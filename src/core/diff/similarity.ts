import type { DiffNode } from './types'
import { jaccardSimilarity, sequenceSimilarity } from './utils'

export function computeNodeSimilarity(
  oldNode: DiffNode,
  newNode: DiffNode,
  structuralContext = 1,
): number {
  if (!isSameShape(oldNode, newNode)) return 0
  if (oldNode.selfHash === newNode.selfHash) return 1

  if (oldNode.entity === 'section' && oldNode.kind === 'heading') {
    const titleSimilarity = jaccardSimilarity(oldNode.titleTokens, newNode.titleTokens)
    const headingBodySimilarity = oldNode.headingBodyHash === newNode.headingBodyHash ? 1 : 0.5
    const depthMatch = oldNode.section?.headingDepth === newNode.section?.headingDepth ? 1 : 0.6
    const hasChildren =
      ((oldNode.section?.items.length ?? 0) > 0) && ((newNode.section?.items.length ?? 0) > 0)
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

  if (oldNode.entity === 'block' && oldNode.blockType === 'paragraph') {
    const textSimilarity = sequenceSimilarity(oldNode.textTokens, newNode.textTokens)
    const structureSimilarity = sequenceSimilarity(
      oldNode.block?.children?.map((child) => child.type) ?? [],
      newNode.block?.children?.map((child) => child.type) ?? [],
    )
    return clamp01(0.7 * textSimilarity + 0.3 * structureSimilarity)
  }

  if (oldNode.entity === 'block' && oldNode.blockType === 'code') {
    if (oldNode.contentOnlyHash === newNode.contentOnlyHash) return 1
    const oldLines = splitLines(oldNode.block?.value)
    const newLines = splitLines(newNode.block?.value)
    const lineSimilarity = jaccardSimilarity(oldLines, newLines)
    const langBonus =
      oldNode.block && newNode.block && oldNode.block.lang === newNode.block.lang ? 0.1 : 0
    return clamp01(lineSimilarity + langBonus)
  }

  if (oldNode.entity === 'block' && oldNode.blockType === 'table') {
    const oldAlign = Array.isArray(oldNode.block?.align) ? (oldNode.block?.align as string[]) : []
    const newAlign = Array.isArray(newNode.block?.align) ? (newNode.block?.align as string[]) : []
    const shapeSimilarity = Math.min(
      ratio((oldNode.block?.children as unknown[] | undefined)?.length ?? 0, (newNode.block?.children as unknown[] | undefined)?.length ?? 0),
      ratio(oldAlign.length, newAlign.length),
    )
    const contentSimilarity = jaccardSimilarity(oldNode.textTokens, newNode.textTokens)
    const alignmentMatch = jaccardSimilarity(oldAlign, newAlign)
    return clamp01(0.3 * shapeSimilarity + 0.5 * contentSimilarity + 0.2 * alignmentMatch)
  }

  if (
    (oldNode.entity === 'section' && oldNode.kind === 'footnote') ||
    (oldNode.entity === 'block' && oldNode.blockType === 'definition')
  ) {
    if (oldNode.identityHash === newNode.identityHash) return 1
    return clamp01(jaccardSimilarity(oldNode.textTokens, newNode.textTokens))
  }

  const textSimilarity = jaccardSimilarity(oldNode.textTokens, newNode.textTokens)
  if (oldNode.contentOnlyHash === newNode.contentOnlyHash) return clamp01(0.9 + textSimilarity * 0.1)
  return clamp01(textSimilarity)
}

export function uniquenessMargin(scores: readonly number[]): number {
  if (scores.length < 2) return 1
  const sorted = [...scores].sort((left, right) => right - left)
  return (sorted[0] ?? 0) - (sorted[1] ?? 0)
}

export function isSameShape(oldNode: DiffNode, newNode: DiffNode): boolean {
  if (oldNode.entity !== newNode.entity) return false
  if (oldNode.entity === 'section') return oldNode.kind === newNode.kind
  return oldNode.blockType === newNode.blockType
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
