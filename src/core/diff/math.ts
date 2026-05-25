export function jaccardSimilarity(left: readonly string[], right: readonly string[]): number {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  if (leftSet.size === 0 && rightSet.size === 0) return 1

  let intersection = 0
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection++
  }

  const union = new Set([...leftSet, ...rightSet]).size
  return union === 0 ? 1 : intersection / union
}

export function multisetJaccardSimilarity(
  left: readonly string[],
  right: readonly string[],
): number {
  if (left.length === 0 && right.length === 0) return 1

  const leftCounts = countTokens(left)
  const rightCounts = countTokens(right)
  const keys = new Set([...leftCounts.keys(), ...rightCounts.keys()])
  let intersection = 0
  let union = 0

  for (const key of keys) {
    const leftCount = leftCounts.get(key) ?? 0
    const rightCount = rightCounts.get(key) ?? 0
    intersection += Math.min(leftCount, rightCount)
    union += Math.max(leftCount, rightCount)
  }

  return union === 0 ? 1 : intersection / union
}

export function sequenceSimilarity(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 && right.length === 0) return 1
  const distance = levenshtein(left, right)
  return 1 - distance / Math.max(left.length, right.length, 1)
}

function levenshtein(left: readonly string[], right: readonly string[]): number {
  const m = left.length
  const n = right.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]!
}

export function characterNgramSimilarity(oldText: string, newText: string, n = 3): number {
  const oldNgrams = generateCharacterNgrams(oldText, n)
  const newNgrams = generateCharacterNgrams(newText, n)
  return multisetJaccardSimilarity(oldNgrams, newNgrams)
}

function generateCharacterNgrams(text: string, n: number): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()
  if (normalized.length < n) return normalized ? [normalized] : []
  const chars = [...normalized]
  const ngrams: string[] = []
  for (let i = 0; i <= chars.length - n; i++) {
    ngrams.push(chars.slice(i, i + n).join(''))
  }
  return ngrams
}

function countTokens(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return counts
}
