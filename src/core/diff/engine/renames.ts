import { diffFrontmatter } from '../frontmatter'
import { isSameShape } from '../similarity'
import { forEachChangeAsync } from '../summary'
import type { DiffChange, SemanticIndex } from '../types'
import {
  getBlockIdentifier,
  getSectionIdentifier,
  jaccardSimilarity,
  sequenceSimilarity,
} from '../utils'
import type { DiffContext } from './context'
import {
  addMatch,
  collectChanges,
  push,
  upgradeToMatch,
} from './helpers'
import {
  rewriteChildrenWithExistingMatches,
  uniqueHeadingSiblingNames,
} from './alignment'
import {
  computeTableMetadataChange,
  isStructuralOnlyTableChange,
  metadataChangeToDiff,
} from './presentation'

export async function recoverRenamesAndMeta(context: DiffContext, root: DiffChange): Promise<void> {
  await forEachChangeAsync(root, async (change) => {
    if (!change.oldId || !change.newId) return
    const oldNode = context.oldIndex.byId.get(change.oldId)
    const newNode = context.newIndex.byId.get(change.newId)
    if (!oldNode || !newNode) return

    if (oldNode.kind === 'heading' && newNode.kind === 'heading') {
      const titlesDiffer = oldNode.normalizedTitle !== newNode.normalizedTitle
      if (titlesDiffer && uniqueHeadingSiblingNames(context, oldNode, newNode)) {
        if (lacksLeafHeadingRenameEvidence(oldNode, newNode)) return
        if (
          sameHeadingStructure(oldNode, newNode) &&
          (oldNode.headingBodyHash === newNode.headingBodyHash ||
            hasStrongHeadingDirectMatchEvidence(context, oldNode, newNode))
        ) {
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
      const oldIdentifier = getSectionIdentifier(oldNode.section)
      const newIdentifier = getSectionIdentifier(newNode.section)
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
      const oldIdentifier = getBlockIdentifier(oldNode.block)
      const newIdentifier = getBlockIdentifier(newNode.block)
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
      if (
        oldNode.contentOnlyHash === newNode.contentOnlyHash &&
        oldNode.selfHash !== newNode.selfHash
      ) {
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
      if (
        oldNode.section?.checked !== newNode.section?.checked &&
        oldNode.contentOnlyHash === newNode.contentOnlyHash
      ) {
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
  })
}

export async function recoverDefinitionIdentifierPairs(
  context: DiffContext,
  root: DiffChange,
): Promise<void> {
  const deletes = collectChanges(
    root,
    (change) =>
      change.primaryOp === 'delete' && change.blockType === 'definition' && !!change.oldId,
  )
  const inserts = collectChanges(
    root,
    (change) =>
      change.primaryOp === 'insert' && change.blockType === 'definition' && !!change.newId,
  )
  if (deletes.length === 0 || inserts.length === 0) return

  const oldByIdentifier = new Map<string, string[]>()
  const newByIdentifier = new Map<string, string[]>()

  for (const change of deletes) {
    const node = change.oldId ? context.oldIndex.byId.get(change.oldId) : undefined
    const identifier = getBlockIdentifier(node?.block)
    if (!node || !identifier || context.matchesByOld.has(node.id)) continue
    push(oldByIdentifier, identifier, node.id)
  }
  for (const change of inserts) {
    const node = change.newId ? context.newIndex.byId.get(change.newId) : undefined
    const identifier = getBlockIdentifier(node?.block)
    if (!node || !identifier || context.matchesByNew.has(node.id)) continue
    push(newByIdentifier, identifier, node.id)
  }

  let recovered = false
  for (const [identifier, oldIds] of oldByIdentifier) {
    const newIds = newByIdentifier.get(identifier)
    if (!newIds || oldIds.length !== 1 || newIds.length !== 1) continue
    const pair = addMatch(context, oldIds[0]!, newIds[0]!, 'definition-identifier', undefined, 1)
    if (pair) recovered = true
  }

  if (!recovered) return
  root.children = await rewriteChildrenWithExistingMatches(context, root.children, 'global')
}

export function hasUniqueIdentityRenameCandidate(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  const oldCandidates = (context.oldIndex.byIdentityHash.get(oldNode.identityHash) ?? [])
    .map((id) => context.oldIndex.byId.get(id))
    .filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        !!candidate && isSameShape(candidate, oldNode),
    )
  const newCandidates = (context.newIndex.byIdentityHash.get(newNode.identityHash) ?? [])
    .map((id) => context.newIndex.byId.get(id))
    .filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        !!candidate && isSameShape(candidate, newNode),
    )

  return oldCandidates.length === 1 && newCandidates.length === 1
}

export function sameHeadingStructure(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  return (
    oldNode.section?.headingDepth === newNode.section?.headingDepth &&
    oldNode.section?.listDepth === newNode.section?.listDepth &&
    oldNode.section?.quoteDepth === newNode.section?.quoteDepth
  )
}

export function hasStrongHeadingDirectMatchEvidence(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  const oldChildren = context.oldIndex.childrenById.get(oldNode.id) ?? []
  const newChildren = new Set(context.newIndex.childrenById.get(newNode.id) ?? [])
  if (oldChildren.length === 0 || newChildren.size === 0) return false

  const matchedDirectChildren = oldChildren.filter((childId) => {
    const pair = context.matchesByOld.get(childId)
    return !!pair && newChildren.has(pair.newId)
  }).length
  const minimumMatchedChildren = Math.max(
    2,
    Math.ceil(Math.min(oldChildren.length, newChildren.size) / 2),
  )
  return matchedDirectChildren >= minimumMatchedChildren
}

export function lacksLeafHeadingRenameEvidence(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): boolean {
  if ((oldNode.logicalChildren.length ?? 0) > 0 || (newNode.logicalChildren.length ?? 0) > 0) {
    return false
  }

  const oldTokens = oldNode.titleTokens
  const newTokens = newNode.titleTokens
  const score =
    oldTokens.length > 0 || newTokens.length > 0
      ? Math.max(jaccardSimilarity(oldTokens, newTokens), sequenceSimilarity(oldTokens, newTokens))
      : sequenceSimilarity(
          [...String(oldNode.section?.title ?? '')],
          [...String(newNode.section?.title ?? '')],
        )

  return score <= 0
}
