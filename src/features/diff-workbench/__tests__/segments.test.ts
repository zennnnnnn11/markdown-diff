import { describe, expect, it } from 'vitest'
import {
  mergeAdjacentSegments,
  headingPrefix,
  stripHeadingPrefix,
  buildCodeSegment,
  buildSegmentsFromRanges,
  buildSideSegmentsFromSpans,
  buildPreciseWordSegments,
} from '../view-model/segments'
import type { ProjectionSegment, Tone } from '../view-model/types'

function seg(text: string, tone: Tone): ProjectionSegment {
  return { text, tone }
}

describe('segments module', () => {
  describe('mergeAdjacentSegments', () => {
    it('merges segments with same tone', () => {
      const result = mergeAdjacentSegments([
        seg('hello ', 'plain'),
        seg('world', 'plain'),
      ])
      expect(result.length).toBe(1)
      expect(result[0]!.text).toBe('hello world')
      expect(result[0]!.tone).toBe('plain')
    })

    it('does not merge segments with different tones', () => {
      const result = mergeAdjacentSegments([
        seg('old', 'delete'),
        seg('new', 'insert'),
      ])
      expect(result.length).toBe(2)
    })

    it('merges multiple consecutive same-tone segments', () => {
      const result = mergeAdjacentSegments([
        seg('a', 'plain'),
        seg('b', 'plain'),
        seg('c', 'plain'),
      ])
      expect(result.length).toBe(1)
      expect(result[0]!.text).toBe('abc')
    })

    it('handles alternating tones correctly', () => {
      const result = mergeAdjacentSegments([
        seg('a', 'plain'),
        seg('b', 'delete'),
        seg('c', 'plain'),
      ])
      expect(result.length).toBe(3)
    })

    it('returns empty array for empty input', () => {
      expect(mergeAdjacentSegments([]).length).toBe(0)
    })

    it('returns single segment unchanged', () => {
      const result = mergeAdjacentSegments([seg('hello', 'insert')])
      expect(result.length).toBe(1)
      expect(result[0]!.text).toBe('hello')
    })

    it('does not mutate original segments', () => {
      const original = [seg('a', 'plain'), seg('b', 'plain')]
      mergeAdjacentSegments(original)
      expect(original.length).toBe(2)
      expect(original[0]!.text).toBe('a')
    })
  })

  describe('headingPrefix', () => {
    it('returns "# " for depth-1 heading from newNode (Section)', () => {
      const change = { newNode: { kind: 'heading', depth: 1, headingDepth: 1 } } as any
      expect(headingPrefix(change)).toBe('# ')
    })

    it('returns "## " for depth-2 heading', () => {
      const change = { newNode: { kind: 'heading', depth: 2, headingDepth: 2 } } as any
      expect(headingPrefix(change)).toBe('## ')
    })

    it('returns "### " for depth-3 heading', () => {
      const change = { newNode: { kind: 'heading', depth: 3, headingDepth: 3 } } as any
      expect(headingPrefix(change)).toBe('### ')
    })

    it('falls back to oldNode when newNode is undefined', () => {
      const change = { newNode: undefined, oldNode: { kind: 'heading', depth: 2, headingDepth: 2 } } as any
      expect(headingPrefix(change)).toBe('## ')
    })

    it('returns empty string when both nodes are undefined', () => {
      const change = { newNode: undefined, oldNode: undefined } as any
      expect(headingPrefix(change)).toBe('')
    })

    it('uses Block depth when node is not a Section', () => {
      const change = { newNode: { depth: 3 } } as any
      expect(headingPrefix(change)).toBe('### ')
    })
  })

  describe('stripHeadingPrefix', () => {
    it('removes leading heading prefix segment', () => {
      const segments = [seg('## ', 'plain'), seg('Title', 'rename')]
      const result = stripHeadingPrefix(segments)
      expect(result!.length).toBe(1)
      expect(result![0]!.text).toBe('Title')
    })

    it('returns undefined when only segment is heading prefix', () => {
      const segments = [seg('# ', 'plain')]
      const result = stripHeadingPrefix(segments)
      expect(result).toBeUndefined()
    })

    it('leaves non-heading-prefix segments unchanged', () => {
      const segments = [seg('hello', 'plain'), seg(' world', 'insert')]
      const result = stripHeadingPrefix(segments)
      expect(result!.length).toBe(2)
    })

    it('returns undefined/empty for empty input', () => {
      expect(stripHeadingPrefix([])).toEqual([])
    })

    it('returns undefined for undefined input', () => {
      expect(stripHeadingPrefix(undefined)).toBeUndefined()
    })
  })

  describe('buildCodeSegment', () => {
    it('returns plain segment for equal op (old side)', () => {
      const span = { op: 'equal' as const, oldText: 'hello', newText: 'hello' }
      const result = buildCodeSegment(span, 'old', 'replace')
      expect(result).toEqual({ text: 'hello', tone: 'plain' })
    })

    it('returns plain segment for equal op (new side)', () => {
      const span = { op: 'equal' as const, oldText: 'hello', newText: 'hello' }
      const result = buildCodeSegment(span, 'new', 'replace')
      expect(result).toEqual({ text: 'hello', tone: 'plain' })
    })

    it('returns undefined for insert op on old side', () => {
      const span = { op: 'insert' as const, newText: 'added' }
      expect(buildCodeSegment(span, 'old', 'replace')).toBeUndefined()
    })

    it('returns insert segment for insert op on new side', () => {
      const span = { op: 'insert' as const, newText: 'added' }
      const result = buildCodeSegment(span, 'new', 'replace')
      expect(result).toEqual({ text: 'added', tone: 'insert' })
    })

    it('returns delete segment for delete op on old side', () => {
      const span = { op: 'delete' as const, oldText: 'removed' }
      const result = buildCodeSegment(span, 'old', 'replace')
      expect(result).toEqual({ text: 'removed', tone: 'delete' })
    })

    it('returns undefined for delete op on new side', () => {
      const span = { op: 'delete' as const, oldText: 'removed' }
      expect(buildCodeSegment(span, 'new', 'replace')).toBeUndefined()
    })

    it('returns delete tone for replace op on old side', () => {
      const span = { op: 'replace' as const, oldText: 'old', newText: 'new' }
      const result = buildCodeSegment(span, 'old', 'replace')
      expect(result).toEqual({ text: 'old', tone: 'delete' })
    })

    it('returns replaceTone for replace op on new side', () => {
      const span = { op: 'replace' as const, oldText: 'old', newText: 'new' }
      const result = buildCodeSegment(span, 'new', 'move')
      expect(result).toEqual({ text: 'new', tone: 'move' })
    })

    it('returns undefined for empty text', () => {
      const span = { op: 'insert' as const, newText: '' }
      expect(buildCodeSegment(span, 'new', 'replace')).toBeUndefined()
    })
  })

  describe('buildSideSegmentsFromSpans', () => {
    it('builds segments from equal spans', () => {
      const spans = [{ op: 'equal' as const, oldText: 'hello', newText: 'hello' }]
      const result = buildSideSegmentsFromSpans(spans, 'new', 'replace')
      expect(result).toBeDefined()
      expect(result!.length).toBe(1)
      expect(result![0]!.tone).toBe('plain')
    })

    it('builds segments from insert spans on new side', () => {
      const spans = [{ op: 'insert' as const, newText: 'added' }]
      const result = buildSideSegmentsFromSpans(spans, 'new', 'replace')
      expect(result).toBeDefined()
      expect(result![0]!.tone).toBe('insert')
    })

    it('returns undefined for insert spans on old side', () => {
      const spans = [{ op: 'insert' as const, newText: 'added' }]
      const result = buildSideSegmentsFromSpans(spans, 'old', 'replace')
      expect(result).toBeUndefined()
    })

    it('merges adjacent same-tone segments', () => {
      const spans = [
        { op: 'equal' as const, oldText: 'a', newText: 'a' },
        { op: 'equal' as const, oldText: 'b', newText: 'b' },
      ]
      const result = buildSideSegmentsFromSpans(spans, 'new', 'replace')
      expect(result!.length).toBe(1)
      expect(result![0]!.text).toBe('ab')
    })

    it('returns undefined for empty spans', () => {
      const result = buildSideSegmentsFromSpans([], 'new', 'replace')
      expect(result).toBeUndefined()
    })
  })

  describe('buildSegmentsFromRanges', () => {
    it('highlights a single range with surrounding plain text', () => {
      const result = buildSegmentsFromRanges('hello world', [{ start: 6, end: 11, tone: 'insert' }])
      expect(result).toBeDefined()
      expect(result!.length).toBe(2)
      expect(result![0]).toEqual({ text: 'hello ', tone: 'plain' })
      expect(result![1]).toEqual({ text: 'world', tone: 'insert' })
    })

    it('handles range at start of text', () => {
      const result = buildSegmentsFromRanges('hello world', [{ start: 0, end: 5, tone: 'delete' }])
      expect(result).toBeDefined()
      expect(result![0]).toEqual({ text: 'hello', tone: 'delete' })
      expect(result![1]).toEqual({ text: ' world', tone: 'plain' })
    })

    it('handles multiple non-overlapping ranges', () => {
      const result = buildSegmentsFromRanges('abc def ghi', [
        { start: 0, end: 3, tone: 'delete' },
        { start: 8, end: 11, tone: 'insert' },
      ])
      expect(result).toBeDefined()
      expect(result!.length).toBe(3)
      expect(result![0]!.tone).toBe('delete')
      expect(result![1]!.tone).toBe('plain')
      expect(result![2]!.tone).toBe('insert')
    })

    it('merges overlapping ranges', () => {
      const result = buildSegmentsFromRanges('abcdefgh', [
        { start: 0, end: 4, tone: 'replace' },
        { start: 2, end: 6, tone: 'replace' },
      ])
      expect(result).toBeDefined()
      const replaceParts = result!.filter((s) => s.tone === 'replace')
      expect(replaceParts.length).toBe(1)
      expect(replaceParts[0]!.text).toBe('abcdef')
    })

    it('returns undefined for empty ranges', () => {
      expect(buildSegmentsFromRanges('hello', [])).toBeUndefined()
    })

    it('filters out zero-width ranges', () => {
      const result = buildSegmentsFromRanges('hello', [{ start: 2, end: 2, tone: 'insert' }])
      expect(result).toBeUndefined()
    })

    it('sorts unsorted ranges before processing', () => {
      const result = buildSegmentsFromRanges('abcdef', [
        { start: 4, end: 6, tone: 'insert' },
        { start: 0, end: 2, tone: 'delete' },
      ])
      expect(result).toBeDefined()
      expect(result![0]!.tone).toBe('delete')
      expect(result![2]!.tone).toBe('insert')
    })
  })

  describe('buildPreciseWordSegments', () => {
    it('positions word segments correctly for ASCII text', () => {
      const wordSpans = [
        { op: 'replace' as const, oldText: 'world', newText: 'planet' },
      ]
      const result = buildPreciseWordSegments('hello world', wordSpans, 'old', 'replace')
      expect(result).toBeDefined()
      expect(result!.find((s) => s.tone === 'delete')?.text).toBe('world')
      expect(result!.find((s) => s.tone === 'plain')?.text).toBe('hello ')
    })

    it('bails out for Turkish İ where toLowerCase changes string length', () => {
      const wordSpans = [
        { op: 'replace' as const, oldText: 'İstanbul', newText: 'Ankara' },
      ]
      const result = buildPreciseWordSegments('İstanbul Güzel', wordSpans, 'old', 'replace')
      expect(result).toBeUndefined()
    })

    it('works normally for non-problematic Unicode', () => {
      const wordSpans = [
        { op: 'replace' as const, oldText: '世界', newText: '地球' },
      ]
      const result = buildPreciseWordSegments('你好 世界', wordSpans, 'old', 'replace')
      expect(result).toBeDefined()
      expect(result!.find((s) => s.tone === 'delete')?.text).toBe('世界')
    })

    it('returns undefined when word is not found in source', () => {
      const wordSpans = [
        { op: 'replace' as const, oldText: 'missing', newText: 'gone' },
      ]
      const result = buildPreciseWordSegments('hello world', wordSpans, 'old', 'replace')
      expect(result).toBeUndefined()
    })
  })
})
