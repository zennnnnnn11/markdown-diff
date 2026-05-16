import type { InlineContent } from '../../transformer'
import type { DiffChange, SemanticIndex } from '../types'
import type { DiffContext } from './context'

export function estimateSectionAlignmentCost(
  context: DiffContext,
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
): number {
  const oldChildren = context.oldIndex.childrenById.get(oldNode.id)?.length ?? 0
  const newChildren = context.newIndex.childrenById.get(newNode.id)?.length ?? 0
  return oldChildren * newChildren + oldChildren + newChildren
}

export function estimateAptedRecoveryCost(change: DiffChange): number {
  const deletes = change.children.filter((child) => child.primaryOp === 'delete').length
  const inserts = change.children.filter((child) => child.primaryOp === 'insert').length
  return deletes * inserts
}

export function estimateInlineDiffCost(
  oldChildren: InlineContent[],
  newChildren: InlineContent[],
): number {
  return oldChildren.length * newChildren.length
}
