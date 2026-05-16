import { sequenceTuning } from '../heuristics'
import { forEachChangeAsync } from '../summary'
import { alignSequence } from '../sequence'
import type {
  DiffChange,
  DiffOptions,
  LineDiffSpan,
} from '../types'
import type { DiffContext } from './context'
import { diffCharacters, diffInlineNodes, diffWordText } from './inline-diff'
import { computeTableMetadataChange } from './table-diff'

export { diffInlineNodes, diffWordText } from './inline-diff'
export { computeTableMetadataChange, isStructuralOnlyTableChange, metadataChangeToDiff } from './table-diff'
export { diffWordTextSync, buildInlineReplaceSpan, diffCharacters, coalesceTextSpans, hasMeaningfulInlineDiff } from './inline-diff'

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
