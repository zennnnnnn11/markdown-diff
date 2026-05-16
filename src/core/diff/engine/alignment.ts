import { DIFF_HEURISTICS } from '../heuristics'
import { hungarianAssignment } from '../hungarian'
import { alignSequence, longestIncreasingSubsequence } from '../sequence'
import { computeNodeSimilarity, isSameShape } from '../similarity'
import type {
  AlignedPair,
  DiffChange,
  MatchPair,
  SemanticIndex,
} from '../types'
import { getBlockIdentifier, makePairKey } from '../utils'
import type { DiffContext } from './context'
import {
  addMatch,
  createStatus,
  estimateSectionAlignmentCost,
  labelForNode,
  parentContextScore,
  uniqueHeadingSiblingNames,
  withinSiblingOffsetThreshold,
} from './helpers'
import { seedLocalMatches } from './local-matching'

export async function buildMatchedChange(
  context: DiffContext,
  pair: MatchPair,
  mode: 'global' | 'local',
): Promise<DiffChange> {
  const oldNode = context.oldIndex.byId.get(pair.oldId)
  const newNode = context.newIndex.byId.get(pair.newId)
  if (!oldNode || !newNode) throw new Error(`Missing nodes for pair ${pair.pairKey}`)

  const change: DiffChange = {
    entity: oldNode.entity,
    kind: oldNode.kind,
    blockType: oldNode.blockType,
    oldId: oldNode.id,
    newId: newNode.id,
    oldNode: oldNode.raw,
    newNode: newNode.raw,
    pairKey: pair.pairKey,
    pairKind: 'match',
    primaryOp: oldNode.selfHash === newNode.selfHash ? 'equal' : 'replace',
    status: createStatus({
      isMatchPair: true,
      selfChanged: oldNode.selfHash !== newNode.selfHash,
      descendantChanged: oldNode.subtreeHash !== newNode.subtreeHash,
    }),
    matchKind: pair.matchKind,
    score: pair.score,
    summary: `Matched ${labelForNode(oldNode)}`,
    children: [],
    warnings: [],
    logicalMoveId: pair.logicalMoveId,
  }

  if (oldNode.entity === 'section' && newNode.entity === 'section') {
    if (
      pair.matchKind !== 'exact-subtree' &&
      estimateSectionAlignmentCost(context, oldNode, newNode) <=
        context.options.maxRecursiveAlignmentCost
    ) {
      change.children = await alignChildren(context, oldNode.id, newNode.id, mode)
      if (
        change.children.some(
          (child) => child.primaryOp !== 'equal' || child.status.descendantChanged,
        )
      ) {
        change.status.descendantChanged = true
      }
    } else if (pair.matchKind !== 'exact-subtree') {
      change.degraded = true
      change.warnings.push('subtree-budget-exceeded')
    }
  }

  return change
}

export async function alignChildren(
  context: DiffContext,
  oldParentId: string,
  newParentId: string,
  mode: 'global' | 'local',
): Promise<DiffChange[]> {
  const oldChildren = context.oldIndex.childrenById.get(oldParentId) ?? []
  const newChildren = context.newIndex.childrenById.get(newParentId) ?? []
  const oldTokens = oldChildren.map((childId) => projectToken(context, childId, newParentId, 'old'))
  const newTokens = newChildren.map((childId) => projectToken(context, childId, oldParentId, 'new'))
  const edits = alignSequence(oldTokens, newTokens, context.options)
  const changes: DiffChange[] = []

  let oldGap: string[] = []
  let newGap: string[] = []

  for (const edit of edits) {
    if (edit.op === 'equal') {
      await flushGap(context, oldParentId, newParentId, oldGap, newGap, changes, mode)
      oldGap = []
      newGap = []

      const oldId = oldChildren[edit.oldIndex!]
      const newId = newChildren[edit.newIndex!]
      if (!oldId || !newId) continue

      const ensuredPair = await ensureMatchedToken(context, oldId, newId, oldParentId, newParentId)
      if (ensuredPair) changes.push(await buildMatchedChange(context, ensuredPair, mode))
      else {
        const aligned = await createAlignedPair(context, oldId, newId, oldParentId, newParentId)
        if (aligned) changes.push(await buildAlignedChange(context, aligned, mode))
      }
      continue
    }

    if (edit.op === 'delete' && edit.oldIndex !== undefined)
      oldGap.push(oldChildren[edit.oldIndex]!)
    if (edit.op === 'insert' && edit.newIndex !== undefined)
      newGap.push(newChildren[edit.newIndex]!)
  }

  await flushGap(context, oldParentId, newParentId, oldGap, newGap, changes, mode)
  changes.splice(
    0,
    changes.length,
    ...(await rewriteChildrenWithExistingMatches(context, changes, mode)),
  )
  markReorderedChildren(context, changes)
  return changes
}

