import { describe, expect, it } from 'vitest'
import {
  alignSequence,
  longestCommonSubsequence,
  longestIncreasingSubsequence,
  type SequenceEdit,
} from '../sequence'

const DEFAULT_OPTIONS = {
  shortSequenceThreshold: 2,
  maxQuadraticSequenceCost: 4,
  heckelUniqueRatio: 0.5,
} as const

function simplify<T>(edits: SequenceEdit<T>[]): string[] {
  return edits.map((edit) => {
    const oldIndex = edit.oldIndex === undefined ? '' : String(edit.oldIndex)
    const newIndex = edit.newIndex === undefined ? '' : String(edit.newIndex)
    return `${edit.op}:${String(edit.value ?? '')}:${oldIndex}:${newIndex}`
  })
}

describe('sequence alignment', () => {
  it('honors the explicit Myers strategy', () => {
    const edits = alignSequence(['a', 'b'], ['a', 'c', 'b'], DEFAULT_OPTIONS, 'myers')

    expect(simplify(edits)).toEqual(['equal:a:0:0', 'insert:c::1', 'equal:b:1:2'])
  })

  it('honors the explicit Heckel strategy and stitches around unique anchors', () => {
    const edits = alignSequence(
      ['x', 'a', 'b', 'c', 'y'],
      ['a', 'z', 'c'],
      DEFAULT_OPTIONS,
      'heckel',
    )

    expect(simplify(edits)).toEqual([
      'delete:x:0:',
      'equal:a:1:0',
      'delete:b:2:',
      'insert:z::1',
      'equal:c:3:2',
      'delete:y:4:',
    ])
  })

  it('falls back from Heckel to Myers when no unique anchors exist', () => {
    const heckel = alignSequence(['a', 'a'], ['a', 'a'], DEFAULT_OPTIONS, 'heckel')
    const myers = alignSequence(['a', 'a'], ['a', 'a'], DEFAULT_OPTIONS, 'myers')

    expect(heckel).toEqual(myers)
  })

  it('honors the explicit Histogram strategy', () => {
    const edits = alignSequence(['a', 'b', 'c'], ['b', 'c', 'd'], DEFAULT_OPTIONS, 'histogram')

    expect(simplify(edits)).toEqual(['delete:a:0:', 'equal:b:1:0', 'equal:c:2:1', 'insert:d::2'])
  })

  it('prefers Myers for short sequences in auto mode', () => {
    const auto = alignSequence(['a', 'b', 'c'], ['a', 'x', 'c'], {
      ...DEFAULT_OPTIONS,
      shortSequenceThreshold: 3,
      maxQuadraticSequenceCost: 0,
    })
    const myers = alignSequence(['a', 'b', 'c'], ['a', 'x', 'c'], DEFAULT_OPTIONS, 'myers')

    expect(auto).toEqual(myers)
  })

  it('prefers Myers for larger sequences when the quadratic cost budget allows it', () => {
    const oldValues = ['a', 'b', 'c', 'd']
    const newValues = ['a', 'x', 'c', 'd']
    const auto = alignSequence(oldValues, newValues, {
      ...DEFAULT_OPTIONS,
      shortSequenceThreshold: 0,
      maxQuadraticSequenceCost: 16,
    })
    const myers = alignSequence(oldValues, newValues, DEFAULT_OPTIONS, 'myers')

    expect(auto).toEqual(myers)
  })

  it('switches to Heckel in auto mode when the unique ratio is high', () => {
    const oldValues = ['a', 'b', 'c', 'd', 'e', 'f']
    const newValues = ['x', 'b', 'y', 'd', 'z', 'f']
    const auto = alignSequence(oldValues, newValues, {
      ...DEFAULT_OPTIONS,
      shortSequenceThreshold: 0,
      maxQuadraticSequenceCost: 1,
      heckelUniqueRatio: 0.4,
    })
    const heckel = alignSequence(oldValues, newValues, DEFAULT_OPTIONS, 'heckel')

    expect(auto).toEqual(heckel)
  })

  it('switches to Histogram in auto mode when the unique ratio stays low', () => {
    const oldValues = ['a', 'b', 'a', 'b', 'c', 'd']
    const newValues = ['b', 'a', 'b', 'a', 'd', 'c']
    const auto = alignSequence(oldValues, newValues, {
      ...DEFAULT_OPTIONS,
      shortSequenceThreshold: 0,
      maxQuadraticSequenceCost: 1,
      heckelUniqueRatio: 0.9,
    })
    const histogram = alignSequence(oldValues, newValues, DEFAULT_OPTIONS, 'histogram')

    expect(auto).toEqual(histogram)
  })

  it('returns the longest increasing subsequence indexes for mixed inputs', () => {
    expect(longestIncreasingSubsequence([])).toEqual([])
    expect(longestIncreasingSubsequence([1, 2, 3])).toEqual([0, 1, 2])
    expect(longestIncreasingSubsequence([3, 2, 1])).toEqual([2])
    expect(longestIncreasingSubsequence([3, 4, 1, 2, 8, 5, 6])).toEqual([2, 3, 5, 6])
  })

  it('builds longest common subsequence matches from Myers equal edits', () => {
    const matches = longestCommonSubsequence(['a', 'b', 'c', 'd'], ['b', 'c', 'e'])

    expect(matches).toEqual([
      { oldIndex: 1, newIndex: 0 },
      { oldIndex: 2, newIndex: 1 },
    ])
  })
})
