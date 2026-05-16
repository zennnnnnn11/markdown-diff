import { describe, expect, it } from 'vitest'
import { hungarianAssignmentWasm, myersDiffWasm } from '../diff-wasm'
import type { SequenceEdit } from '../sequence'

function totalCost(
  costMatrix: readonly (readonly number[])[],
  assignments: Array<[number, number]>,
): number {
  return assignments.reduce((sum, [r, c]) => sum + costMatrix[r]![c]!, 0)
}

function simplify<T>(edits: SequenceEdit<T>[]): string[] {
  return edits.map(
    (e) => `${e.op}:${String(e.value)}:${e.oldIndex ?? ''}:${e.newIndex ?? ''}`,
  )
}

describe('diff-wasm hungarian', () => {
  it('solves 1x1 matrix', () => {
    expect(hungarianAssignmentWasm([[5]])).toEqual([[0, 0]])
  })

  it('solves 2x2 matrix optimally', () => {
    const cost = [
      [1, 4],
      [3, 2],
    ]
    const result = hungarianAssignmentWasm(cost)
    expect(totalCost(cost, result)).toBe(3)
    expect(result).toHaveLength(2)
  })

  it('finds globally optimal where greedy fails', () => {
    const cost = [
      [1, 2, 100],
      [2, 100, 100],
      [100, 100, 1],
    ]
    const result = hungarianAssignmentWasm(cost)
    expect(totalCost(cost, result)).toBe(5)
    expect(result).toHaveLength(3)
  })

  it('handles non-square with more rows than cols', () => {
    const cost = [
      [5, 9],
      [1, 3],
      [7, 2],
    ]
    const result = hungarianAssignmentWasm(cost)
    expect(result).toHaveLength(2)
    expect(totalCost(cost, result)).toBe(3)
  })

  it('handles non-square with more cols than rows', () => {
    const cost = [
      [4, 1, 7],
      [6, 3, 2],
    ]
    const result = hungarianAssignmentWasm(cost)
    expect(result).toHaveLength(2)
    expect(totalCost(cost, result)).toBe(3)
  })

  it('excludes Infinity entries', () => {
    const cost = [
      [1, Infinity],
      [Infinity, 2],
    ]
    const result = hungarianAssignmentWasm(cost)
    expect(result).toHaveLength(2)
    expect(totalCost(cost, result)).toBe(3)
  })

  it('handles all-zero matrix', () => {
    const result = hungarianAssignmentWasm([
      [0, 0],
      [0, 0],
    ])
    expect(result).toHaveLength(2)
    expect(totalCost([[0, 0], [0, 0]], result)).toBe(0)
  })

  it('returns empty for empty matrix', () => {
    expect(hungarianAssignmentWasm([])).toEqual([])
  })

  it('handles larger matrix (10x10)', () => {
    const n = 10
    const cost = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1 : 10)),
    )
    const result = hungarianAssignmentWasm(cost)
    expect(result).toHaveLength(n)
    expect(totalCost(cost, result)).toBe(n)
  })
})

describe('diff-wasm myers', () => {
  it('handles identical sequences', () => {
    const edits = myersDiffWasm(['a', 'b', 'c'], ['a', 'b', 'c'])
    expect(simplify(edits)).toEqual([
      'equal:a:0:0',
      'equal:b:1:1',
      'equal:c:2:2',
    ])
  })

  it('handles single insertion', () => {
    const edits = myersDiffWasm(['a', 'c'], ['a', 'b', 'c'])
    expect(simplify(edits)).toEqual([
      'equal:a:0:0',
      'insert:b::1',
      'equal:c:1:2',
    ])
  })

  it('handles single deletion', () => {
    const edits = myersDiffWasm(['a', 'b', 'c'], ['a', 'c'])
    expect(simplify(edits)).toEqual([
      'equal:a:0:0',
      'delete:b:1:',
      'equal:c:2:1',
    ])
  })

  it('handles completely different sequences', () => {
    const edits = myersDiffWasm(['a', 'b'], ['c', 'd'])
    expect(edits.filter((e) => e.op === 'delete')).toHaveLength(2)
    expect(edits.filter((e) => e.op === 'insert')).toHaveLength(2)
  })

  it('handles empty old', () => {
    const edits = myersDiffWasm([], ['a', 'b'])
    expect(simplify(edits)).toEqual([
      'insert:a::0',
      'insert:b::1',
    ])
  })

  it('handles empty new', () => {
    const edits = myersDiffWasm(['a', 'b'], [])
    expect(simplify(edits)).toEqual([
      'delete:a:0:',
      'delete:b:1:',
    ])
  })

  it('handles both empty', () => {
    expect(myersDiffWasm([], [])).toEqual([])
  })

  it('preserves value references', () => {
    const old = ['hello', 'world']
    const nw = ['hello', 'there', 'world']
    const edits = myersDiffWasm(old, nw)
    const equalEdits = edits.filter((e) => e.op === 'equal')
    expect(equalEdits[0]!.value).toBe('hello')
    expect(equalEdits[1]!.value).toBe('world')
    const insertEdits = edits.filter((e) => e.op === 'insert')
    expect(insertEdits[0]!.value).toBe('there')
  })

  it('matches JS output for a longer sequence', () => {
    const old = 'the quick brown fox jumps over the lazy dog'.split(' ')
    const nw = 'the slow brown cat jumps over a lazy dog'.split(' ')
    const edits = myersDiffWasm(old, nw)

    const equalValues = edits.filter((e) => e.op === 'equal').map((e) => e.value)
    expect(equalValues).toContain('the')
    expect(equalValues).toContain('brown')
    expect(equalValues).toContain('jumps')
    expect(equalValues).toContain('over')
    expect(equalValues).toContain('lazy')
    expect(equalValues).toContain('dog')

    const deleteValues = edits.filter((e) => e.op === 'delete').map((e) => e.value)
    expect(deleteValues).toContain('quick')
    expect(deleteValues).toContain('fox')

    const insertValues = edits.filter((e) => e.op === 'insert').map((e) => e.value)
    expect(insertValues).toContain('slow')
    expect(insertValues).toContain('cat')
  })
})
