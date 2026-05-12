import type { DiffNode, DiffOptions } from './types'
import { jaccardSimilarity, sequenceSimilarity } from './utils'

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

  if (oldNode.contentOnlyHash === newNode.contentOnlyHash) return 0.95
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
  return clamp01(0.7 * textSimilarity + 0.3 * structureSimilarity)
}

function headingSimilarity(
  oldNode: DiffNode,
  newNode: DiffNode,
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
  structuralContext: number,
): number {
  const titleSimilarity = tokenSimilarity(oldNode.titleTokens, newNode.titleTokens, options)
  const hasChildren = (oldNode.logicalChildren.length ?? 0) > 0 && (newNode.logicalChildren.length ?? 0) > 0
  const headingBodySimilarity = oldNode.headingBodyHash === newNode.headingBodyHash ? 1 : 0.5
  const depthMatch = oldNode.section?.headingDepth === newNode.section?.headingDepth ? 1 : 0.6

  if (hasChildren) {
    return clamp01(
      0.4 * titleSimilarity +
        0.3 * headingBodySimilarity +
        0.15 * depthMatch +
        0.15 * structuralContext,
    )
  }

  return clamp01(0.6 * titleSimilarity + 0.2 * depthMatch + 0.2 * structuralContext)
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
    tokenSimilarity(oldNode.textTokens, newNode.textTokens, options),
    charSimilarity,
  )
  const langBonus = oldNode.block?.lang === newNode.block?.lang ? 0.1 : 0
  return clamp01(lineSimilarity + langBonus)
}

function tableSimilarity(
  oldNode: DiffNode,
  newNode: DiffNode,
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
): number {
  const oldRows = Array.isArray(oldNode.block?.children) ? oldNode.block.children.length : 0
  const newRows = Array.isArray(newNode.block?.children) ? newNode.block.children.length : 0
  const oldAlign = Array.isArray(oldNode.block?.align) ? (oldNode.block.align as string[]) : []
  const newAlign = Array.isArray(newNode.block?.align) ? (newNode.block.align as string[]) : []
  const shapeSimilarity = Math.min(ratio(oldRows, newRows), ratio(oldAlign.length, newAlign.length))
  const cellContentSimilarity = tokenSimilarity(oldNode.textTokens, newNode.textTokens, options)
  const alignmentMatch = jaccardSimilarity(oldAlign, newAlign)
  return clamp01(0.3 * shapeSimilarity + 0.5 * cellContentSimilarity + 0.2 * alignmentMatch)
}

function footnoteOrDefinitionSimilarity(
  oldNode: DiffNode,
  newNode: DiffNode,
  options: Pick<DiffOptions, 'minHashTokenCount' | 'minHashNumFunctions'>,
): number {
  if (oldNode.identityHash === newNode.identityHash) return 1
  return tokenSimilarity(oldNode.textTokens, newNode.textTokens, options)
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

function ratio(left: number, right: number): number {
  if (left === 0 && right === 0) return 1
  if (left === 0 || right === 0) return 0
  return Math.min(left, right) / Math.max(left, right)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
