import { describe, expect, it } from 'vitest'
import { DEFAULT_DIFF_OPTIONS, resolveDiffOptions } from '../options'

describe('diff options', () => {
  it('returns the defaults when no overrides are provided', () => {
    expect(resolveDiffOptions()).toEqual(DEFAULT_DIFF_OPTIONS)
  })

  it('overrides a single option without disturbing unrelated defaults', () => {
    const resolved = resolveDiffOptions({ minSimilarity: 0.9 })

    expect(resolved.minSimilarity).toBe(0.9)
    expect(resolved.maxInlineDiffMatrixCost).toBe(DEFAULT_DIFF_OPTIONS.maxInlineDiffMatrixCost)
    expect(resolved.enhancedLocalRecovery).toBe(DEFAULT_DIFF_OPTIONS.enhancedLocalRecovery)
  })

  it('derives local alignment cost from the window size when no explicit cost is provided', () => {
    const resolved = resolveDiffOptions({ maxLocalWindowSize: 7 })

    expect(resolved.maxLocalAlignmentCost).toBe(49)
  })

  it('does not override an explicit local alignment cost with the window-derived cost', () => {
    const resolved = resolveDiffOptions({
      maxLocalWindowSize: 7,
      maxLocalAlignmentCost: 99,
    })

    expect(resolved.maxLocalAlignmentCost).toBe(99)
  })

  it('derives recursive, inline, sequence, and apted costs from their public size controls', () => {
    const resolved = resolveDiffOptions({
      maxRecursiveSubtreeSize: 9,
      maxInlineDiffCost: 11,
      shortSequenceThreshold: 13,
      aptedMaxSubtreeSize: 15,
    })

    expect(resolved.maxRecursiveAlignmentCost).toBe(81)
    expect(resolved.maxInlineDiffMatrixCost).toBe(121)
    expect(resolved.maxQuadraticSequenceCost).toBe(169)
    expect(resolved.maxAptedCost).toBe(225)
  })

  it('preserves explicit recursive, inline, sequence, and apted costs over derived values', () => {
    const resolved = resolveDiffOptions({
      maxRecursiveSubtreeSize: 9,
      maxRecursiveAlignmentCost: 5,
      maxInlineDiffCost: 11,
      maxInlineDiffMatrixCost: 7,
      shortSequenceThreshold: 13,
      maxQuadraticSequenceCost: 17,
      aptedMaxSubtreeSize: 15,
      maxAptedCost: 19,
    })

    expect(resolved.maxRecursiveAlignmentCost).toBe(5)
    expect(resolved.maxInlineDiffMatrixCost).toBe(7)
    expect(resolved.maxQuadraticSequenceCost).toBe(17)
    expect(resolved.maxAptedCost).toBe(19)
  })

  it('does not mutate the shared default options object', () => {
    const snapshot = { ...DEFAULT_DIFF_OPTIONS }

    resolveDiffOptions({ maxLocalWindowSize: 3, minSimilarity: 0.2 })

    expect(DEFAULT_DIFF_OPTIONS).toEqual(snapshot)
  })
})