export async function flushGap(
  context: DiffContext,
  oldParentId: string,
  newParentId: string,
  oldGap: string[],
  newGap: string[],
  changes: DiffChange[],
  mode: 'global' | 'local',
): Promise<void> {
  if (oldGap.length === 0 && newGap.length === 0) return

  const matchedPairs = collectGapMatches(context, oldGap, newGap)
  const consumedOldByMatch = new Set(matchedPairs.map((entry) => entry.oldId))
  const consumedNewByMatch = new Set(matchedPairs.map((entry) => entry.newId))
  const residualOldGap = oldGap.filter((oldId) => !consumedOldByMatch.has(oldId))
  const residualNewGap = newGap.filter((newId) => !consumedNewByMatch.has(newId))

  for (const { pair } of matchedPairs) {
    changes.push(await buildMatchedChange(context, pair, mode))
  }

  const pairs = await pairGapNodes(
    context,
    residualOldGap,
    residualNewGap,
    oldParentId,
    newParentId,
  )
  const pairedOld = new Set(pairs.map((pair) => pair.oldId))
  const pairedNew = new Set(pairs.map((pair) => pair.newId))

  for (const oldId of residualOldGap) {
    const aligned = pairs.find((pair) => pair.oldId === oldId)
    if (aligned) {
      changes.push(await buildAlignedChange(context, aligned, mode))
      continue
    }
    changes.push(buildDeleteChange(context, oldId))
  }

  for (const newId of residualNewGap) {
    if (pairedNew.has(newId)) continue
    changes.push(buildInsertChange(context, newId))
  }

}

export function collectGapMatches(
  context: DiffContext,
  oldGap: string[],
  newGap: string[],
): Array<{ oldId: string; newId: string; pair: MatchPair }> {
  if (oldGap.length === 0 || newGap.length === 0) return []

  const newGapSet = new Set(newGap)
  const matched: Array<{ oldId: string; newId: string; pair: MatchPair }> = []
  const consumedNew = new Set<string>()

  for (const oldId of oldGap) {
    const pair = context.matchesByOld.get(oldId)
    if (!pair) continue
    if (consumedNew.has(pair.newId)) continue
    if (!newGapSet.has(pair.newId)) continue
    if (context.matchesByNew.get(pair.newId)?.oldId !== oldId) continue

    matched.push({ oldId, newId: pair.newId, pair })
    consumedNew.add(pair.newId)
  }

  return matched
}

export function definitionGapPairAllowed(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  oldIds: string[],
  newIds: string[],
): boolean {
  if (oldNode.blockType !== 'definition' || newNode.blockType !== 'definition') return true

  const oldIdentifier = getBlockIdentifier(oldNode.block)
  const newIdentifier = getBlockIdentifier(newNode.block)
  if (!oldIdentifier || oldIdentifier !== newIdentifier) return true

  const oldCount = countDefinitionIdentifier(context.oldIndex, oldIds, oldIdentifier)
  const newCount = countDefinitionIdentifier(context.newIndex, newIds, newIdentifier)
  return oldCount === 1 && newCount === 1
}

export function countDefinitionIdentifier(index: SemanticIndex, ids: string[], identifier: string): number {
  let count = 0
  for (const id of ids) {
    const node = index.byId.get(id)
    if (node?.blockType !== 'definition') continue
    if (getBlockIdentifier(node.block) === identifier) count++
  }
  return count
}

