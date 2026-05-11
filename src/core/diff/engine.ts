/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InlineContent, Section } from '../transformer'
import { buildSemanticIndex } from './indexer'
import { resolveDiffOptions } from './options'
import { longestCommonSubsequence, longestIncreasingSubsequence } from './sequence'
import { computeNodeSimilarity, isSameShape, uniquenessMargin } from './similarity'
import type {
  AlignedPair,
  DiffChange,
  DiffOptions,
  DiffResult,
  DiffStatus,
  MatchKind,
  MatchPair,
  SemanticIndex,
} from './types'
import {
  extractNodeText,
  jaccardSimilarity,
  makeMoveId,
  makePairKey,
  normalizeHeadingTitle,
  normalizeIdentifier,
  tokenizeText,
} from './utils'

interface DiffContext {
  options: DiffOptions
  oldIndex: SemanticIndex
  newIndex: SemanticIndex
  matchesByOld: Map<string, MatchPair>
  matchesByNew: Map<string, MatchPair>
  warnings: string[]
}

export function diffMarkdownTrees(
  oldRoot: Section,
  newRoot: Section,
  options?: Partial<DiffOptions>,
): DiffResult {
  const resolved = resolveDiffOptions(options)
  const oldIndex = buildSemanticIndex(oldRoot, 'old')
  const newIndex = buildSemanticIndex(newRoot, 'new')
  const context: DiffContext = {
    options: resolved,
    oldIndex,
    newIndex,
    matchesByOld: new Map(),
    matchesByNew: new Map(),
    warnings: [],
  }

  addMatch(context, oldRoot.id, newRoot.id, 'forced-root')
  runDeterministicMatching(context)

  const rootPair = context.matchesByOld.get(oldRoot.id)
  if (!rootPair) throw new Error('Root match missing')

  const root = buildMatchedChange(context, rootPair)
  recoverMoves(context, root)
  recoverRenamesAndMeta(context, root)
  computeInlineDiffs(context, root)
  validateTree(root, context.warnings)

  return {
    root,
    oldIndex,
    newIndex,
    matches: [...context.matchesByOld.values()],
    stats: collectStats(root),
    warnings: context.warnings,
  }
}

function runDeterministicMatching(context: DiffContext): void {
  const coveredOld = new Set<string>()
  const coveredNew = new Set<string>()

  const subtreeCandidates = collectUniqueHashCandidates(
    context,
    context.oldIndex.bySubtreeHash,
    context.newIndex.bySubtreeHash,
  ).sort((left, right) => right.oldNode.subtreeSize - left.oldNode.subtreeSize)

  for (const candidate of subtreeCandidates) {
    if (!isSameShape(candidate.oldNode, candidate.newNode)) continue
    if (coveredOld.has(candidate.oldNode.id) || coveredNew.has(candidate.newNode.id)) continue
    addMatch(context, candidate.oldNode.id, candidate.newNode.id, 'exact-subtree')
    coverDescendants(context.oldIndex, candidate.oldNode.id, coveredOld)
    coverDescendants(context.newIndex, candidate.newNode.id, coveredNew)
  }

  matchUniqueHashes(context, context.oldIndex.bySelfHash, context.newIndex.bySelfHash, 'exact-self')
  matchUniqueHashes(context, context.oldIndex.byDirectHash, context.newIndex.byDirectHash, 'exact-direct', {
    sectionsOnly: true,
  })
  matchFrontmatter(context)
  matchUniqueHashes(
    context,
    filterMapByIds(context.oldIndex.byKind, context.oldIndex.byId, 'footnote', 'identity'),
    filterMapByIds(context.newIndex.byKind, context.newIndex.byId, 'footnote', 'identity'),
    'footnote-identity',
  )
  matchUniqueHashes(
    context,
    filterMapByIds(context.oldIndex.byBlockType, context.oldIndex.byId, 'definition', 'identity'),
    filterMapByIds(context.newIndex.byBlockType, context.newIndex.byId, 'definition', 'identity'),
    'definition-identity',
  )
}

