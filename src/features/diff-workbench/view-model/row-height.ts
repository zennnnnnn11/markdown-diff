import { prepare, layout } from '@chenglou/pretext'
import type { MergedRow, ProjectionLine } from './types'

const FONT =
  '12px "Maple Mono CN", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
const LINE_HEIGHT = 18
const CELL_PADDING_V = 12
const ROW_BORDER = 1
const MIN_ROW_HEIGHT = 28
const GRID_FIXED_WIDTH = 236
const CELL_PADDING_H = 24

type PreparedHandle = ReturnType<typeof prepare>

const cache = new Map<string, PreparedHandle>()

function prepareLineText(text: string): PreparedHandle {
  let handle = cache.get(text)
  if (!handle) {
    handle = prepare(text, FONT, { whiteSpace: 'pre-wrap' })
    cache.set(text, handle)
  }
  return handle
}

function computeLineHeight(line: ProjectionLine | null, textWidth: number): number {
  if (!line) return 0
  const handle = prepareLineText(line.text)
  const { height } = layout(handle, Math.max(textWidth, 1), LINE_HEIGHT)
  return Math.max(height, LINE_HEIGHT) + CELL_PADDING_V
}

export function computeRowHeight(row: MergedRow, cellWidth: number): number {
  const textWidth = cellWidth - CELL_PADDING_H
  const oldH = computeLineHeight(row.oldLine, textWidth)
  const newH = computeLineHeight(row.newLine, textWidth)
  return Math.max(oldH, newH, MIN_ROW_HEIGHT) + ROW_BORDER
}

export function computeAllRowHeights(rows: MergedRow[], tableWidth: number): number[] {
  const cellWidth = (tableWidth - GRID_FIXED_WIDTH) / 2
  return rows.map((row) => computeRowHeight(row, cellWidth))
}

export function clearPretextCache(): void {
  cache.clear()
}