export async function pairGapNodes(
  context: DiffContext,
  oldIds: string[],
  newIds: string[],
  oldParentId: string,
  newParentId: string,
): Promise<AlignedPair[]> {
  if (oldIds.length === 0 || newIds.length === 0) return []

  type Candidate = AlignedPair & { siblingDistance: number }
  const candidates: Candidate[] = []

  for (const oldId of oldIds) {
    const oldNode = context.oldIndex.byId.get(oldId)
    if (!oldNode) continue
    const comparable = newIds
      .map((newId) => {
        const newNode = context.newIndex.byId.get(newId)
        if (!newNode || !isSameShape(oldNode, newNode)) return undefined
        if (!definitionGapPairAllowed(context, oldNode, newNode, oldIds, newIds)) return undefined
        return { newId, newNode }
      })
      .filter(
        (entry): entry is { newId: string; newNode: NonNullable<typeof entry>['newNode'] } =>
          !!entry,
      )

    const scores = comparable.map(({ newNode }) =>
      computeNodeSimilarity(
        oldNode,
        newNode,
        context.options,
        parentContextScore(context, oldParentId, newParentId),
      ),
    )

    comparable.forEach(({ newId, newNode }, index) => {
      const score = scores[index] ?? 0
      const shortHeadingFallback = shouldUseShortHeadingFallback(
        context,
        oldNode,
        newNode,
        oldParentId,
        newParentId,
      )
      if (!shortHeadingFallback && score < context.options.minSimilarity) return

      candidates.push({
        oldId,
        newId,
        pairKind: 'align',
        pairKey: makePairKey('align', oldId, newId),
        score,
        shortHeadingFallback,
        siblingDistance: Math.abs((oldNode.siblingIndex ?? 0) - (newNode.siblingIndex ?? 0)),
      })
    })
  }

  if (candidates.length === 0) return []

  // Build index maps for unique IDs
  const uniqueOldIds = [...new Set(candidates.map((c) => c.oldId))]
  const uniqueNewIds = [...new Set(candidates.map((c) => c.newId))]
  const oldIdxMap = new Map(uniqueOldIds.map((id, i) => [id, i]))
  const newIdxMap = new Map(uniqueNewIds.map((id, i) => [id, i]))

  // Build cost matrix (1 - score + sibling distance epsilon for tiebreaking)
  const INFEASIBLE = Infinity
  const costMatrix: number[][] = Array.from({ length: uniqueOldIds.length }, () =>
    Array.from({ length: uniqueNewIds.length }, () => INFEASIBLE),
  )
  const candidateLookup = new Map<string, Candidate>()
  for (const c of candidates) {
    const key = `${c.oldId}\0${c.newId}`
    const cost = 1 - (c.score ?? 0) + c.siblingDistance * 1e-6
    const row = oldIdxMap.get(c.oldId)!
    const col = newIdxMap.get(c.newId)!
    costMatrix[row]![col] = cost
    candidateLookup.set(key, c)
  }

  // Run Hungarian assignment
  const assignments = hungarianAssignment(costMatrix)

  // Map back to AlignedPair[], applying threshold
  const result: AlignedPair[] = []
  for (const [row, col] of assignments) {
    const oldId = uniqueOldIds[row]!
    const newId = uniqueNewIds[col]!
    const key = `${oldId}\0${newId}`
    const candidate = candidateLookup.get(key)
    if (!candidate) continue
    if (!candidate.shortHeadingFallback && (candidate.score ?? 0) < context.options.minSimilarity) continue
    result.push(candidate)
  }

  return result
}

export async function createAlignedPair(
  context: DiffContext,
  oldId: string,
  newId: string,
  oldParentId: string,
  newParentId: string,
): Promise<AlignedPair | undefined> {
  const oldNode = context.oldIndex.byId.get(oldId)
  const newNode = context.newIndex.byId.get(newId)
  if (!oldNode || !newNode || !isSameShape(oldNode, newNode)) return undefined

  const score = computeNodeSimilarity(
    oldNode,
    newNode,
    context.options,
    parentContextScore(context, oldParentId, newParentId),
  )
  const shortHeadingFallback = shouldUseShortHeadingFallback(
    context,
    oldNode,
    newNode,
    oldParentId,
    newParentId,
  )
  if (!shortHeadingFallback && score < context.options.minSimilarity) return undefined

  return {
    oldId,
    newId,
    pairKind: 'align',
    pairKey: makePairKey('align', oldId, newId),
    score,
    shortHeadingFallback,
  }
}

