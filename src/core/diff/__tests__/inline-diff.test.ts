import { describe, expect, it } from 'vitest'
import {
  coalesceTextSpans,
  diffCharacters,
  diffInlineNodes,
  diffWordText,
  diffWordTextSync,
  hasMeaningfulInlineDiff,
} from '../engine/inline-diff'

describe('inline-diff', () => {
  const SEQ_OPTS = {
    shortSequenceThreshold: 4,
    maxQuadraticSequenceCost: 40000,
    heckelUniqueRatio: 0.5,
  } as const

  describe('diffInlineNodes', () => {
    it('returns deferred when cost exceeds budget', async () => {
      const nodes = Array.from({ length: 200 }, (_, i) => ({
        type: 'text',
        value: `word${i}`,
      })) as any[]
      const result = await diffInlineNodes(nodes, nodes.slice(0, 1), 1, SEQ_OPTS)
      expect(result.deferred).toBe(true)
      expect(result.spans).toHaveLength(1)
      expect(result.spans[0]!.op).toBe('replace')
    })

    it('returns equal spans for identical inline content', async () => {
      const nodes = [{ type: 'text', value: 'hello world' }] as any[]
      const result = await diffInlineNodes(nodes, [...nodes], 10000, SEQ_OPTS)
      expect(result.deferred).toBe(false)
      expect(result.inlineStructureChanged).toBe(false)
      expect(result.spans.length).toBeGreaterThan(0)
      expect(result.spans.every((s) => s.op === 'equal')).toBe(true)
    })

    it('detects inline structure changes when node types differ', async () => {
      const oldNodes = [{ type: 'text', value: 'plain' }] as any[]
      const newNodes = [
        {
          type: 'emphasis',
          children: [{ type: 'text', value: 'italic' }],
        },
      ] as any[]
      const result = await diffInlineNodes(oldNodes, newNodes, 10000, SEQ_OPTS)
      expect(result.deferred).toBe(false)
      expect(result.spans.some((s) => s.op !== 'equal')).toBe(true)
    })

    it('handles empty inputs', async () => {
      const result = await diffInlineNodes([], [], 10000, SEQ_OPTS)
      expect(result.deferred).toBe(false)
      expect(result.spans).toHaveLength(0)
    })
  })

  describe('diffWordText', () => {
    it('returns equal span for identical text', async () => {
      const spans = await diffWordText('hello world', 'hello world', SEQ_OPTS)
      expect(spans).toHaveLength(1)
      expect(spans[0]!.op).toBe('equal')
    })

    it('returns replace span for different text', async () => {
      const spans = await diffWordText('hello world', 'hello planet', SEQ_OPTS)
      expect(spans).toHaveLength(1)
      expect(spans[0]!.op).toBe('replace')
      expect(spans[0]!.wordSpans).toBeDefined()
    })

    it('returns word-level sub-spans', async () => {
      const spans = await diffWordText('alpha beta gamma', 'alpha delta gamma', SEQ_OPTS)
      expect(spans[0]!.wordSpans).toBeDefined()
      const words = spans[0]!.wordSpans!
      const equalWords = words.filter((w) => w.op === 'equal')
      expect(equalWords.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('diffWordTextSync', () => {
    it('diffs at word level', () => {
      const result = diffWordTextSync('foo bar baz', 'foo qux baz', SEQ_OPTS)
      expect(result.some((s) => s.op === 'equal' && s.oldText === 'foo')).toBe(true)
      expect(result.some((s) => s.op === 'equal' && s.oldText === 'baz')).toBe(true)
      expect(result.some((s) => s.op === 'replace')).toBe(true)
    })

    it('falls back to character-level for non-word text', () => {
      const result = diffWordTextSync('...', '---', SEQ_OPTS)
      expect(result.length).toBeGreaterThan(0)
    })

    it('handles empty strings', () => {
      const result = diffWordTextSync('', '', SEQ_OPTS)
      expect(result).toHaveLength(0)
    })
  })

  describe('diffCharacters', () => {
    it('diffs at character level', () => {
      const result = diffCharacters('abc', 'adc', SEQ_OPTS)
      const ops = result.map((s) => s.op)
      expect(ops).toContain('equal')
      expect(ops.some((op) => op === 'replace' || op === 'delete' || op === 'insert')).toBe(true)
    })

    it('handles identical strings', () => {
      const result = diffCharacters('same', 'same', SEQ_OPTS)
      expect(result.every((s) => s.op === 'equal')).toBe(true)
    })
  })

  describe('coalesceTextSpans', () => {
    it('merges adjacent deletes and inserts into replace', () => {
      const edits = [
        { op: 'delete' as const, oldIndex: 0 },
        { op: 'insert' as const, newIndex: 0 },
      ]
      const result = coalesceTextSpans(edits, ['old'], ['new'], ' ')
      expect(result).toHaveLength(1)
      expect(result[0]!.op).toBe('replace')
      expect(result[0]!.oldText).toBe('old')
      expect(result[0]!.newText).toBe('new')
    })

    it('keeps standalone deletes and inserts separate', () => {
      const edits = [
        { op: 'delete' as const, oldIndex: 0 },
        { op: 'equal' as const, oldIndex: 1, newIndex: 0 },
        { op: 'insert' as const, newIndex: 1 },
      ]
      const result = coalesceTextSpans(edits, ['a', 'b'], ['b', 'c'], ' ')
      expect(result).toHaveLength(3)
      expect(result[0]!.op).toBe('delete')
      expect(result[1]!.op).toBe('equal')
      expect(result[2]!.op).toBe('insert')
    })

    it('joins multiple units with separator', () => {
      const edits = [
        { op: 'delete' as const, oldIndex: 0 },
        { op: 'delete' as const, oldIndex: 1 },
      ]
      const result = coalesceTextSpans(edits, ['hello', 'world'], [], ' ')
      expect(result).toHaveLength(1)
      expect(result[0]!.oldText).toBe('hello world')
    })

    it('uses empty separator for character mode', () => {
      const edits = [
        { op: 'delete' as const, oldIndex: 0 },
        { op: 'delete' as const, oldIndex: 1 },
      ]
      const result = coalesceTextSpans(edits, ['a', 'b'], [], '')
      expect(result[0]!.oldText).toBe('ab')
    })
  })

  describe('hasMeaningfulInlineDiff', () => {
    it('returns true when spans contain non-equal ops', () => {
      expect(
        hasMeaningfulInlineDiff([{ op: 'replace', oldText: 'a', newText: 'b' }], 'a', 'b'),
      ).toBe(true)
    })

    it('returns false when all spans are equal and text matches', () => {
      expect(
        hasMeaningfulInlineDiff([{ op: 'equal', oldText: 'a', newText: 'a' }], 'a', 'a'),
      ).toBe(false)
    })

    it('returns true when all spans are equal but text differs', () => {
      expect(
        hasMeaningfulInlineDiff([{ op: 'equal', oldText: 'a', newText: 'a' }], 'a', 'b'),
      ).toBe(true)
    })
  })
})
