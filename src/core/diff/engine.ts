/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InlineContent, Section } from '../transformer'
import { computeAptedMatches, type AptedNode } from './apted'
import { diffFrontmatter } from './frontmatter'
import { DIFF_HEURISTICS, sequenceTuning } from './heuristics'
import { buildSemanticIndex } from './indexer'
import { resolveDiffOptions } from './options'
import { alignSequence, longestIncreasingSubsequence } from './sequence'
import { computeNodeSimilarity, isSameShape, uniquenessMargin } from './similarity'
import type {
  AlignedPair,
  DiffChange,
  DiffChangeIndex,
  DiffOptions,
  DiffQualitySummary,
  DiffResult,
  DiffStatus,
  InlineSpan,
  InlineToken,
  LineDiffSpan,
  MatchKind,
  MatchPair,
  MetadataChange,
  SemanticIndex,
  TableCellDiff,
  TableDiff,
} from './types'
import {
  buildInlineTokens,
  extractNodeText,
  jaccardSimilarity,
  makeMoveId,
  makePairKey,
  multisetJaccardSimilarity,
  normalizeIdentifier,
  simHashHammingDistance,
  tokenizeText,
} from './utils'

interface MatchCandidate {
  oldId: string
  newId: string
  matchKind: MatchKind
  priority: number
  score: number
}

interface DiffContext {
  options: DiffOptions
  oldIndex: SemanticIndex
  newIndex: SemanticIndex
  matchesByOld: Map<string, MatchPair>
  matchesByNew: Map<string, MatchPair>
  warnings: string[]
}

interface AptedDiffMeta {
  node: NonNullable<ReturnType<SemanticIndex['byId']['get']>>
}

class AnchorRegistry {
  private globalAnchors: Array<{ oldPreorder: number; newPreorder: number }> = []

  register(oldPreorder: number, newPreorder: number): void {
    const existing = this.globalAnchors.find(
      (anchor) => anchor.oldPreorder === oldPreorder && anchor.newPreorder === newPreorder,
    )
    if (existing) return

    this.globalAnchors.push({ oldPreorder, newPreorder })
    this.globalAnchors.sort((left, right) => left.oldPreorder - right.oldPreorder)
  }

  getGlobalInterval(oldPreorder: number, newTreeSize: number): { min: number; max: number } {
    if (this.globalAnchors.length === 0) {
      return {
        min: 0,
        max: Math.max(0, newTreeSize - 1),
      }
    }

    let leftNewPreorder = -1
    let rightNewPreorder = newTreeSize
    for (const anchor of this.globalAnchors) {
      if (anchor.oldPreorder < oldPreorder) {
        leftNewPreorder = anchor.newPreorder
        continue
      }

      if (anchor.oldPreorder > oldPreorder) {
        rightNewPreorder = anchor.newPreorder
        break
      }
    }

    const min = Math.max(0, leftNewPreorder + 1)
    const max = Math.min(newTreeSize - 1, rightNewPreorder - 1)
    if (min > max) return { min, max }
    return { min, max }
  }
}

interface SiblingAnchorBounds {
  leftOldAnchorIndex: number
  rightOldAnchorIndex: number
  leftNewAnchorIndex: number
  rightNewAnchorIndex: number
  oldMin: number
  oldMax: number
  newMin: number
  newMax: number
}

export async function diffMarkdownTrees(
  oldRoot: Section,
  newRoot: Section,
  options?: Partial<DiffOptions>,
): Promise<DiffResult> {
  const resolved = resolveDiffOptions(options)
  const [oldIndex, newIndex] = await Promise.all([
    buildSemanticIndex(oldRoot, 'old'),
    buildSemanticIndex(newRoot, 'new'),
  ])

  const context: DiffContext = {
    options: resolved,
    oldIndex,
    newIndex,
    matchesByOld: new Map(),
    matchesByNew: new Map(),
    warnings: [],
  }

  addMatch(context, oldRoot.id, newRoot.id, 'forced-root')
  await runDeterministicMatching(context)

  const rootPair = context.matchesByOld.get(oldRoot.id)
  if (!rootPair) throw new Error('Root pair missing after deterministic matching')

  const root = await buildMatchedChange(context, rootPair, 'global')
  await recoverMoves(context, root)
  await recoverRenamesAndMeta(context, root)
  await computePresentationDiffs(context, root)
  validateTree(root, context.warnings)
  const changeIndex = buildChangeIndex(root)
  const quality = collectQuality(root, context.warnings)

  return {
    root,
    oldIndex,
    newIndex,
    matches: [...context.matchesByOld.values()],
    changeIndex,
    stats: collectStats(root),
    quality,
    warnings: context.warnings,
  }
}

async function runDeterministicMatching(context: DiffContext): Promise<void> {
  const coveredOld = new Set<string>()
  const coveredNew = new Set<string>()
  const anchors = new AnchorRegistry()
  registerDeterministicAnchor(context, anchors, oldRootPair(context))

  await applyExactSubtreeMatches(context, anchors, coveredOld, coveredNew)
  const candidates = await collectDeterministicCandidates(context, anchors, coveredOld, coveredNew)
  const highestPriorityByOld = new Map<string, number>()
  const highestPriorityByNew = new Map<string, number>()
  for (const candidate of candidates) {
    highestPriorityByOld.set(candidate.oldId, Math.max(highestPriorityByOld.get(candidate.oldId) ?? Number.NEGATIVE_INFINITY, candidate.priority))
    highestPriorityByNew.set(candidate.newId, Math.max(highestPriorityByNew.get(candidate.newId) ?? Number.NEGATIVE_INFINITY, candidate.priority))
  }

  const eligibleCandidates = candidates.filter(
    (candidate) =>
      highestPriorityByOld.get(candidate.oldId) === candidate.priority &&
      highestPriorityByNew.get(candidate.newId) === candidate.priority,
  )
  const groupedByPriority = new Map<number, MatchCandidate[]>()
  for (const candidate of eligibleCandidates) push(groupedByPriority, candidate.priority, candidate)
  const discardedOld = new Set<string>()
  const discardedNew = new Set<string>()

  for (const priority of [...groupedByPriority.keys()].sort((left, right) => right - left)) {
    const bucket = groupedByPriority.get(priority) ?? []
    const conflictingOld = collectConflicts(bucket.map((candidate) => candidate.oldId))
    const conflictingNew = collectConflicts(bucket.map((candidate) => candidate.newId))
    conflictingOld.forEach((id) => discardedOld.add(id))
    conflictingNew.forEach((id) => discardedNew.add(id))
    for (const candidate of bucket) {
      if (discardedOld.has(candidate.oldId) || discardedNew.has(candidate.newId)) continue
      if (conflictingOld.has(candidate.oldId) || conflictingNew.has(candidate.newId)) continue
      if (context.matchesByOld.has(candidate.oldId) || context.matchesByNew.has(candidate.newId)) continue
      const pair = addMatch(context, candidate.oldId, candidate.newId, candidate.matchKind, undefined, candidate.score)
      registerDeterministicAnchor(context, anchors, pair)
    }
  }
}

async function applyExactSubtreeMatches(
  context: DiffContext,
  anchors: AnchorRegistry,
  blockedOld: Set<string>,
  blockedNew: Set<string>,
): Promise<void> {
  const exactSubtrees = uniqueSharedHashes(context.oldIndex.bySubtreeHash, context.newIndex.bySubtreeHash)
    .map(([oldId, newId]) => ({
      oldId,
      newId,
      oldNode: context.oldIndex.byId.get(oldId),
      newNode: context.newIndex.byId.get(newId),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        oldId: string
        newId: string
        oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>
        newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>
      } => !!candidate.oldNode && !!candidate.newNode && isSameShape(candidate.oldNode, candidate.newNode),
    )
    .sort((left, right) => right.oldNode.subtreeSize - left.oldNode.subtreeSize)

  for (const candidate of exactSubtrees) {
    if (blockedOld.has(candidate.oldId) || blockedNew.has(candidate.newId)) continue
    if (context.matchesByOld.has(candidate.oldId) || context.matchesByNew.has(candidate.newId)) continue
    const pair = addMatch(context, candidate.oldId, candidate.newId, 'exact-subtree', undefined, 1)
    registerDeterministicAnchor(context, anchors, pair)
    coverDescendants(context.oldIndex, candidate.oldId, blockedOld)
    coverDescendants(context.newIndex, candidate.newId, blockedNew)
  }
}

async function collectDeterministicCandidates(
  context: DiffContext,
  anchors: AnchorRegistry,
  blockedOld: Set<string>,
  blockedNew: Set<string>,
): Promise<MatchCandidate[]> {
  const candidates: MatchCandidate[] = []
  const exactSelf = uniqueSharedHashes(context.oldIndex.bySelfHash, context.newIndex.bySelfHash)
    .map(([oldId, newId]) => classifyExactSelfCandidate(context, anchors, oldId, newId))
    .filter((candidate): candidate is MatchCandidate => !!candidate)
  const exactDirect = uniqueSharedHashes(context.oldIndex.byDirectHash, context.newIndex.byDirectHash)
    .map(([oldId, newId]) => ({ oldId, newId, matchKind: 'exact-direct' as const, priority: 4, score: 1 }))

  candidates.push(
    ...exactSelf.filter(
      (candidate) =>
        !blockedOld.has(candidate.oldId) &&
        !blockedNew.has(candidate.newId) &&
        !context.matchesByOld.has(candidate.oldId) &&
        !context.matchesByNew.has(candidate.newId),
    ),
    ...exactDirect.filter((candidate) => {
      const oldNode = context.oldIndex.byId.get(candidate.oldId)
      const newNode = context.newIndex.byId.get(candidate.newId)
      return (
        !blockedOld.has(candidate.oldId) &&
        !blockedNew.has(candidate.newId) &&
        oldNode?.entity === 'section' &&
        newNode?.entity === 'section' &&
        canDeterministicallyMatch(context, anchors, candidate.oldId, candidate.newId)
      )
    }),
  )

  const oldFrontmatter = context.oldIndex.byKind.get('frontmatter') ?? []
  const newFrontmatter = context.newIndex.byKind.get('frontmatter') ?? []
  if (oldFrontmatter.length === 1 && newFrontmatter.length === 1) {
    candidates.push({
      oldId: oldFrontmatter[0]!,
      newId: newFrontmatter[0]!,
      matchKind: 'frontmatter-anchor',
      priority: 1,
      score: 1,
    })
  }

  candidates.push(
    ...uniqueSharedHashes(filterIdentityHashes(context.oldIndex, 'footnote'), filterIdentityHashes(context.newIndex, 'footnote')).map(
      ([oldId, newId]) => ({
        oldId,
        newId,
        matchKind: 'footnote-identity' as const,
        priority: 3,
        score: 1,
      }),
    ),
    ...uniqueSharedHashes(
      filterIdentityHashes(context.oldIndex, 'definition'),
      filterIdentityHashes(context.newIndex, 'definition'),
    ).map(([oldId, newId]) => ({
      oldId,
      newId,
      matchKind: 'definition-identity' as const,
      priority: 2,
      score: 1,
    })),
  )

  return candidates
}

async function buildMatchedChange(
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
    if (pair.matchKind !== 'exact-subtree' && estimateSectionAlignmentCost(context, oldNode, newNode) <= context.options.maxRecursiveAlignmentCost) {
      change.children = await alignChildren(context, oldNode.id, newNode.id, mode)
      if (change.children.some((child) => child.primaryOp !== 'equal' || child.status.descendantChanged)) {
        change.status.descendantChanged = true
      }
    } else if (pair.matchKind !== 'exact-subtree') {
      change.degraded = true
      change.warnings.push('subtree-budget-exceeded')
    }
  }

  return change
}

