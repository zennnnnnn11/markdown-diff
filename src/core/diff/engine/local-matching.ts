import { DIFF_HEURISTICS } from '../heuristics'
import { computeNodeSimilarity, isSameShape, uniquenessMargin } from '../similarity'
import type { MatchKind, SemanticIndex } from '../types'
import { simHashHammingDistanceBatch } from '../utils'
import type { DiffContext, MatchCandidate } from './context'
import {
  addMatch,
  childMatchOverlap,
  indexOfMaxScore,
  push,
  resolveSiblingAnchorBounds,
} from './helpers'

export async function seedLocalMatches(
  context: DiffContext,
  oldParentId: string,
  newParentId: string,
): Promise<void> {
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
  matchLocalBy(context, oldChildren, newChildren, headingBodyLocalKey, 'local-heading-body')
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

  const similarityCandidates: MatchCandidate[] = []
  const unmatchedOldNodes = oldChildren
    .map((candidateId) => context.oldIndex.byId.get(candidateId))
    .filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        !!candidate && !context.matchesByOld.has(candidate.id),
    )
  for (const oldId of oldChildren) {
    const oldNode = context.oldIndex.byId.get(oldId)
    if (!oldNode || context.matchesByOld.has(oldId)) continue
    const comparables = recallComparableNodes(
      context,
      oldNode,
      newChildren,
      oldParentId,
      newParentId,
    )
    if (comparables.length === 0) continue

    const scores = comparables.map((newNode) =>
      computeNodeSimilarity(oldNode, newNode, context.options, 1) +
      DIFF_HEURISTICS.childMatch.bonusWeight * childMatchOverlap(context, oldNode.id, newNode.id),
    )
    const bestIndex = indexOfMaxScore(scores)
    const bestScore = scores[bestIndex] ?? 0
    if (bestScore < context.options.minSimilarity) continue
    if (uniquenessMargin(scores) < context.options.minUniquenessMargin) continue

    const bestNew = comparables[bestIndex]
    if (!bestNew) continue

    const reverseCandidates = unmatchedOldNodes.filter((candidate) =>
      isSameShape(candidate, bestNew),
    )
    const reverseScores = reverseCandidates.map((candidate) =>
      computeNodeSimilarity(candidate, bestNew, context.options, 1) +
      DIFF_HEURISTICS.childMatch.bonusWeight * childMatchOverlap(context, candidate.id, bestNew.id),
    )
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
    if (context.matchesByOld.has(candidate.oldId) || context.matchesByNew.has(candidate.newId))
      continue
    addMatch(
      context,
      candidate.oldId,
      candidate.newId,
      candidate.matchKind,
      undefined,
      candidate.score,
    )
  }
}

export function matchLocalBy(
  context: DiffContext,
  oldIds: string[],
  newIds: string[],
  getKey: (
    node: SemanticIndex['byId'] extends Map<string, infer T> ? T | undefined : never,
  ) => string | undefined,
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

export function recallComparableNodes(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newIds: string[],
  oldParentId: string,
  newParentId: string,
): Array<NonNullable<ReturnType<SemanticIndex['byId']['get']>>> {
  const boundedIds = boundCandidateIdsBySiblingAnchors(
    context,
    oldNode,
    newIds,
    oldParentId,
    newParentId,
  )
  const sameShape = boundedIds
    .map((newId) => context.newIndex.byId.get(newId))
    .filter(
      (newNode): newNode is NonNullable<typeof newNode> =>
        !!newNode && !context.matchesByNew.has(newNode.id) && isSameShape(oldNode, newNode),
    )
  if (sameShape.length <= DIFF_HEURISTICS.recall.maxComparableNodes) return sameShape

  const distances = simHashHammingDistanceBatch(
    oldNode.textSimHash,
    sameShape.map((newNode) => newNode.textSimHash),
  )
  const ranked = sameShape
    .map((newNode, index) => ({
      node: newNode,
      distance: distances[index],
      structuralBias:
        (oldNode.pathHash && newNode.pathHash && oldNode.pathHash === newNode.pathHash
          ? 0
          : DIFF_HEURISTICS.recall.pathMismatchPenalty) +
        Math.abs((oldNode.siblingIndex ?? 0) - (newNode.siblingIndex ?? 0)),
    }))
    .filter(
      (entry) =>
        entry.distance === undefined || entry.distance <= DIFF_HEURISTICS.recall.textSimThreshold,
    )
    .sort(
      (left, right) =>
        (left.distance ?? Number.POSITIVE_INFINITY) -
          (right.distance ?? Number.POSITIVE_INFINITY) ||
        left.structuralBias - right.structuralBias,
    )

  if (ranked.length === 0) return sameShape
  return ranked.slice(0, DIFF_HEURISTICS.recall.maxComparableNodes).map((entry) => entry.node)
}

export function boundCandidateIdsBySiblingAnchors(
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

export function headingBodyLocalKey(
  node: SemanticIndex['byId'] extends Map<string, infer T> ? T | undefined : never,
): string | undefined {
  if (!node || node.kind !== 'heading' || !node.headingBodyHash) return undefined
  return [
    node.section?.headingDepth ?? '',
    node.section?.listDepth ?? '',
    node.section?.quoteDepth ?? '',
    node.headingBodyHash,
  ].join(':')
}
