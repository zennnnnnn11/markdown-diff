import type { DiffResult, ProjectionLine, Tone } from './types'
import type { MergedRow } from './types'
import { buildOldProjectionLines, buildProjectionLines } from './projection'

type RawRow = { oldLine: ProjectionLine | null; newLine: ProjectionLine | null }

interface ProjectionBlock {
  side: 'old' | 'new'
  lines: ProjectionLine[]
  anchorKey?: string
  mode: 'pair' | 'plain' | 'old-only' | 'new-only'
  groupKey: string
}

export function buildMergedRows(
  oldMarkdown: string,
  newMarkdown: string,
  result: DiffResult,
): MergedRow[] {
  const oldLines = buildOldProjectionLines(oldMarkdown, result)
  const newLines = buildProjectionLines(newMarkdown, result)
  const oldBlocks = buildProjectionBlocks(oldLines, 'old')
  const newBlocks = buildProjectionBlocks(newLines, 'new')
  const consumedOld = new Set<number>()
  const mergedBlocks: Array<{ oldBlock?: ProjectionBlock; newBlock?: ProjectionBlock }> = []

  for (const newBlock of newBlocks) {
    if (newBlock.mode === 'pair' && newBlock.anchorKey) {
      const oldIndex = oldBlocks.findIndex(
        (candidate, index) =>
          !consumedOld.has(index) &&
          candidate.mode === 'pair' &&
          candidate.anchorKey === newBlock.anchorKey,
      )
      if (oldIndex >= 0) {
        consumedOld.add(oldIndex)
        mergedBlocks.push({ oldBlock: oldBlocks[oldIndex], newBlock })
        continue
      }
    } else if (newBlock.mode === 'plain') {
      let bestIndex = -1
      let bestScore = -1
      for (let i = 0; i < oldBlocks.length; i++) {
        if (consumedOld.has(i) || oldBlocks[i]!.mode !== 'plain') continue
        const score = plainBlockSimilarity(oldBlocks[i]!, newBlock)
        if (score > bestScore) { bestScore = score; bestIndex = i }
      }
      if (bestIndex >= 0) {
        consumedOld.add(bestIndex)
        mergedBlocks.push({ oldBlock: oldBlocks[bestIndex], newBlock })
        continue
      }
    }
    mergedBlocks.push({ newBlock })
  }

  for (const [oldIndex, oldBlock] of oldBlocks.entries()) {
    if (consumedOld.has(oldIndex)) continue
    const insertionIndex = findInsertionIndexForOldBlock(oldBlocks, oldIndex, mergedBlocks)
    mergedBlocks.splice(insertionIndex, 0, { oldBlock })
  }

  const rawRows = mergedBlocks.flatMap(({ oldBlock, newBlock }) => alignBlockRows(oldBlock, newBlock))
  resolveMovePeerRowIndices(rawRows)
  return rawRows.map((row): MergedRow => ({
    key: `${row.oldLine?.key ?? '_'}|${row.newLine?.key ?? '_'}`,
    oldLine: row.oldLine,
    newLine: row.newLine,
  }))
}

export function tokenizeForSimilarity(text: string): string[] {
  return text.match(/[一-鿿㐀-䶿豈-﫿]|[^\s一-鿿㐀-䶿豈-﫿]+/g) ?? []
}

function resolveMovePeerRowIndices(rows: RawRow[]): void {
  const byAlignmentKey = new Map<string, { oldIndices: number[]; newIndices: number[] }>()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    for (const [line, side] of [[row.oldLine, 'old'], [row.newLine, 'new']] as const) {
      if (!line?.alignmentKey || line.baseTone !== 'move') continue
      let entry = byAlignmentKey.get(line.alignmentKey)
      if (!entry) { entry = { oldIndices: [], newIndices: [] }; byAlignmentKey.set(line.alignmentKey, entry) }
      if (side === 'old') entry.oldIndices.push(i)
      else entry.newIndices.push(i)
    }
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    if (row.oldLine?.baseTone === 'move' && row.oldLine.alignmentKey) {
      const entry = byAlignmentKey.get(row.oldLine.alignmentKey)
      if (entry?.newIndices.length) row.oldLine.movePeerRowIndex = entry.newIndices[0]
    }
    if (row.newLine?.baseTone === 'move' && row.newLine.alignmentKey) {
      const entry = byAlignmentKey.get(row.newLine.alignmentKey)
      if (entry?.oldIndices.length) row.newLine.movePeerRowIndex = entry.oldIndices[0]
    }
  }
}