async function alignChildren(
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

    if (edit.op === 'delete' && edit.oldIndex !== undefined) oldGap.push(oldChildren[edit.oldIndex]!)
    if (edit.op === 'insert' && edit.newIndex !== undefined) newGap.push(newChildren[edit.newIndex]!)
  }

  await flushGap(context, oldParentId, newParentId, oldGap, newGap, changes, mode)
  markReorderedChildren(context, changes)
  return changes
}

async function flushGap(
  context: DiffContext,
  oldParentId: string,
  newParentId: string,
  oldGap: string[],
  newGap: string[],
  changes: DiffChange[],
  mode: 'global' | 'local',
): Promise<void> {
  if (oldGap.length === 0 && newGap.length === 0) return

  const pairs = await pairGapNodes(context, oldGap, newGap, oldParentId, newParentId)
  const pairedOld = new Set(pairs.map((pair) => pair.oldId))
  const pairedNew = new Set(pairs.map((pair) => pair.newId))

  for (const oldId of oldGap) {
    const aligned = pairs.find((pair) => pair.oldId === oldId)
    if (aligned) {
      changes.push(await buildAlignedChange(context, aligned, mode))
      continue
    }
    changes.push(buildDeleteChange(context, oldId))
  }

  for (const newId of newGap) {
    if (pairedNew.has(newId)) continue
    changes.push(buildInsertChange(context, newId))
  }

  for (const pair of pairs) {
    if (!pairedOld.has(pair.oldId)) continue
  }
}

