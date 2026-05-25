import { isSection } from '@/core/transformer'
import type { Block, DiffChange, InlineSpan, LineDiffSpan, Section, Tone } from './types'
import type { ProjectionSegment } from './types'
import { tonesForChange } from './utils'

export function mergeAdjacentSegments(segments: ProjectionSegment[]): ProjectionSegment[] {
  const merged: ProjectionSegment[] = []
  for (const segment of segments) {
    const previous = merged[merged.length - 1]
    if (previous && previous.tone === segment.tone) {
      previous.text += segment.text
      continue
    }
    merged.push({ ...segment })
  }
  return merged
}

export function headingPrefix(change: DiffChange): string {
  const depth = getHeadingDepth(change.newNode) ?? getHeadingDepth(change.oldNode)
  return depth ? `${'#'.repeat(depth)} ` : ''
}

function getHeadingDepth(node: Section | Block | undefined): number | undefined {
  if (!node) return undefined
  if (isSection(node)) return node.headingDepth
  return typeof node.depth === 'number' ? node.depth : undefined
}

export function buildSideInlineSegments(
  change: DiffChange,
  side: 'old' | 'new',
): ProjectionSegment[] | undefined {
  const spans = change.kind === 'heading' ? change.titleInlineSpans : change.inlineSpans
  if (!spans?.length) return undefined

  const tone = change.kind === 'heading' ? 'rename' : (tonesForChange(change)[0] ?? 'replace')
  const prefix = change.kind === 'heading' ? headingPrefix(change) : ''
  const segments: ProjectionSegment[] = []

  if (prefix) {
    segments.push({
      text: prefix,
      tone: 'plain',
    })
  }

  for (const span of spans) {
    const next = buildPreciseSideSegments(span, side, tone)
    if (next?.length) segments.push(...next)
  }

  const merged = mergeAdjacentSegments(segments)
  return merged.length > 0 ? merged : undefined
}

export function stripHeadingPrefix(
  segments: ProjectionSegment[] | undefined,
): ProjectionSegment[] | undefined {
  if (!segments?.length) return segments
  const first = segments[0]
  if (!first) return segments
  if (first.tone === 'plain' && /^#+ $/.test(first.text)) {
    return segments.length === 1 ? undefined : segments.slice(1)
  }
  return segments
}

export function buildCodeSegment(
  span: NonNullable<LineDiffSpan['charSpans']>[number],
  side: 'old' | 'new',
  replaceTone: Tone,
): ProjectionSegment | undefined {
  if (span.op === 'equal') {
    const text =
      side === 'old' ? (span.oldText ?? span.newText ?? '') : (span.newText ?? span.oldText ?? '')
    return text ? { text, tone: 'plain' } : undefined
  }
  if (span.op === 'insert') {
    if (side === 'old') return undefined
    return span.newText ? { text: span.newText, tone: 'insert' } : undefined
  }
  if (span.op === 'delete') {
    if (side === 'new') return undefined
    return span.oldText ? { text: span.oldText, tone: 'delete' } : undefined
  }
  if (side === 'old') {
    return span.oldText ? { text: span.oldText, tone: 'delete' } : undefined
  }
  return span.newText ? { text: span.newText, tone: replaceTone } : undefined
}

export function buildSideSegmentsFromSpans(
  spans: InlineSpan[],
  side: 'old' | 'new',
  tone: Tone,
): ProjectionSegment[] | undefined {
  const segments: ProjectionSegment[] = []
  for (const span of spans) {
    const next = buildPreciseSideSegments(span, side, tone)
    if (next?.length) segments.push(...next)
  }

  const merged = mergeAdjacentSegments(segments)
  return merged.length > 0 ? merged : undefined
}

