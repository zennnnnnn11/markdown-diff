import { forEachChange } from '@/core/diff/summary'
import type { DiffChange, PrimaryOp, SourceRange, Tone } from './types'

const TONE_PRIORITY: Record<Tone, number> = {
  delete: 0,
  replace: 1,
  move: 2,
  insert: 3,
  meta: 4,
  rename: 5,
  reorder: 6,
  plain: 7,
}

export function flattenChanges(root: DiffChange): DiffChange[] {
  const changes: DiffChange[] = []
  forEachChange(root, (change) => {
    changes.push(change)
  })
  return changes
}

export function getChangeReference(change: DiffChange): string {
  if (change.pairKey) {
    if (change.moveRole && change.primaryOp === 'move') return `${change.pairKey}:${change.moveRole}`
    return change.pairKey
  }
  if (change.oldId && change.newId) return `pair:${change.oldId}:${change.newId}`
  if (change.newId) return `new:${change.newId}`
  if (change.oldId) return `old:${change.oldId}`
  if (change.metadataChanges?.[0]?.path) return `meta:${change.metadataChanges[0].path}`
  return `summary:${change.summary}`
}

export function getAlignmentReference(change: DiffChange): string {
  if (change.primaryOp === 'move') {
    return change.logicalMoveId ?? change.movePeerKey ?? getChangeReference(change)
  }
  return getChangeReference(change)
}

export function tonesForChange(change: DiffChange): Tone[] {
  const tones: Tone[] = []
  const primaryTone = primaryOpTone(change.primaryOp)
  if (primaryTone !== 'plain') tones.push(primaryTone)
  if (change.primaryOp === 'equal' && change.status.metaChanged) tones.push('meta')
  if (change.primaryOp === 'meta-update') tones.push('meta')
  if (change.status.renamed) tones.push('rename')
  if (change.status.movedWithinParent || change.reordered) tones.push('reorder')
  if (tones.length === 0) tones.push('plain')
  return uniqueTones(tones).sort((left, right) => TONE_PRIORITY[left] - TONE_PRIORITY[right])
}

function primaryOpTone(op: PrimaryOp): Tone {
  if (op === 'insert') return 'insert'
  if (op === 'delete') return 'delete'
  if (op === 'replace') return 'replace'
  if (op === 'move') return 'move'
  if (op === 'meta-update') return 'meta'
  return 'plain'
}

export function uniqueTones(tones: Tone[]): Tone[] {
  return [...new Set(tones)]
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

export function rangeSpan(range: SourceRange): number {
  const start = range.start?.line
  const end = range.end?.line
  if (!start || !end) return Number.MAX_SAFE_INTEGER
  return end - start
}

export function formatMetadataValue(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
