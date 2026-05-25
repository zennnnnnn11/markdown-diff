import { describe, expect, it, vi } from 'vitest'

vi.mock('../diff-wasm', () => ({
  hungarianAssignmentWasm: () => {
    throw new Error('WASM not available')
  },
}))

const { hungarianAssignment } = await import('../hungarian')

function totalCost(
  costMatrix: readonly (readonly number[])[],
  assignments: Array<[number, number]>,
): number {
  return assignments.reduce((sum, [r, c]) => sum + costMatrix[r]![c]!, 0)
}

describe('hungarianAssignment (JS fallback)', () => {
  it('solves 1x1 matrix', () => {
    const result = hungarianAssignment([[5]])
    expect(result).toEqual([[0, 0]])
  })

  it('solves 2x2 matrix optimally', () => {
    const result = hungarianAssignment([
      [1, 4],
      [3, 2],
    ])
    expect(
      totalCost(
        [
          [1, 4],
          [3, 2],
        ],
        result,
      ),
    ).toBe(3)
    expect(result).toHaveLength(2)
  })

  it('finds globally optimal where greedy fails', () => {
    const cost = [
      [1, 2, 100],
      [2, 100, 100],
      [100, 100, 1],
    ]
    const result = hungarianAssignment(cost)
    expect(totalCost(cost, result)).toBe(5)
    expect(result).toHaveLength(3)
  })

  it('handles non-square with more rows than cols (3x2)', () => {
    const cost = [
      [5, 9],
      [1, 3],
      [7, 2],
    ]
    const result = hungarianAssignment(cost)
    expect(result).toHaveLength(2)
    const rows = result.map(([r]) => r)
    const cols = result.map(([, c]) => c)
    expect(new Set(rows).size).toBe(rows.length)
    expect(new Set(cols).size).toBe(cols.length)
    expect(totalCost(cost, result)).toBe(3)
  })

  it('handles non-square with more cols than rows (2x3)', () => {
    const cost = [
      [4, 1, 7],
      [6, 3, 2],
    ]
    const result = hungarianAssignment(cost)
    expect(result).toHaveLength(2)
    expect(totalCost(cost, result)).toBe(3)
  })

  it('excludes Infinity entries from results', () => {
    const cost = [
      [1, Infinity],
      [Infinity, 2],
    ]
    const result = hungarianAssignment(cost)
    for (const [r, c] of result) {
      expect(cost[r]![c]).not.toBe(Infinity)
    }
    expect(result).toHaveLength(2)
    expect(totalCost(cost, result)).toBe(3)
  })

  it('handles all-zero matrix', () => {
    const result = hungarianAssignment([
      [0, 0],
      [0, 0],
    ])
    expect(result).toHaveLength(2)
    expect(
      totalCost(
        [
          [0, 0],
          [0, 0],
        ],
        result,
      ),
    ).toBe(0)
  })

  it('returns empty for empty matrix', () => {
    expect(hungarianAssignment([])).toEqual([])
  })

  it('returns empty for zero-column matrix', () => {
    expect(hungarianAssignment([[]])).toEqual([])
  })

  it('matches greedy for diagonal-dominant matrix', () => {
    const cost = [
      [1, 10, 10],
      [10, 2, 10],
      [10, 10, 3],
    ]
    const result = hungarianAssignment(cost)
    expect(result).toHaveLength(3)
    expect(totalCost(cost, result)).toBe(6)
  })

  it('returns empty for all-Infinity matrix', () => {
    const result = hungarianAssignment([
      [Infinity, Infinity],
      [Infinity, Infinity],
    ])
    expect(result).toEqual([])
  })

  it('handles large costs near LARGE_COST sentinel', () => {
    const cost = [
      [1e17, 1],
      [1, 1e17],
    ]
    const result = hungarianAssignment(cost)
    expect(result).toHaveLength(2)
    expect(totalCost(cost, result)).toBe(2)
  })
})
