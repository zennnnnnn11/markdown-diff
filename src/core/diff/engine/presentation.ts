import type { InlineContent } from '../../transformer'
import { sequenceTuning } from '../heuristics'
import { forEachChangeAsync } from '../summary'
import { alignSequence } from '../sequence'
import type {
  DiffChange,
  DiffOptions,
  InlineSpan,
  InlineToken,
  LineDiffSpan,
  MetadataChange,
  SemanticIndex,
  TableCellDiff,
  TableDiff,
} from '../types'
import {
  buildInlineTokens,
  maxColumns,
  readTableData,
  tokenizeText,
} from '../utils'
import type { DiffContext } from './context'
import { createStatus, estimateInlineDiffCost, extractInlineText } from './helpers'

export async function computePresentationDiffs(context: DiffContext, root: DiffChange): Promise<void> {
  await forEachChangeAsync(root, async (change) => {
    if (!change.oldId || !change.newId) return
    const oldNode = context.oldIndex.byId.get(change.oldId)
    const newNode = context.newIndex.byId.get(change.newId)
    if (!oldNode || !newNode) return

    if (oldNode.entity === 'block' && newNode.entity === 'block') {
      if (oldNode.blockType === 'paragraph' && newNode.blockType === 'paragraph') {
        if (!(change.primaryOp === 'equal' && oldNode.selfHash === newNode.selfHash)) {
          const result = await diffInlineNodes(
            oldNode.block?.children ?? [],
            newNode.block?.children ?? [],
            context.options.maxInlineDiffMatrixCost,
            sequenceTuning(context.options),
          )
          change.inlineSpans = result.spans
          if (result.inlineStructureChanged) change.status.inlineStructureChanged = true
          if (result.deferred) change.warnings.push('inline-deferred')
        }
      }

      if (oldNode.blockType === 'code' && newNode.blockType === 'code') {
        if (oldNode.contentOnlyHash !== newNode.contentOnlyHash) {
          change.codeSpans = diffCodeLines(
            String(oldNode.block?.value ?? ''),
            String(newNode.block?.value ?? ''),
            context.options,
          )
        }
      }

      if (oldNode.blockType === 'table' && newNode.blockType === 'table') {
        change.tableDiff ??= await computeTableMetadataChange(oldNode, newNode, context.options)
      }
    }

    if (oldNode.kind === 'heading' && newNode.kind === 'heading' && change.status.renamed) {
      change.titleInlineSpans = await diffWordText(
        oldNode.section?.title ?? '',
        newNode.section?.title ?? '',
        sequenceTuning(context.options),
      )
    }
  })
}

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

export function diffCodeLines(oldValue: string, newValue: string, options: DiffOptions): LineDiffSpan[] {
  const oldLines = oldValue.split(/\r?\n/u)
  const newLines = newValue.split(/\r?\n/u)
  const edits = alignSequence(oldLines, newLines, options, 'heckel')
  const spans = coalesceLineDiffSpans(edits, oldLines, newLines, sequenceTuning(options))

  if (
    oldLines.length > options.longCodeLineThreshold ||
    newLines.length > options.longCodeLineThreshold
  ) {
    return foldLongCodeSpans(spans, options.codeFoldContextLines)
  }
  return spans
}

