import { myersDiffWasm } from './diff-wasm'
import type { DiffOptions } from './types'

export interface SequenceMatch {
  oldIndex: number
  newIndex: number
}

export interface SequenceEdit<T> {
  op: 'equal' | 'insert' | 'delete'
  oldIndex?: number
  newIndex?: number
  value?: T
}

export type SequenceStrategy = 'auto' | 'myers' | 'heckel' | 'histogram'

export function alignSequence<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
  options: Pick<
    DiffOptions,
    'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'
  >,
  strategy: SequenceStrategy = 'auto',
): SequenceEdit<T>[] {
  if (strategy === 'myers') return myersShortestEditScript(oldValues, newValues)
  if (strategy === 'heckel') return heckelAlign(oldValues, newValues)
  if (strategy === 'histogram') return histogramAlign(oldValues, newValues)

  if (Math.max(oldValues.length, newValues.length) <= options.shortSequenceThreshold) {
    return myersShortestEditScript(oldValues, newValues)
  }

  if (oldValues.length * newValues.length <= options.maxQuadraticSequenceCost) {
    return myersShortestEditScript(oldValues, newValues)
  }

  const uniqueRatio = computeUniqueRatio(oldValues, newValues)
  if (uniqueRatio > options.heckelUniqueRatio) {
    return heckelAlign(oldValues, newValues)
  }
  return histogramAlign(oldValues, newValues)
}

export function longestIncreasingSubsequence(values: readonly number[]): number[] {
  if (values.length === 0) return []

  const tails: number[] = []
  const previous = Array.from<number>({ length: values.length }).fill(-1)

  for (let index = 0; index < values.length; index++) {
    const value = values[index]!
    let left = 0
    let right = tails.length
    while (left < right) {
      const middle = Math.floor((left + right) / 2)
      const tailIndex = tails[middle]
      if (tailIndex === undefined) break
      if ((values[tailIndex] ?? 0) < value) left = middle + 1
      else right = middle
    }

    if (left > 0) previous[index] = tails[left - 1] ?? -1
    tails[left] = index
  }

  const result: number[] = []
  let current = tails[tails.length - 1] ?? -1
  while (current >= 0) {
    result.push(current)
    current = previous[current] ?? -1
  }
  return result.reverse()
}

export function longestCommonSubsequence<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
): SequenceMatch[] {
  return toMatches(myersShortestEditScript(oldValues, newValues))
}

const WASM_MIN_TOTAL_LENGTH = 30
let wasmFailed = false

function myersShortestEditScript<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
): SequenceEdit<T>[] {
  if (!wasmFailed && oldValues.length + newValues.length >= WASM_MIN_TOTAL_LENGTH) {
    try {
      return myersDiffWasm(oldValues, newValues)
    } catch {
      wasmFailed = true
    }
  }
  return myersShortestEditScriptJs(oldValues, newValues)
}

function myersShortestEditScriptJs<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
): SequenceEdit<T>[] {
  const maxDistance = oldValues.length + newValues.length
  const offset = maxDistance
  const vectorLength = maxDistance * 2 + 1
  const paths = Array.from<number>({ length: vectorLength }).fill(0)
  const trace: number[][] = []

  for (let distance = 0; distance <= maxDistance; distance++) {
    trace.push([...paths])
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const vectorIndex = diagonal + offset
      let x: number

      if (
        diagonal === -distance ||
        (diagonal !== distance &&
          (paths[vectorIndex - 1] ?? Number.NEGATIVE_INFINITY) <
            (paths[vectorIndex + 1] ?? Number.NEGATIVE_INFINITY))
      ) {
        x = paths[vectorIndex + 1] ?? 0
      } else {
        x = (paths[vectorIndex - 1] ?? 0) + 1
      }

      let y = x - diagonal
      while (x < oldValues.length && y < newValues.length && oldValues[x] === newValues[y]) {
        x++
        y++
      }

      paths[vectorIndex] = x
      if (x >= oldValues.length && y >= newValues.length) {
        return backtrackMyers(oldValues, newValues, trace, distance, offset)
      }
    }
  }

  return []
}