function buildProjectionBlocks(
  lines: ProjectionLine[],
  side: 'old' | 'new',
): ProjectionBlock[] {
  const blocks: ProjectionBlock[] = []

  for (const line of lines) {
    const mode = blockMode(line, side)
    const anchorKey = blockAnchorKey(line)
    const groupKey = anchorKey
      ? `${mode}:anchor:${anchorKey}:${line.baseTone}:${line.pairKind ?? 'none'}`
      : `${mode}:plain:${line.baseTone}:${line.warnings.join('|')}:${line.hasDescendantChange ? 'desc' : 'self'}`
    const previous = blocks[blocks.length - 1]

    if (previous && previous.groupKey === groupKey) {
      previous.lines.push(line)
      continue
    }

    blocks.push({
      side,
      lines: [line],
      anchorKey,
      mode,
      groupKey,
    })
  }

  return blocks
}

function blockAnchorKey(line: ProjectionLine): string | undefined {
  if (!line.alignmentKey || line.alignmentKey === 'match:root:root') return undefined
  if (line.baseTone === 'move' || line.baseTone === 'reorder') return undefined
  if (line.baseTone === 'plain' && !line.pairKind && !line.hasDescendantChange && line.warnings.length === 0) {
    return undefined
  }
  return line.alignmentKey
}

function blockMode(line: ProjectionLine, side: 'old' | 'new'): ProjectionBlock['mode'] {
  if (side === 'old' && (line.baseTone === 'delete' || line.baseTone === 'move' || line.baseTone === 'reorder')) {
    return 'old-only'
  }
  if (side === 'new' && (line.baseTone === 'insert' || line.baseTone === 'move' || line.baseTone === 'reorder')) {
    return 'new-only'
  }
  if (blockAnchorKey(line)) return 'pair'
  return 'plain'
}

function findInsertionIndexForOldBlock(
  oldBlocks: ProjectionBlock[],
  oldIndex: number,
  mergedBlocks: Array<{ oldBlock?: ProjectionBlock; newBlock?: ProjectionBlock }>,
): number {
  for (let index = oldIndex + 1; index < oldBlocks.length; index++) {
    const nextAnchorKey = oldBlocks[index]?.anchorKey
    if (!nextAnchorKey) continue
    const mergedIndex = mergedBlocks.findIndex((entry) => entry.oldBlock?.anchorKey === nextAnchorKey)
    if (mergedIndex >= 0) return mergedIndex
  }
  return mergedBlocks.length
}

