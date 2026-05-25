import { describe, expect, it } from 'vitest'
import { hungarianAssignment } from '../hungarian'

function totalCost(
  costMatrix: readonly (readonly number[])[],
  assignments: Array<[number, number]>,
): number {
  return assignments.reduce((sum, [r, c]) => sum + costMatrix[r]![c]!, 0)
}

describe('hungarianAssignment', () => {
  it('solves 1x1 matrix', () => {
    const result = hungarianAssignment([[5]])
    expect(result).toEqual([[0, 0]])
  })

  it('solves 2x2 matrix optimally', () => {
    const result = hungarianAssignment([
      [1, 4],
      [3, 2],
    ])
    // Optimal: (0,0)=1 + (1,1)=2 = 3
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
    const rows = result.map(([r]) => r).sort()
    const cols = result.map(([, c]) => c).sort()
    expect(rows).toEqual([0, 1])
    expect(cols).toEqual([0, 1])
  })

  it('finds globally optimal where greedy fails', () => {
    // Greedy (pick smallest available first) would pick:
    //   (0,0)=1 first, then (1,1)=100, then (2,2)=1 → total = 102
    // Optimal: (0,1)=2, (1,0)=2, (2,2)=1 → total = 5
    const cost = [
      [1, 2, 100],
      [2, 100, 100],
      [100, 100, 1],
    ]
    const result = hungarianAssignment(cost)
    const total = totalCost(cost, result)
    expect(total).toBe(5)
    expect(result).toHaveLength(3)
  })

  it('handles non-square with more rows than cols', () => {
    // 3x2 matrix — only 2 assignments possible
    const cost = [
      [5, 9],
      [1, 3],
      [7, 2],
    ]
    const result = hungarianAssignment(cost)
    expect(result).toHaveLength(2)
    // All returned rows must be in [0..2], cols in [0..1]
    for (const [r, c] of result) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(3)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(2)
    }
    // Each row and col used at most once
    const rows = result.map(([r]) => r)
    const cols = result.map(([, c]) => c)
    expect(new Set(rows).size).toBe(rows.length)
    expect(new Set(cols).size).toBe(cols.length)
    // Optimal: (1,0)=1 + (2,1)=2 = 3
    expect(totalCost(cost, result)).toBe(3)
  })

  it('handles non-square with more cols than rows', () => {
    // 2x3 matrix — only 2 assignments possible
    const cost = [
      [4, 1, 7],
      [6, 3, 2],
    ]
    const result = hungarianAssignment(cost)
    expect(result).toHaveLength(2)
    for (const [r, c] of result) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(2)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(3)
    }
    const rows = result.map(([r]) => r)
    const cols = result.map(([, c]) => c)
    expect(new Set(rows).size).toBe(rows.length)
    expect(new Set(cols).size).toBe(cols.length)
    // Optimal: (0,1)=1 + (1,2)=2 = 3
    expect(totalCost(cost, result)).toBe(3)
  })

  it('excludes Infinity entries from results', () => {
    const cost = [
      [1, Infinity],
      [Infinity, 2],
    ]
    const result = hungarianAssignment(cost)
    // Only finite cells should be assigned
    for (const [r, c] of result) {
      expect(cost[r]![c]).not.toBe(Infinity)
    }
    // Both (0,0) and (1,1) are finite, so both should be assigned
    expect(result).toHaveLength(2)
    expect(totalCost(cost, result)).toBe(3)
  })

  it('handles all-zero matrix', () => {
    const cost = [
      [0, 0],
      [0, 0],
    ]
    const result = hungarianAssignment(cost)
    expect(result).toHaveLength(2)
    expect(totalCost(cost, result)).toBe(0)
  })

  it('returns empty for empty matrix', () => {
    const result = hungarianAssignment([])
    expect(result).toEqual([])
  })

  it('matches greedy for diagonal-dominant matrix', () => {
    // Diagonal entries are smallest → Hungarian should pick them
    const cost = [
      [1, 10, 10],
      [10, 2, 10],
      [10, 10, 3],
    ]
    const result = hungarianAssignment(cost)
    expect(result).toHaveLength(3)
    expect(totalCost(cost, result)).toBe(6)
    // Verify it picks the diagonal
    const asSet = new Set(result.map(([r, c]) => `${r},${c}`))
    expect(asSet.has('0,0')).toBe(true)
    expect(asSet.has('1,1')).toBe(true)
    expect(asSet.has('2,2')).toBe(true)
  })
})