export async function buildAlignedChange(
  context: DiffContext,
  aligned: AlignedPair,
  mode: 'global' | 'local',
): Promise<DiffChange> {
  const oldNode = context.oldIndex.byId.get(aligned.oldId)
  const newNode = context.newIndex.byId.get(aligned.newId)
  if (!oldNode || !newNode) throw new Error(`Missing aligned nodes ${aligned.pairKey}`)

  const change: DiffChange = {
    entity: oldNode.entity,
    kind: oldNode.kind,
    blockType: oldNode.blockType,
    oldId: oldNode.id,
    newId: newNode.id,
    oldNode: oldNode.raw,
    newNode: newNode.raw,
    pairKey: aligned.pairKey,
    pairKind: 'align',
    primaryOp: 'replace',
    status: createStatus({
      isAlignedPair: true,
      selfChanged: oldNode.selfHash !== newNode.selfHash,
      descendantChanged: oldNode.subtreeHash !== newNode.subtreeHash,
    }),
    score: aligned.score,
    summary: `Aligned ${labelForNode(oldNode)}`,
    children: [],
    warnings: [],
    shortHeadingFallback: aligned.shortHeadingFallback,
  }

  if (oldNode.entity === 'section' && newNode.entity === 'section') {
    if (
      estimateSectionAlignmentCost(context, oldNode, newNode) <=
      context.options.maxLocalAlignmentCost
    ) {
      await seedLocalMatches(context, oldNode.id, newNode.id)
      change.children = await alignChildren(context, oldNode.id, newNode.id, 'local')
      if (
        change.children.some(
          (child) => child.primaryOp !== 'equal' || child.status.descendantChanged,
        )
      ) {
        change.status.descendantChanged = true
      }
      if (oldNode.selfHash === newNode.selfHash && change.status.descendantChanged) {
        change.primaryOp = 'equal'
        change.status.selfChanged = false
      }
    } else {
      change.degraded = true
      change.warnings.push('local-window-exceeded')
    }

    if (context.structuralFallback) {
      await context.structuralFallback(context, change, oldNode, newNode)
    }
  }

  if (
    mode === 'local' &&
    oldNode.selfHash === newNode.selfHash &&
    change.status.descendantChanged
  ) {
    change.primaryOp = 'equal'
    change.status.selfChanged = false
  }

  return change
}

export function buildDeleteChange(context: DiffContext, oldId: string): DiffChange {
  const oldNode = context.oldIndex.byId.get(oldId)
  if (!oldNode) throw new Error(`Missing old node ${oldId}`)
  return {
    entity: oldNode.entity,
    kind: oldNode.kind,
    blockType: oldNode.blockType,
    oldId,
    oldNode: oldNode.raw,
    primaryOp: 'delete',
    status: createStatus({ selfChanged: true }),
    summary: `Delete ${labelForNode(oldNode)}`,
    children: oldNode.entity === 'section' ? expandChildren(context, oldNode.id, 'delete') : [],
    warnings: [],
  }
}

export function buildInsertChange(context: DiffContext, newId: string): DiffChange {
  const newNode = context.newIndex.byId.get(newId)
  if (!newNode) throw new Error(`Missing new node ${newId}`)
  return {
    entity: newNode.entity,
    kind: newNode.kind,
    blockType: newNode.blockType,
    newId,
    newNode: newNode.raw,
    primaryOp: 'insert',
    status: createStatus({ selfChanged: true }),
    summary: `Insert ${labelForNode(newNode)}`,
    children: newNode.entity === 'section' ? expandChildren(context, newNode.id, 'insert') : [],
    warnings: [],
  }
}

export function expandChildren(
  context: DiffContext,
  parentId: string,
  op: 'delete' | 'insert',
): DiffChange[] {
  const index = op === 'delete' ? context.oldIndex : context.newIndex
  return (index.childrenById.get(parentId) ?? []).map((childId) =>
    op === 'delete' ? buildDeleteChange(context, childId) : buildInsertChange(context, childId),
  )
}

export async function ensureMatchedToken(
  context: DiffContext,
  oldId: string,
  newId: string,
  oldParentId: string,
  newParentId: string,
): Promise<MatchPair | undefined> {
  const existing = context.matchesByOld.get(oldId)
  if (existing?.newId === newId) return existing

  const oldNode = context.oldIndex.byId.get(oldId)
  const newNode = context.newIndex.byId.get(newId)
  if (!oldNode || !newNode || !isSameShape(oldNode, newNode)) return undefined

  if (!withinSiblingOffsetThreshold(context, oldNode, newNode)) return undefined
  const score = computeNodeSimilarity(
    oldNode,
    newNode,
    context.options,
    parentContextScore(context, oldParentId, newParentId),
  )
  if (oldNode.selfHash === newNode.selfHash && score >= context.options.minSimilarity) {
    return addMatch(context, oldId, newId, 'exact-self-with-context', undefined, score)
  }

  return undefined
}

