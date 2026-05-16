import type { InlineContent } from '../../transformer'
import { alignSequence } from '../sequence'
import type {
  DiffOptions,
  InlineSpan,
  InlineToken,
} from '../types'
import {
  buildInlineTokens,
  tokenizeText,
} from '../utils'
import { estimateInlineDiffCost, extractInlineText } from './helpers'

export async function diffInlineNodes(
  oldChildren: InlineContent[],
  newChildren: InlineContent[],
  maxInlineDiffMatrixCost: number,
  sequenceOptions: Pick<
    DiffOptions,
    'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'
  >,
): Promise<{ spans: InlineSpan[]; inlineStructureChanged: boolean; deferred: boolean }> {
  if (estimateInlineDiffCost(oldChildren, newChildren) > maxInlineDiffMatrixCost) {
    return {
      spans: [
        {
          op: 'replace',
          oldText: extractInlineText(oldChildren),
          newText: extractInlineText(newChildren),
        },
      ],
      inlineStructureChanged: false,
      deferred: true,
    }
  }

  const [oldTokens, newTokens] = await Promise.all([
    buildInlineTokens(oldChildren),
    buildInlineTokens(newChildren),
  ])
  const edits = alignSequence(
    oldTokens.map((token) => token.hash),
    newTokens.map((token) => token.hash),
    sequenceOptions,
    'myers',
  )

  const spans: InlineSpan[] = []
  let oldGap: InlineToken[] = []
  let newGap: InlineToken[] = []
  let inlineStructureChanged = false

  for (const edit of edits) {
    if (edit.op === 'equal') {
      if (oldGap.length > 0 || newGap.length > 0) {
        const span = await buildInlineReplaceSpan(oldGap, newGap, sequenceOptions)
        spans.push(span)
        if (
          span.oldTokens?.some((token) => token.type !== 'text') ||
          span.newTokens?.some((token) => token.type !== 'text')
        ) {
          inlineStructureChanged = true
        }
        oldGap = []
        newGap = []
      }

      spans.push({
        op: 'equal',
        oldText: oldTokens[edit.oldIndex!]?.rawText,
        newText: newTokens[edit.newIndex!]?.rawText,
        oldTokens: [oldTokens[edit.oldIndex!]!],
        newTokens: [newTokens[edit.newIndex!]!],
      })
      continue
    }

    if (edit.op === 'delete' && edit.oldIndex !== undefined) oldGap.push(oldTokens[edit.oldIndex]!)
    if (edit.op === 'insert' && edit.newIndex !== undefined) newGap.push(newTokens[edit.newIndex]!)
  }

  if (oldGap.length > 0 || newGap.length > 0) {
    const span = await buildInlineReplaceSpan(oldGap, newGap, sequenceOptions)
    spans.push(span)
    if (
      span.oldTokens?.some((token) => token.type !== 'text') ||
      span.newTokens?.some((token) => token.type !== 'text')
    ) {
      inlineStructureChanged = true
    }
  }

  return { spans, inlineStructureChanged, deferred: false }
}

export async function diffWordText(
  oldText: string,
  newText: string,
  sequenceOptions: Pick<
    DiffOptions,
    'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'
  >,
): Promise<InlineSpan[]> {
  return [
    {
      op: oldText === newText ? 'equal' : 'replace',
      oldText,
      newText,
      wordSpans: diffWordTextSync(oldText, newText, sequenceOptions),
    },
  ]
}

export function diffWordTextSync(
  oldText: string,
  newText: string,
  sequenceOptions: Pick<
    DiffOptions,
    'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'
  >,
): Array<{ op: 'equal' | 'insert' | 'delete' | 'replace'; oldText?: string; newText?: string }> {
  const oldWords = tokenizeText(oldText)
  const newWords = tokenizeText(newText)
  const useCharacterFallback =
    oldWords.length === 0 && newWords.length === 0 && (oldText.length > 0 || newText.length > 0)
  const oldUnits = useCharacterFallback ? [...oldText] : oldWords
  const newUnits = useCharacterFallback ? [...newText] : newWords
  const edits = alignSequence(oldUnits, newUnits, sequenceOptions, 'myers')
  return coalesceTextSpans(edits, oldUnits, newUnits, useCharacterFallback ? '' : ' ')
}

export async function buildInlineReplaceSpan(
  oldTokens: InlineToken[],
  newTokens: InlineToken[],
  sequenceOptions: Pick<
    DiffOptions,
    'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'
  >,
): Promise<InlineSpan> {
  const oldText = oldTokens.map((token) => token.rawText).join('')
  const newText = newTokens.map((token) => token.rawText).join('')
  const textOnly =
    oldTokens.every((token) => token.type === 'text') &&
    newTokens.every((token) => token.type === 'text')
  return {
    op: 'replace',
    oldText,
    newText,
    oldTokens,
    newTokens,
    wordSpans: textOnly ? diffWordTextSync(oldText, newText, sequenceOptions) : undefined,
  }
}

export function diffCharacters(
  oldText: string,
  newText: string,
  sequenceOptions: Pick<
    DiffOptions,
    'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'
  >,
): Array<{ op: 'equal' | 'insert' | 'delete' | 'replace'; oldText?: string; newText?: string }> {
  const oldChars = [...oldText]
  const newChars = [...newText]
  const edits = alignSequence(oldChars, newChars, sequenceOptions, 'myers')
  return coalesceTextSpans(edits, oldChars, newChars, '')
}

export function coalesceTextSpans(
  edits: Array<{ op: 'equal' | 'insert' | 'delete'; oldIndex?: number; newIndex?: number }>,
  oldUnits: string[],
  newUnits: string[],
  separator: string,
): Array<{ op: 'equal' | 'insert' | 'delete' | 'replace'; oldText?: string; newText?: string }> {
  const spans: Array<{
    op: 'equal' | 'insert' | 'delete' | 'replace'
    oldText?: string
    newText?: string
  }> = []
  let pendingDeletes: string[] = []
  let pendingInserts: string[] = []

  const flushPending = () => {
    if (pendingDeletes.length === 0 && pendingInserts.length === 0) return
    if (pendingDeletes.length > 0 && pendingInserts.length > 0) {
      spans.push({
        op: 'replace',
        oldText: pendingDeletes.join(separator),
        newText: pendingInserts.join(separator),
      })
    } else if (pendingDeletes.length > 0) {
      spans.push({ op: 'delete', oldText: pendingDeletes.join(separator) })
    } else {
      spans.push({ op: 'insert', newText: pendingInserts.join(separator) })
    }
    pendingDeletes = []
    pendingInserts = []
  }

  for (const edit of edits) {
    if (edit.op === 'equal') {
      flushPending()
      spans.push({
        op: 'equal',
        oldText: edit.oldIndex !== undefined ? oldUnits[edit.oldIndex] : undefined,
        newText: edit.newIndex !== undefined ? newUnits[edit.newIndex] : undefined,
      })
      continue
    }

    if (edit.op === 'delete' && edit.oldIndex !== undefined)
      pendingDeletes.push(oldUnits[edit.oldIndex] ?? '')
    if (edit.op === 'insert' && edit.newIndex !== undefined)
      pendingInserts.push(newUnits[edit.newIndex] ?? '')
  }

  flushPending()
  return spans
}

export function hasMeaningfulInlineDiff(spans: InlineSpan[], oldText: string, newText: string): boolean {
  if (spans.some((span) => span.op !== 'equal')) return true
  return oldText !== newText
}
