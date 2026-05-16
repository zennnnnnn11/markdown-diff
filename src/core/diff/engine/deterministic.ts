import { isSameShape } from '../similarity'
import type { MatchKind, MatchPair, SemanticIndex } from '../types'
import { AnchorRegistry } from './context'
import type { DiffContext, MatchCandidate } from './context'
import {
  addMatch,
  ambiguousSharedHashes,
  collectConflicts,
  coverDescendants,
  filterDefinitionIdentifiers,
  filterFootnoteIdentifiers,
  filterIdentityHashes,
  oldRootPair,
  push,
  resolveSiblingAnchorBounds,
  sliceSiblingWitnessWindow,
  uniqueSharedHashes,
  withinSiblingOffsetThreshold,
} from './helpers'

export async function runDeterministicMatching(context: DiffContext): Promise<void> {
  const coveredOld = new Set<string>()
  const coveredNew = new Set<string>()
  const anchors = new AnchorRegistry()
  registerDeterministicAnchor(context, anchors, oldRootPair(context))

  await applyExactSubtreeMatches(context, anchors, coveredOld, coveredNew)
  resolveAmbiguousSubtrees(context, anchors, coveredOld, coveredNew)
  const candidates = await collectDeterministicCandidates(context, anchors, coveredOld, coveredNew)
  const highestPriorityByOld = new Map<string, number>()
  const highestPriorityByNew = new Map<string, number>()
  for (const candidate of candidates) {
    highestPriorityByOld.set(
      candidate.oldId,
      Math.max(
        highestPriorityByOld.get(candidate.oldId) ?? Number.NEGATIVE_INFINITY,
        candidate.priority,
      ),
    )
    highestPriorityByNew.set(
      candidate.newId,
      Math.max(
        highestPriorityByNew.get(candidate.newId) ?? Number.NEGATIVE_INFINITY,
        candidate.priority,
      ),
    )
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
      if (context.matchesByOld.has(candidate.oldId) || context.matchesByNew.has(candidate.newId))
        continue
      const pair = addMatch(
        context,
        candidate.oldId,
        candidate.newId,
        candidate.matchKind,
        undefined,
        candidate.score,
      )
      registerDeterministicAnchor(context, anchors, pair)
    }
  }
}

export async function applyExactSubtreeMatches(
  context: DiffContext,
  anchors: AnchorRegistry,
  blockedOld: Set<string>,
  blockedNew: Set<string>,
): Promise<void> {
  const exactSubtrees = uniqueSharedHashes(
    context.oldIndex.bySubtreeHash,
    context.newIndex.bySubtreeHash,
  )
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
      } =>
        !!candidate.oldNode &&
        !!candidate.newNode &&
        isSameShape(candidate.oldNode, candidate.newNode),
    )
    .sort((left, right) => right.oldNode.subtreeSize - left.oldNode.subtreeSize)

  for (const candidate of exactSubtrees) {
    if (blockedOld.has(candidate.oldId) || blockedNew.has(candidate.newId)) continue
    if (context.matchesByOld.has(candidate.oldId) || context.matchesByNew.has(candidate.newId))
      continue
    const pair = addMatch(context, candidate.oldId, candidate.newId, 'exact-subtree', undefined, 1)
    registerDeterministicAnchor(context, anchors, pair)
    coverDescendants(context.oldIndex, candidate.oldId, blockedOld)
    coverDescendants(context.newIndex, candidate.newId, blockedNew)
  }
}

export async function collectDeterministicCandidates(
  context: DiffContext,
  anchors: AnchorRegistry,
  blockedOld: Set<string>,
  blockedNew: Set<string>,
): Promise<MatchCandidate[]> {
  const candidates: MatchCandidate[] = []
  const exactSelf = uniqueSharedHashes(context.oldIndex.bySelfHash, context.newIndex.bySelfHash)
    .map(([oldId, newId]) => classifyExactSelfCandidate(context, anchors, oldId, newId))
    .filter((candidate): candidate is MatchCandidate => !!candidate)
  const exactDirect = uniqueSharedHashes(
    context.oldIndex.byDirectHash,
    context.newIndex.byDirectHash,
  ).map(([oldId, newId]) => ({
    oldId,
    newId,
    matchKind: 'exact-direct' as const,
    priority: 4,
    score: 1,
  }))

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
    ...uniqueSharedHashes(
      filterIdentityHashes(context.oldIndex, 'footnote'),
      filterIdentityHashes(context.newIndex, 'footnote'),
    ).map(([oldId, newId]) => ({
      oldId,
      newId,
      matchKind: 'footnote-identity' as const,
      priority: 3,
      score: 1,
    })),
    ...uniqueSharedHashes(
      filterFootnoteIdentifiers(context.oldIndex),
      filterFootnoteIdentifiers(context.newIndex),
    ).map(([oldId, newId]) => ({
      oldId,
      newId,
      matchKind: 'footnote-identifier' as const,
      priority: 2,
      score: 1,
    })),
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
    ...uniqueSharedHashes(
      filterDefinitionIdentifiers(context.oldIndex),
      filterDefinitionIdentifiers(context.newIndex),
    ).map(([oldId, newId]) => ({
      oldId,
      newId,
      matchKind: 'definition-identifier' as const,
      priority: 1,
      score: 1,
    })),
  )

  return candidates
}

