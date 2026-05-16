import type { Block } from '../transformer'
import type { MetadataChange, SourcePoint, SourceRange } from './types'
import { stableStringify } from './hash'
import { normalizeIdentifier } from './text'

export { isSection } from '../transformer'

export { hashCanonical, hashText, stableStringify, charikarSimHash, simHashHammingDistance, simHashHammingDistanceBatch } from './hash'
export { normalizeIdentifier, normalizeHeadingTitle, slugifyHeading, tokenizeText, structuredTextTokens, extractNodeText, buildInlineTokens, buildInlineToken, extractInlineStructure, readTableData, maxColumns, pathHashInput } from './text'
export { characterNgramSimilarity, jaccardSimilarity, multisetJaccardSimilarity, sequenceSimilarity } from './math'

export function getBlockIdentifier(block: Block | undefined): string {
  return normalizeIdentifier(block?.identifier)
}

export function getSectionIdentifier(section: { heading?: Block } | undefined): string {
  return normalizeIdentifier(section?.heading?.identifier)
}

export function makePairKey(pairKind: 'match' | 'align', oldId: string, newId: string): string {
  return `${pairKind}:${oldId}:${newId}`
}

export function makeMoveId(oldId: string, newId: string): string {
  return `move:${oldId}:${newId}`
}

export function sourceRangeFromPosition(position: any): SourceRange | undefined {
  if (!position) return undefined
  return {
    start: toSourcePoint(position.start),
    end: toSourcePoint(position.end),
  }
}

export function mergeSourceRanges(ranges: Array<SourceRange | undefined>): SourceRange | undefined {
  const filtered = ranges.filter((range): range is SourceRange => !!range)
  if (filtered.length === 0) return undefined

  const starts = filtered.map((range) => range.start).filter((point): point is SourcePoint => !!point)
  const ends = filtered.map((range) => range.end).filter((point): point is SourcePoint => !!point)

  return {
    start: starts.sort(compareSourcePoint)[0],
    end: ends.sort(compareSourcePoint)[ends.length - 1],
  }
}

export function metadataDiff(oldValue: unknown, newValue: unknown, basePath = ''): MetadataChange[] {
  if (deepEqual(oldValue, newValue)) return []

  if (!isRecordLike(oldValue) || !isRecordLike(newValue)) {
    return [
      {
        path: basePath || '$',
        oldValue,
        newValue,
        op: oldValue === undefined ? 'insert' : newValue === undefined ? 'delete' : 'replace',
      },
    ]
  }

  const result: MetadataChange[] = []
  const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)])
  for (const key of [...keys].sort()) {
    const nextPath = basePath ? `${basePath}.${key}` : key
    const oldChild = oldValue[key]
    const newChild = newValue[key]
    if (oldChild === undefined) {
      result.push({ path: nextPath, newValue: newChild, op: 'insert' })
      continue
    }
    if (newChild === undefined) {
      result.push({ path: nextPath, oldValue: oldChild, op: 'delete' })
      continue
    }
    result.push(...metadataDiff(oldChild, newChild, nextPath))
  }
  return result
}

function deepEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right)
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toSourcePoint(point: any): SourcePoint | undefined {
  if (!point) return undefined
  return {
    offset: typeof point.offset === 'number' ? point.offset : undefined,
    line: typeof point.line === 'number' ? point.line : undefined,
    column: typeof point.column === 'number' ? point.column : undefined,
  }
}

function compareSourcePoint(left: SourcePoint, right: SourcePoint): number {
  const leftOffset = left.offset ?? Number.POSITIVE_INFINITY
  const rightOffset = right.offset ?? Number.POSITIVE_INFINITY
  if (leftOffset !== rightOffset) return leftOffset - rightOffset

  const leftLine = left.line ?? Number.POSITIVE_INFINITY
  const rightLine = right.line ?? Number.POSITIVE_INFINITY
  if (leftLine !== rightLine) return leftLine - rightLine

  return (left.column ?? Number.POSITIVE_INFINITY) - (right.column ?? Number.POSITIVE_INFINITY)
}
