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

export function alignSequence<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
  options: Pick<DiffOptions, 'shortSequenceThreshold' | 'heckelUniqueRatio'>,
): SequenceEdit<T>[] {
  if (Math.max(oldValues.length, newValues.length) < options.shortSequenceThreshold) {
    return myersAlign(oldValues, newValues)
  }

  const uniqueRatio = computeUniqueRatio(oldValues, newValues)
  if (uniqueRatio > options.heckelUniqueRatio) {
    return heckelAlign(oldValues, newValues)
  }
  return patienceAlign(oldValues, newValues)
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

export function longestCommonSubsequence<T>(oldValues: readonly T[], newValues: readonly T[]): SequenceMatch[] {
  return toMatches(myersAlign(oldValues, newValues))
}

function myersAlign<T>(oldValues: readonly T[], newValues: readonly T[]): SequenceEdit<T>[] {
  const rows = oldValues.length + 1
  const cols = newValues.length + 1
  const matrix = Array.from({ length: rows }, () => Array.from<number>({ length: cols }).fill(0))

  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      if (oldValues[row - 1] === newValues[col - 1]) {
        matrix[row]![col] = (matrix[row - 1]?.[col - 1] ?? 0) + 1
      } else {
        matrix[row]![col] = Math.max(matrix[row - 1]?.[col] ?? 0, matrix[row]?.[col - 1] ?? 0)
      }
    }
  }

  const edits: SequenceEdit<T>[] = []
  let row = oldValues.length
  let col = newValues.length
  while (row > 0 || col > 0) {
    if (row > 0 && col > 0 && oldValues[row - 1] === newValues[col - 1]) {
      edits.push({ op: 'equal', oldIndex: row - 1, newIndex: col - 1, value: oldValues[row - 1] })
      row--
      col--
      continue
    }

    const top = row > 0 ? (matrix[row - 1]?.[col] ?? 0) : Number.NEGATIVE_INFINITY
    const left = col > 0 ? (matrix[row]?.[col - 1] ?? 0) : Number.NEGATIVE_INFINITY
    if (row > 0 && (col === 0 || top >= left)) {
      edits.push({ op: 'delete', oldIndex: row - 1, value: oldValues[row - 1] })
      row--
    } else {
      edits.push({ op: 'insert', newIndex: col - 1, value: newValues[col - 1] })
      col--
    }
  }

  return edits.reverse()
}

function patienceAlign<T>(oldValues: readonly T[], newValues: readonly T[]): SequenceEdit<T>[] {
  const anchors = uniqueCommonAnchors(oldValues, newValues)
  if (anchors.length === 0) return myersAlign(oldValues, newValues)
  return stitchFromAnchors(oldValues, newValues, anchors)
}

function heckelAlign<T>(oldValues: readonly T[], newValues: readonly T[]): SequenceEdit<T>[] {
  const occurrences = buildOccurrenceMaps(oldValues, newValues)
  const rawAnchors: SequenceMatch[] = []
  for (const [token, oldPositions] of occurrences.old.entries()) {
    const newPositions = occurrences.new.get(token)
    if (!newPositions || oldPositions.length !== 1 || newPositions.length !== 1) continue
    rawAnchors.push({ oldIndex: oldPositions[0]!, newIndex: newPositions[0]! })
  }
  if (rawAnchors.length === 0) return myersAlign(oldValues, newValues)

  rawAnchors.sort((left, right) => left.oldIndex - right.oldIndex)
  const lis = longestIncreasingSubsequence(rawAnchors.map((anchor) => anchor.newIndex))
  const anchors = lis.map((index) => rawAnchors[index]!)
  return stitchFromAnchors(oldValues, newValues, anchors)
}

function stitchFromAnchors<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
  anchors: SequenceMatch[],
): SequenceEdit<T>[] {
  const edits: SequenceEdit<T>[] = []
  let oldStart = 0
  let newStart = 0

  for (const anchor of anchors) {
    edits.push(
      ...myersAlign(oldValues.slice(oldStart, anchor.oldIndex), newValues.slice(newStart, anchor.newIndex)).map(
        (edit) => rebaseEdit(edit, oldStart, newStart),
      ),
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
    ...myersAlign(oldValues.slice(oldStart), newValues.slice(newStart)).map((edit) =>
      rebaseEdit(edit, oldStart, newStart),
    ),
  )
  return edits
}

function uniqueCommonAnchors<T>(oldValues: readonly T[], newValues: readonly T[]): SequenceMatch[] {
  const occurrences = buildOccurrenceMaps(oldValues, newValues)
  const rawAnchors: SequenceMatch[] = []
  for (const [token, oldPositions] of occurrences.old.entries()) {
    const newPositions = occurrences.new.get(token)
    if (!newPositions || oldPositions.length !== 1 || newPositions.length !== 1) continue
    rawAnchors.push({ oldIndex: oldPositions[0]!, newIndex: newPositions[0]! })
  }
  if (rawAnchors.length === 0) return []

  rawAnchors.sort((left, right) => left.oldIndex - right.oldIndex)
  const lis = longestIncreasingSubsequence(rawAnchors.map((anchor) => anchor.newIndex))
  return lis.map((index) => rawAnchors[index]!)
}

function buildOccurrenceMaps<T>(oldValues: readonly T[], newValues: readonly T[]) {
  const oldMap = new Map<T, number[]>()
  const newMap = new Map<T, number[]>()

  oldValues.forEach((value, index) => push(oldMap, value, index))
  newValues.forEach((value, index) => push(newMap, value, index))

  return { old: oldMap, new: newMap }
}

function computeUniqueRatio<T>(oldValues: readonly T[], newValues: readonly T[]): number {
  const occurrences = buildOccurrenceMaps(oldValues, newValues)
  const unique = new Set<T>()
  for (const [token, positions] of occurrences.old.entries()) {
    if (positions.length === 1 && (occurrences.new.get(token)?.length ?? 0) === 1) unique.add(token)
  }
  const total = Math.max(oldValues.length, newValues.length, 1)
  return unique.size / total
}

function toMatches<T>(edits: SequenceEdit<T>[]): SequenceMatch[] {
  return edits
    .filter((edit): edit is SequenceEdit<T> & { op: 'equal'; oldIndex: number; newIndex: number } => edit.op === 'equal' && edit.oldIndex !== undefined && edit.newIndex !== undefined)
    .map((edit) => ({ oldIndex: edit.oldIndex, newIndex: edit.newIndex }))
}

function rebaseEdit<T>(edit: SequenceEdit<T>, oldOffset: number, newOffset: number): SequenceEdit<T> {
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