export function canDeterministicallyMatch(
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

export function classifyExactSelfCandidate(
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

export function hasLocalHashContext(
  context: DiffContext,
  anchors: AnchorRegistry,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  const oldSiblings = oldNode.parentId
    ? (context.oldIndex.childrenById.get(oldNode.parentId) ?? [])
    : []
  const newSiblings = newNode.parentId
    ? (context.newIndex.childrenById.get(newNode.parentId) ?? [])
    : []

  const siblingBounds =
    oldNode.parentId && newNode.parentId
      ? resolveSiblingAnchorBounds(
          context,
          oldNode.parentId,
          newNode.parentId,
          oldNode.siblingIndex,
        )
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
    const interval = anchors.getGlobalInterval(
      oldNode.preorder,
      context.newIndex.nodesInPreorder.length,
    )
    if (!interval) return true
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

export function registerDeterministicAnchor(
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

export function shouldRegisterDeterministicAnchor(matchKind: MatchKind | undefined): boolean {
  return matchKind === 'forced-root' || matchKind === 'exact-subtree' || matchKind === 'exact-subtree-resolved' || matchKind === 'exact-self'
}

export function isCandidateWithinAnchoredBounds(
  context: DiffContext,
  anchors: AnchorRegistry,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  if (oldNode.parentId && newNode.parentId) {
    const siblingBounds = resolveSiblingAnchorBounds(
      context,
      oldNode.parentId,
      newNode.parentId,
      oldNode.siblingIndex,
    )
    if (siblingBounds) {
      return (
        newNode.siblingIndex >= siblingBounds.newMin && newNode.siblingIndex <= siblingBounds.newMax
      )
    }
  }

  const interval = anchors.getGlobalInterval(
    oldNode.preorder,
    context.newIndex.nodesInPreorder.length,
  )
  if (!interval) return true
  return newNode.preorder >= interval.min && newNode.preorder <= interval.max
}

function resolveAmbiguousSubtrees(
  context: DiffContext,
  anchors: AnchorRegistry,
  blockedOld: Set<string>,
  blockedNew: Set<string>,
): void {
  const ambiguous = ambiguousSharedHashes(
    context.oldIndex.bySubtreeHash,
    context.newIndex.bySubtreeHash,
  )
  ambiguous.sort((a, b) => {
    const sizeA = context.oldIndex.byId.get(a.oldIds[0]!)?.subtreeSize ?? 0
    const sizeB = context.oldIndex.byId.get(b.oldIds[0]!)?.subtreeSize ?? 0
    return sizeB - sizeA
  })

  for (const { oldIds, newIds } of ambiguous) {
    const resolved = resolveByChildDisambiguation(context, oldIds, newIds, blockedOld, blockedNew, 3)
    for (const { oldId, newId } of resolved) {
      if (blockedOld.has(oldId) || blockedNew.has(newId)) continue
      if (context.matchesByOld.has(oldId) || context.matchesByNew.has(newId)) continue
      const oldNode = context.oldIndex.byId.get(oldId)
      const newNode = context.newIndex.byId.get(newId)
      if (!oldNode || !newNode || !isSameShape(oldNode, newNode)) continue
      const pair = addMatch(context, oldId, newId, 'exact-subtree-resolved', undefined, 1)
      registerDeterministicAnchor(context, anchors, pair)
      coverDescendants(context.oldIndex, oldId, blockedOld)
      coverDescendants(context.newIndex, newId, blockedNew)
    }
  }
}

function resolveByChildDisambiguation(
  context: DiffContext,
  oldIds: string[],
  newIds: string[],
  blockedOld: Set<string>,
  blockedNew: Set<string>,
  remainingDepth: number,
): Array<{ oldId: string; newId: string }> {
  if (remainingDepth <= 0 || oldIds.length !== newIds.length) return []

  const oldChildMaps = new Map<string, Map<string, string[]>>()
  const newChildMaps = new Map<string, Map<string, string[]>>()
  for (const oldId of oldIds) {
    const childMap = new Map<string, string[]>()
    for (const childId of context.oldIndex.childrenById.get(oldId) ?? []) {
      const child = context.oldIndex.byId.get(childId)
      if (child) push(childMap, child.subtreeHash, childId)
    }
    oldChildMaps.set(oldId, childMap)
  }
  for (const newId of newIds) {
    const childMap = new Map<string, string[]>()
    for (const childId of context.newIndex.childrenById.get(newId) ?? []) {
      const child = context.newIndex.byId.get(childId)
      if (child) push(childMap, child.subtreeHash, childId)
    }
    newChildMaps.set(newId, childMap)
  }

  const evidence = new Map<string, string>()
  for (const oldId of oldIds) {
    const oldMap = oldChildMaps.get(oldId)!
    for (const [childHash, oldChildIds] of oldMap) {
      if (oldChildIds.length !== 1) continue
      const candidates: string[] = []
      for (const newId of newIds) {
        const newChildIds = newChildMaps.get(newId)!.get(childHash)
        if (newChildIds?.length === 1) candidates.push(newId)
      }
      if (candidates.length !== 1) continue
      const existing = evidence.get(oldId)
      if (existing && existing !== candidates[0]) { evidence.delete(oldId); break }
      evidence.set(oldId, candidates[0]!)
    }
  }

  const usedNew = new Set<string>()
  const result: Array<{ oldId: string; newId: string }> = []
  for (const [oldId, newId] of evidence) {
    if (usedNew.has(newId) || blockedOld.has(oldId) || blockedNew.has(newId)) continue
    usedNew.add(newId)
    result.push({ oldId, newId })
  }
  if (result.length !== oldIds.length) return []
  return result
}