function backtrackMyers<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
  trace: number[][],
  distance: number,
  offset: number,
): SequenceEdit<T>[] {
  const edits: SequenceEdit<T>[] = []
  let x = oldValues.length
  let y = newValues.length

  for (let currentDistance = distance; currentDistance > 0; currentDistance--) {
    const diagonal = x - y
    const snapshot = trace[currentDistance] ?? []
    const chooseInsert =
      diagonal === -currentDistance ||
      (diagonal !== currentDistance &&
        (snapshot[diagonal - 1 + offset] ?? Number.NEGATIVE_INFINITY) <
          (snapshot[diagonal + 1 + offset] ?? Number.NEGATIVE_INFINITY))

    const previousDiagonal = chooseInsert ? diagonal + 1 : diagonal - 1
    const previousX = snapshot[previousDiagonal + offset] ?? 0
    const previousY = previousX - previousDiagonal

    while (x > previousX && y > previousY) {
      edits.push({
        op: 'equal',
        oldIndex: x - 1,
        newIndex: y - 1,
        value: oldValues[x - 1],
      })
      x--
      y--
    }

    if (chooseInsert) {
      edits.push({ op: 'insert', newIndex: previousY, value: newValues[previousY] })
      y = previousY
      x = previousX
    } else {
      edits.push({ op: 'delete', oldIndex: previousX, value: oldValues[previousX] })
      x = previousX
      y = previousY
    }
  }

  while (x > 0 && y > 0) {
    edits.push({
      op: 'equal',
      oldIndex: x - 1,
      newIndex: y - 1,
      value: oldValues[x - 1],
    })
    x--
    y--
  }
  while (x > 0) {
    edits.push({ op: 'delete', oldIndex: x - 1, value: oldValues[x - 1] })
    x--
  }
  while (y > 0) {
    edits.push({ op: 'insert', newIndex: y - 1, value: newValues[y - 1] })
    y--
  }

  return edits.reverse()
}

function heckelAlign<T>(oldValues: readonly T[], newValues: readonly T[]): SequenceEdit<T>[] {
  const occurrences = buildOccurrenceMaps(oldValues, newValues)
  const anchors = [...occurrences.old.entries()]
    .flatMap(([token, oldPositions]) => {
      const newPositions = occurrences.new.get(token)
      if (!newPositions || oldPositions.length !== 1 || newPositions.length !== 1) return []
      return [{ oldIndex: oldPositions[0]!, newIndex: newPositions[0]! }]
    })
    .sort((left, right) => left.oldIndex - right.oldIndex)

  if (anchors.length === 0) return myersShortestEditScript(oldValues, newValues)

  const lis = longestIncreasingSubsequence(anchors.map((anchor) => anchor.newIndex))
  return stitchFromAnchors(
    oldValues,
    newValues,
    lis.map((index) => anchors[index]!),
    'myers',
  )
}

function histogramAlign<T>(oldValues: readonly T[], newValues: readonly T[]): SequenceEdit<T>[] {
  const pivot = bestHistogramAnchor(oldValues, newValues)
  if (!pivot) return myersShortestEditScript(oldValues, newValues)

  return [
    ...stitchSegment(oldValues, newValues, 0, pivot.oldIndex, 0, pivot.newIndex),
    {
      op: 'equal',
      oldIndex: pivot.oldIndex,
      newIndex: pivot.newIndex,
      value: oldValues[pivot.oldIndex],
    },
    ...stitchSegment(
      oldValues,
      newValues,
      pivot.oldIndex + 1,
      oldValues.length,
      pivot.newIndex + 1,
      newValues.length,
    ),
  ]
}

function stitchSegment<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
  oldStart: number,
  oldEnd: number,
  newStart: number,
  newEnd: number,
): SequenceEdit<T>[] {
  if (oldStart >= oldEnd && newStart >= newEnd) return []
  const oldSlice = oldValues.slice(oldStart, oldEnd)
  const newSlice = newValues.slice(newStart, newEnd)
  const pivot = bestHistogramAnchor(oldSlice, newSlice)
  if (!pivot) {
    return myersShortestEditScript(oldSlice, newSlice).map((edit) =>
      rebaseEdit(edit, oldStart, newStart),
    )
  }

  const rebasedPivot = {
    oldIndex: pivot.oldIndex + oldStart,
    newIndex: pivot.newIndex + newStart,
  }

  return [
    ...stitchSegment(
      oldValues,
      newValues,
      oldStart,
      rebasedPivot.oldIndex,
      newStart,
      rebasedPivot.newIndex,
    ),
    {
      op: 'equal',
      oldIndex: rebasedPivot.oldIndex,
      newIndex: rebasedPivot.newIndex,
      value: oldValues[rebasedPivot.oldIndex],
    },
    ...stitchSegment(
      oldValues,
      newValues,
      rebasedPivot.oldIndex + 1,
      oldEnd,
      rebasedPivot.newIndex + 1,
      newEnd,
    ),
  ]
}

