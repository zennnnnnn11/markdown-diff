import { describe, expect, it } from 'vitest'
import { AnchorRegistry } from '../engine/context'

describe('AnchorRegistry', () => {
  describe('register', () => {
    it('inserts first anchor', () => {
      const reg = new AnchorRegistry()
      reg.register(5, 10)
      expect(reg.getGlobalInterval(3, 20)).toEqual({ min: 0, max: 9 })
    })

    it('maintains sorted order by oldPreorder', () => {
      const reg = new AnchorRegistry()
      reg.register(10, 20)
      reg.register(5, 15)
      reg.register(15, 25)
      const interval = reg.getGlobalInterval(7, 30)
      expect(interval).toEqual({ min: 16, max: 19 })
    })

    it('deduplicates exact (oldPreorder, newPreorder) pairs', () => {
      const reg = new AnchorRegistry()
      reg.register(5, 10)
      reg.register(5, 10)
      const interval = reg.getGlobalInterval(3, 20)
      expect(interval).toEqual({ min: 0, max: 9 })
    })

    it('allows same oldPreorder with different newPreorder', () => {
      const reg = new AnchorRegistry()
      reg.register(5, 10)
      reg.register(5, 12)
      const interval = reg.getGlobalInterval(3, 20)
      expect(interval!.min).toBe(0)
      expect(interval!.max).toBeLessThan(20)
    })

    it('out-of-order insertion still results in sorted order', () => {
      const reg = new AnchorRegistry()
      reg.register(20, 30)
      reg.register(5, 10)
      reg.register(10, 20)
      const interval = reg.getGlobalInterval(7, 40)
      expect(interval).toEqual({ min: 11, max: 19 })
    })
  })

  describe('getGlobalInterval', () => {
    it('returns full range when no anchors registered', () => {
      const reg = new AnchorRegistry()
      expect(reg.getGlobalInterval(5, 20)).toEqual({ min: 0, max: 19 })
    })

    it('returns {min: 0, max: 0} when no anchors and newTreeSize=1', () => {
      const reg = new AnchorRegistry()
      expect(reg.getGlobalInterval(5, 1)).toEqual({ min: 0, max: 0 })
    })

    it('returns {min: 0, max: 0} when no anchors and newTreeSize=0', () => {
      const reg = new AnchorRegistry()
      expect(reg.getGlobalInterval(5, 0)).toEqual({ min: 0, max: 0 })
    })

    it('uses left anchor as lower bound', () => {
      const reg = new AnchorRegistry()
      reg.register(3, 5)
      const interval = reg.getGlobalInterval(7, 20)
      expect(interval).toEqual({ min: 6, max: 19 })
    })

    it('uses right anchor as upper bound', () => {
      const reg = new AnchorRegistry()
      reg.register(10, 15)
      const interval = reg.getGlobalInterval(5, 20)
      expect(interval).toEqual({ min: 0, max: 14 })
    })

    it('returns interval between two anchors', () => {
      const reg = new AnchorRegistry()
      reg.register(3, 5)
      reg.register(10, 15)
      const interval = reg.getGlobalInterval(7, 20)
      expect(interval).toEqual({ min: 6, max: 14 })
    })

    it('returns undefined when squeezed out between adjacent anchors', () => {
      const reg = new AnchorRegistry()
      reg.register(3, 10)
      reg.register(5, 11)
      const interval = reg.getGlobalInterval(4, 20)
      expect(interval).toBeUndefined()
    })

    it('query before all anchors uses 0 as min', () => {
      const reg = new AnchorRegistry()
      reg.register(10, 15)
      const interval = reg.getGlobalInterval(5, 20)
      expect(interval!.min).toBe(0)
    })

    it('query after all anchors uses newTreeSize-1 as max', () => {
      const reg = new AnchorRegistry()
      reg.register(3, 5)
      const interval = reg.getGlobalInterval(10, 20)
      expect(interval!.max).toBe(19)
    })

    it('handles large newTreeSize', () => {
      const reg = new AnchorRegistry()
      reg.register(3, 5)
      const interval = reg.getGlobalInterval(10, 100_000)
      expect(interval).toEqual({ min: 6, max: 99_999 })
    })

    it('returns undefined when min exceeds max', () => {
      const reg = new AnchorRegistry()
      reg.register(3, 18)
      reg.register(5, 1)
      const interval = reg.getGlobalInterval(4, 20)
      expect(interval).toBeUndefined()
    })

    it('handles single anchor at query oldPreorder (anchor is skipped)', () => {
      const reg = new AnchorRegistry()
      reg.register(5, 10)
      const interval = reg.getGlobalInterval(5, 20)
      expect(interval).toEqual({ min: 0, max: 19 })
    })
  })
})