function matchUniqueHashes(
  context: DiffContext,
  oldMap: Map<string, string[]>,
  newMap: Map<string, string[]>,
  matchKind: MatchKind,
  options?: { sectionsOnly?: boolean },
): void {
  for (const [hash, oldIds] of oldMap) {
    const newIds = newMap.get(hash)
    if (!newIds || oldIds.length !== 1 || newIds.length !== 1) continue
    const oldNode = context.oldIndex.byId.get(oldIds[0]!)
    const newNode = context.newIndex.byId.get(newIds[0]!)
    if (!oldNode || !newNode) continue
    if (options?.sectionsOnly && (oldNode.entity !== 'section' || newNode.entity !== 'section')) continue
    if (!isSameShape(oldNode, newNode)) continue
    if (!canContextuallyMatch(context, oldNode.id, newNode.id, matchKind)) continue
    addMatch(context, oldNode.id, newNode.id, matchKind)
  }
}

function matchFrontmatter(context: DiffContext): void {
  const oldFrontmatter = context.oldIndex.byKind.get('frontmatter')
  const newFrontmatter = context.newIndex.byKind.get('frontmatter')
  if (oldFrontmatter?.length === 1 && newFrontmatter?.length === 1) {
    addMatch(context, oldFrontmatter[0]!, newFrontmatter[0]!, 'frontmatter-anchor')
  }
}

function buildMatchedChange(context: DiffContext, pair: MatchPair): DiffChange {
  const oldNode = context.oldIndex.byId.get(pair.oldId)
  const newNode = context.newIndex.byId.get(pair.newId)
  if (!oldNode || !newNode) throw new Error(`Missing nodes for pair ${pair.pairKey}`)

  const status = createStatus({
    isMatchPair: true,
    selfChanged: oldNode.selfHash !== newNode.selfHash,
    descendantChanged: oldNode.subtreeHash !== newNode.subtreeHash,
  })

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
    primaryOp: status.selfChanged ? 'replace' : 'equal',
    status,
    matchKind: pair.matchKind,
    summary: buildSummary('match', oldNode, newNode),
    children: [],
    warnings: [],
    logicalMoveId: pair.logicalMoveId,
  }

  if (oldNode.entity === 'section' && newNode.entity === 'section') {
    if (
      pair.matchKind !== 'exact-subtree' &&
      Math.max(oldNode.subtreeSize, newNode.subtreeSize) <= context.options.maxRecursiveSubtreeSize
    ) {
      change.children = alignChildren(context, oldNode.id, newNode.id, 'global')
    } else if (pair.matchKind !== 'exact-subtree') {
      change.degraded = true
      change.warnings.push('subtree-budget-exceeded')
    }

    if (change.children.some((child) => child.primaryOp !== 'equal' || child.status.descendantChanged)) {
      change.status.descendantChanged = true
    }
    if (!change.status.selfChanged && change.status.descendantChanged) {
      change.primaryOp = 'equal'
    }
  }

  return change
}

function alignChildren(
  context: DiffContext,
  oldParentId: string,
  newParentId: string,
  mode: 'global' | 'local',
): DiffChange[] {
  const oldChildren = context.oldIndex.childrenById.get(oldParentId) ?? []
  const newChildren = context.newIndex.childrenById.get(newParentId) ?? []
  const oldTokens = oldChildren.map((childId) => projectToken(context, childId, oldParentId, newParentId))
  const newTokens = newChildren.map((childId) => projectToken(context, childId, oldParentId, newParentId))
  const anchors = longestCommonSubsequence(oldTokens, newTokens)
  const changes: DiffChange[] = []

  let oldCursor = 0
  let newCursor = 0

  for (const anchor of anchors) {
    materializeRanges(
      context,
      oldParentId,
      newParentId,
      oldChildren.slice(oldCursor, anchor.oldIndex),
      newChildren.slice(newCursor, anchor.newIndex),
      changes,
      mode,
    )

    const oldId = oldChildren[anchor.oldIndex]
    const newId = newChildren[anchor.newIndex]
    if (oldId && newId) {
      ensureContextualMatch(context, oldId, newId)
      const pair = context.matchesByOld.get(oldId)
      if (pair) {
        changes.push(buildMatchedChange(context, pair))
      } else {
        const aligned = createAlignedPair(context, oldId, newId, oldParentId, newParentId)
        if (aligned) {
          changes.push(buildAlignedChange(context, aligned, mode))
        } else {
          changes.push(buildDeleteChange(context, oldId))
          changes.push(buildInsertChange(context, newId))
        }
      }
    }

    oldCursor = anchor.oldIndex + 1
    newCursor = anchor.newIndex + 1
  }

  materializeRanges(
    context,
    oldParentId,
    newParentId,
    oldChildren.slice(oldCursor),
    newChildren.slice(newCursor),
    changes,
    mode,
  )
  markReorderedChildren(context, changes)
  return changes
}