export function projectToken(
  context: DiffContext,
  childId: string,
  oppositeParentId: string,
  tree: 'old' | 'new',
): string {
  const match =
    tree === 'old' ? context.matchesByOld.get(childId) : context.matchesByNew.get(childId)
  if (match) {
    const oppositeId = tree === 'old' ? match.newId : match.oldId
    const oppositeNode =
      context.newIndex.byId.get(oppositeId) ?? context.oldIndex.byId.get(oppositeId)
    if (oppositeNode?.parentId === oppositeParentId) return `MATCHED:${match.pairKey}`
  }

  const node =
    tree === 'old' ? context.oldIndex.byId.get(childId) : context.newIndex.byId.get(childId)
  return `SELF:${node?.selfHash ?? childId}`
}

export function markReorderedChildren(context: DiffContext, changes: DiffChange[]): void {
  const paired = changes
    .map((change, index) => ({ change, index }))
    .filter(
      ({ change }) =>
        !!change.oldId &&
        !!change.newId &&
        (change.status.isMatchPair || change.status.isAlignedPair),
    )
    .map(({ change, index }) => ({
      change,
      index,
      newOrder: context.newIndex.byId.get(change.newId!)?.siblingIndex ?? index,
    }))

  const lis = new Set(longestIncreasingSubsequence(paired.map((entry) => entry.newOrder)))
  paired.forEach((entry, index) => {
    if (!lis.has(index)) {
      entry.change.reordered = true
      entry.change.status.movedWithinParent = true
    }
  })
}

export async function rewriteChildrenWithExistingMatches(
  context: DiffContext,
  existingChildren: DiffChange[],
  mode: 'global' | 'local',
): Promise<DiffChange[]> {
  const pendingInsertsByNewId = new Map<string, DiffChange>()
  for (const child of existingChildren) {
    if (child.primaryOp === 'insert' && child.newId) pendingInsertsByNewId.set(child.newId, child)
  }

  const consumedInsertIds = new Set<string>()
  const rewritten: DiffChange[] = []

  for (const child of existingChildren) {
    if (child.primaryOp === 'insert' && child.newId && consumedInsertIds.has(child.newId)) continue

    if (child.primaryOp === 'delete' && child.oldId) {
      const pair = context.matchesByOld.get(child.oldId)
      const pairedInsert = pair?.newId ? pendingInsertsByNewId.get(pair.newId) : undefined
      if (
        pair &&
        pairedInsert &&
        pairedInsert.primaryOp === 'insert' &&
        context.matchesByNew.get(pair.newId)?.oldId === child.oldId &&
        !consumedInsertIds.has(pair.newId)
      ) {
        rewritten.push(await buildMatchedChange(context, pair, mode))
        consumedInsertIds.add(pair.newId)
        continue
      }
    }

    rewritten.push(child)
  }

  return rewritten
}

export function shouldUseShortHeadingFallback(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  oldParentId: string,
  newParentId: string,
): boolean {
  if (oldNode.kind !== 'heading' || newNode.kind !== 'heading') return false
  if (oldNode.section?.headingDepth !== newNode.section?.headingDepth) return false
  if (
    Math.abs(oldNode.siblingIndex - newNode.siblingIndex) >
    DIFF_HEURISTICS.context.shortHeadingSiblingTolerance
  ) {
    return false
  }
  if (context.matchesByOld.get(oldParentId)?.newId !== newParentId) return false
  if (!uniqueHeadingSiblingNames(context, oldNode, newNode)) return false
  return (
    oldNode.headingBodyHash === newNode.headingBodyHash ||
    (oldNode.logicalChildren.length === 0 && newNode.logicalChildren.length === 0)
  )
}

export async function rewriteChildrenWithFallbackPairs(
  context: DiffContext,
  existingChildren: DiffChange[],
  fallbackPairs: AlignedPair[],
): Promise<DiffChange[]> {
  const pairByOld = new Map(fallbackPairs.map((pair) => [pair.oldId, pair]))
  const consumedNew = new Set<string>()
  const rewritten: DiffChange[] = []

  for (const child of existingChildren) {
    if (child.primaryOp === 'delete' && child.oldId) {
      const pair = pairByOld.get(child.oldId)
      if (pair && !consumedNew.has(pair.newId)) {
        rewritten.push(await buildAlignedChange(context, pair, 'local'))
        consumedNew.add(pair.newId)
        continue
      }
    }

    if (child.primaryOp === 'insert' && child.newId && consumedNew.has(child.newId)) continue
    rewritten.push(child)
  }

  return rewritten
}