export function buildSegmentsFromRanges(
  text: string,
  ranges: Array<{ start: number; end: number; tone: Tone }>,
): ProjectionSegment[] | undefined {
  const sorted = [...ranges]
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)

  if (!sorted.length) return undefined

  const mergedRanges: Array<{ start: number; end: number; tone: Tone }> = []
  for (const range of sorted) {
    const previous = mergedRanges[mergedRanges.length - 1]
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
      continue
    }
    mergedRanges.push({ ...range })
  }

  const segments: ProjectionSegment[] = []
  let cursor = 0

  for (const range of mergedRanges) {
    if (range.start > cursor) {
      segments.push({
        text: text.slice(cursor, range.start),
        tone: 'plain',
      })
    }

    segments.push({
      text: text.slice(range.start, range.end),
      tone: range.tone,
    })
    cursor = range.end
  }

  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      tone: 'plain',
    })
  }

  return mergeAdjacentSegments(segments.filter((segment) => segment.text.length > 0))
}

function buildPreciseSideSegments(
  span: InlineSpan,
  side: 'old' | 'new',
  tone: Tone,
): ProjectionSegment[] | undefined {
  const sourceText = side === 'old' ? span.oldText : span.newText
  if (sourceText && span.wordSpans?.length) {
    const precise = buildPreciseWordSegments(sourceText, span.wordSpans, side, tone)
    if (precise?.length) return precise
  }

  const fallback = buildSideSpanSegment(span, side, tone)
  return fallback ? [fallback] : undefined
}

export function buildPreciseWordSegments(
  sourceText: string,
  wordSpans: NonNullable<InlineSpan['wordSpans']>,
  side: 'old' | 'new',
  tone: Tone,
): ProjectionSegment[] | undefined {
  const segments: ProjectionSegment[] = []
  const loweredSource = sourceText.toLowerCase()
  if (loweredSource.length !== sourceText.length) return undefined
  let cursor = 0

  for (const wordSpan of wordSpans) {
    const next = buildSideWordSegment(wordSpan, side, tone)
    if (!next?.text) continue

    const matchIndex = loweredSource.indexOf(next.text.toLowerCase(), cursor)
    if (matchIndex < 0) return undefined

    if (matchIndex > cursor) {
      segments.push({
        text: sourceText.slice(cursor, matchIndex),
        tone: 'plain',
      })
    }

    segments.push({
      text: sourceText.slice(matchIndex, matchIndex + next.text.length),
      tone: next.tone,
    })
    cursor = matchIndex + next.text.length
  }

  if (cursor < sourceText.length) {
    segments.push({
      text: sourceText.slice(cursor),
      tone: 'plain',
    })
  }

  const merged = mergeAdjacentSegments(segments.filter((segment) => segment.text.length > 0))
  return merged.length > 0 ? merged : undefined
}

function buildSideSpanSegment(
  span: InlineSpan,
  side: 'old' | 'new',
  tone: Tone,
): ProjectionSegment | undefined {
  if (span.op === 'equal') {
    const text =
      side === 'old' ? (span.oldText ?? span.newText ?? '') : (span.newText ?? span.oldText ?? '')
    return text ? { text, tone: 'plain' } : undefined
  }

  if (span.op === 'insert') {
    if (side === 'old') return undefined
    return span.newText ? { text: span.newText, tone: 'insert' } : undefined
  }

  if (span.op === 'delete') {
    if (side === 'new') return undefined
    return span.oldText ? { text: span.oldText, tone: 'delete' } : undefined
  }

  if (side === 'old') {
    return span.oldText ? { text: span.oldText, tone: 'delete' } : undefined
  }
  return span.newText ? { text: span.newText, tone } : undefined
}

function buildSideWordSegment(
  span: NonNullable<InlineSpan['wordSpans']>[number],
  side: 'old' | 'new',
  tone: Tone,
): ProjectionSegment | undefined {
  if (span.op === 'equal') {
    const text =
      side === 'old' ? (span.oldText ?? span.newText ?? '') : (span.newText ?? span.oldText ?? '')
    return text ? { text, tone: 'plain' } : undefined
  }

  if (span.op === 'insert') {
    if (side === 'old') return undefined
    return span.newText ? { text: span.newText, tone: 'insert' } : undefined
  }

  if (span.op === 'delete') {
    if (side === 'new') return undefined
    return span.oldText ? { text: span.oldText, tone: 'delete' } : undefined
  }

  if (side === 'old') {
    return span.oldText ? { text: span.oldText, tone: 'delete' } : undefined
  }
  return span.newText ? { text: span.newText, tone } : undefined
}