export async function computeTableMetadataChange(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  options: DiffOptions,
): Promise<TableDiff> {
  const oldData = readTableData(oldNode.block)
  const newData = readTableData(newNode.block)
  const oldRows = oldData.cells
  const newRows = newData.cells
  const oldStructuredRows = oldData.structured
  const newStructuredRows = newData.structured
  const oldAlign = Array.isArray(oldNode.block?.align) ? (oldNode.block.align as string[]) : []
  const newAlign = Array.isArray(newNode.block?.align) ? (newNode.block.align as string[]) : []
  const shapeChanged =
    oldRows.length !== newRows.length || maxColumns(oldRows) !== maxColumns(newRows)
  const alignmentChanged = JSON.stringify(oldAlign) !== JSON.stringify(newAlign)
  const cellDiffs: TableCellDiff[] = []

  if (!shapeChanged) {
    for (let row = 0; row < oldRows.length; row++) {
      const oldRow = oldStructuredRows[row] ?? []
      const newRow = newStructuredRows[row] ?? []
      for (let column = 0; column < oldRow.length; column++) {
        const oldCell = oldRow[column] ?? []
        const newCell = newRow[column] ?? []
        const oldText = extractInlineText(oldCell)
        const newText = extractInlineText(newCell)
        const result = await diffInlineNodes(
          oldCell,
          newCell,
          options.maxInlineDiffMatrixCost,
          sequenceTuning(options),
        )
        const spans =
          result.spans.length > 0
            ? result.spans
            : [
                {
                  op: 'replace' as const,
                  oldText,
                  newText,
                  wordSpans: diffWordTextSync(oldText, newText, sequenceTuning(options)),
                },
              ]
        if (!hasMeaningfulInlineDiff(spans, oldText, newText)) continue
        cellDiffs.push({
          row,
          column,
          spans,
        })
      }
    }
  }

  return {
    structureChanged: shapeChanged || alignmentChanged,
    shapeChanged,
    alignmentChanged,
    cellDiffs,
  }
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

export function coalesceLineDiffSpans(
  edits: Array<{ op: 'equal' | 'insert' | 'delete'; oldIndex?: number; newIndex?: number }>,
  oldLines: string[],
  newLines: string[],
  sequenceOptions: Pick<
    DiffOptions,
    'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'
  >,
): LineDiffSpan[] {
  const spans: LineDiffSpan[] = []
  let deleteIndexes: number[] = []
  let insertIndexes: number[] = []

  const flushPending = () => {
    if (deleteIndexes.length === 0 && insertIndexes.length === 0) return

    if (deleteIndexes.length > 0 && insertIndexes.length > 0) {
      const deletes = deleteIndexes.map((index) => oldLines[index] ?? '')
      const inserts = insertIndexes.map((index) => newLines[index] ?? '')
      const max = Math.max(deletes.length, inserts.length)
      for (let offset = 0; offset < max; offset++) {
        const oldLine = deletes[offset]
        const newLine = inserts[offset]
        if (oldLine !== undefined && newLine !== undefined) {
          spans.push({
            op: 'replace',
            oldLine,
            newLine,
            charSpans: diffCharacters(oldLine, newLine, sequenceOptions),
          })
        } else if (oldLine !== undefined) {
          spans.push({ op: 'delete', oldLine })
        } else if (newLine !== undefined) {
          spans.push({ op: 'insert', newLine })
        }
      }
    } else if (deleteIndexes.length > 0) {
      deleteIndexes.forEach((index) => spans.push({ op: 'delete', oldLine: oldLines[index] }))
    } else {
      insertIndexes.forEach((index) => spans.push({ op: 'insert', newLine: newLines[index] }))
    }

    deleteIndexes = []
    insertIndexes = []
  }

  for (const edit of edits) {
    if (edit.op === 'equal') {
      flushPending()
      spans.push({
        op: 'equal',
        oldLine: edit.oldIndex !== undefined ? oldLines[edit.oldIndex] : undefined,
        newLine: edit.newIndex !== undefined ? newLines[edit.newIndex] : undefined,
      })
      continue
    }

    if (edit.op === 'delete' && edit.oldIndex !== undefined) deleteIndexes.push(edit.oldIndex)
    if (edit.op === 'insert' && edit.newIndex !== undefined) insertIndexes.push(edit.newIndex)
  }

  flushPending()
  return spans
}

export function hasMeaningfulInlineDiff(spans: InlineSpan[], oldText: string, newText: string): boolean {
  if (spans.some((span) => span.op !== 'equal')) return true
  return oldText !== newText
}

export function isStructuralOnlyTableChange(
  oldNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  newNode: NonNullable<ReturnType<SemanticIndex['byId']['get']>>,
  tableDiff: TableDiff,
): boolean {
  if (!tableDiff.structureChanged || tableDiff.cellDiffs.length > 0) return false
  const oldCells = readTableData(oldNode.block).cells
  const newCells = readTableData(newNode.block).cells
  return JSON.stringify(oldCells) === JSON.stringify(newCells)
}

export function foldLongCodeSpans(spans: LineDiffSpan[], contextLines: number): LineDiffSpan[] {
  const changed = spans
    .map((span, index) => ({ span, index }))
    .filter(({ span }) => span.op !== 'equal')
    .map(({ index }) => index)
  if (changed.length === 0) return spans.slice(0, contextLines * 2)

  const keep = new Set<number>()
  for (const index of changed) {
    for (
      let cursor = Math.max(0, index - contextLines);
      cursor <= Math.min(spans.length - 1, index + contextLines);
      cursor++
    ) {
      keep.add(cursor)
    }
  }
  for (let index = 0; index < Math.min(contextLines, spans.length); index++) keep.add(index)
  for (let index = Math.max(0, spans.length - contextLines); index < spans.length; index++)
    keep.add(index)

  return spans.filter((_, index) => keep.has(index))
}

export function metadataChangeToDiff(change: MetadataChange): DiffChange {
  return {
    entity: 'metadata',
    primaryOp: 'meta-update',
    status: createStatus({ metaChanged: true }),
    summary: `${change.op} metadata ${change.path}`,
    metadataChanges: [change],
    children: [],
    warnings: [],
  }
}