function materializeRanges(
  context: DiffContext,
  oldParentId: string,
  newParentId: string,
  oldRange: string[],
  newRange: string[],
  changes: DiffChange[],
  mode: 'global' | 'local',
): void {
  let oldIndex = 0
  let newIndex = 0

  while (oldIndex < oldRange.length || newIndex < newRange.length) {
    const oldId = oldRange[oldIndex]
    const newId = newRange[newIndex]

    if (oldId && newId) {
      const aligned = createAlignedPair(context, oldId, newId, oldParentId, newParentId)
      if (aligned) {
        changes.push(buildAlignedChange(context, aligned, mode))
        oldIndex++
        newIndex++
        continue
      }
    }

    if (oldId) {
      changes.push(buildDeleteChange(context, oldId))
      oldIndex++
    }
    if (newId) {
      changes.push(buildInsertChange(context, newId))
      newIndex++
    }
  }
}

function buildAlignedChange(
  context: DiffContext,
  aligned: AlignedPair | undefined,
  mode: 'global' | 'local',
): DiffChange {
  if (!aligned) {
    throw new Error('Aligned pair missing')
  }

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
    summary: buildSummary('align', oldNode, newNode),
    children: [],
    warnings: [],
    shortHeadingFallback: aligned.shortHeadingFallback,
  }

  if (oldNode.entity === 'section' && newNode.entity === 'section') {
    const childBudget =
      (context.oldIndex.childrenById.get(oldNode.id)?.length ?? 0) +
      (context.newIndex.childrenById.get(newNode.id)?.length ?? 0)
    if (childBudget <= context.options.maxLocalWindowSize) {
      seedLocalMatches(context, oldNode.id, newNode.id)
      change.children = alignChildren(context, oldNode.id, newNode.id, 'local')
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
  }

  if (mode === 'local' && oldNode.selfHash === newNode.selfHash && change.status.descendantChanged) {
    change.primaryOp = 'equal'
    change.status.selfChanged = false
  }

  return change
}

function seedLocalMatches(context: DiffContext, oldParentId: string, newParentId: string): void {
  const oldChildren = context.oldIndex.childrenById.get(oldParentId) ?? []
  const newChildren = context.newIndex.childrenById.get(newParentId) ?? []
  matchLocalBy(
    context,
    oldChildren,
    newChildren,
    (node) => node?.selfHash,
    'exact-self-with-context',
  )
  matchLocalBy(
    context,
    oldChildren,
    newChildren,
    (node) => (node?.kind === 'heading' ? node.titleSlug : undefined),
    'local-heading-slug',
  )
  matchLocalBy(
    context,
    oldChildren,
    newChildren,
    (node) =>
      node && (node.kind === 'footnote' || node.blockType === 'definition')
        ? node.identityHash
        : undefined,
    'local-identity',
  )
}