async function pairGapNodes(
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
        return { newId, newNode }
      })
      .filter((entry): entry is { newId: string; newNode: NonNullable<typeof entry>['newNode'] } => !!entry)

    const scores = comparable.map(({ newNode }) =>
      computeNodeSimilarity(oldNode, newNode, context.options, parentContextScore(context, oldParentId, newParentId)),
    )

    comparable.forEach(({ newId, newNode }, index) => {
      const score = scores[index] ?? 0
      const shortHeadingFallback = shouldUseShortHeadingFallback(context, oldNode, newNode, oldParentId, newParentId)
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

  candidates.sort(
    (left, right) =>
      (right.score ?? 0) - (left.score ?? 0) || left.siblingDistance - right.siblingDistance,
  )
  const usedOld = new Set<string>()
  const usedNew = new Set<string>()
  const result: AlignedPair[] = []

  for (const candidate of candidates) {
    if (usedOld.has(candidate.oldId) || usedNew.has(candidate.newId)) continue
    usedOld.add(candidate.oldId)
    usedNew.add(candidate.newId)
    result.push(candidate)
  }

  return result
}

async function createAlignedPair(
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
  const shortHeadingFallback = shouldUseShortHeadingFallback(context, oldNode, newNode, oldParentId, newParentId)
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

async function buildAlignedChange(
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
    if (estimateSectionAlignmentCost(context, oldNode, newNode) <= context.options.maxLocalAlignmentCost) {
      await seedLocalMatches(context, oldNode.id, newNode.id)
      change.children = await alignChildren(context, oldNode.id, newNode.id, 'local')
      if (change.children.some((child) => child.primaryOp !== 'equal' || child.status.descendantChanged)) {
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

    if (context.options.enhancedLocalRecovery) {
      await maybeApplyStructuralFallback(context, change, oldNode, newNode)
    }
  }

  if (mode === 'local' && oldNode.selfHash === newNode.selfHash && change.status.descendantChanged) {
    change.primaryOp = 'equal'
    change.status.selfChanged = false
  }

  return change
}

async function seedLocalMatches(context: DiffContext, oldParentId: string, newParentId: string): Promise<void> {
  const oldChildren = context.oldIndex.childrenById.get(oldParentId) ?? []
  const newChildren = context.newIndex.childrenById.get(newParentId) ?? []

  matchLocalBy(context, oldChildren, newChildren, (node) => node?.selfHash, 'exact-self-with-context')
  matchLocalBy(context, oldChildren, newChildren, (node) => (node?.kind === 'heading' ? node.titleSlug : undefined), 'local-heading-slug')
  matchLocalBy(
    context,
    oldChildren,
    newChildren,
    (node) => (node && (node.kind === 'footnote' || node.blockType === 'definition') ? node.identityHash : undefined),
    'local-identity',
  )

  const similarityCandidates: MatchCandidate[] = []
  for (const oldId of oldChildren) {
    const oldNode = context.oldIndex.byId.get(oldId)
    if (!oldNode || context.matchesByOld.has(oldId)) continue
    const comparables = recallComparableNodes(context, oldNode, newChildren, oldParentId, newParentId)
    if (comparables.length === 0) continue

    const scores = comparables.map((newNode) => computeNodeSimilarity(oldNode, newNode, context.options, 1))
    const bestIndex = scores.findIndex((score) => score === Math.max(...scores))
    const bestScore = scores[bestIndex] ?? 0
    if (bestScore < context.options.minSimilarity) continue
    if (uniquenessMargin(scores) < context.options.minUniquenessMargin) continue

    const bestNew = comparables[bestIndex]
    if (!bestNew) continue

    const reverseCandidates = oldChildren
      .map((candidateId) => context.oldIndex.byId.get(candidateId))
      .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate && !context.matchesByOld.has(candidate.id) && isSameShape(candidate, bestNew))
    const reverseScores = reverseCandidates.map((candidate) => computeNodeSimilarity(candidate, bestNew, context.options, 1))
    if (uniquenessMargin(reverseScores) < context.options.minUniquenessMargin) continue

    similarityCandidates.push({
      oldId,
      newId: bestNew.id,
      matchKind: 'local-similarity',
      priority: 1,
      score: bestScore,
    })
  }

  for (const candidate of similarityCandidates.sort((left, right) => right.score - left.score)) {
    if (context.matchesByOld.has(candidate.oldId) || context.matchesByNew.has(candidate.newId)) continue
    addMatch(context, candidate.oldId, candidate.newId, candidate.matchKind, undefined, candidate.score)
  }
}

function matchLocalBy(
  context: DiffContext,
  oldIds: string[],
  newIds: string[],
  getKey: (node: SemanticIndex['byId'] extends Map<string, infer T> ? T | undefined : never) => string | undefined,
  matchKind: MatchKind,
): void {
  const oldBuckets = new Map<string, string[]>()
  const newBuckets = new Map<string, string[]>()

  for (const oldId of oldIds) {
    const node = context.oldIndex.byId.get(oldId)
    const key = getKey(node)
    if (!node || !key || context.matchesByOld.has(oldId)) continue
    push(oldBuckets, key, oldId)
  }
  for (const newId of newIds) {
    const node = context.newIndex.byId.get(newId)
    const key = getKey(node)
    if (!node || !key || context.matchesByNew.has(newId)) continue
    push(newBuckets, key, newId)
  }

  for (const [key, oldBucket] of oldBuckets) {
    const newBucket = newBuckets.get(key)
    if (!newBucket || oldBucket.length !== 1 || newBucket.length !== 1) continue
    addMatch(context, oldBucket[0]!, newBucket[0]!, matchKind, undefined, 1)
  }
}

function recallComparableNodes(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newIds: string[],
  oldParentId: string,
  newParentId: string,
): Array<NonNullable<ReturnType<SemanticIndex['byId']['get']>>> {
  const boundedIds = boundCandidateIdsBySiblingAnchors(context, oldNode, newIds, oldParentId, newParentId)
  const sameShape = boundedIds
    .map((newId) => context.newIndex.byId.get(newId))
    .filter(
      (newNode): newNode is NonNullable<typeof newNode> =>
        !!newNode && !context.matchesByNew.has(newNode.id) && isSameShape(oldNode, newNode),
    )
  if (sameShape.length <= DIFF_HEURISTICS.recall.maxComparableNodes) return sameShape

  const ranked = sameShape
    .map((newNode) => ({
      node: newNode,
      distance: simHashDistanceForRecall(oldNode, newNode),
      structuralBias:
        (oldNode.pathHash &&
        newNode.pathHash &&
        oldNode.pathHash === newNode.pathHash
          ? 0
          : DIFF_HEURISTICS.recall.pathMismatchPenalty) +
        Math.abs((oldNode.siblingIndex ?? 0) - (newNode.siblingIndex ?? 0)),
    }))
    .filter(
      (entry) => entry.distance === undefined || entry.distance <= DIFF_HEURISTICS.recall.textSimThreshold,
    )
    .sort((left, right) => (left.distance ?? Number.POSITIVE_INFINITY) - (right.distance ?? Number.POSITIVE_INFINITY) || left.structuralBias - right.structuralBias)

  if (ranked.length === 0) return sameShape
  return ranked.slice(0, DIFF_HEURISTICS.recall.maxComparableNodes).map((entry) => entry.node)
}

async function maybeApplyStructuralFallback(
  context: DiffContext,
  change: DiffChange,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): Promise<void> {
  const oldChildren = context.oldIndex.childrenById.get(oldNode.id) ?? []
  const newChildren = context.newIndex.childrenById.get(newNode.id) ?? []
  const unresolved = change.children.filter((child) => child.primaryOp !== 'equal').length
  const total = Math.max(oldChildren.length + newChildren.length, 1)
  if (total === 0 || unresolved / total <= context.options.aptedUnpairedThreshold) return
  if (estimateAptedRecoveryCost(change) > context.options.maxAptedCost) {
    change.warnings.push('enhanced-local-recovery-budget-exceeded')
    return
  }

  const aptedMatches = computeStructuralAptedMatches(context, change)
  const fallbackPairs = collectStructuralFallbackPairs(context, change, oldNode.id, newNode.id, aptedMatches)
  if (fallbackPairs.length === 0) {
    change.warnings.push('enhanced-local-recovery-no-candidates')
    return
  }

  change.children = await rewriteChildrenWithFallbackPairs(context, change.children, fallbackPairs)
  if (change.children.some((child) => child.primaryOp !== 'equal' || child.status.descendantChanged)) {
    change.status.descendantChanged = true
  }
  if (oldNode.selfHash === newNode.selfHash && change.status.descendantChanged) {
    change.primaryOp = 'equal'
    change.status.selfChanged = false
  }
}

function buildDeleteChange(context: DiffContext, oldId: string): DiffChange {
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

function buildInsertChange(context: DiffContext, newId: string): DiffChange {
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

function expandChildren(context: DiffContext, parentId: string, op: 'delete' | 'insert'): DiffChange[] {
  const index = op === 'delete' ? context.oldIndex : context.newIndex
  return (index.childrenById.get(parentId) ?? []).map((childId) =>
    op === 'delete' ? buildDeleteChange(context, childId) : buildInsertChange(context, childId),
  )
}

async function recoverMoves(context: DiffContext, root: DiffChange): Promise<void> {
  const deletes = collectChanges(root, (change) => change.primaryOp === 'delete' && !!change.oldId)
  const inserts = collectChanges(root, (change) => change.primaryOp === 'insert' && !!change.newId)
  const coveredOld = new Set<string>()
  const coveredNew = new Set<string>()

  const candidates = deletes.flatMap((deleted) =>
    inserts
      .map((inserted) => ({ deleted, inserted }))
      .filter(({ deleted: oldChange, inserted: newChange }) => moveCandidateAllowed(context, oldChange, newChange)),
  )

  candidates.sort((left, right) => subtreeSizeOfChange(context, right.deleted, right.inserted) - subtreeSizeOfChange(context, left.deleted, left.inserted))

  for (const candidate of candidates) {
    const oldId = candidate.deleted.oldId!
    const newId = candidate.inserted.newId!
    if (coveredOld.has(oldId) || coveredNew.has(newId)) continue

    const matchKind = classifyMove(context, oldId, newId, deletes, inserts)
    if (!matchKind) continue

    const logicalMoveId = makeMoveId(oldId, newId)
    const pair = addMatch(context, oldId, newId, matchKind, logicalMoveId, 1)
    if (!pair) continue

    coverDescendants(context.oldIndex, oldId, coveredOld)
    coverDescendants(context.newIndex, newId, coveredNew)
    convertChangeToMove(candidate.deleted, pair, 'source')
    convertChangeToMove(candidate.inserted, pair, 'target')
    candidate.deleted.children = []
    candidate.inserted.children = []
  }
}

async function recoverRenamesAndMeta(context: DiffContext, root: DiffChange): Promise<void> {
  for (const change of collectChanges(root, () => true)) {
    if (!change.oldId || !change.newId) continue
    const oldNode = context.oldIndex.byId.get(change.oldId)
    const newNode = context.newIndex.byId.get(change.newId)
    if (!oldNode || !newNode) continue

    if (oldNode.kind === 'heading' && newNode.kind === 'heading') {
      const titlesDiffer = oldNode.normalizedTitle !== newNode.normalizedTitle
      if (titlesDiffer && uniqueHeadingSiblingNames(context, oldNode, newNode)) {
        if (oldNode.headingBodyHash === newNode.headingBodyHash && sameHeadingStructure(oldNode, newNode)) {
          upgradeToMatch(change)
          change.primaryOp = 'equal'
          change.status.renamed = true
          change.status.selfChanged = false
        } else if (oldNode.contentOnlyHash === newNode.contentOnlyHash) {
          change.status.renamed = true
          change.status.selfChanged = true
        }
      }
    }

    if (oldNode.kind === 'footnote' && newNode.kind === 'footnote') {
      const oldIdentifier = normalizeIdentifier((oldNode.section?.heading as any)?.identifier)
      const newIdentifier = normalizeIdentifier((newNode.section?.heading as any)?.identifier)
      if (
        oldIdentifier !== newIdentifier &&
        oldNode.identityHash === newNode.identityHash &&
        hasUniqueIdentityRenameCandidate(context, oldNode, newNode)
      ) {
        upgradeToMatch(change)
        change.primaryOp = 'equal'
        change.status.renamed = true
        change.status.selfChanged = false
      }
    }

    if (oldNode.blockType === 'definition' && newNode.blockType === 'definition') {
      const oldIdentifier = normalizeIdentifier((oldNode.block as any)?.identifier)
      const newIdentifier = normalizeIdentifier((newNode.block as any)?.identifier)
      if (
        oldIdentifier !== newIdentifier &&
        oldNode.identityHash === newNode.identityHash &&
        hasUniqueIdentityRenameCandidate(context, oldNode, newNode)
      ) {
        upgradeToMatch(change)
        change.primaryOp = 'equal'
        change.status.renamed = true
        change.status.selfChanged = false
      } else if (oldIdentifier !== newIdentifier) {
        change.status.renamed = true
        change.status.metaChanged = true
      } else if (oldNode.identityHash !== newNode.identityHash) {
        change.primaryOp = 'meta-update'
        change.status.metaChanged = true
        change.status.selfChanged = false
      }
    }

    if (oldNode.blockType === 'code' && newNode.blockType === 'code') {
      if (oldNode.contentOnlyHash === newNode.contentOnlyHash && oldNode.selfHash !== newNode.selfHash) {
        upgradeToMatch(change)
        change.primaryOp = 'meta-update'
        change.status.metaChanged = true
        change.status.selfChanged = false
      }
    }

    if (oldNode.blockType === 'table' && newNode.blockType === 'table') {
      const tableMeta = await computeTableMetadataChange(oldNode, newNode, context.options)
      if (isStructuralOnlyTableChange(oldNode, newNode, tableMeta)) {
        upgradeToMatch(change)
        change.primaryOp = 'meta-update'
        change.status.metaChanged = true
        change.status.selfChanged = false
        change.tableDiff = tableMeta
      } else {
        change.tableDiff = tableMeta
      }
    }

    if (oldNode.kind === 'listItem' && newNode.kind === 'listItem') {
      if (oldNode.section?.checked !== newNode.section?.checked && oldNode.contentOnlyHash === newNode.contentOnlyHash) {
        upgradeToMatch(change)
        change.primaryOp = 'meta-update'
        change.status.metaChanged = true
        change.status.selfChanged = false
      }
    }

    if (oldNode.kind === 'frontmatter' && newNode.kind === 'frontmatter') {
      const metadataChanges = diffFrontmatter(
        oldNode.section?.frontmatterType,
        oldNode.section?.frontmatterValue,
        newNode.section?.frontmatterType,
        newNode.section?.frontmatterValue,
      )
      if (metadataChanges.length > 0) {
        upgradeToMatch(change)
        change.primaryOp = 'meta-update'
        change.status.metaChanged = true
        change.status.selfChanged = false
        change.metadataChanges = metadataChanges
        change.children = metadataChanges.map((entry) => metadataChangeToDiff(entry))
      }
    }
  }
}

async function computePresentationDiffs(context: DiffContext, root: DiffChange): Promise<void> {
  for (const change of collectChanges(root, () => true)) {
    if (!change.oldId || !change.newId) continue
    const oldNode = context.oldIndex.byId.get(change.oldId)
    const newNode = context.newIndex.byId.get(change.newId)
    if (!oldNode || !newNode) continue

    if (oldNode.entity === 'block' && newNode.entity === 'block') {
      if (oldNode.blockType === 'paragraph' && newNode.blockType === 'paragraph') {
        const result = await diffInlineNodes(
          oldNode.block?.children ?? [],
          newNode.block?.children ?? [],
          context.options.maxInlineDiffMatrixCost,
          sequenceTuning(context.options),
        )
        change.inlineSpans = result.spans
        if (result.inlineStructureChanged) change.status.inlineStructureChanged = true
        if (result.deferred) change.warnings.push('inline-deferred')
      }

      if (oldNode.blockType === 'code' && newNode.blockType === 'code') {
        if (oldNode.contentOnlyHash !== newNode.contentOnlyHash) {
          change.codeSpans = diffCodeLines(String(oldNode.block?.value ?? ''), String(newNode.block?.value ?? ''), context.options)
        }
      }

      if (oldNode.blockType === 'table' && newNode.blockType === 'table') {
        change.tableDiff ??= await computeTableMetadataChange(oldNode, newNode, context.options)
      }
    }

    if (oldNode.kind === 'heading' && newNode.kind === 'heading' && change.status.renamed) {
      change.titleInlineSpans = await diffWordText(
        oldNode.section?.title ?? '',
        newNode.section?.title ?? '',
        sequenceTuning(context.options),
      )
    }
  }
}

function validateTree(root: DiffChange, warnings: string[]): void {
  for (const change of collectChanges(root, () => true)) {
    if ((change.primaryOp === 'insert' || change.primaryOp === 'delete') && (change.status.isMatchPair || change.status.isAlignedPair)) {
      warnings.push(`invalid-pair-state:${change.summary}`)
    }
    if (change.primaryOp === 'move' && !change.status.moved) warnings.push(`invalid-move-state:${change.summary}`)
    if (change.primaryOp === 'meta-update' && !change.status.metaChanged) warnings.push(`invalid-meta-state:${change.summary}`)
    if (change.primaryOp === 'equal' && change.status.selfChanged && !change.status.renamed) warnings.push(`invalid-equal-state:${change.summary}`)
    if (change.status.isMatchPair && change.pairKind !== 'match') warnings.push(`invalid-match-kind:${change.summary}`)
    if (change.status.isAlignedPair && change.pairKind !== 'align') warnings.push(`invalid-align-kind:${change.summary}`)
    if (
      change.entity !== 'metadata' &&
      change.primaryOp === 'meta-update' &&
      !change.status.isMatchPair
    ) {
      warnings.push(`invalid-meta-pair:${change.summary}`)
    }
    if (change.primaryOp === 'move' && (!change.logicalMoveId || !change.moveRole)) warnings.push(`invalid-move-link:${change.summary}`)
  }
}

function collectStats(root: DiffChange) {
  const logicalMoves = new Set<string>()
  const stats = {
    inserts: 0,
    deletes: 0,
    replaces: 0,
    moves: 0,
    metaUpdates: 0,
    renames: 0,
  }

  for (const change of collectChanges(root, () => true)) {
    if (change.primaryOp === 'insert') stats.inserts++
    if (change.primaryOp === 'delete') stats.deletes++
    if (change.primaryOp === 'replace') stats.replaces++
    if (change.primaryOp === 'meta-update') stats.metaUpdates++
    if (change.status.renamed) stats.renames++
    if (change.logicalMoveId) logicalMoves.add(change.logicalMoveId)
  }
  stats.moves = logicalMoves.size
  return stats
}

function collectQuality(root: DiffChange, warnings: string[]): DiffQualitySummary {
  let degradedCount = 0
  let inlineDeferredCount = 0

  for (const change of collectChanges(root, () => true)) {
    if (change.degraded) degradedCount++
    if (change.warnings.includes('inline-deferred')) inlineDeferredCount++
  }

  return {
    degradedCount,
    inlineDeferredCount,
    warningCount: warnings.length,
  }
}

async function diffInlineNodes(
  oldChildren: InlineContent[],
  newChildren: InlineContent[],
  maxInlineDiffMatrixCost: number,
  sequenceOptions: Pick<DiffOptions, 'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'>,
): Promise<{ spans: InlineSpan[]; inlineStructureChanged: boolean; deferred: boolean }> {
  if (estimateInlineDiffCost(oldChildren, newChildren) > maxInlineDiffMatrixCost) {
    return {
      spans: [{ op: 'replace', oldText: extractInlineText(oldChildren), newText: extractInlineText(newChildren) }],
      inlineStructureChanged: false,
      deferred: true,
    }
  }

  const [oldTokens, newTokens] = await Promise.all([buildInlineTokens(oldChildren), buildInlineTokens(newChildren)])
  const edits = alignSequence(
    oldTokens.map((token) => token.hash),
    newTokens.map((token) => token.hash),
    sequenceOptions,
    'myers',
  )

  const spans: InlineSpan[] = []
  let oldGap: InlineToken[] = []
  let newGap: InlineToken[] = []
  let inlineStructureChanged = false

  for (const edit of edits) {
    if (edit.op === 'equal') {
      if (oldGap.length > 0 || newGap.length > 0) {
        const span = await buildInlineReplaceSpan(oldGap, newGap, sequenceOptions)
        spans.push(span)
        if (span.oldTokens?.some((token) => token.type !== 'text') || span.newTokens?.some((token) => token.type !== 'text')) {
          inlineStructureChanged = true
        }
        oldGap = []
        newGap = []
      }

      spans.push({
        op: 'equal',
        oldText: oldTokens[edit.oldIndex!]?.rawText,
        newText: newTokens[edit.newIndex!]?.rawText,
        oldTokens: [oldTokens[edit.oldIndex!]!],
        newTokens: [newTokens[edit.newIndex!]!],
      })
      continue
    }

    if (edit.op === 'delete' && edit.oldIndex !== undefined) oldGap.push(oldTokens[edit.oldIndex]!)
    if (edit.op === 'insert' && edit.newIndex !== undefined) newGap.push(newTokens[edit.newIndex]!)
  }

  if (oldGap.length > 0 || newGap.length > 0) {
    const span = await buildInlineReplaceSpan(oldGap, newGap, sequenceOptions)
    spans.push(span)
    if (span.oldTokens?.some((token) => token.type !== 'text') || span.newTokens?.some((token) => token.type !== 'text')) {
      inlineStructureChanged = true
    }
  }

  return { spans, inlineStructureChanged, deferred: false }
}

function diffCodeLines(oldValue: string, newValue: string, options: DiffOptions): LineDiffSpan[] {
  const oldLines = oldValue.split(/\r?\n/u)
  const newLines = newValue.split(/\r?\n/u)
  const edits = alignSequence(oldLines, newLines, options, 'heckel')
  const spans = coalesceLineDiffSpans(edits, oldLines, newLines, sequenceTuning(options))

  if (oldLines.length > options.longCodeLineThreshold || newLines.length > options.longCodeLineThreshold) {
    return foldLongCodeSpans(spans, options.codeFoldContextLines)
  }
  return spans
}

async function computeTableMetadataChange(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  options: DiffOptions,
): Promise<TableDiff> {
  const oldRows = readTableCells(oldNode.block)
  const newRows = readTableCells(newNode.block)
  const oldStructuredRows = readStructuredTableCells(oldNode.block)
  const newStructuredRows = readStructuredTableCells(newNode.block)
  const oldAlign = Array.isArray(oldNode.block?.align) ? (oldNode.block.align as string[]) : []
  const newAlign = Array.isArray(newNode.block?.align) ? (newNode.block.align as string[]) : []
  const shapeChanged = oldRows.length !== newRows.length || maxColumns(oldRows) !== maxColumns(newRows)
  const alignmentChanged = JSON.stringify(oldAlign) !== JSON.stringify(newAlign)
  const cellDiffs: TableCellDiff[] = []

  if (!shapeChanged) {
    for (let row = 0; row < oldRows.length; row++) {
      const oldRow = oldStructuredRows[row] ?? []
      const newRow = newStructuredRows[row] ?? []
      for (let column = 0; column < oldRow.length; column++) {
        const oldCell = oldRow[column] ?? []
        const newCell = newRow[column] ?? []
        const oldText = extractInlineText(oldCell)
        const newText = extractInlineText(newCell)
        const result = await diffInlineNodes(
          oldCell,
          newCell,
          options.maxInlineDiffMatrixCost,
          sequenceTuning(options),
        )
        const spans = result.spans.length > 0 ? result.spans : [{
          op: 'replace' as const,
          oldText,
          newText,
          wordSpans: diffWordTextSync(oldText, newText, sequenceTuning(options)),
        }]
        if (!hasMeaningfulInlineDiff(spans, oldText, newText)) continue
        cellDiffs.push({
          row,
          column,
          spans,
        })
      }
    }
  }

  return {
    structureChanged: shapeChanged || alignmentChanged,
    shapeChanged,
    alignmentChanged,
    cellDiffs,
  }
}

async function diffWordText(
  oldText: string,
  newText: string,
  sequenceOptions: Pick<DiffOptions, 'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'>,
): Promise<InlineSpan[]> {
  return [
    {
      op: oldText === newText ? 'equal' : 'replace',
      oldText,
      newText,
      wordSpans: diffWordTextSync(oldText, newText, sequenceOptions),
    },
  ]
}

function diffWordTextSync(
  oldText: string,
  newText: string,
  sequenceOptions: Pick<DiffOptions, 'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'>,
): Array<{ op: 'equal' | 'insert' | 'delete' | 'replace'; oldText?: string; newText?: string }> {
  const oldWords = tokenizeText(oldText)
  const newWords = tokenizeText(newText)
  const edits = alignSequence(oldWords, newWords, sequenceOptions, 'myers')
  return coalesceTextSpans(edits, oldWords, newWords, ' ')
}

async function buildInlineReplaceSpan(
  oldTokens: InlineToken[],
  newTokens: InlineToken[],
  sequenceOptions: Pick<DiffOptions, 'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'>,
): Promise<InlineSpan> {
  const oldText = oldTokens.map((token) => token.rawText).join('')
  const newText = newTokens.map((token) => token.rawText).join('')
  const textOnly = oldTokens.every((token) => token.type === 'text') && newTokens.every((token) => token.type === 'text')
  return {
    op: 'replace',
    oldText,
    newText,
    oldTokens,
    newTokens,
    wordSpans: textOnly ? diffWordTextSync(oldText, newText, sequenceOptions) : undefined,
  }
}

function diffCharacters(
  oldText: string,
  newText: string,
  sequenceOptions: Pick<DiffOptions, 'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'>,
): Array<{ op: 'equal' | 'insert' | 'delete' | 'replace'; oldText?: string; newText?: string }> {
  const oldChars = [...oldText]
  const newChars = [...newText]
  const edits = alignSequence(oldChars, newChars, sequenceOptions, 'myers')
  return coalesceTextSpans(edits, oldChars, newChars, '')
}

function coalesceTextSpans(
  edits: Array<{ op: 'equal' | 'insert' | 'delete'; oldIndex?: number; newIndex?: number }>,
  oldUnits: string[],
  newUnits: string[],
  separator: string,
): Array<{ op: 'equal' | 'insert' | 'delete' | 'replace'; oldText?: string; newText?: string }> {
  const spans: Array<{ op: 'equal' | 'insert' | 'delete' | 'replace'; oldText?: string; newText?: string }> = []
  let pendingDeletes: string[] = []
  let pendingInserts: string[] = []

  const flushPending = () => {
    if (pendingDeletes.length === 0 && pendingInserts.length === 0) return
    if (pendingDeletes.length > 0 && pendingInserts.length > 0) {
      spans.push({
        op: 'replace',
        oldText: pendingDeletes.join(separator),
        newText: pendingInserts.join(separator),
      })
    } else if (pendingDeletes.length > 0) {
      spans.push({ op: 'delete', oldText: pendingDeletes.join(separator) })
    } else {
      spans.push({ op: 'insert', newText: pendingInserts.join(separator) })
    }
    pendingDeletes = []
    pendingInserts = []
  }

  for (const edit of edits) {
    if (edit.op === 'equal') {
      flushPending()
      spans.push({
        op: 'equal',
        oldText: edit.oldIndex !== undefined ? oldUnits[edit.oldIndex] : undefined,
        newText: edit.newIndex !== undefined ? newUnits[edit.newIndex] : undefined,
      })
      continue
    }

    if (edit.op === 'delete' && edit.oldIndex !== undefined) pendingDeletes.push(oldUnits[edit.oldIndex] ?? '')
    if (edit.op === 'insert' && edit.newIndex !== undefined) pendingInserts.push(newUnits[edit.newIndex] ?? '')
  }

  flushPending()
  return spans
}

function coalesceLineDiffSpans(
  edits: Array<{ op: 'equal' | 'insert' | 'delete'; oldIndex?: number; newIndex?: number }>,
  oldLines: string[],
  newLines: string[],
  sequenceOptions: Pick<DiffOptions, 'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'>,
): LineDiffSpan[] {
  const spans: LineDiffSpan[] = []
  let deleteIndexes: number[] = []
  let insertIndexes: number[] = []

  const flushPending = () => {
    if (deleteIndexes.length === 0 && insertIndexes.length === 0) return

    if (deleteIndexes.length > 0 && insertIndexes.length > 0) {
      const deletes = deleteIndexes.map((index) => oldLines[index] ?? '')
      const inserts = insertIndexes.map((index) => newLines[index] ?? '')
      const max = Math.max(deletes.length, inserts.length)
      for (let offset = 0; offset < max; offset++) {
        const oldLine = deletes[offset]
        const newLine = inserts[offset]
        if (oldLine !== undefined && newLine !== undefined) {
          spans.push({
            op: 'replace',
            oldLine,
            newLine,
            charSpans: diffCharacters(oldLine, newLine, sequenceOptions),
          })
        } else if (oldLine !== undefined) {
          spans.push({ op: 'delete', oldLine })
        } else if (newLine !== undefined) {
          spans.push({ op: 'insert', newLine })
        }
      }
    } else if (deleteIndexes.length > 0) {
      deleteIndexes.forEach((index) => spans.push({ op: 'delete', oldLine: oldLines[index] }))
    } else {
      insertIndexes.forEach((index) => spans.push({ op: 'insert', newLine: newLines[index] }))
    }

    deleteIndexes = []
    insertIndexes = []
  }

  for (const edit of edits) {
    if (edit.op === 'equal') {
      flushPending()
      spans.push({
        op: 'equal',
        oldLine: edit.oldIndex !== undefined ? oldLines[edit.oldIndex] : undefined,
        newLine: edit.newIndex !== undefined ? newLines[edit.newIndex] : undefined,
      })
      continue
    }

    if (edit.op === 'delete' && edit.oldIndex !== undefined) deleteIndexes.push(edit.oldIndex)
    if (edit.op === 'insert' && edit.newIndex !== undefined) insertIndexes.push(edit.newIndex)
  }

  flushPending()
  return spans
}

function hasMeaningfulInlineDiff(spans: InlineSpan[], oldText: string, newText: string): boolean {
  if (spans.some((span) => span.op !== 'equal')) return true
  return oldText !== newText
}

function isStructuralOnlyTableChange(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  tableDiff: TableDiff,
): boolean {
  if (!tableDiff.structureChanged || tableDiff.cellDiffs.length > 0) return false
  return JSON.stringify(readTableCells(oldNode.block)) === JSON.stringify(readTableCells(newNode.block))
}

function foldLongCodeSpans(spans: LineDiffSpan[], contextLines: number): LineDiffSpan[] {
  const changed = spans
    .map((span, index) => ({ span, index }))
    .filter(({ span }) => span.op !== 'equal')
    .map(({ index }) => index)
  if (changed.length === 0) return spans.slice(0, contextLines * 2)

  const keep = new Set<number>()
  for (const index of changed) {
    for (let cursor = Math.max(0, index - contextLines); cursor <= Math.min(spans.length - 1, index + contextLines); cursor++) {
      keep.add(cursor)
    }
  }
  for (let index = 0; index < Math.min(contextLines, spans.length); index++) keep.add(index)
  for (let index = Math.max(0, spans.length - contextLines); index < spans.length; index++) keep.add(index)

  return spans.filter((_, index) => keep.has(index))
}

function metadataChangeToDiff(change: MetadataChange): DiffChange {
  return {
    entity: 'metadata',
    primaryOp: 'meta-update',
    status: createStatus({ metaChanged: true }),
    summary: `${change.op} metadata ${change.path}`,
    metadataChanges: [change],
    children: [],
    warnings: [],
  }
}

async function ensureMatchedToken(
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
  const score = computeNodeSimilarity(oldNode, newNode, context.options, parentContextScore(context, oldParentId, newParentId))
  if (oldNode.selfHash === newNode.selfHash && score >= context.options.minSimilarity) {
    return addMatch(context, oldId, newId, 'exact-self-with-context', undefined, score)
  }

  return undefined
}

function addMatch(
  context: DiffContext,
  oldId: string,
  newId: string,
  matchKind: MatchKind,
  logicalMoveId?: string,
  score?: number,
): MatchPair | undefined {
  const existingOld = context.matchesByOld.get(oldId)
  const existingNew = context.matchesByNew.get(newId)
  if (existingOld || existingNew) {
    if (existingOld && existingOld.newId === newId) {
      if (logicalMoveId && !existingOld.logicalMoveId) existingOld.logicalMoveId = logicalMoveId
      if (score !== undefined) existingOld.score = score
      return existingOld
    }
    return undefined
  }

  const pair: MatchPair = {
    oldId,
    newId,
    pairKind: 'match',
    pairKey: makePairKey('match', oldId, newId),
    matchKind,
    logicalMoveId,
    score,
  }
  context.matchesByOld.set(oldId, pair)
  context.matchesByNew.set(newId, pair)
  return pair
}

function canDeterministicallyMatch(
  context: DiffContext,
  anchors: AnchorRegistry,
  oldId: string,
  newId: string,
): boolean {
  const oldNode = context.oldIndex.byId.get(oldId)
  const newNode = context.newIndex.byId.get(newId)
  if (!oldNode || !newNode || !isSameShape(oldNode, newNode)) return false

  if (oldNode.parentId && newNode.parentId) {
    const parentPair = context.matchesByOld.get(oldNode.parentId)
    if (parentPair?.newId === newNode.parentId) return true
  }

  if (!withinSiblingOffsetThreshold(context, oldNode, newNode)) return false
  if (!isCandidateWithinAnchoredBounds(context, anchors, oldNode, newNode)) return false
  return hasLocalHashContext(context, anchors, oldNode, newNode)
}

function classifyExactSelfCandidate(
  context: DiffContext,
  anchors: AnchorRegistry,
  oldId: string,
  newId: string,
): MatchCandidate | undefined {
  const oldNode = context.oldIndex.byId.get(oldId)
  const newNode = context.newIndex.byId.get(newId)
  if (!oldNode || !newNode || !isSameShape(oldNode, newNode)) return undefined

  if (oldNode.parentId && newNode.parentId) {
    const parentPair = context.matchesByOld.get(oldNode.parentId)
    if (parentPair?.newId === newNode.parentId) {
      return { oldId, newId, matchKind: 'exact-self', priority: 5, score: 1 }
    }
  }

  if (!withinSiblingOffsetThreshold(context, oldNode, newNode)) return undefined
  if (!isCandidateWithinAnchoredBounds(context, anchors, oldNode, newNode)) return undefined
  if (!hasLocalHashContext(context, anchors, oldNode, newNode)) return undefined
  return { oldId, newId, matchKind: 'exact-self-with-context', priority: 5, score: 1 }
}

function hasLocalHashContext(
  context: DiffContext,
  anchors: AnchorRegistry,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  const oldSiblings = oldNode.parentId ? context.oldIndex.childrenById.get(oldNode.parentId) ?? [] : []
  const newSiblings = newNode.parentId ? context.newIndex.childrenById.get(newNode.parentId) ?? [] : []

  const siblingBounds =
    oldNode.parentId && newNode.parentId
      ? resolveSiblingAnchorBounds(context, oldNode.parentId, newNode.parentId, oldNode.siblingIndex)
      : undefined

  const oldWindow = sliceSiblingWitnessWindow(
    oldSiblings,
    oldNode.siblingIndex,
    context.options.contextSiblingWindow,
    siblingBounds?.oldMin,
    siblingBounds?.oldMax,
  ).filter((candidateOldId) => candidateOldId !== oldNode.id)

  const newWindow = sliceSiblingWitnessWindow(
    newSiblings,
    newNode.siblingIndex,
    context.options.contextSiblingWindow,
    siblingBounds?.newMin,
    siblingBounds?.newMax,
  ).filter((candidateNewId) => {
    if (candidateNewId === newNode.id) return false
    if (siblingBounds) return true
    const candidateNew = context.newIndex.byId.get(candidateNewId)
    if (!candidateNew) return false
    const interval = anchors.getGlobalInterval(oldNode.preorder, context.newIndex.nodesInPreorder.length)
    return candidateNew.preorder >= interval.min && candidateNew.preorder <= interval.max
  })

  return oldWindow.some((candidateOldId) => {
    const candidateOld = context.oldIndex.byId.get(candidateOldId)
    if (!candidateOld) return false
    return newWindow.some((candidateNewId) => {
      const candidateNew = context.newIndex.byId.get(candidateNewId)
      return !!candidateNew && candidateOld.selfHash === candidateNew.selfHash
    })
  })
}

function sameHeadingStructure(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  return (
    oldNode.section?.headingDepth === newNode.section?.headingDepth &&
    oldNode.section?.listDepth === newNode.section?.listDepth &&
    oldNode.section?.quoteDepth === newNode.section?.quoteDepth
  )
}

function projectToken(context: DiffContext, childId: string, oppositeParentId: string, tree: 'old' | 'new'): string {
  const match = tree === 'old' ? context.matchesByOld.get(childId) : context.matchesByNew.get(childId)
  if (match) {
    const oppositeId = tree === 'old' ? match.newId : match.oldId
    const oppositeNode = context.newIndex.byId.get(oppositeId) ?? context.oldIndex.byId.get(oppositeId)
    if (oppositeNode?.parentId === oppositeParentId) return `MATCHED:${match.pairKey}`
  }

  const node = tree === 'old' ? context.oldIndex.byId.get(childId) : context.newIndex.byId.get(childId)
  return `SELF:${node?.selfHash ?? childId}`
}

function parentContextScore(context: DiffContext, oldParentId: string, newParentId: string): number {
  const pair = context.matchesByOld.get(oldParentId)
  return pair?.newId === newParentId
    ? DIFF_HEURISTICS.context.matchedParentScore
    : DIFF_HEURISTICS.context.unmatchedParentScore
}

function oldRootPair(context: DiffContext): MatchPair | undefined {
  return context.matchesByOld.get(context.oldIndex.rootId)
}

function shouldRegisterDeterministicAnchor(matchKind: MatchKind | undefined): boolean {
  return matchKind === 'forced-root' || matchKind === 'exact-subtree' || matchKind === 'exact-self'
}

function registerDeterministicAnchor(
  context: DiffContext,
  anchors: AnchorRegistry,
  pair: MatchPair | undefined,
): void {
  if (!pair || !shouldRegisterDeterministicAnchor(pair.matchKind)) return
  const oldNode = context.oldIndex.byId.get(pair.oldId)
  const newNode = context.newIndex.byId.get(pair.newId)
  if (!oldNode || !newNode) return
  anchors.register(oldNode.preorder, newNode.preorder)
}

function isCandidateWithinAnchoredBounds(
  context: DiffContext,
  anchors: AnchorRegistry,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  if (oldNode.parentId && newNode.parentId) {
    const siblingBounds = resolveSiblingAnchorBounds(context, oldNode.parentId, newNode.parentId, oldNode.siblingIndex)
    if (siblingBounds) {
      return newNode.siblingIndex >= siblingBounds.newMin && newNode.siblingIndex <= siblingBounds.newMax
    }
  }

  const interval = anchors.getGlobalInterval(oldNode.preorder, context.newIndex.nodesInPreorder.length)
  return newNode.preorder >= interval.min && newNode.preorder <= interval.max
}

function resolveSiblingAnchorBounds(
  context: DiffContext,
  oldParentId: string,
  newParentId: string,
  oldSiblingIndex: number,
): SiblingAnchorBounds | undefined {
  const oldSiblings = context.oldIndex.childrenById.get(oldParentId) ?? []
  const newSiblings = context.newIndex.childrenById.get(newParentId) ?? []
  if (oldSiblings.length === 0 || newSiblings.length === 0) return undefined

  let leftOldAnchorIndex = -1
  let leftNewAnchorIndex = -1
  for (let index = Math.min(oldSiblingIndex - 1, oldSiblings.length - 1); index >= 0; index--) {
    const siblingId = oldSiblings[index]
    if (!siblingId) continue
    const pair = context.matchesByOld.get(siblingId)
    if (!pair) continue
    const matchedNode = context.newIndex.byId.get(pair.newId)
    if (!matchedNode || matchedNode.parentId !== newParentId) continue
    leftOldAnchorIndex = index
    leftNewAnchorIndex = matchedNode.siblingIndex
    break
  }

  let rightOldAnchorIndex = oldSiblings.length
  let rightNewAnchorIndex = newSiblings.length
  for (let index = Math.max(0, oldSiblingIndex + 1); index < oldSiblings.length; index++) {
    const siblingId = oldSiblings[index]
    if (!siblingId) continue
    const pair = context.matchesByOld.get(siblingId)
    if (!pair) continue
    const matchedNode = context.newIndex.byId.get(pair.newId)
    if (!matchedNode || matchedNode.parentId !== newParentId) continue
    rightOldAnchorIndex = index
    rightNewAnchorIndex = matchedNode.siblingIndex
    break
  }

  if (leftOldAnchorIndex === -1 && rightOldAnchorIndex === oldSiblings.length) return undefined

  const oldMin = Math.max(0, leftOldAnchorIndex + 1)
  const oldMax = Math.min(oldSiblings.length - 1, rightOldAnchorIndex - 1)
  const newMin = Math.max(0, leftNewAnchorIndex + 1)
  const newMax = Math.min(newSiblings.length - 1, rightNewAnchorIndex - 1)
  if (oldMin > oldMax || newMin > newMax) return undefined

  return {
    leftOldAnchorIndex,
    rightOldAnchorIndex,
    leftNewAnchorIndex,
    rightNewAnchorIndex,
    oldMin,
    oldMax,
    newMin,
    newMax,
  }
}

function boundCandidateIdsBySiblingAnchors(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newIds: string[],
  oldParentId: string,
  newParentId: string,
): string[] {
  const bounds = resolveSiblingAnchorBounds(context, oldParentId, newParentId, oldNode.siblingIndex)
  if (!bounds) return newIds

  const bounded = newIds.filter((newId) => {
    const node = context.newIndex.byId.get(newId)
    return !!node && node.siblingIndex >= bounds.newMin && node.siblingIndex <= bounds.newMax
  })
  return bounded.length > 0 ? bounded : newIds
}

function estimateSectionAlignmentCost(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number {
  const oldChildren = context.oldIndex.childrenById.get(oldNode.id)?.length ?? 0
  const newChildren = context.newIndex.childrenById.get(newNode.id)?.length ?? 0
  return oldChildren * newChildren + oldChildren + newChildren
}

function estimateAptedRecoveryCost(change: DiffChange): number {
  const deletes = change.children.filter((child) => child.primaryOp === 'delete').length
  const inserts = change.children.filter((child) => child.primaryOp === 'insert').length
  return deletes * inserts
}

function estimateInlineDiffCost(oldChildren: InlineContent[], newChildren: InlineContent[]): number {
  return oldChildren.length * newChildren.length
}

function shouldUseShortHeadingFallback(
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
  return oldNode.headingBodyHash === newNode.headingBodyHash || (oldNode.logicalChildren.length === 0 && newNode.logicalChildren.length === 0)
}

function uniqueHeadingSiblingNames(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  const oldSiblings = oldNode.parentId ? context.oldIndex.childrenById.get(oldNode.parentId) ?? [] : []
  const newSiblings = newNode.parentId ? context.newIndex.childrenById.get(newNode.parentId) ?? [] : []
  const duplicateOld = oldSiblings
    .map((id) => context.oldIndex.byId.get(id))
    .some((candidate) => candidate && candidate.id !== oldNode.id && candidate.kind === 'heading' && candidate.normalizedTitle === newNode.normalizedTitle)
  const duplicateNew = newSiblings
    .map((id) => context.newIndex.byId.get(id))
    .some((candidate) => candidate && candidate.id !== newNode.id && candidate.kind === 'heading' && candidate.normalizedTitle === oldNode.normalizedTitle)
  return !duplicateOld && !duplicateNew
}

function moveCandidateAllowed(context: DiffContext, deleted: DiffChange, inserted: DiffChange): boolean {
  const oldNode = deleted.oldId ? context.oldIndex.byId.get(deleted.oldId) : undefined
  const newNode = inserted.newId ? context.newIndex.byId.get(inserted.newId) : undefined
  if (!oldNode || !newNode || !isSameShape(oldNode, newNode)) return false
  if (Math.abs(oldNode.depth - newNode.depth) > context.options.moveDepthDiffMax && !hasCompatibleMovePath(oldNode, newNode)) {
    return false
  }
  if (oldNode.entity === 'section') {
    const ratio = oldNode.subtreeSize / Math.max(newNode.subtreeSize, 1)
    if (ratio < context.options.moveSubtreeSizeRatioMin || ratio > context.options.moveSubtreeSizeRatioMax) return false
  }
  return true
}

function classifyMove(
  context: DiffContext,
  oldId: string,
  newId: string,
  deletes: DiffChange[],
  inserts: DiffChange[],
): MatchKind | undefined {
  const oldNode = context.oldIndex.byId.get(oldId)
  const newNode = context.newIndex.byId.get(newId)
  if (!oldNode || !newNode) return undefined

  if (oldNode.subtreeHash === newNode.subtreeHash && uniqueMoveHash(deletes, inserts, context, 'subtreeHash', oldNode.subtreeHash)) {
    return 'move-exact'
  }
  if (
    oldNode.entity === 'section' &&
    oldNode.directHash === newNode.directHash &&
    (shareMatchedNeighborContext(context, oldNode, newNode) || hasCompatibleMovePath(oldNode, newNode))
  ) {
    return 'move-direct'
  }
  if (oldNode.kind === 'heading' && newNode.kind === 'heading' && oldNode.titleSlug === newNode.titleSlug) {
    const score = computeHeadingMoveScore(oldNode, newNode)
    const strongSimilarity = oldNode.headingBodyHash === newNode.headingBodyHash || score >= context.options.minSimilarity
    if (strongSimilarity && isUniqueHeadingMoveCandidate(context, oldId, newId, deletes, inserts, score)) {
      return 'move-heading'
    }
  }
  if (oldNode.blockType === 'code' && newNode.blockType === 'code' && oldNode.contentOnlyHash === newNode.contentOnlyHash && uniqueMoveHash(deletes, inserts, context, 'contentOnlyHash', oldNode.contentOnlyHash)) {
    return 'move-code'
  }
  return undefined
}

function computeHeadingMoveScore(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number {
  if (oldNode.headingBodyHash && newNode.headingBodyHash && oldNode.headingBodyHash === newNode.headingBodyHash) return 1
  if (oldNode.contentOnlyHash === newNode.contentOnlyHash) return 1
  return jaccardSimilarity(oldNode.textTokens, newNode.textTokens)
}

function hasCompatibleMovePath(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  if (oldNode.pathParts.length === 0 || newNode.pathParts.length === 0) return false
  return longestCommonPathSuffix(oldNode.pathParts, newNode.pathParts) === Math.min(oldNode.pathParts.length, newNode.pathParts.length)
}

function longestCommonPathSuffix(left: readonly string[], right: readonly string[]): number {
  let matches = 0
  for (let leftIndex = left.length - 1, rightIndex = right.length - 1; leftIndex >= 0 && rightIndex >= 0; leftIndex--, rightIndex--) {
    if (left[leftIndex] !== right[rightIndex]) break
    matches++
  }
  return matches
}

function isUniqueHeadingMoveCandidate(
  context: DiffContext,
  oldId: string,
  newId: string,
  deletes: DiffChange[],
  inserts: DiffChange[],
  score: number,
): boolean {
  const candidates = deletes
    .map((change) => (change.oldId ? context.oldIndex.byId.get(change.oldId) : undefined))
    .filter((node): node is NonNullable<typeof node> => !!node && node.kind === 'heading')
    .flatMap((oldHeading) =>
      inserts
        .map((change) => (change.newId ? context.newIndex.byId.get(change.newId) : undefined))
        .filter(
          (node): node is NonNullable<typeof node> =>
            !!node && node.kind === 'heading' && node.titleSlug === oldHeading.titleSlug,
        )
        .map((newHeading) => ({
          oldId: oldHeading.id,
          newId: newHeading.id,
          score: computeHeadingMoveScore(oldHeading, newHeading),
        })),
  )
  const target = candidates.find((candidate) => candidate.oldId === oldId && candidate.newId === newId)
  if (!target || target.score !== score) return false

  const oldScores = candidates.filter((candidate) => candidate.oldId === oldId).map((candidate) => candidate.score)
  const newScores = candidates.filter((candidate) => candidate.newId === newId).map((candidate) => candidate.score)
  return (
    uniquenessMargin(oldScores) >= context.options.minUniquenessMargin &&
    uniquenessMargin(newScores) >= context.options.minUniquenessMargin
  )
}

function uniqueMoveHash(
  deletes: DiffChange[],
  inserts: DiffChange[],
  context: DiffContext,
  key: 'subtreeHash' | 'contentOnlyHash',
  value: string,
): boolean {
  const oldMatches = deletes.filter((change) => {
    const node = change.oldId ? context.oldIndex.byId.get(change.oldId) : undefined
    return node?.[key] === value
  })
  const newMatches = inserts.filter((change) => {
    const node = change.newId ? context.newIndex.byId.get(change.newId) : undefined
    return node?.[key] === value
  })
  return oldMatches.length === 1 && newMatches.length === 1
}

function hasUniqueIdentityRenameCandidate(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  const oldCandidates = (context.oldIndex.byIdentityHash.get(oldNode.identityHash) ?? [])
    .map((id) => context.oldIndex.byId.get(id))
    .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate && isSameShape(candidate, oldNode))
  const newCandidates = (context.newIndex.byIdentityHash.get(newNode.identityHash) ?? [])
    .map((id) => context.newIndex.byId.get(id))
    .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate && isSameShape(candidate, newNode))

  return oldCandidates.length === 1 && newCandidates.length === 1
}

function shareMatchedNeighborContext(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  if (!oldNode.parentId || !newNode.parentId) return false
  const oldSiblings = context.oldIndex.childrenById.get(oldNode.parentId) ?? []
  const newSiblings = context.newIndex.childrenById.get(newNode.parentId) ?? []
  const oldNeighborIds = neighborIds(oldSiblings, oldNode.siblingIndex)
  const newNeighborIds = neighborIds(newSiblings, newNode.siblingIndex)
  return oldNeighborIds.some((oldNeighborId) => {
    const pair = context.matchesByOld.get(oldNeighborId)
    return !!pair && newNeighborIds.includes(pair.newId)
  })
}

function collectStructuralFallbackPairs(
  context: DiffContext,
  change: DiffChange,
  oldParentId: string,
  newParentId: string,
  aptedMatches: Array<{ oldId: string; newId: string; tedCost: number }>,
): AlignedPair[] {
  if (aptedMatches.length === 0) return []

  type RawCandidate = AlignedPair & { tedCost: number }
  const candidates: RawCandidate[] = []
  const scoresByOld = new Map<string, number[]>()
  const scoresByNew = new Map<string, number[]>()

  for (const { oldId, newId, tedCost } of aptedMatches) {
    const oldChild = context.oldIndex.byId.get(oldId)
    const newChild = context.newIndex.byId.get(newId)
    if (!oldChild || !newChild || !isSameShape(oldChild, newChild)) continue
    const score = computeStructuralFallbackScore(context, oldChild, newChild, oldParentId, newParentId)
    push(scoresByOld, oldId, score)
    push(scoresByNew, newId, score)
    candidates.push({
      oldId,
      newId,
      pairKind: 'align',
      pairKey: makePairKey('align', oldId, newId),
      score,
      tedCost,
    })
  }

  const filtered = candidates
    .map((candidate) => ({
      ...candidate,
      oldMargin: uniquenessMargin(scoresByOld.get(candidate.oldId) ?? [candidate.score ?? 0]),
      newMargin: uniquenessMargin(scoresByNew.get(candidate.newId) ?? [candidate.score ?? 0]),
    }))
    .filter((candidate) => {
      const score = candidate.score ?? 0
      return (
        score >= context.options.minSimilarity &&
        candidate.oldMargin >= context.options.minUniquenessMargin &&
        candidate.newMargin >= context.options.minUniquenessMargin
      )
    })
    .sort((left, right) => left.tedCost - right.tedCost || (right.score ?? 0) - (left.score ?? 0))

  const usedOld = new Set<string>()
  const usedNew = new Set<string>()
  const pairs: AlignedPair[] = []
  for (const candidate of filtered) {
    if (usedOld.has(candidate.oldId) || usedNew.has(candidate.newId)) continue
    usedOld.add(candidate.oldId)
    usedNew.add(candidate.newId)
    pairs.push(candidate)
  }
  return pairs
}

function computeStructuralAptedMatches(
  context: DiffContext,
  change: DiffChange,
): Array<{ oldId: string; newId: string; tedCost: number }> {
  const deletes = change.children
    .filter((child) => child.primaryOp === 'delete' && !!child.oldId)
    .map((child) => child.oldId!)
  const inserts = change.children
    .filter((child) => child.primaryOp === 'insert' && !!child.newId)
    .map((child) => child.newId!)
  if (deletes.length === 0 || inserts.length === 0) return []

  const oldForest = deletes
    .map((oldId) => buildAptedTree(context.oldIndex, oldId))
    .filter((node): node is AptedNode<AptedDiffMeta> => !!node)
  const newForest = inserts
    .map((newId) => buildAptedTree(context.newIndex, newId))
    .filter((node): node is AptedNode<AptedDiffMeta> => !!node)
  if (oldForest.length === 0 || newForest.length === 0) return []

  const directOld = new Set(deletes)
  const directNew = new Set(inserts)
  return computeAptedMatches(oldForest, newForest, {
    canMatch: (oldTree, newTree) =>
      isSameShape(oldTree.meta.node, newTree.meta.node) &&
      withinTextRecallWindow(oldTree.meta.node, newTree.meta.node),
    relabelCost: (oldTree, newTree) => {
      const score = computeAptedRelabelScore(context, oldTree.meta.node, newTree.meta.node)
      return 1 - Math.max(0, Math.min(1, score))
    },
    deleteCost: (node) => node.subtreeSize,
    insertCost: (node) => node.subtreeSize,
  })
    .filter((match) => directOld.has(match.oldId) && directNew.has(match.newId))
    .map((match) => ({
      oldId: match.oldId,
      newId: match.newId,
      tedCost: match.cost,
    }))
}

function buildAptedTree(
  index: SemanticIndex,
  id: string,
): AptedNode<AptedDiffMeta> | undefined {
  const node = index.byId.get(id)
  if (!node) return undefined
  return {
    id: node.id,
    subtreeSize: node.subtreeSize,
    meta: { node },
    children: (index.childrenById.get(id) ?? [])
      .map((childId) => buildAptedTree(index, childId))
      .filter((child): child is AptedNode<AptedDiffMeta> => !!child),
  }
}

function computeAptedRelabelScore(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number {
  if (!isSameShape(oldNode, newNode)) return 0
  if (oldNode.selfHash === newNode.selfHash) return 1
  const pathBonus =
    oldNode.pathHash && newNode.pathHash && oldNode.pathHash === newNode.pathHash
      ? DIFF_HEURISTICS.fallback.aptedPathBonus
      : 0
  const rangeBonus =
    sourceRangeCloseness(oldNode, newNode) * DIFF_HEURISTICS.fallback.aptedRangeBonusWeight
  const simHashBonus = simHashBonusForRecall(oldNode, newNode)
  return Math.max(
    0,
    Math.min(1, computeNodeSimilarity(oldNode, newNode, context.options, 1) + pathBonus + rangeBonus + simHashBonus),
  )
}

function withinTextRecallWindow(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  if (oldNode.selfHash === newNode.selfHash) return true
  if (oldNode.identityHash === newNode.identityHash) return true
  if (oldNode.contentOnlyHash === newNode.contentOnlyHash) return true
  if (oldNode.headingBodyHash && newNode.headingBodyHash && oldNode.headingBodyHash === newNode.headingBodyHash) return true
  const distance = simHashDistanceForRecall(oldNode, newNode)
  return distance === undefined || distance <= DIFF_HEURISTICS.recall.textSimThreshold
}

function simHashDistanceForRecall(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number | undefined {
  return simHashHammingDistance(oldNode.textSimHash, newNode.textSimHash)
}

function simHashBonusForRecall(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number {
  const distance = simHashDistanceForRecall(oldNode, newNode)
  if (distance === undefined) return 0
  return (
    Math.max(0, (DIFF_HEURISTICS.recall.textSimThreshold - distance) / DIFF_HEURISTICS.recall.textSimThreshold) *
    DIFF_HEURISTICS.recall.simHashBonusWeight
  )
}

function computeStructuralFallbackScore(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  oldParentId: string,
  newParentId: string,
): number {
  const base = computeNodeSimilarity(oldNode, newNode, context.options, parentContextScore(context, oldParentId, newParentId))
  const oldChildren = context.oldIndex.childrenById.get(oldNode.id) ?? []
  const newChildren = context.newIndex.childrenById.get(newNode.id) ?? []
  const childShapeScore = childShapeSimilarity(context, oldChildren, newChildren)
  const pathScore =
    oldNode.pathHash && newNode.pathHash && oldNode.pathHash === newNode.pathHash
      ? 1
      : DIFF_HEURISTICS.fallback.score.pathMismatchScore
  const rangeScore = sourceRangeCloseness(oldNode, newNode)
  const structuralBonus =
    oldChildren.length === newChildren.length && childShapeScore === 1
      ? DIFF_HEURISTICS.fallback.score.structuralBonus
      : 0
  return Math.max(
    0,
    Math.min(
      1,
      DIFF_HEURISTICS.fallback.score.baseWeight * base +
        DIFF_HEURISTICS.fallback.score.childShapeWeight * childShapeScore +
        DIFF_HEURISTICS.fallback.score.pathWeight * pathScore +
        DIFF_HEURISTICS.fallback.score.rangeWeight * rangeScore +
        structuralBonus,
    ),
  )
}

function childShapeSimilarity(context: DiffContext, oldChildren: string[], newChildren: string[]): number {
  const oldSignature = oldChildren
    .map((childId) => context.oldIndex.byId.get(childId))
    .filter((node): node is NonNullable<typeof node> => !!node)
    .map((node) => (node.entity === 'section' ? `section:${node.kind}` : `block:${node.blockType}`))
  const newSignature = newChildren
    .map((childId) => context.newIndex.byId.get(childId))
    .filter((node): node is NonNullable<typeof node> => !!node)
    .map((node) => (node.entity === 'section' ? `section:${node.kind}` : `block:${node.blockType}`))
  if (oldSignature.length === 0 && newSignature.length === 0) return 1
  return multisetJaccardSimilarity(oldSignature, newSignature)
}

function sourceRangeCloseness(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number {
  const oldStart = oldNode.sourceRange?.start
  const newStart = newNode.sourceRange?.start
  if (!oldStart || !newStart) return DIFF_HEURISTICS.fallback.sourceRange.fallbackScore
  if (oldStart.line !== undefined && newStart.line !== undefined) {
    return Math.max(
      0,
      1 - Math.abs(oldStart.line - newStart.line) / DIFF_HEURISTICS.fallback.sourceRange.lineDivisor,
    )
  }
  if (oldStart.offset !== undefined && newStart.offset !== undefined) {
    return Math.max(
      0,
      1 -
        Math.abs(oldStart.offset - newStart.offset) /
          DIFF_HEURISTICS.fallback.sourceRange.offsetDivisor,
    )
  }
  return DIFF_HEURISTICS.fallback.sourceRange.fallbackScore
}

async function rewriteChildrenWithFallbackPairs(
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

function convertChangeToMove(change: DiffChange, pair: MatchPair, role: 'source' | 'target'): void {
  change.primaryOp = 'move'
  change.pairKind = 'match'
  change.pairKey = pair.pairKey
  change.matchKind = pair.matchKind
  change.logicalMoveId = pair.logicalMoveId
  change.moveRole = role
  change.movePeerKey = pair.logicalMoveId
  change.status.isMatchPair = true
  change.status.isAlignedPair = false
  change.status.moved = true
}

function upgradeToMatch(change: DiffChange): void {
  if (!change.oldId || !change.newId) return
  change.pairKind = 'match'
  change.pairKey = makePairKey('match', change.oldId, change.newId)
  change.status.isMatchPair = true
  change.status.isAlignedPair = false
}

function markReorderedChildren(context: DiffContext, changes: DiffChange[]): void {
  const paired = changes
    .map((change, index) => ({ change, index }))
    .filter(({ change }) => !!change.oldId && !!change.newId && (change.status.isMatchPair || change.status.isAlignedPair))
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

function collectChanges(root: DiffChange, predicate: (change: DiffChange) => boolean): DiffChange[] {
  const result: DiffChange[] = []
  visit(root)
  return result

  function visit(change: DiffChange): void {
    if (predicate(change)) result.push(change)
    for (const child of change.children) visit(child)
  }
}

function buildChangeIndex(root: DiffChange): DiffChangeIndex {
  const byOldId = new Map<string, DiffChange>()
  const byNewId = new Map<string, DiffChange>()
  const byPairKey = new Map<string, DiffChange>()

  for (const change of collectChanges(root, () => true)) {
    if (change.oldId && !byOldId.has(change.oldId)) byOldId.set(change.oldId, change)
    if (change.newId && !byNewId.has(change.newId)) byNewId.set(change.newId, change)
    if (change.pairKey && !byPairKey.has(change.pairKey)) byPairKey.set(change.pairKey, change)
  }

  return { byOldId, byNewId, byPairKey }
}

function createStatus(overrides?: Partial<DiffStatus>): DiffStatus {
  return {
    isMatchPair: false,
    isAlignedPair: false,
    moved: false,
    movedWithinParent: false,
    renamed: false,
    selfChanged: false,
    descendantChanged: false,
    metaChanged: false,
    inlineStructureChanged: false,
    ...overrides,
  }
}

function labelForNode(node: NonNullable<ReturnType<SemanticIndex['byId']['get']>>): string {
  return node.entity === 'section' ? `${node.kind ?? 'section'} section` : `${node.blockType ?? 'block'} block`
}

function uniqueSharedHashes(oldMap: Map<string, string[]>, newMap: Map<string, string[]>): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (const [hash, oldIds] of oldMap) {
    const newIds = newMap.get(hash)
    if (!newIds || oldIds.length !== 1 || newIds.length !== 1) continue
    pairs.push([oldIds[0]!, newIds[0]!])
  }
  return pairs
}

function filterIdentityHashes(index: SemanticIndex, target: 'footnote' | 'definition'): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const ids = target === 'footnote' ? index.byKind.get('footnote') ?? [] : index.byBlockType.get('definition') ?? []
  for (const id of ids) {
    const node = index.byId.get(id)
    if (!node) continue
    push(result, node.identityHash, id)
  }
  return result
}

function collectConflicts(ids: string[]): Set<string> {
  const counts = new Map<string, number>()
  ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id))
}

function subtreeSizeOfChange(context: DiffContext, deleted: DiffChange, inserted: DiffChange): number {
  const oldNode = deleted.oldId ? context.oldIndex.byId.get(deleted.oldId) : undefined
  const newNode = inserted.newId ? context.newIndex.byId.get(inserted.newId) : undefined
  return Math.max(oldNode?.subtreeSize ?? 0, newNode?.subtreeSize ?? 0)
}

function coverDescendants(index: SemanticIndex, id: string, covered: Set<string>): void {
  covered.add(id)
  for (const child of index.childrenById.get(id) ?? []) coverDescendants(index, child, covered)
}

function extractInlineText(nodes: InlineContent[]): string {
  return nodes.map((node) => extractNodeText(node)).join('')
}

function readTableCells(block: any): string[][] {
  if (!block || !Array.isArray(block.children)) return []
  return block.children.map((row: any) =>
    Array.isArray(row.children)
      ? row.children.map((cell: any) => extractNodeText(cell))
      : [],
  )
}

function readStructuredTableCells(block: any): InlineContent[][][] {
  if (!block || !Array.isArray(block.children)) return []
  return block.children.map((row: any) =>
    Array.isArray(row.children)
      ? row.children.map((cell: any) => (Array.isArray(cell.children) ? (cell.children as InlineContent[]) : []))
      : [],
  )
}

function maxColumns(rows: string[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0)
}

function neighborIds(ids: string[], index: number): string[] {
  return [ids[index - 1], ids[index + 1]].filter((value): value is string => !!value)
}

function withinSiblingOffsetThreshold(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  return Math.abs((oldNode.siblingIndex ?? 0) - (newNode.siblingIndex ?? 0)) <= context.options.preorderOffsetThreshold
}

function sliceSiblingWitnessWindow(
  siblingIds: string[],
  centerIndex: number,
  radius: number,
  boundedMin?: number,
  boundedMax?: number,
): string[] {
  const minIndex = boundedMin ?? 0
  const maxIndex = boundedMax ?? siblingIds.length - 1
  const start = Math.max(minIndex, centerIndex - radius)
  const end = Math.min(maxIndex, centerIndex + radius)
  if (start > end) return []
  return siblingIds.slice(start, end + 1)
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key)
  if (existing) {
    existing.push(value)
    return
  }
  map.set(key, [value])
}
