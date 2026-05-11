export interface SequenceMatch {
  oldIndex: number
  newIndex: number
}

export function longestCommonSubsequence<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
): SequenceMatch[] {
  const rows = oldValues.length + 1
  const cols = newValues.length + 1
  const matrix = Array.from({ length: rows }, () => Array.from<number>({ length: cols }).fill(0))

  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      if (oldValues[row - 1] === newValues[col - 1]) {
        const prev = matrix[row - 1]?.[col - 1] ?? 0
        const currentRow = matrix[row]
        if (!currentRow) continue
        currentRow[col] = prev + 1
      } else {
        const top = matrix[row - 1]?.[col] ?? 0
        const left = matrix[row]?.[col - 1] ?? 0
        const currentRow = matrix[row]
        if (!currentRow) continue
        currentRow[col] = Math.max(top, left)
      }
    }
  }

  const matches: SequenceMatch[] = []
  let row = oldValues.length
  let col = newValues.length
  while (row > 0 && col > 0) {
    if (oldValues[row - 1] === newValues[col - 1]) {
      matches.push({ oldIndex: row - 1, newIndex: col - 1 })
      row--
      col--
      continue
    }

    const top = matrix[row - 1]?.[col] ?? 0
    const left = matrix[row]?.[col - 1] ?? 0
    if (top >= left) {
      row--
    } else {
      col--
    }
  }

  return matches.reverse()
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