function matchLocalBy(
  context: DiffContext,
  oldIds: string[],
  newIds: string[],
  getKey: (node: ReturnType<SemanticIndex['byId']['get']>) => string | undefined,
  matchKind: MatchKind,
): void {
  const oldBuckets = new Map<string, string[]>()
  const newBuckets = new Map<string, string[]>()
  for (const oldId of oldIds) {
    const node = context.oldIndex.byId.get(oldId)
    const key = getKey(node)
    if (!node || !key || context.matchesByOld.has(node.id)) continue
    push(oldBuckets, key, node.id)
  }
  for (const newId of newIds) {
    const node = context.newIndex.byId.get(newId)
    const key = getKey(node)
    if (!node || !key || context.matchesByNew.has(node.id)) continue
    push(newBuckets, key, node.id)
  }
  for (const [key, oldBucket] of oldBuckets) {
    const newBucket = newBuckets.get(key)
    if (!newBucket || oldBucket.length !== 1 || newBucket.length !== 1) continue
    addMatch(context, oldBucket[0]!, newBucket[0]!, matchKind)
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

function expandChildren(
  context: DiffContext,
  parentId: string,
  op: 'delete' | 'insert',
): DiffChange[] {
  const index = op === 'delete' ? context.oldIndex : context.newIndex
  const childIds = index.childrenById.get(parentId) ?? []
  return childIds.map((childId) =>
    op === 'delete' ? buildDeleteChange(context, childId) : buildInsertChange(context, childId),
  )
}

function recoverMoves(context: DiffContext, root: DiffChange): void {
  const deletes = collectChanges(root, (change) => change.primaryOp === 'delete' && !!change.oldId)
  const inserts = collectChanges(root, (change) => change.primaryOp === 'insert' && !!change.newId)
  const usedDeletes = new Set<string>()
  const usedInserts = new Set<string>()

  const candidates = deletes.flatMap((deleted) =>
    inserts
      .map((inserted) => ({ deleted, inserted, score: moveScore(context, deleted, inserted) }))
      .filter((candidate) => candidate.score > 0),
  )
  candidates.sort((left, right) => right.score - left.score)

  for (const candidate of candidates) {
    const oldId = candidate.deleted.oldId
    const newId = candidate.inserted.newId
    if (!oldId || !newId || usedDeletes.has(oldId) || usedInserts.has(newId)) continue
    const matchKind = classifyMove(context, oldId, newId)
    if (!matchKind) continue

    const pair = addMatch(context, oldId, newId, matchKind, makeMoveId(oldId, newId), candidate.score)
    if (!pair) continue
    usedDeletes.add(oldId)
    usedInserts.add(newId)
    convertChangeToMove(candidate.deleted, pair, 'source')
    convertChangeToMove(candidate.inserted, pair, 'target')
    candidate.deleted.children = []
    candidate.inserted.children = []
  }
}

function recoverRenamesAndMeta(context: DiffContext, root: DiffChange): void {
  for (const change of collectChanges(root, () => true)) {
    if (!change.oldId || !change.newId) continue
    const oldNode = context.oldIndex.byId.get(change.oldId)
    const newNode = context.newIndex.byId.get(change.newId)
    if (!oldNode || !newNode) continue

    if (oldNode.kind === 'heading' && newNode.kind === 'heading') {
      if (oldNode.normalizedTitle !== newNode.normalizedTitle && uniqueHeadingSiblingNames(context, oldNode, newNode)) {
        if (oldNode.headingBodyHash === newNode.headingBodyHash) {
          upgradeToMatch(change)
          change.status.renamed = true
          change.primaryOp = 'equal'
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
      if (oldIdentifier !== newIdentifier && oldNode.identityHash === newNode.identityHash) {
        upgradeToMatch(change)
        change.status.renamed = true
        change.primaryOp = 'equal'
        change.status.selfChanged = false
      }
    }

    if (oldNode.blockType === 'definition' && newNode.blockType === 'definition') {
      const oldIdentifier = normalizeIdentifier((oldNode.block as any)?.identifier)
      const newIdentifier = normalizeIdentifier((newNode.block as any)?.identifier)
      if (oldIdentifier !== newIdentifier && oldNode.identityHash === newNode.identityHash) {
        upgradeToMatch(change)
        change.status.renamed = true
        change.primaryOp = 'equal'
        change.status.selfChanged = false
      } else if (oldNode.contentOnlyHash !== newNode.contentOnlyHash) {
        change.status.metaChanged = true
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

    if (oldNode.kind === 'listItem' && newNode.kind === 'listItem') {
      if (oldNode.section?.checked !== newNode.section?.checked && oldNode.contentOnlyHash === newNode.contentOnlyHash) {
        upgradeToMatch(change)
        change.primaryOp = 'meta-update'
        change.status.metaChanged = true
        change.status.selfChanged = false
      }
    }

    if (oldNode.kind === 'frontmatter' && newNode.kind === 'frontmatter') {
      if ((oldNode.section?.frontmatterValue ?? '') !== (newNode.section?.frontmatterValue ?? '')) {
        upgradeToMatch(change)
        change.primaryOp = 'meta-update'
        change.status.metaChanged = true
        change.status.selfChanged = false
      }
    }
  }
}

function computeInlineDiffs(context: DiffContext, root: DiffChange): void {
  for (const change of collectChanges(root, () => true)) {
    if (!change.oldId || !change.newId) continue
    const oldNode = context.oldIndex.byId.get(change.oldId)
    const newNode = context.newIndex.byId.get(change.newId)
    if (!oldNode || !newNode) continue

    if (oldNode.entity === 'block' && newNode.entity === 'block') {
      if (oldNode.blockType === 'paragraph' && newNode.blockType === 'paragraph') {
        change.inlineSpans = diffInlineNodes(
          oldNode.block?.children ?? [],
          newNode.block?.children ?? [],
          context.options.maxInlineDiffCost,
        )
        if (change.inlineSpans.some((span) => span.op === 'replace' && span.oldTokens && span.newTokens)) {
          change.status.inlineStructureChanged = true
        }
      }
      if (oldNode.blockType === 'code' && newNode.blockType === 'code') {
        change.codeSpans = diffCodeLines(String(oldNode.block?.value ?? ''), String(newNode.block?.value ?? ''))
      }
    }

    if (oldNode.kind === 'heading' && newNode.kind === 'heading' && change.status.renamed) {
      change.titleInlineSpans = diffTextTokens(oldNode.section?.title ?? '', newNode.section?.title ?? '')
    }
  }
}

function validateTree(root: DiffChange, warnings: string[]): void {
  for (const change of collectChanges(root, () => true)) {
    if (change.primaryOp === 'insert' || change.primaryOp === 'delete') {
      if (change.status.isMatchPair || change.status.isAlignedPair) {
        warnings.push(`invalid-pair-state:${change.summary}`)
      }
    }
    if (change.primaryOp === 'move' && !change.status.moved) {
      warnings.push(`invalid-move-state:${change.summary}`)
    }
    if (change.primaryOp === 'meta-update' && !change.status.metaChanged) {
      warnings.push(`invalid-meta-state:${change.summary}`)
    }
  }
}

function collectStats(root: DiffChange) {
  const moves = new Set<string>()
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
    if (change.logicalMoveId) moves.add(change.logicalMoveId)
  }

  stats.moves = moves.size
  return stats
}

function diffInlineNodes(
  oldChildren: InlineContent[],
  newChildren: InlineContent[],
  maxInlineDiffCost: number,
) {
  if (oldChildren.length + newChildren.length > maxInlineDiffCost) {
    return [{ op: 'replace' as const, oldTokens: oldChildren, newTokens: newChildren }]
  }

  const oldTokens = oldChildren.map((child) => inlineTokenKey(child))
  const newTokens = newChildren.map((child) => inlineTokenKey(child))
  const anchors = longestCommonSubsequence(oldTokens, newTokens)
  const spans: Array<{
    op: 'equal' | 'insert' | 'delete' | 'replace'
    oldText?: string
    newText?: string
    oldTokens?: InlineContent[]
    newTokens?: InlineContent[]
  }> = []

  let oldCursor = 0
  let newCursor = 0
  for (const anchor of anchors) {
    if (oldCursor < anchor.oldIndex || newCursor < anchor.newIndex) {
      spans.push({
        op: 'replace',
        oldTokens: oldChildren.slice(oldCursor, anchor.oldIndex),
        newTokens: newChildren.slice(newCursor, anchor.newIndex),
        oldText: oldChildren.slice(oldCursor, anchor.oldIndex).map((node) => extractNodeText(node)).join(''),
        newText: newChildren.slice(newCursor, anchor.newIndex).map((node) => extractNodeText(node)).join(''),
      })
    }
    spans.push({
      op: 'equal',
      oldTokens: [oldChildren[anchor.oldIndex]!],
      newTokens: [newChildren[anchor.newIndex]!],
      oldText: extractNodeText(oldChildren[anchor.oldIndex]),
      newText: extractNodeText(newChildren[anchor.newIndex]),
    })
    oldCursor = anchor.oldIndex + 1
    newCursor = anchor.newIndex + 1
  }

  if (oldCursor < oldChildren.length || newCursor < newChildren.length) {
    spans.push({
      op: 'replace',
      oldTokens: oldChildren.slice(oldCursor),
      newTokens: newChildren.slice(newCursor),
      oldText: oldChildren.slice(oldCursor).map((node) => extractNodeText(node)).join(''),
      newText: newChildren.slice(newCursor).map((node) => extractNodeText(node)).join(''),
    })
  }

  return spans
}

function diffCodeLines(oldValue: string, newValue: string) {
  const oldLines = oldValue.split(/\r?\n/u)
  const newLines = newValue.split(/\r?\n/u)
  const anchors = longestCommonSubsequence(oldLines, newLines)
  const spans: Array<{ op: 'equal' | 'insert' | 'delete' | 'replace'; oldLine?: string; newLine?: string }> = []

  let oldCursor = 0
  let newCursor = 0
  for (const anchor of anchors) {
    while (oldCursor < anchor.oldIndex || newCursor < anchor.newIndex) {
      const oldLine = oldCursor < anchor.oldIndex ? oldLines[oldCursor] : undefined
      const newLine = newCursor < anchor.newIndex ? newLines[newCursor] : undefined
      spans.push({
        op: oldLine !== undefined && newLine !== undefined ? 'replace' : oldLine !== undefined ? 'delete' : 'insert',
        oldLine,
        newLine,
      })
      if (oldLine !== undefined) oldCursor++
      if (newLine !== undefined) newCursor++
    }

    spans.push({ op: 'equal', oldLine: oldLines[anchor.oldIndex], newLine: newLines[anchor.newIndex] })
    oldCursor = anchor.oldIndex + 1
    newCursor = anchor.newIndex + 1
  }

  while (oldCursor < oldLines.length || newCursor < newLines.length) {
    const oldLine = oldCursor < oldLines.length ? oldLines[oldCursor] : undefined
    const newLine = newCursor < newLines.length ? newLines[newCursor] : undefined
    spans.push({
      op: oldLine !== undefined && newLine !== undefined ? 'replace' : oldLine !== undefined ? 'delete' : 'insert',
      oldLine,
      newLine,
    })
    if (oldLine !== undefined) oldCursor++
    if (newLine !== undefined) newCursor++
  }

  return spans
}

function diffTextTokens(oldText: string, newText: string) {
  const oldTokens = tokenizeText(oldText)
  const newTokens = tokenizeText(newText)
  const anchors = longestCommonSubsequence(oldTokens, newTokens)
  const spans: Array<{ op: 'equal' | 'insert' | 'delete' | 'replace'; oldText?: string; newText?: string }> = []

  let oldCursor = 0
  let newCursor = 0
  for (const anchor of anchors) {
    if (oldCursor < anchor.oldIndex || newCursor < anchor.newIndex) {
      spans.push({
        op: 'replace',
        oldText: oldTokens.slice(oldCursor, anchor.oldIndex).join(' '),
        newText: newTokens.slice(newCursor, anchor.newIndex).join(' '),
      })
    }
    spans.push({ op: 'equal', oldText: oldTokens[anchor.oldIndex], newText: newTokens[anchor.newIndex] })
    oldCursor = anchor.oldIndex + 1
    newCursor = anchor.newIndex + 1
  }
  if (oldCursor < oldTokens.length || newCursor < newTokens.length) {
    spans.push({
      op: 'replace',
      oldText: oldTokens.slice(oldCursor).join(' '),
      newText: newTokens.slice(newCursor).join(' '),
    })
  }
  return spans
}

function createAlignedPair(
  context: DiffContext,
  oldId: string,
  newId: string,
  oldParentId: string,
  newParentId: string,
): AlignedPair | undefined {
  const oldNode = context.oldIndex.byId.get(oldId)
  const newNode = context.newIndex.byId.get(newId)
  if (!oldNode || !newNode || !isSameShape(oldNode, newNode)) return undefined
  if (context.matchesByOld.has(oldId) || context.matchesByNew.has(newId)) return undefined

  const parentContext = parentPairMatches(context, oldParentId, newParentId) ? 1 : 0.7
  const similarity = computeNodeSimilarity(oldNode, newNode, parentContext)
  const shortHeadingFallback = shouldUseShortHeadingFallback(context, oldNode, newNode, oldParentId, newParentId)
  if (!shortHeadingFallback && similarity < context.options.minSimilarity) return undefined

  return {
    oldId,
    newId,
    pairKind: 'align',
    pairKey: makePairKey('align', oldId, newId),
    score: similarity,
    shortHeadingFallback,
  }
}

function shouldUseShortHeadingFallback(
  context: DiffContext,
  oldNode: ReturnType<SemanticIndex['byId']['get']>,
  newNode: ReturnType<SemanticIndex['byId']['get']>,
  oldParentId: string,
  newParentId: string,
): boolean {
  if (!oldNode || !newNode) return false
  if (oldNode.kind !== 'heading' || newNode.kind !== 'heading') return false
  if (oldNode.section?.headingDepth !== newNode.section?.headingDepth) return false
  if (!parentPairMatches(context, oldParentId, newParentId)) return false
  if (Math.abs(oldNode.siblingIndex - newNode.siblingIndex) > 1) return false
  if (oldNode.headingBodyHash !== newNode.headingBodyHash) return false
  return uniqueHeadingSiblingNames(context, oldNode, newNode)
}

function ensureContextualMatch(context: DiffContext, oldId: string, newId: string): void {
  if (context.matchesByOld.has(oldId) || context.matchesByNew.has(newId)) return
  const oldNode = context.oldIndex.byId.get(oldId)
  const newNode = context.newIndex.byId.get(newId)
  if (!oldNode || !newNode || !isSameShape(oldNode, newNode)) return
  if (oldNode.selfHash === newNode.selfHash) {
    addMatch(context, oldId, newId, 'exact-self-with-context')
  }
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
      if (matchKind.startsWith('move-')) existingOld.matchKind = matchKind
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

function canContextuallyMatch(
  context: DiffContext,
  oldId: string,
  newId: string,
  matchKind: MatchKind,
): boolean {
  const oldNode = context.oldIndex.byId.get(oldId)
  const newNode = context.newIndex.byId.get(newId)
  if (!oldNode || !newNode) return false
  if (context.matchesByOld.has(oldId) || context.matchesByNew.has(newId)) return false
  if (matchKind === 'exact-subtree') return true

  if (oldNode.parentId && newNode.parentId && parentPairMatches(context, oldNode.parentId, newNode.parentId)) {
    return true
  }

  return (
    Math.abs(oldNode.siblingIndex - newNode.siblingIndex) <= context.options.preorderOffsetThreshold ||
    Math.abs(oldNode.preorder - newNode.preorder) <= context.options.preorderOffsetThreshold
  )
}

function parentPairMatches(context: DiffContext, oldParentId: string, newParentId: string): boolean {
  const parentPair = context.matchesByOld.get(oldParentId)
  return parentPair?.newId === newParentId
}

function collectUniqueHashCandidates(
  context: DiffContext,
  oldMap: Map<string, string[]>,
  newMap: Map<string, string[]>,
) {
  const candidates: Array<{ oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>; newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>> }> = []
  for (const [hash, oldIds] of oldMap) {
    const newIds = newMap.get(hash)
    if (!newIds || oldIds.length !== 1 || newIds.length !== 1) continue
    const oldNode = context.oldIndex.byId.get(oldIds[0]!)
    const newNode = context.newIndex.byId.get(newIds[0]!)
    if (!oldNode || !newNode) continue
    candidates.push({ oldNode, newNode })
  }
  return candidates
}

function coverDescendants(index: SemanticIndex, id: string, covered: Set<string>): void {
  covered.add(id)
  const children = index.childrenById.get(id) ?? []
  for (const child of children) {
    coverDescendants(index, child, covered)
  }
}

function projectToken(
  context: DiffContext,
  childId: string,
  oldParentId: string,
  newParentId: string,
): string {
  const oldPair = context.matchesByOld.get(childId)
  if (oldPair) {
    const newNode = context.newIndex.byId.get(oldPair.newId)
    if (newNode && newNode.parentId === newParentId) return `MATCHED:${oldPair.pairKey}`
  }

  const newPair = context.matchesByNew.get(childId)
  if (newPair) {
    const oldNode = context.oldIndex.byId.get(newPair.oldId)
    if (oldNode && oldNode.parentId === oldParentId) return `MATCHED:${newPair.pairKey}`
  }

  const node = context.oldIndex.byId.get(childId) ?? context.newIndex.byId.get(childId)
  return `SELF:${node?.selfHash ?? childId}`
}

function moveScore(context: DiffContext, deleted: DiffChange, inserted: DiffChange): number {
  if (!deleted.oldId || !inserted.newId) return 0
  const oldNode = context.oldIndex.byId.get(deleted.oldId)
  const newNode = context.newIndex.byId.get(inserted.newId)
  if (!oldNode || !newNode || !isSameShape(oldNode, newNode)) return 0
  if (oldNode.entity === 'section') {
    const ratio = oldNode.subtreeSize / Math.max(newNode.subtreeSize, 1)
    if (ratio < 0.3 || ratio > 3) return 0
  }
  return computeNodeSimilarity(oldNode, newNode)
}

function classifyMove(context: DiffContext, oldId: string, newId: string): MatchKind | undefined {
  const oldNode = context.oldIndex.byId.get(oldId)
  const newNode = context.newIndex.byId.get(newId)
  if (!oldNode || !newNode) return undefined

  if (oldNode.subtreeHash === newNode.subtreeHash) return 'move-exact'
  if (oldNode.entity === 'section' && oldNode.directHash === newNode.directHash) return 'move-direct'
  if (oldNode.kind === 'heading' && newNode.kind === 'heading' && oldNode.titleSlug === newNode.titleSlug) {
    const scores = [computeNodeSimilarity(oldNode, newNode), siblingHeadingCompetition(context, oldNode, newNode)]
    if (
      (oldNode.headingBodyHash === newNode.headingBodyHash ||
        jaccardSimilarity(oldNode.textTokens, newNode.textTokens) >= context.options.minSimilarity) &&
      uniquenessMargin(scores) >= 0
    ) {
      return 'move-heading'
    }
  }
  if (oldNode.blockType === 'code' && newNode.blockType === 'code' && oldNode.contentOnlyHash === newNode.contentOnlyHash) {
    return 'move-code'
  }
  return undefined
}

function siblingHeadingCompetition(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number {
  const candidates = (context.newIndex.byKind.get('heading') ?? [])
    .map((id) => context.newIndex.byId.get(id))
    .filter((node): node is NonNullable<typeof node> => !!node && node.id !== newNode.id && node.titleSlug === oldNode.titleSlug)
    .map((node) => computeNodeSimilarity(oldNode, node))
  if (candidates.length === 0) return 0
  return Math.max(...candidates)
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
  change.status.isAlignedPair = false
  change.status.isMatchPair = true
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
    .some((node) => node && node.id !== oldNode.id && node.kind === 'heading' && node.normalizedTitle === newNode.normalizedTitle)
  const duplicateNew = newSiblings
    .map((id) => context.newIndex.byId.get(id))
    .some((node) => node && node.id !== newNode.id && node.kind === 'heading' && node.normalizedTitle === oldNode.normalizedTitle)
  return !duplicateOld && !duplicateNew
}

function inlineTokenKey(node: InlineContent): string {
  const text = extractNodeText(node)
  const normalized = normalizeHeadingTitle(text)
  const suffix = Array.isArray(node.children) ? `:${node.children.length}` : ''
  return `${node.type}:${normalized}${suffix}`
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

  const lis = new Set(longestIncreasingSubsequence(paired.map((item) => item.newOrder)))
  paired.forEach((item, index) => {
    if (!lis.has(index)) {
      item.change.reordered = true
      item.change.status.movedWithinParent = true
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

function buildSummary(
  mode: 'match' | 'align',
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  _newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): string {
  const label = labelForNode(oldNode)
  if (mode === 'match') return `Matched ${label}`
  return `Aligned ${label}`
}

function labelForNode(node: NonNullable<ReturnType<SemanticIndex['byId']['get']>>): string {
  if (node.entity === 'section') return `${node.kind ?? 'section'} section`
  return `${node.blockType ?? 'block'} block`
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

function push(map: Map<string, string[]>, key: string, value: string): void {
  const current = map.get(key)
  if (current) current.push(value)
  else map.set(key, [value])
}

function filterMapByIds(
  source: Map<string | number, string[]>,
  byId: SemanticIndex['byId'],
  targetKey: string,
  mode: 'identity',
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const [key, ids] of source) {
    if (String(key) !== targetKey) continue
    for (const id of ids) {
      const node = byId.get(id)
      if (!node) continue
      const hash = mode === 'identity' ? node.identityHash : node.selfHash
      push(result, hash, id)
    }
  }
  return result
}