function alignBlockRows(
  oldBlock?: ProjectionBlock,
  newBlock?: ProjectionBlock,
): RawRow[] {
  if (!oldBlock) return newBlock?.lines.map((line): RawRow => ({ oldLine: null, newLine: line })) ?? []
  if (!newBlock) return oldBlock.lines.map((line): RawRow => ({ oldLine: line, newLine: null }))

  const oldLines = oldBlock.lines
  const newLines = newBlock.lines
  if (oldLines.length === newLines.length) {
    return oldLines.map((oldLine, index): RawRow => ({ oldLine, newLine: newLines[index] ?? null }))
  }

  const matches = computeLineMatches(oldLines, newLines)
  if (matches.length === 0) {
    return zipWithResiduals(oldLines, newLines)
  }

  const merged: RawRow[] = []
  let oldIdx = 0
  let newIdx = 0

  for (const [matchedOldIndex, matchedNewIndex] of matches) {
    while (oldIdx < matchedOldIndex && newIdx < matchedNewIndex) {
      merged.push({ oldLine: oldLines[oldIdx] ?? null, newLine: newLines[newIdx] ?? null })
      oldIdx += 1
      newIdx += 1
    }
    while (oldIdx < matchedOldIndex) {
      merged.push({ oldLine: oldLines[oldIdx] ?? null, newLine: null })
      oldIdx += 1
    }
    while (newIdx < matchedNewIndex) {
      merged.push({ oldLine: null, newLine: newLines[newIdx] ?? null })
      newIdx += 1
    }
    merged.push({ oldLine: oldLines[matchedOldIndex] ?? null, newLine: newLines[matchedNewIndex] ?? null })
    oldIdx = matchedOldIndex + 1
    newIdx = matchedNewIndex + 1
  }

  while (oldIdx < oldLines.length && newIdx < newLines.length) {
    merged.push({ oldLine: oldLines[oldIdx] ?? null, newLine: newLines[newIdx] ?? null })
    oldIdx += 1
    newIdx += 1
  }
  while (oldIdx < oldLines.length) {
    merged.push({ oldLine: oldLines[oldIdx] ?? null, newLine: null })
    oldIdx += 1
  }
  while (newIdx < newLines.length) {
    merged.push({ oldLine: null, newLine: newLines[newIdx] ?? null })
    newIdx += 1
  }

  return merged
}

function zipWithResiduals(oldLines: ProjectionLine[], newLines: ProjectionLine[]): RawRow[] {
  const rows: RawRow[] = []
  const length = Math.max(oldLines.length, newLines.length)
  for (let index = 0; index < length; index++) {
    rows.push({
      oldLine: oldLines[index] ?? null,
      newLine: newLines[index] ?? null,
    })
  }
  return rows
}

function computeLineMatches(
  oldLines: ProjectionLine[],
  newLines: ProjectionLine[],
): Array<[number, number]> {
  const signaturesOld = oldLines.map(lineTextSignature)
  const signaturesNew = newLines.map(lineTextSignature)

  const MAX_LCS = 500
  if (oldLines.length > MAX_LCS || newLines.length > MAX_LCS) {
    const sigMap = new Map<string, number[]>()
    signaturesOld.forEach((sig, i) => {
      let arr = sigMap.get(sig)
      if (!arr) { arr = []; sigMap.set(sig, arr) }
      arr.push(i)
    })
    const matches: Array<[number, number]> = []
    const usedOld = new Set<number>()
    for (let j = 0; j < newLines.length; j++) {
      const candidates = sigMap.get(signaturesNew[j]!)
      if (!candidates) continue
      const idx = candidates.find((i) => !usedOld.has(i))
      if (idx !== undefined) { usedOld.add(idx); matches.push([idx, j]) }
    }
    matches.sort((a, b) => a[0] - b[0])
    return removeNewIndexCrossings(matches)
  }

  const dp = Array.from({ length: oldLines.length + 1 }, () =>
    Array.from({ length: newLines.length + 1 }, () => 0),
  )

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      if (signaturesOld[oldIndex] === signaturesNew[newIndex]) {
        dp[oldIndex]![newIndex] = (dp[oldIndex + 1]?.[newIndex + 1] ?? 0) + 1
      } else {
        dp[oldIndex]![newIndex] = Math.max(
          dp[oldIndex + 1]?.[newIndex] ?? 0,
          dp[oldIndex]?.[newIndex + 1] ?? 0,
        )
      }
    }
  }

  const matches: Array<[number, number]> = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (signaturesOld[oldIndex] === signaturesNew[newIndex]) {
      matches.push([oldIndex, newIndex])
      oldIndex += 1
      newIndex += 1
      continue
    }

    if ((dp[oldIndex + 1]?.[newIndex] ?? 0) >= (dp[oldIndex]?.[newIndex + 1] ?? 0)) {
      oldIndex += 1
    } else {
      newIndex += 1
    }
  }

  const matchedOld = new Set(matches.map(([oi]) => oi))
  const matchedNew = new Set(matches.map(([, ni]) => ni))
  const unmatchedOld = oldLines.map((_, i) => i).filter((i) => !matchedOld.has(i))
  const unmatchedNew = newLines.map((_, i) => i).filter((i) => !matchedNew.has(i))

  if (unmatchedOld.length > 0 && unmatchedNew.length > 0) {
    const fuzzyCandidates: Array<{ oldIdx: number; newIdx: number; score: number }> = []
    for (const oi of unmatchedOld) {
      for (const ni of unmatchedNew) {
        const score = lineSimilarity(oldLines[oi]!, newLines[ni]!)
        if (score >= 0.5) fuzzyCandidates.push({ oldIdx: oi, newIdx: ni, score })
      }
    }
    fuzzyCandidates.sort((a, b) => b.score - a.score)
    const usedOld = new Set<number>()
    const usedNew = new Set<number>()
    const accepted: Array<[number, number]> = [...matches]
    const fuzzyMatches: Array<[number, number]> = []
    for (const { oldIdx, newIdx } of fuzzyCandidates) {
      if (usedOld.has(oldIdx) || usedNew.has(newIdx)) continue
      let compatible = true
      for (const [lo, ln] of accepted) {
        if ((oldIdx < lo && newIdx > ln) || (oldIdx > lo && newIdx < ln)) {
          compatible = false
          break
        }
      }
      if (!compatible) continue
      usedOld.add(oldIdx)
      usedNew.add(newIdx)
      accepted.push([oldIdx, newIdx])
      fuzzyMatches.push([oldIdx, newIdx])
    }

    if (fuzzyMatches.length > 0) {
      return [...matches, ...fuzzyMatches].sort((a, b) => a[0] - b[0])
    }
  }

  return matches
}