function bestHistogramAnchor<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
): SequenceMatch | undefined {
  const oldCounts = countOccurrences(oldValues)
  const newCounts = countOccurrences(newValues)
  let best: SequenceMatch | undefined
  let bestWeight = Number.POSITIVE_INFINITY

  for (let oldIndex = 0; oldIndex < oldValues.length; oldIndex++) {
    const token = oldValues[oldIndex]!
    const oldCount = oldCounts.get(token) ?? Number.POSITIVE_INFINITY
    const newCount = newCounts.get(token) ?? Number.POSITIVE_INFINITY
    if (oldCount === Number.POSITIVE_INFINITY || newCount === Number.POSITIVE_INFINITY) continue
    const weight = oldCount + newCount
    if (weight > bestWeight) continue

    for (let newIndex = 0; newIndex < newValues.length; newIndex++) {
      if (newValues[newIndex] !== token) continue
      if (weight < bestWeight) {
        best = { oldIndex, newIndex }
        bestWeight = weight
      }
      break
    }
  }

  return best
}

function stitchFromAnchors<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
  anchors: SequenceMatch[],
  fallback: SequenceStrategy,
): SequenceEdit<T>[] {
  const edits: SequenceEdit<T>[] = []
  let oldStart = 0
  let newStart = 0

  for (const anchor of anchors) {
    edits.push(
      ...alignSequence(
        oldValues.slice(oldStart, anchor.oldIndex),
        newValues.slice(newStart, anchor.newIndex),
        {
          shortSequenceThreshold: Number.MAX_SAFE_INTEGER,
          maxQuadraticSequenceCost: Number.MAX_SAFE_INTEGER,
          heckelUniqueRatio: 1,
        },
        fallback,
      ).map((edit) => rebaseEdit(edit, oldStart, newStart)),
    )
    edits.push({
      op: 'equal',
      oldIndex: anchor.oldIndex,
      newIndex: anchor.newIndex,
      value: oldValues[anchor.oldIndex],
    })
    oldStart = anchor.oldIndex + 1
    newStart = anchor.newIndex + 1
  }

  edits.push(
    ...alignSequence(
      oldValues.slice(oldStart),
      newValues.slice(newStart),
      {
        shortSequenceThreshold: Number.MAX_SAFE_INTEGER,
        maxQuadraticSequenceCost: Number.MAX_SAFE_INTEGER,
        heckelUniqueRatio: 1,
      },
      fallback,
    ).map((edit) => rebaseEdit(edit, oldStart, newStart)),
  )
  return edits
}

function buildOccurrenceMaps<T>(oldValues: readonly T[], newValues: readonly T[]) {
  const oldMap = new Map<T, number[]>()
  const newMap = new Map<T, number[]>()
  oldValues.forEach((value, index) => push(oldMap, value, index))
  newValues.forEach((value, index) => push(newMap, value, index))
  return { old: oldMap, new: newMap }
}

function countOccurrences<T>(values: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return counts
}

function computeUniqueRatio<T>(oldValues: readonly T[], newValues: readonly T[]): number {
  const occurrences = buildOccurrenceMaps(oldValues, newValues)
  const unique = new Set<T>()
  for (const [token, positions] of occurrences.old.entries()) {
    if (positions.length === 1 && (occurrences.new.get(token)?.length ?? 0) === 1) unique.add(token)
  }
  return unique.size / Math.max(oldValues.length, newValues.length, 1)
}

function toMatches<T>(edits: SequenceEdit<T>[]): SequenceMatch[] {
  return edits
    .filter(
      (
        edit,
      ): edit is SequenceEdit<T> & {
        op: 'equal'
        oldIndex: number
        newIndex: number
      } => edit.op === 'equal' && edit.oldIndex !== undefined && edit.newIndex !== undefined,
    )
    .map((edit) => ({ oldIndex: edit.oldIndex, newIndex: edit.newIndex }))
}

function rebaseEdit<T>(
  edit: SequenceEdit<T>,
  oldOffset: number,
  newOffset: number,
): SequenceEdit<T> {
  return {
    ...edit,
    oldIndex: edit.oldIndex === undefined ? undefined : edit.oldIndex + oldOffset,
    newIndex: edit.newIndex === undefined ? undefined : edit.newIndex + newOffset,
  }
}

function push<K>(map: Map<K, number[]>, key: K, value: number): void {
  const existing = map.get(key)
  if (existing) {
    existing.push(value)
    return
  }
  map.set(key, [value])
}
