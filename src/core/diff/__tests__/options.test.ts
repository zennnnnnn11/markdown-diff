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

  it('overrides cost parameters directly', () => {
    const resolved = resolveDiffOptions({
      maxLocalAlignmentCost: 99,
      maxRecursiveAlignmentCost: 5,
      maxInlineDiffMatrixCost: 7,
      maxQuadraticSequenceCost: 17,
      maxAptedCost: 19,
    })

    expect(resolved.maxLocalAlignmentCost).toBe(99)
    expect(resolved.maxRecursiveAlignmentCost).toBe(5)
    expect(resolved.maxInlineDiffMatrixCost).toBe(7)
    expect(resolved.maxQuadraticSequenceCost).toBe(17)
    expect(resolved.maxAptedCost).toBe(19)
  })

  it('does not mutate the shared default options object', () => {
    const snapshot = { ...DEFAULT_DIFF_OPTIONS }

    resolveDiffOptions({ minSimilarity: 0.2 })

    expect(DEFAULT_DIFF_OPTIONS).toEqual(snapshot)
  })
})
