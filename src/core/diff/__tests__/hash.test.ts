import { describe, expect, it } from 'vitest'
import {
  hashCanonical,
  hashText,
  stableStringify,
  charikarSimHash,
  simHashHammingDistance,
  simHashHammingDistanceBatch,
} from '../hash'

describe('hash module', () => {
  describe('hashCanonical', () => {
    it('produces consistent hashes for same value', async () => {
      const a = await hashCanonical({ key: 'value' })
      const b = await hashCanonical({ key: 'value' })
      expect(a).toBe(b)
    })

    it('produces different hashes for different values', async () => {
      const a = await hashCanonical({ key: 'alpha' })
      const b = await hashCanonical({ key: 'beta' })
      expect(a).not.toBe(b)
    })

    it('is key-order independent', async () => {
      const a = await hashCanonical({ x: 1, y: 2 })
      const b = await hashCanonical({ y: 2, x: 1 })
      expect(a).toBe(b)
    })
  })

  describe('hashText', () => {
    it('produces consistent hashes', async () => {
      const a = await hashText('hello')
      const b = await hashText('hello')
      expect(a).toBe(b)
    })

    it('produces different hashes for different strings', async () => {
      const a = await hashText('hello')
      const b = await hashText('world')
      expect(a).not.toBe(b)
    })
  })

  describe('stableStringify', () => {
    it('sorts object keys', () => {
      expect(stableStringify({ z: 1, a: 2 })).toBe('{"a":2,"z":1}')
    })

    it('handles nested objects', () => {
      expect(stableStringify({ b: { d: 1, c: 2 }, a: 3 })).toBe('{"a":3,"b":{"c":2,"d":1}}')
    })

    it('handles arrays without reordering', () => {
      expect(stableStringify([3, 1, 2])).toBe('[3,1,2]')
    })

    it('handles null and undefined', () => {
      expect(stableStringify(null)).toBe('null')
      expect(stableStringify({ a: undefined })).toBe('{}')
    })

    it('handles primitives', () => {
      expect(stableStringify('hello')).toBe('"hello"')
      expect(stableStringify(42)).toBe('42')
      expect(stableStringify(true)).toBe('true')
    })
  })

  describe('charikarSimHash', () => {
    it('returns undefined for empty tokens', async () => {
      expect(await charikarSimHash([])).toBeUndefined()
    })

    it('returns a hex string for non-empty tokens', async () => {
      const hash = await charikarSimHash(['hello', 'world'])
      expect(hash).toBeDefined()
      expect(hash).toMatch(/^[0-9a-f]+$/)
    })

    it('returns same hash for same tokens', async () => {
      const a = await charikarSimHash(['alpha', 'beta', 'gamma'])
      const b = await charikarSimHash(['alpha', 'beta', 'gamma'])
      expect(a).toBe(b)
    })

    it('returns different hashes for different tokens', async () => {
      const a = await charikarSimHash(['alpha', 'beta'])
      const b = await charikarSimHash(['gamma', 'delta'])
      expect(a).not.toBe(b)
    })
  })

  describe('simHashHammingDistance', () => {
    it('returns 0 for identical hashes', () => {
      expect(simHashHammingDistance('abcd', 'abcd')).toBe(0)
    })

    it('returns undefined when either input is undefined', () => {
      expect(simHashHammingDistance(undefined, 'abcd')).toBeUndefined()
      expect(simHashHammingDistance('abcd', undefined)).toBeUndefined()
      expect(simHashHammingDistance(undefined, undefined)).toBeUndefined()
    })

    it('counts differing bits', () => {
      const dist = simHashHammingDistance('0', '1')
      expect(dist).toBe(1)
    })

    it('counts all differing bits for maximally different hashes', () => {
      const dist = simHashHammingDistance('0000000000000000', 'ffffffffffffffff')
      expect(dist).toBe(64)
    })
  })

  describe('simHashHammingDistanceBatch', () => {
    it('returns distances for each candidate', () => {
      const result = simHashHammingDistanceBatch('abcd', ['abcd', 'abce', undefined])
      expect(result).toHaveLength(3)
      expect(result[0]).toBe(0)
      expect(result[2]).toBeUndefined()
    })

    it('returns all undefined when query is undefined', () => {
      const result = simHashHammingDistanceBatch(undefined, ['abcd', 'abce'])
      expect(result.every((d) => d === undefined)).toBe(true)
    })
  })
})
