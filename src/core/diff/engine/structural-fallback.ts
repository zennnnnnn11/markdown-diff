import { computeAptedMatches, type AptedNode } from '../apted'
import { DIFF_HEURISTICS } from '../heuristics'
import { computeNodeSimilarity, isSameShape, uniquenessMargin } from '../similarity'
import type {
  AlignedPair,
  DiffChange,
  SemanticIndex,
} from '../types'
import {
  makePairKey,
  multisetJaccardSimilarity,
  simHashHammingDistance,
} from '../utils'
import type { AptedDiffMeta, DiffContext } from './context'
import {
  estimateAptedRecoveryCost,
  parentContextScore,
  push,
} from './helpers'
import { rewriteChildrenWithFallbackPairs } from './alignment'

export async function maybeApplyStructuralFallback(
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
  const fallbackPairs = collectStructuralFallbackPairs(
    context,
    change,
    oldNode.id,
    newNode.id,
    aptedMatches,
  )
  if (fallbackPairs.length === 0) {
    change.warnings.push('enhanced-local-recovery-no-candidates')
    return
  }

  change.children = await rewriteChildrenWithFallbackPairs(context, change.children, fallbackPairs)
  if (
    change.children.some((child) => child.primaryOp !== 'equal' || child.status.descendantChanged)
  ) {
    change.status.descendantChanged = true
  }
  if (oldNode.selfHash === newNode.selfHash && change.status.descendantChanged) {
    change.primaryOp = 'equal'
    change.status.selfChanged = false
  }
}

export function computeStructuralAptedMatches(
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

export function collectStructuralFallbackPairs(
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
    const score = computeStructuralFallbackScore(
      context,
      oldChild,
      newChild,
      oldParentId,
      newParentId,
    )
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

export function buildAptedTree(index: SemanticIndex, id: string): AptedNode<AptedDiffMeta> | undefined {
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

export function computeAptedRelabelScore(
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
    Math.min(
      1,
      computeNodeSimilarity(oldNode, newNode, context.options, 1) +
        pathBonus +
        rangeBonus +
        simHashBonus,
    ),
  )
}

export function withinTextRecallWindow(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  if (oldNode.selfHash === newNode.selfHash) return true
  if (oldNode.identityHash === newNode.identityHash) return true
  if (oldNode.contentOnlyHash === newNode.contentOnlyHash) return true
  if (
    oldNode.headingBodyHash &&
    newNode.headingBodyHash &&
    oldNode.headingBodyHash === newNode.headingBodyHash
  )
    return true
  const distance = simHashDistanceForRecall(oldNode, newNode)
  return distance === undefined || distance <= DIFF_HEURISTICS.recall.textSimThreshold
}

export function simHashDistanceForRecall(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number | undefined {
  return simHashHammingDistance(oldNode.textSimHash, newNode.textSimHash)
}

export function simHashBonusForRecall(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number {
  const distance = simHashDistanceForRecall(oldNode, newNode)
  if (distance === undefined) return 0
  return (
    Math.max(
      0,
      (DIFF_HEURISTICS.recall.textSimThreshold - distance) /
        DIFF_HEURISTICS.recall.textSimThreshold,
    ) * DIFF_HEURISTICS.recall.simHashBonusWeight
  )
}

export function computeStructuralFallbackScore(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  oldParentId: string,
  newParentId: string,
): number {
  const base = computeNodeSimilarity(
    oldNode,
    newNode,
    context.options,
    parentContextScore(context, oldParentId, newParentId),
  )
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

export function childShapeSimilarity(
  context: DiffContext,
  oldChildren: string[],
  newChildren: string[],
): number {
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

export function sourceRangeCloseness(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number {
  const oldStart = oldNode.sourceRange?.start
  const newStart = newNode.sourceRange?.start
  if (!oldStart || !newStart) return DIFF_HEURISTICS.fallback.sourceRange.fallbackScore
  if (oldStart.line !== undefined && newStart.line !== undefined) {
    return Math.max(
      0,
      1 -
        Math.abs(oldStart.line - newStart.line) / DIFF_HEURISTICS.fallback.sourceRange.lineDivisor,
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
