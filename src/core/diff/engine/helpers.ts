import type { InlineContent } from '../../transformer'
import { DIFF_HEURISTICS } from '../heuristics'
import { forEachChange } from '../summary'
import type {
  DiffChange,
  DiffChangeIndex,
  DiffStatus,
  MatchPair,
  SemanticIndex,
} from '../types'
import {
  extractNodeText,
  getBlockIdentifier,
  getSectionIdentifier,
} from '../utils'
import type { DiffContext, SiblingAnchorBounds } from './context'

export { addMatch, convertChangeToMove, upgradeToMatch } from './context-ops'
export { estimateSectionAlignmentCost, estimateAptedRecoveryCost, estimateInlineDiffCost } from './cost'

export function createStatus(overrides?: Partial<DiffStatus>): DiffStatus {
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

export function labelForNode(node: NonNullable<ReturnType<SemanticIndex['byId']['get']>>): string {
  return node.entity === 'section'
    ? `${node.kind ?? 'section'} section`
    : `${node.blockType ?? 'block'} block`
}

export function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key)
  if (existing) {
    existing.push(value)
    return
  }
  map.set(key, [value])
}

export function collectChanges(
  root: DiffChange,
  predicate: (change: DiffChange) => boolean,
): DiffChange[] {
  const result: DiffChange[] = []
  visit(root)
  return result

  function visit(change: DiffChange): void {
    if (predicate(change)) result.push(change)
    for (const child of change.children) visit(child)
  }
}

export function buildChangeIndex(root: DiffChange): DiffChangeIndex {
  const byOldId = new Map<string, DiffChange>()
  const byNewId = new Map<string, DiffChange>()
  const byPairKey = new Map<string, DiffChange>()
  const byLogicalMoveId = new Map<string, DiffChange[]>()

  forEachChange(root, (change) => {
    if (change.oldId && !byOldId.has(change.oldId)) byOldId.set(change.oldId, change)
    if (change.newId && !byNewId.has(change.newId)) byNewId.set(change.newId, change)
    if (change.pairKey && !byPairKey.has(change.pairKey)) byPairKey.set(change.pairKey, change)
    if (change.logicalMoveId) {
      let arr = byLogicalMoveId.get(change.logicalMoveId)
      if (!arr) { arr = []; byLogicalMoveId.set(change.logicalMoveId, arr) }
      arr.push(change)
    }
  })

  return { byOldId, byNewId, byPairKey, byLogicalMoveId }
}

export function validateTree(root: DiffChange, warnings: string[]): void {
  forEachChange(root, (change) => {
    if (
      (change.primaryOp === 'insert' || change.primaryOp === 'delete') &&
      (change.status.isMatchPair || change.status.isAlignedPair)
    ) {
      warnings.push(`invalid-pair-state:${change.summary}`)
    }
    if (change.primaryOp === 'move' && !change.status.moved)
      warnings.push(`invalid-move-state:${change.summary}`)
    if (change.primaryOp === 'meta-update' && !change.status.metaChanged)
      warnings.push(`invalid-meta-state:${change.summary}`)
    if (change.primaryOp === 'equal' && change.status.selfChanged && !change.status.renamed)
      warnings.push(`invalid-equal-state:${change.summary}`)
    if (change.status.isMatchPair && change.pairKind !== 'match')
      warnings.push(`invalid-match-kind:${change.summary}`)
    if (change.status.isAlignedPair && change.pairKind !== 'align')
      warnings.push(`invalid-align-kind:${change.summary}`)
    if (
      change.entity !== 'metadata' &&
      change.primaryOp === 'meta-update' &&
      !change.status.isMatchPair
    ) {
      warnings.push(`invalid-meta-pair:${change.summary}`)
    }
    if (change.primaryOp === 'move' && (!change.logicalMoveId || !change.moveRole))
      warnings.push(`invalid-move-link:${change.summary}`)
  })
}

export function indexOfMaxScore(scores: readonly number[]): number {
  let bestIndex = -1
  let bestScore = Number.NEGATIVE_INFINITY
  for (let index = 0; index < scores.length; index++) {
    const score = scores[index] ?? Number.NEGATIVE_INFINITY
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  }
  return bestIndex
}

