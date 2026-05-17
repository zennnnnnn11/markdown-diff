import { describe, expect, it } from 'vitest'
import {
  foldLongCodeSpans,
  coalesceLineDiffSpans,
  diffCodeLines,
} from '../engine/presentation'
import { resolveDiffOptions } from '../options'
import type { LineDiffSpan } from '../types'

function makeSpan(op: LineDiffSpan['op'], overrides: Partial<LineDiffSpan> = {}): LineDiffSpan {
  switch (op) {
    case 'equal':
      return { op: 'equal', oldLine: 'line', newLine: 'line', ...overrides }
    case 'delete':
      return { op: 'delete', oldLine: 'deleted', ...overrides }
    case 'insert':
      return { op: 'insert', newLine: 'inserted', ...overrides }
    case 'replace':
      return { op: 'replace', oldLine: 'old', newLine: 'new', charSpans: [], ...overrides }
  }
}

describe('presentation module', () => {
  describe('foldLongCodeSpans', () => {
    it('returns all spans when all are changes', () => {
      const spans: LineDiffSpan[] = [
        makeSpan('delete'),
        makeSpan('insert'),
        makeSpan('replace'),
      ]
      const result = foldLongCodeSpans(spans, 2)
      expect(result.length).toBe(3)
    })

    it('keeps context lines around changes plus first/last lines', () => {
      const spans: LineDiffSpan[] = [
        makeSpan('equal'),  // 0: kept (first contextLines)
        makeSpan('equal'),  // 1: filtered
        makeSpan('equal'),  // 2: kept (change-1)
        makeSpan('delete'), // 3: kept (change)
        makeSpan('equal'),  // 4: kept (change+1)
        makeSpan('equal'),  // 5: filtered
        makeSpan('equal'),  // 6: kept (last contextLines)
      ]
      const result = foldLongCodeSpans(spans, 1)
      expect(result.length).toBe(5)
      expect(result.some((s) => s.op === 'delete')).toBe(true)
    })

    it('preserves first contextLines from start', () => {
      const spans: LineDiffSpan[] = Array.from({ length: 20 }, () => makeSpan('equal'))
      spans[15] = makeSpan('delete')
      const result = foldLongCodeSpans(spans, 3)
      expect(result.length).toBeGreaterThanOrEqual(3)
      expect(result[0]!.op).toBe('equal')
      expect(result[1]!.op).toBe('equal')
      expect(result[2]!.op).toBe('equal')
    })

    it('preserves last contextLines from end', () => {
      const spans: LineDiffSpan[] = Array.from({ length: 20 }, () => makeSpan('equal'))
      spans[3] = makeSpan('delete')
      const result = foldLongCodeSpans(spans, 3)
      const lastThree = result.slice(-3)
      expect(lastThree.every((s) => s.op === 'equal')).toBe(true)
    })

    it('returns truncated equal-only spans', () => {
      const spans: LineDiffSpan[] = Array.from({ length: 20 }, () => makeSpan('equal'))
      const result = foldLongCodeSpans(spans, 3)
      expect(result.length).toBe(6)
    })

    it('handles contextLines=0', () => {
      const spans: LineDiffSpan[] = [
        makeSpan('equal'),
        makeSpan('delete'),
        makeSpan('equal'),
      ]
      const result = foldLongCodeSpans(spans, 0)
      expect(result.some((s) => s.op === 'delete')).toBe(true)
    })

    it('merges overlapping context windows', () => {
      const spans: LineDiffSpan[] = [
        makeSpan('equal'),
        makeSpan('delete'),
        makeSpan('equal'),
        makeSpan('insert'),
        makeSpan('equal'),
      ]
      const result = foldLongCodeSpans(spans, 2)
      expect(result.length).toBe(5)
    })

    it('handles empty spans array', () => {
      const result = foldLongCodeSpans([], 3)
      expect(result.length).toBe(0)
    })

    it('handles single change span', () => {
      const spans: LineDiffSpan[] = [makeSpan('delete')]
      const result = foldLongCodeSpans(spans, 3)
      expect(result.length).toBe(1)
    })
  })

  describe('coalesceLineDiffSpans', () => {
    it('produces equal spans for matching lines', () => {
      const edits = [
        { op: 'equal' as const, oldIndex: 0, newIndex: 0 },
        { op: 'equal' as const, oldIndex: 1, newIndex: 1 },
      ]
      const result = coalesceLineDiffSpans(edits, ['a', 'b'], ['a', 'b'], resolveDiffOptions({}))
      expect(result.length).toBe(2)
      expect(result.every((s) => s.op === 'equal')).toBe(true)
    })

    it('produces delete spans for removed lines', () => {
      const edits = [
        { op: 'delete' as const, oldIndex: 0 },
        { op: 'delete' as const, oldIndex: 1 },
      ]
      const result = coalesceLineDiffSpans(edits, ['a', 'b'], [], resolveDiffOptions({}))
      expect(result.length).toBe(2)
      expect(result.every((s) => s.op === 'delete')).toBe(true)
      expect(result[0]!.oldLine).toBe('a')
    })

    it('produces insert spans for added lines', () => {
      const edits = [
        { op: 'insert' as const, newIndex: 0 },
        { op: 'insert' as const, newIndex: 1 },
      ]
      const result = coalesceLineDiffSpans(edits, [], ['x', 'y'], resolveDiffOptions({}))
      expect(result.length).toBe(2)
      expect(result.every((s) => s.op === 'insert')).toBe(true)
      expect(result[0]!.newLine).toBe('x')
    })

    it('zips adjacent delete+insert into replace', () => {
      const edits = [
        { op: 'delete' as const, oldIndex: 0 },
        { op: 'insert' as const, newIndex: 0 },
      ]
      const result = coalesceLineDiffSpans(edits, ['old line'], ['new line'], resolveDiffOptions({}))
      expect(result.length).toBe(1)
      expect(result[0]!.op).toBe('replace')
      expect(result[0]!.oldLine).toBe('old line')
      expect(result[0]!.newLine).toBe('new line')
    })

    it('produces replace with charSpans for modified lines', () => {
      const edits = [
        { op: 'delete' as const, oldIndex: 0 },
        { op: 'insert' as const, newIndex: 0 },
      ]
      const result = coalesceLineDiffSpans(edits, ['hello world'], ['hello earth'], resolveDiffOptions({}))
      expect(result[0]!.op).toBe('replace')
      expect(result[0]!.charSpans).toBeDefined()
    })

    it('handles more deletes than inserts in a batch', () => {
      const edits = [
        { op: 'delete' as const, oldIndex: 0 },
        { op: 'delete' as const, oldIndex: 1 },
        { op: 'insert' as const, newIndex: 0 },
      ]
      const result = coalesceLineDiffSpans(edits, ['a', 'b'], ['x'], resolveDiffOptions({}))
      const replaces = result.filter((s) => s.op === 'replace')
      const deletes = result.filter((s) => s.op === 'delete')
      expect(replaces.length).toBe(1)
      expect(deletes.length).toBe(1)
    })

    it('handles more inserts than deletes in a batch', () => {
      const edits = [
        { op: 'delete' as const, oldIndex: 0 },
        { op: 'insert' as const, newIndex: 0 },
        { op: 'insert' as const, newIndex: 1 },
      ]
      const result = coalesceLineDiffSpans(edits, ['a'], ['x', 'y'], resolveDiffOptions({}))
      const replaces = result.filter((s) => s.op === 'replace')
      const inserts = result.filter((s) => s.op === 'insert')
      expect(replaces.length).toBe(1)
      expect(inserts.length).toBe(1)
    })

    it('flushes pending batch on equal op', () => {
      const edits = [
        { op: 'delete' as const, oldIndex: 0 },
        { op: 'equal' as const, oldIndex: 1, newIndex: 0 },
        { op: 'insert' as const, newIndex: 1 },
      ]
      const result = coalesceLineDiffSpans(edits, ['a', 'b'], ['b', 'c'], resolveDiffOptions({}))
      expect(result[0]!.op).toBe('delete')
      expect(result[1]!.op).toBe('equal')
      expect(result[2]!.op).toBe('insert')
    })

    it('handles empty edits', () => {
      const result = coalesceLineDiffSpans([], [], [], resolveDiffOptions({}))
      expect(result.length).toBe(0)
    })
  })

  describe('diffCodeLines', () => {
    it('produces spans for simple line change', () => {
      const result = diffCodeLines('line1\nline2', 'line1\nline3', resolveDiffOptions({}))
      expect(result.length).toBeGreaterThan(0)
      const changed = result.filter((s) => s.op !== 'equal')
      expect(changed.length).toBeGreaterThan(0)
    })

    it('produces all-equal for identical code', () => {
      const code = 'const a = 1\nconst b = 2'
      const result = diffCodeLines(code, code, resolveDiffOptions({}))
      expect(result.every((s) => s.op === 'equal')).toBe(true)
    })

    it('folds long code when exceeding longCodeLineThreshold', () => {
      const lines = Array.from({ length: 250 }, (_, i) => `line ${i}`)
      const oldCode = lines.join('\n')
      const newLines = [...lines]
      newLines[125] = 'changed line 125'
      const newCode = newLines.join('\n')
      const result = diffCodeLines(oldCode, newCode, resolveDiffOptions({ longCodeLineThreshold: 200 }))
      expect(result.length).toBeLessThan(250)
    })

    it('does not fold short code', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`)
      const oldCode = lines.join('\n')
      const newLines = [...lines]
      newLines[5] = 'changed'
      const newCode = newLines.join('\n')
      const result = diffCodeLines(oldCode, newCode, resolveDiffOptions({}))
      expect(result.length).toBe(10)
    })

    it('handles CRLF line endings', () => {
      const result = diffCodeLines('a\r\nb\r\nc', 'a\r\nd\r\nc', resolveDiffOptions({}))
      expect(result.length).toBeGreaterThan(0)
    })

    it('handles empty strings', () => {
      const result = diffCodeLines('', '', resolveDiffOptions({}))
      expect(result.length).toBe(1)
    })
  })
})
