/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DiffNode, DiffOptions } from './types'
import { DIFF_HEURISTICS } from './heuristics'
import { extractNodeText, jaccardSimilarity, sequenceSimilarity, tokenizeText } from './utils'

export function computeNodeSimilarity(
  oldNode: DiffNode,
  newNode: DiffNode,
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
  structuralContext = 1,
): number {
  if (!isSameShape(oldNode, newNode)) return 0
  if (oldNode.selfHash === newNode.selfHash) return 1

  if (oldNode.entity === 'section' && oldNode.kind === 'heading') {
    return headingSimilarity(oldNode, newNode, options, structuralContext)
  }
  if (oldNode.entity === 'block' && oldNode.blockType === 'paragraph') {
    return paragraphSimilarity(oldNode, newNode, options)
  }
  if (oldNode.entity === 'block' && oldNode.blockType === 'code') {
    return codeSimilarity(oldNode, newNode, options)
  }
  if (oldNode.entity === 'block' && oldNode.blockType === 'table') {
    return tableSimilarity(oldNode, newNode, options)
  }
  if (
    (oldNode.entity === 'section' && oldNode.kind === 'footnote') ||
    (oldNode.entity === 'block' && oldNode.blockType === 'definition')
  ) {
    return footnoteOrDefinitionSimilarity(oldNode, newNode, options)
  }

  if (oldNode.contentOnlyHash === newNode.contentOnlyHash) {
    return DIFF_HEURISTICS.similarity.genericContentOnlyScore
  }
  return tokenSimilarity(oldNode.textTokens, newNode.textTokens, options)
}

export function uniquenessMargin(scores: readonly number[]): number {
  if (scores.length < 2) return 1
  const sorted = [...scores].sort((left, right) => right - left)
  return (sorted[0] ?? 0) - (sorted[1] ?? 0)
}

export function isSameShape(oldNode: DiffNode, newNode: DiffNode): boolean {
  if (oldNode.entity !== newNode.entity) return false
  return oldNode.entity === 'section' ? oldNode.kind === newNode.kind : oldNode.blockType === newNode.blockType
}

function paragraphSimilarity(
  oldNode: DiffNode,
  newNode: DiffNode,
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
): number {
  const textSimilarity = Math.max(
    tokenSimilarity(oldNode.textTokens, newNode.textTokens, options),
    sequenceSimilarity(oldNode.textTokens, newNode.textTokens),
  )
  const structureSimilarity = sequenceSimilarity(
    oldNode.block?.children?.map((child) => child.type) ?? [],
    newNode.block?.children?.map((child) => child.type) ?? [],
  )
  return clamp01(
    DIFF_HEURISTICS.similarity.paragraph.textWeight * textSimilarity +
      DIFF_HEURISTICS.similarity.paragraph.structureWeight * structureSimilarity,
  )
}

function headingSimilarity(
  oldNode: DiffNode,
  newNode: DiffNode,
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
  structuralContext: number,
): number {
  const titleSimilarity = tokenSimilarity(oldNode.titleTokens, newNode.titleTokens, options)
  const hasChildren = (oldNode.logicalChildren.length ?? 0) > 0 && (newNode.logicalChildren.length ?? 0) > 0
  const headingBodySimilarity =
    oldNode.headingBodyHash === newNode.headingBodyHash
      ? 1
      : DIFF_HEURISTICS.similarity.heading.bodyHashMismatchScore
  const depthMatch =
    oldNode.section?.headingDepth === newNode.section?.headingDepth
      ? 1
      : DIFF_HEURISTICS.similarity.heading.depthMismatchScore

  if (hasChildren) {
    const weights = DIFF_HEURISTICS.similarity.heading.withChildren
    return clamp01(
      weights.titleWeight * titleSimilarity +
        weights.bodyWeight * headingBodySimilarity +
        weights.depthWeight * depthMatch +
        weights.contextWeight * structuralContext,
    )
  }

  const weights = DIFF_HEURISTICS.similarity.heading.leaf
  return clamp01(
    weights.titleWeight * titleSimilarity +
      weights.depthWeight * depthMatch +
      weights.contextWeight * structuralContext,
  )
}

function codeSimilarity(
  oldNode: DiffNode,
  newNode: DiffNode,
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
): number {
  if (oldNode.contentOnlyHash === newNode.contentOnlyHash) return 1
  const oldLines = splitLines(oldNode.block?.value)
  const newLines = splitLines(newNode.block?.value)
  const charSimilarity = sequenceSimilarity(
    [...String(oldNode.block?.value ?? '')],
    [...String(newNode.block?.value ?? '')],
  )
  const lineSimilarity = Math.max(
    tokenSimilarity(oldLines, newLines, options),
    sequenceSimilarity(oldLines, newLines),
    charSimilarity,
  )
  const langBonus =
    oldNode.block?.lang === newNode.block?.lang ? DIFF_HEURISTICS.similarity.code.langBonus : 0
  return clamp01(lineSimilarity + langBonus)
}