export function uniqueSharedHashes(
  oldMap: Map<string, string[]>,
  newMap: Map<string, string[]>,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (const [hash, oldIds] of oldMap) {
    const newIds = newMap.get(hash)
    if (!newIds || oldIds.length !== 1 || newIds.length !== 1) continue
    pairs.push([oldIds[0]!, newIds[0]!])
  }
  return pairs
}

export function filterIdentityHashes(
  index: SemanticIndex,
  target: 'footnote' | 'definition',
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const ids =
    target === 'footnote'
      ? (index.byKind.get('footnote') ?? [])
      : (index.byBlockType.get('definition') ?? [])
  for (const id of ids) {
    const node = index.byId.get(id)
    if (!node) continue
    push(result, node.identityHash, id)
  }
  return result
}

export function filterDefinitionIdentifiers(index: SemanticIndex): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const ids = index.byBlockType.get('definition') ?? []
  for (const id of ids) {
    const node = index.byId.get(id)
    const identifier = getBlockIdentifier(node?.block)
    if (!node || !identifier) continue
    push(result, identifier, id)
  }
  return result
}

export function filterFootnoteIdentifiers(index: SemanticIndex): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const ids = index.byKind.get('footnote') ?? []
  for (const id of ids) {
    const node = index.byId.get(id)
    const identifier = getSectionIdentifier(node?.section)
    if (!node || !identifier) continue
    push(result, identifier, id)
  }
  return result
}

export function collectConflicts(ids: string[]): Set<string> {
  const counts = new Map<string, number>()
  ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id))
}

export function subtreeSizeOfChange(
  context: DiffContext,
  deleted: DiffChange,
  inserted: DiffChange,
): number {
  const oldNode = deleted.oldId ? context.oldIndex.byId.get(deleted.oldId) : undefined
  const newNode = inserted.newId ? context.newIndex.byId.get(inserted.newId) : undefined
  return Math.max(oldNode?.subtreeSize ?? 0, newNode?.subtreeSize ?? 0)
}

export function coverDescendants(index: SemanticIndex, id: string, covered: Set<string>): void {
  covered.add(id)
  for (const child of index.childrenById.get(id) ?? []) coverDescendants(index, child, covered)
}

export function extractInlineText(nodes: InlineContent[]): string {
  return nodes.map((node) => extractNodeText(node)).join('')
}

export function neighborIds(ids: string[], index: number): string[] {
  return [ids[index - 1], ids[index + 1]].filter((value): value is string => !!value)
}

export function withinSiblingOffsetThreshold(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  return (
    Math.abs((oldNode.siblingIndex ?? 0) - (newNode.siblingIndex ?? 0)) <=
    context.options.preorderOffsetThreshold
  )
}

export function sliceSiblingWitnessWindow(
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

export function resolveSiblingAnchorBounds(
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

export function oldRootPair(context: DiffContext): MatchPair | undefined {
  return context.matchesByOld.get(context.oldIndex.rootId)
}

export function parentContextScore(
  context: DiffContext,
  oldParentId: string,
  newParentId: string,
): number {
  const pair = context.matchesByOld.get(oldParentId)
  return pair?.newId === newParentId
    ? DIFF_HEURISTICS.context.matchedParentScore
    : DIFF_HEURISTICS.context.unmatchedParentScore
}

export function uniqueHeadingSiblingNames(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  const oldSiblings = oldNode.parentId
    ? (context.oldIndex.childrenById.get(oldNode.parentId) ?? [])
    : []
  const newSiblings = newNode.parentId
    ? (context.newIndex.childrenById.get(newNode.parentId) ?? [])
    : []
  const duplicateOld = oldSiblings
    .map((id) => context.oldIndex.byId.get(id))
    .some(
      (candidate) =>
        candidate &&
        candidate.id !== oldNode.id &&
        candidate.kind === 'heading' &&
        candidate.normalizedTitle === newNode.normalizedTitle,
    )
  const duplicateNew = newSiblings
    .map((id) => context.newIndex.byId.get(id))
    .some(
      (candidate) =>
        candidate &&
        candidate.id !== newNode.id &&
        candidate.kind === 'heading' &&
        candidate.normalizedTitle === oldNode.normalizedTitle,
    )
  return !duplicateOld && !duplicateNew
}