export function removeNewIndexCrossings(
  sorted: Array<[number, number]>,
): Array<[number, number]> {
  const result: Array<[number, number]> = []
  let maxNewIndex = -1
  for (const match of sorted) {
    if (match[1] > maxNewIndex) {
      result.push(match)
      maxNewIndex = match[1]
    }
  }
  return result
}

function plainBlockSimilarity(a: ProjectionBlock, b: ProjectionBlock): number {
  const normalize = (block: ProjectionBlock) =>
    block.lines.map((l) => l.text).join(' ').trim().replace(/\s+/g, ' ')
  const textA = normalize(a)
  const textB = normalize(b)
  if (textA === '' && textB === '') return 1
  if (textA === '' || textB === '') return 0
  const setA = new Set(tokenizeForSimilarity(textA))
  const setB = new Set(tokenizeForSimilarity(textB))
  let intersection = 0
  for (const token of setA) if (setB.has(token)) intersection++
  const union = setA.size + setB.size - intersection
  return union === 0 ? 1 : intersection / union
}

function lineTextSignature(line: ProjectionLine): string {
  const normalizedText = line.text.trim().replace(/\s+/g, ' ')
  const blankFlag = normalizedText.length === 0 ? 'blank' : 'content'
  return `${blankFlag}:${normalizedText}`
}

function charLevenshtein(a: string, b: string): number {
  const MAX_LEN = 2000
  const sa = a.length > MAX_LEN ? a.slice(0, MAX_LEN) : a
  const sb = b.length > MAX_LEN ? b.slice(0, MAX_LEN) : b
  if (sa === sb) return 0
  if (sa.length === 0) return sb.length
  if (sb.length === 0) return sa.length
  let prev = Array.from({ length: sb.length + 1 }, (_, i) => i)
  let curr = new Array<number>(sb.length + 1)
  for (let i = 1; i <= sa.length; i++) {
    curr[0] = i
    for (let j = 1; j <= sb.length; j++) {
      curr[j] = sa[i - 1] === sb[j - 1]
        ? prev[j - 1]!
        : Math.min(prev[j - 1]!, prev[j]!, curr[j - 1]!) + 1
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[sb.length]!
}

function lineSimilarity(a: ProjectionLine, b: ProjectionLine): number {
  const normA = a.text.trim().replace(/\s+/g, ' ')
  const normB = b.text.trim().replace(/\s+/g, ' ')
  const maxLen = Math.max(normA.length, normB.length)
  if (maxLen === 0) return 1
  return 1 - charLevenshtein(normA, normB) / maxLen
}