function tableSimilarity(
  oldNode: DiffNode,
  newNode: DiffNode,
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
): number {
  const oldRows = readTableCellTexts(oldNode.block)
  const newRows = readTableCellTexts(newNode.block)
  const oldAlign = Array.isArray(oldNode.block?.align) ? (oldNode.block.align as string[]) : []
  const newAlign = Array.isArray(newNode.block?.align) ? (newNode.block.align as string[]) : []
  const shapeSimilarity = Math.min(ratio(oldRows.length, newRows.length), ratio(maxColumns(oldRows), maxColumns(newRows)))
  const cellContentSimilarity = averageTableCellSimilarity(oldRows, newRows, options)
  const alignmentMatch = exactAlignmentRatio(oldAlign, newAlign)
  return clamp01(
    DIFF_HEURISTICS.similarity.table.shapeWeight * shapeSimilarity +
      DIFF_HEURISTICS.similarity.table.cellContentWeight * cellContentSimilarity +
      DIFF_HEURISTICS.similarity.table.alignmentWeight * alignmentMatch,
  )
}

function footnoteOrDefinitionSimilarity(
  oldNode: DiffNode,
  newNode: DiffNode,
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
): number {
  if (oldNode.identityHash === newNode.identityHash) return 1
  if (oldNode.blockType === 'definition' && newNode.blockType === 'definition') {
    return definitionFieldSimilarity(oldNode, newNode, options)
  }
  return tokenSimilarity(oldNode.textTokens, newNode.textTokens, options)
}

function definitionFieldSimilarity(
  oldNode: DiffNode,
  newNode: DiffNode,
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
): number {
  const oldUrl = String((oldNode.block as any)?.url ?? '')
  const newUrl = String((newNode.block as any)?.url ?? '')
  const oldTitle = String((oldNode.block as any)?.title ?? '')
  const newTitle = String((newNode.block as any)?.title ?? '')
  const oldLabel = String((oldNode.block as any)?.label ?? extractNodeText(oldNode.block))
  const newLabel = String((newNode.block as any)?.label ?? extractNodeText(newNode.block))
  const urlSimilarity = tokenSimilarity(tokenizeText(oldUrl), tokenizeText(newUrl), options)
  const titleSimilarity = tokenSimilarity(tokenizeText(oldTitle), tokenizeText(newTitle), options)
  const labelSimilarity = tokenSimilarity(tokenizeText(oldLabel), tokenizeText(newLabel), options)
  return clamp01(
    DIFF_HEURISTICS.similarity.definition.urlWeight * urlSimilarity +
      DIFF_HEURISTICS.similarity.definition.titleWeight * titleSimilarity +
      DIFF_HEURISTICS.similarity.definition.labelWeight * labelSimilarity,
  )
}

function tokenSimilarity(
  oldTokens: readonly string[],
  newTokens: readonly string[],
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
): number {
  const max = Math.max(oldTokens.length, newTokens.length)
  if (max > options.minHashTokenCount) {
    return estimateJaccardWithMinHash(oldTokens, newTokens, options.minHashNumFunctions)
  }
  return jaccardSimilarity(oldTokens, newTokens)
}

function estimateJaccardWithMinHash(left: readonly string[], right: readonly string[], functions: number): number {
  const leftSketch = computeMinHashSketch(left, functions)
  const rightSketch = computeMinHashSketch(right, functions)
  let equal = 0
  for (let index = 0; index < Math.min(leftSketch.length, rightSketch.length); index++) {
    if (leftSketch[index] === rightSketch[index]) equal++
  }
  return leftSketch.length === 0 ? 1 : equal / leftSketch.length
}

function computeMinHashSketch(tokens: readonly string[], functions: number): number[] {
  if (tokens.length === 0) return []
  const unique = [...new Set(tokens)]
  return Array.from({ length: functions }, (_, seed) =>
    unique.reduce((best, token) => Math.min(best, seededHash(token, seed + 1)), Number.POSITIVE_INFINITY),
  )
}

function seededHash(token: string, seed: number): number {
  let hash = seed * 2_654_435_761
  for (let index = 0; index < token.length; index++) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function splitLines(value: unknown): string[] {
  return String(value ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
}

function readTableCellTexts(block: any): string[][] {
  if (!block || !Array.isArray(block.children)) return []
  return block.children.map((row: any) =>
    Array.isArray(row.children)
      ? row.children.map((cell: any) => extractNodeText(cell))
      : [],
  )
}

function averageTableCellSimilarity(
  oldRows: string[][],
  newRows: string[][],
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
): number {
  const rowCount = Math.max(oldRows.length, newRows.length, 1)
  const columnCount = Math.max(maxColumns(oldRows), maxColumns(newRows), 1)
  let total = 0
  let compared = 0

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      const oldCell = oldRows[rowIndex]?.[columnIndex]
      const newCell = newRows[rowIndex]?.[columnIndex]
      if (oldCell === undefined || newCell === undefined) {
        compared++
        continue
      }
      total += tokenSimilarity(tokenizeText(oldCell), tokenizeText(newCell), options)
      compared++
    }
  }

  return compared === 0 ? 1 : total / compared
}

function exactAlignmentRatio(oldAlign: string[], newAlign: string[]): number {
  const total = Math.min(oldAlign.length, newAlign.length)
  if (total === 0) return oldAlign.length === 0 && newAlign.length === 0 ? 1 : 0
  let matches = 0
  for (let index = 0; index < total; index++) {
    if (oldAlign[index] === newAlign[index]) matches++
  }
  return matches / total
}

function maxColumns(rows: string[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0)
}

function ratio(left: number, right: number): number {
  if (left === 0 && right === 0) return 1
  if (left === 0 || right === 0) return 0
  return Math.min(left, right) / Math.max(left, right)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
