import { isSameShape, uniquenessMargin } from '../similarity'
import type { DiffChange, MatchKind, SemanticIndex } from '../types'
import { jaccardSimilarity, makeMoveId } from '../utils'
import type { DiffContext } from './context'
import {
  addMatch,
  collectChanges,
  convertChangeToMove,
  coverDescendants,
  neighborIds,
  subtreeSizeOfChange,
} from './helpers'

export async function recoverMoves(context: DiffContext, root: DiffChange): Promise<void> {
  const deletes = collectChanges(root, (change) => change.primaryOp === 'delete' && !!change.oldId)
  const inserts = collectChanges(root, (change) => change.primaryOp === 'insert' && !!change.newId)
  const coveredOld = new Set<string>()
  const coveredNew = new Set<string>()

  const deleteBuckets = new Map<string, DiffChange[]>()
  for (const d of deletes) {
    const node = d.oldId ? context.oldIndex.byId.get(d.oldId) : undefined
    const key = node?.entity === 'section' ? `section:${node.kind}` : (node?.blockType ?? 'unknown')
    let bucket = deleteBuckets.get(key)
    if (!bucket) {
      bucket = []
      deleteBuckets.set(key, bucket)
    }
    bucket.push(d)
  }

  const candidates: Array<{ deleted: DiffChange; inserted: DiffChange }> = []
  for (const inserted of inserts) {
    const node = inserted.newId ? context.newIndex.byId.get(inserted.newId) : undefined
    const key = node?.entity === 'section' ? `section:${node.kind}` : (node?.blockType ?? 'unknown')
    const bucket = deleteBuckets.get(key)
    if (!bucket) continue
    for (const deleted of bucket) {
      if (moveCandidateAllowed(context, deleted, inserted)) {
        candidates.push({ deleted, inserted })
      }
    }
  }

  candidates.sort(
    (left, right) =>
      subtreeSizeOfChange(context, right.deleted, right.inserted) -
      subtreeSizeOfChange(context, left.deleted, left.inserted),
  )

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

export function moveCandidateAllowed(
  context: DiffContext,
  deleted: DiffChange,
  inserted: DiffChange,
): boolean {
  const oldNode = deleted.oldId ? context.oldIndex.byId.get(deleted.oldId) : undefined
  const newNode = inserted.newId ? context.newIndex.byId.get(inserted.newId) : undefined
  if (!oldNode || !newNode || !isSameShape(oldNode, newNode)) return false
  if (
    Math.abs(oldNode.depth - newNode.depth) > context.options.moveDepthDiffMax &&
    !hasCompatibleMovePath(oldNode, newNode)
  ) {
    return false
  }
  if (oldNode.entity === 'section') {
    const ratio = oldNode.subtreeSize / Math.max(newNode.subtreeSize, 1)
    if (
      ratio < context.options.moveSubtreeSizeRatioMin ||
      ratio > context.options.moveSubtreeSizeRatioMax
    )
      return false
  }
  return true
}

export function classifyMove(
  context: DiffContext,
  oldId: string,
  newId: string,
  deletes: DiffChange[],
  inserts: DiffChange[],
): MatchKind | undefined {
  const oldNode = context.oldIndex.byId.get(oldId)
  const newNode = context.newIndex.byId.get(newId)
  if (!oldNode || !newNode) return undefined

  if (
    oldNode.subtreeHash === newNode.subtreeHash &&
    uniqueMoveHash(deletes, inserts, context, 'subtreeHash', oldNode.subtreeHash)
  ) {
    return 'move-exact'
  }
  if (
    oldNode.entity === 'section' &&
    oldNode.directHash === newNode.directHash &&
    (shareMatchedNeighborContext(context, oldNode, newNode) ||
      hasCompatibleMovePath(oldNode, newNode))
  ) {
    return 'move-direct'
  }
  if (
    oldNode.kind === 'heading' &&
    newNode.kind === 'heading' &&
    oldNode.titleSlug === newNode.titleSlug
  ) {
    const score = computeHeadingMoveScore(oldNode, newNode)
    const strongSimilarity =
      oldNode.headingBodyHash === newNode.headingBodyHash || score >= context.options.minSimilarity
    if (
      strongSimilarity &&
      isUniqueHeadingMoveCandidate(context, oldId, newId, deletes, inserts, score)
    ) {
      return 'move-heading'
    }
  }
  if (
    oldNode.blockType === 'code' &&
    newNode.blockType === 'code' &&
    oldNode.contentOnlyHash === newNode.contentOnlyHash &&
    uniqueMoveHash(deletes, inserts, context, 'contentOnlyHash', oldNode.contentOnlyHash)
  ) {
    return 'move-code'
  }
  return undefined
}

export function computeHeadingMoveScore(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number {
  if (
    oldNode.headingBodyHash &&
    newNode.headingBodyHash &&
    oldNode.headingBodyHash === newNode.headingBodyHash
  )
    return 1
  if (oldNode.contentOnlyHash === newNode.contentOnlyHash) return 1
  return jaccardSimilarity(oldNode.textTokens, newNode.textTokens)
}

export function isUniqueHeadingMoveCandidate(
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
  const target = candidates.find(
    (candidate) => candidate.oldId === oldId && candidate.newId === newId,
  )
  if (!target || target.score !== score) return false

  const oldScores = candidates
    .filter((candidate) => candidate.oldId === oldId)
    .map((candidate) => candidate.score)
  const newScores = candidates
    .filter((candidate) => candidate.newId === newId)
    .map((candidate) => candidate.score)
  return (
    uniquenessMargin(oldScores) >= context.options.minUniquenessMargin &&
    uniquenessMargin(newScores) >= context.options.minUniquenessMargin
  )
}

export function uniqueMoveHash(
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

export function hasCompatibleMovePath(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  if (oldNode.pathParts.length === 0 || newNode.pathParts.length === 0) return false
  return (
    longestCommonPathSuffix(oldNode.pathParts, newNode.pathParts) ===
    Math.min(oldNode.pathParts.length, newNode.pathParts.length)
  )
}

export function longestCommonPathSuffix(left: readonly string[], right: readonly string[]): number {
  let matches = 0
  for (
    let leftIndex = left.length - 1, rightIndex = right.length - 1;
    leftIndex >= 0 && rightIndex >= 0;
    leftIndex--, rightIndex--
  ) {
    if (left[leftIndex] !== right[rightIndex]) break
    matches++
  }
  return matches
}

export function shareMatchedNeighborContext(
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
