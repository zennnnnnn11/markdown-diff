import { describe, expect, it } from 'vitest'
import {
  characterNgramSimilarity,
  jaccardSimilarity,
  multisetJaccardSimilarity,
  sequenceSimilarity,
} from '../math'

describe('math module', () => {
  describe('jaccardSimilarity', () => {
    it('returns 1 for identical sets', () => {
      expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1)
    })

    it('returns 0 for disjoint sets', () => {
      expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0)
    })

    it('returns 1 for two empty sets', () => {
      expect(jaccardSimilarity([], [])).toBe(1)
    })

    it('returns 0 for empty vs non-empty', () => {
      expect(jaccardSimilarity([], ['a'])).toBe(0)
    })

    it('computes correct ratio for partial overlap', () => {
      expect(jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(0.5, 5)
    })

    it('ignores duplicates (set semantics)', () => {
      expect(jaccardSimilarity(['a', 'a', 'b'], ['a', 'b'])).toBe(1)
    })
  })

  describe('multisetJaccardSimilarity', () => {
    it('returns 1 for identical multisets', () => {
      expect(multisetJaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1)
    })

    it('returns 0 for disjoint multisets', () => {
      expect(multisetJaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0)
    })

    it('returns 1 for two empty multisets', () => {
      expect(multisetJaccardSimilarity([], [])).toBe(1)
    })

    it('accounts for multiplicity', () => {
      const sim = multisetJaccardSimilarity(['a', 'a', 'b'], ['a', 'b'])
      expect(sim).toBeLessThan(1)
      expect(sim).toBeGreaterThan(0)
    })

    it('returns correct ratio with counts', () => {
      expect(multisetJaccardSimilarity(['a', 'a'], ['a'])).toBeCloseTo(0.5, 5)
    })
  })

  describe('sequenceSimilarity', () => {
    it('returns 1 for identical sequences', () => {
      expect(sequenceSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1)
    })

    it('returns 0 for completely different sequences', () => {
      expect(sequenceSimilarity(['a'], ['b'])).toBe(0)
    })

    it('returns 1 for two empty sequences', () => {
      expect(sequenceSimilarity([], [])).toBe(1)
    })

    it('returns 0 for empty vs non-empty', () => {
      expect(sequenceSimilarity([], ['a'])).toBe(0)
    })

    it('increases with more shared elements', () => {
      const sim1 = sequenceSimilarity(['a', 'b', 'c', 'd'], ['a', 'x', 'y', 'z'])
      const sim2 = sequenceSimilarity(['a', 'b', 'c', 'd'], ['a', 'b', 'y', 'z'])
      const sim3 = sequenceSimilarity(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'z'])
      expect(sim3).toBeGreaterThan(sim2)
      expect(sim2).toBeGreaterThan(sim1)
    })

    it('is sensitive to ordering', () => {
      const forward = sequenceSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])
      const reversed = sequenceSimilarity(['a', 'b', 'c'], ['c', 'b', 'a'])
      expect(forward).toBeGreaterThan(reversed)
    })
  })

  describe('characterNgramSimilarity', () => {
    it('returns 1 for identical text', () => {
      expect(characterNgramSimilarity('hello world', 'hello world')).toBe(1)
    })

    it('returns 0 for completely different text', () => {
      expect(characterNgramSimilarity('abc', 'xyz')).toBe(0)
    })

    it('returns 1 for two empty strings', () => {
      expect(characterNgramSimilarity('', '')).toBe(1)
    })

    it('returns a mid-range value for reversed word order', () => {
      const sim = characterNgramSimilarity('hello world', 'world hello')
      expect(sim).toBeGreaterThan(0.3)
      expect(sim).toBeLessThan(1)
    })

    it('handles CJK characters correctly', () => {
      const sim = characterNgramSimilarity('你好世界欢迎来到', '你好世界欢迎来到')
      expect(sim).toBe(1)
      const partial = characterNgramSimilarity('你好世界欢迎来到', '你好世界再见各位')
      expect(partial).toBeGreaterThan(0)
      expect(partial).toBeLessThan(1)
    })

    it('handles emoji and multi-byte characters', () => {
      const sim = characterNgramSimilarity('hello 🌍 world', 'hello 🌍 world')
      expect(sim).toBe(1)
    })

    it('is case-insensitive', () => {
      expect(characterNgramSimilarity('Hello World', 'hello world')).toBe(1)
    })

    it('normalizes whitespace', () => {
      expect(characterNgramSimilarity('hello   world', 'hello world')).toBe(1)
    })

    it('returns a value for text shorter than n', () => {
      const sim = characterNgramSimilarity('ab', 'ab')
      expect(sim).toBe(1)
    })
  })

  describe('module independence', () => {
    it('math.ts has no imports from the diff layer', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const source = fs.readFileSync(
        path.resolve(__dirname, '../math.ts'),
        'utf-8',
      )
      expect(source).not.toMatch(/from\s+['"]\.\//m)
    })
  })
})
