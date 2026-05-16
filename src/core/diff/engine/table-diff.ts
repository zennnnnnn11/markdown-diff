import { sequenceTuning } from '../heuristics'
import type {
  DiffChange,
  DiffOptions,
  MetadataChange,
  SemanticIndex,
  TableCellDiff,
  TableDiff,
} from '../types'
import {
  maxColumns,
  readTableData,
} from '../utils'
import { createStatus, extractInlineText } from './helpers'
import { diffInlineNodes, diffWordTextSync, hasMeaningfulInlineDiff } from './inline-diff'

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
