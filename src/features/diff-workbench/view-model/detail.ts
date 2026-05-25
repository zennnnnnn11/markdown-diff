import { isSection } from '@/core/transformer'
import type {
  Block,
  DiffChange,
  DiffChangeIndex,
  DiffResult,
  InlineSpan,
  LineDiffSpan,
  MetadataChange,
  Section,
  SemanticIndex,
  Tone,
} from './types'
import type {
  BacklinkInfo,
  DebugSnapshot,
  DetailMetadataItem,
  DetailPanelModel,
  DetailRenderedLine,
  DetailTableCellModel,
  DetailTableRowModel,
  HighlightFilter,
  MoveInfo,
  ProjectionLine,
  ProjectionSegment,
} from './types'
import { entityLabel, matchKindLabels, operationLabel } from './labels'
import {
  flattenChanges,
  formatMetadataValue,
  getChangeReference,
  tonesForChange,
  uniqueStrings,
} from './utils'
import {
  buildCodeSegment,
  buildSegmentsFromRanges,
  buildSideInlineSegments,
  buildSideSegmentsFromSpans,
  headingPrefix,
  mergeAdjacentSegments,
  stripHeadingPrefix,
} from './segments'

export function buildDetailPanel(
  change: DiffChange | undefined,
  changeIndex?: DiffChangeIndex,
  newIndex?: SemanticIndex,
  oldIndex?: SemanticIndex,
): DetailPanelModel | undefined {
  if (!change) return undefined

  const highlightTone = tonesForChange(change)[0] ?? 'replace'

  const isHeadingRename = change.status.renamed && change.kind === 'heading'
  const oldSection =
    isHeadingRename && change.oldNode && isSection(change.oldNode) ? change.oldNode : undefined
  const newSection =
    isHeadingRename && change.newNode && isSection(change.newNode) ? change.newNode : undefined
  const rawTitleSegments = isHeadingRename ? buildSideInlineSegments(change, 'new') : undefined

  return {
    heading: `${entityLabel(change)} · ${operationLabel(change)}`,
    operation: operationLabel(change),
    pairKind: change.pairKind,
    matchKind: change.matchKind,
    matchKindLabel: change.matchKind ? matchKindLabels[change.matchKind] : undefined,
    score: change.score,
    oldContent: buildOldContent(change),
    newContent: buildNewContent(change),
    oldTitle: oldSection?.title,
    newTitle: newSection?.title,
    oldInlineSegments: buildSideInlineSegments(change, 'old'),
    newTitleSegments: stripHeadingPrefix(rawTitleSegments),
    newInlineSegments: isHeadingRename ? undefined : buildSideInlineSegments(change, 'new'),
    highlightTone,
    oldHighlightedLines: buildHighlightedLines(change, highlightTone, 'old'),
    newHighlightedLines: buildHighlightedNewLines(change, highlightTone),
    oldCodeLines: buildCodeLineDetails(change.codeSpans, 'old', highlightTone),
    codeLines: buildCodeLineDetails(change.codeSpans, 'new', highlightTone),
    oldTableRows: buildTableRows(change, highlightTone, 'old'),
    newTableRows: buildTableRows(change, highlightTone, 'new'),
    metadataChanges: change.metadataChanges?.map((entry) => ({
      path: entry.path,
      op: entry.op,
      oldValueText: formatMetadataValue(entry.oldValue),
      newValueText: formatMetadataValue(entry.newValue),
    })),
    moveInfo: buildMoveInfo(change, changeIndex, newIndex, oldIndex),
    backlinkInfo: buildBacklinkInfo(change, oldIndex, newIndex),
  }
}

export function buildDebugSnapshot(result: DiffResult): DebugSnapshot {
  const changes = flattenChanges(result.root)
  return {
    quality: result.quality,
    warnings: result.warnings,
    oldIndexSummary: buildIndexSummary(result.oldIndex),
    newIndexSummary: buildIndexSummary(result.newIndex),
    matches: result.matches.map((match) => ({
      pairKey: match.pairKey,
      matchKind: match.matchKind,
      oldId: match.oldId,
      newId: match.newId,
      score: match.score,
    })),
    changes: changes.map((change) => ({
      key: getChangeReference(change),
      summary: change.summary,
      entity: change.entity,
      primaryOp: change.primaryOp,
      pairKind: change.pairKind,
      matchKind: change.matchKind,
      warnings: change.warnings,
      status: change.status,
      degraded: change.degraded,
      shortHeadingFallback: change.shortHeadingFallback,
    })),
  }
}

export function lineMatchesFilter(line: ProjectionLine, filter: HighlightFilter | null): boolean {
  if (!filter) return false
  if (filter === 'warning') return line.warnings.length > 0
  return line.matchedTones.includes(filter) || line.baseTone === filter
}

function buildIndexSummary(index: SemanticIndex): Record<string, number> {
  return {
    nodes: index.byId.size,
    kinds: index.byKind.size,
    blockTypes: index.byBlockType.size,
    selfHashes: index.bySelfHash.size,
    directHashes: index.byDirectHash.size,
    subtreeHashes: index.bySubtreeHash.size,
    identityHashes: index.byIdentityHash.size,
    headingBodyHashes: index.byHeadingBodyHash.size,
    pathHashes: index.byPathHash.size,
    footnoteBacklinks: index.backlinks.footnotes.size,
    definitionBacklinks: index.backlinks.definitions.size,
  }
}

function buildCodeLineDetails(
  codeSpans: LineDiffSpan[] | undefined,
  side: 'old' | 'new',
  highlightTone: Tone,
): DetailPanelModel['codeLines'] {
  if (!codeSpans?.length) return undefined

  const lines: NonNullable<DetailPanelModel['codeLines']> = []
  for (const [index, line] of codeSpans.entries()) {
    const segments = line.charSpans
      ?.map((span) => buildCodeSegment(span, side, highlightTone))
      .filter((segment): segment is ProjectionSegment => !!segment)

    const renderedText =
      side === 'old'
        ? (line.oldLine ?? segments?.map((segment) => segment.text).join(''))
        : (line.newLine ?? segments?.map((segment) => segment.text).join(''))
    if ((side === 'old' && line.op === 'insert') || (side === 'new' && line.op === 'delete')) {
      if (!renderedText) continue
    }

    lines.push({
      key: `code:${index}`,
      oldLine: line.oldLine,
      newLine: line.newLine,
      op: line.op,
      segments: segments?.length ? mergeAdjacentSegments(segments) : undefined,
    })
  }

  return lines.length ? lines : undefined
}

function buildHighlightedLines(
  change: DiffChange,
  highlightTone: Tone,
  side: 'old' | 'new',
): DetailRenderedLine[] | undefined {
  if (change.kind === 'frontmatter' && change.metadataChanges?.length) {
    return buildMetadataHighlightedLines(change, highlightTone, side)
  }

  if (change.primaryOp === 'meta-update' || change.status.metaChanged || change.status.renamed) {
    return buildFieldHighlightedLines(change, highlightTone, side)
  }

  return undefined
}

function buildHighlightedNewLines(
  change: DiffChange,
  highlightTone: Tone,
): DetailRenderedLine[] | undefined {
  return buildHighlightedLines(change, highlightTone, 'new')
}

function buildMetadataHighlightedLines(
  change: DiffChange,
  highlightTone: Tone,
  side: 'old' | 'new',
): DetailRenderedLine[] | undefined {
  const content = side === 'old' ? buildOldContent(change) : buildNewContent(change)
  if (!content || !change.metadataChanges?.length) return undefined

  const lines = content.split('\n')
  const lineRanges = lines.map(() => [] as Array<{ start: number; end: number; tone: Tone }>)
  const fullLineIndexes = new Set<number>()

  for (const metadataChange of change.metadataChanges) {
    if (shouldHighlightMetadataBlock(metadataChange)) {
      for (const lineIndex of findMetadataBlockLineIndexes(lines, metadataChange.path)) {
        fullLineIndexes.add(lineIndex)
      }
      continue
    }

    for (const [lineIndex, line] of lines.entries()) {
      lineRanges[lineIndex]!.push(
        ...collectMetadataLineRanges(line, metadataChange, highlightTone, side),
      )
    }
  }

  const highlighted = lines.map((line, index) => {
    const segments = fullLineIndexes.has(index)
      ? [{ text: line, tone: highlightTone }]
      : buildSegmentsFromRanges(line, lineRanges[index] ?? [])

    return {
      key: `meta:${index}`,
      text: line,
      tone: segments?.some((segment) => segment.tone !== 'plain') ? highlightTone : 'plain',
      segments: segments?.some((segment) => segment.tone !== 'plain') ? segments : undefined,
    }
  })

  return highlighted.some((line) => line.segments?.length) ? highlighted : undefined
}

function buildFieldHighlightedLines(
  change: DiffChange,
  highlightTone: Tone,
  side: 'old' | 'new',
): DetailRenderedLine[] | undefined {
  const content = side === 'old' ? buildOldContent(change) : buildNewContent(change)
  if (!content) return undefined

  const fields = collectChangedFields(change, side)
  if (!fields.length) return undefined

  const highlighted = content.split('\n').map((line, index) => {
    const segments = buildFieldLineSegments(line, fields, highlightTone)
    return {
      key: `field:${index}`,
      text: line,
      tone: segments ? highlightTone : 'plain',
      segments,
    }
  })

  return highlighted.some((line) => line.segments?.length) ? highlighted : undefined
}

function buildTableRows(
  change: DiffChange,
  highlightTone: Tone,
  side: 'old' | 'new',
): DetailTableRowModel[] | undefined {
  const node = side === 'old' ? change.oldNode : change.newNode
  if (change.blockType !== 'table' || !node || isSection(node)) return undefined
  const rows = Array.isArray(node.children) ? node.children : []
  if (!rows.length) return undefined

  const tableDiff = change.tableDiff
  const diffCells = new Map(
    (tableDiff?.cellDiffs ?? []).map((cell) => [`${cell.row}:${cell.column}`, cell]),
  )

  if (tableDiff?.rowEdits && tableDiff.columnEdits) {
    return buildAlignedTableRows(rows, tableDiff, diffCells, side, highlightTone)
  }

  const renderedRows = rows.map((row, rowIndex) => {
    const cells = Array.isArray(row.children) ? row.children : []
    return {
      key: `table:${rowIndex}`,
      cells: cells.map((cell, cellIndex) => {
        const diffCell = diffCells.get(`${rowIndex}:${cellIndex}`)
        const segments = diffCell
          ? buildSideSegmentsFromSpans(diffCell.spans, side, highlightTone)
          : undefined
        const text = collectInlineText(cell.children)
        const tone = diffCell || tableDiff?.structureChanged ? highlightTone : 'plain'
        return {
          key: `table:${rowIndex}:${cellIndex}`,
          text,
          tone,
          segments,
        }
      }),
    }
  })

  return renderedRows.some((row) => row.cells.some((cell) => cell.tone !== 'plain'))
    ? renderedRows
    : undefined
}

function buildAlignedTableRows(
  rows: Block[],
  tableDiff: NonNullable<DiffChange['tableDiff']>,
  diffCells: Map<string, { row: number; column: number; spans: InlineSpan[] }>,
  side: 'old' | 'new',
  highlightTone: Tone,
): DetailTableRowModel[] | undefined {
  const rowEdits = tableDiff.rowEdits!
  const columnEdits = tableDiff.columnEdits!
  const isOld = side === 'old'
  const renderedRows: DetailTableRowModel[] = []

  for (const re of rowEdits) {
    if (isOld && re.op === 'insert') continue
    if (!isOld && re.op === 'delete') continue

    const rowIndex = isOld ? re.oldIndex! : re.newIndex!
    const row = rows[rowIndex]
    if (!row) continue
    const rowCells = Array.isArray(row.children) ? row.children : []
    const rowOp = re.op
    const cells: DetailTableCellModel[] = []

    for (const ce of columnEdits) {
      if (isOld && ce.op === 'insert') continue
      if (!isOld && ce.op === 'delete') continue

      const colIndex = isOld ? ce.oldIndex! : ce.newIndex!
      const cell = rowCells[colIndex]
      const text = cell ? collectInlineText(cell.children) : ''
      const columnOp = ce.op

      let segments: ProjectionSegment[] | undefined
      let tone: Tone = 'plain'

      if (re.op === 'equal' && ce.op === 'equal' && re.newIndex != null && ce.newIndex != null) {
        const diffCell = diffCells.get(`${re.newIndex}:${ce.newIndex}`)
        if (diffCell) {
          segments = buildSideSegmentsFromSpans(diffCell.spans, side, highlightTone)
          tone = highlightTone
        }
      } else if (
        re.op === 'insert' ||
        re.op === 'delete' ||
        ce.op === 'insert' ||
        ce.op === 'delete'
      ) {
        tone = highlightTone
      }

      cells.push({
        key: `table:${rowIndex}:${colIndex}`,
        text,
        tone,
        segments,
        columnOp,
      })
    }

    renderedRows.push({
      key: `table:${rowIndex}`,
      cells,
      rowOp,
    })
  }

  return renderedRows.length > 0 ? renderedRows : undefined
}

function buildOldContent(change: DiffChange): string | undefined {
  if (change.primaryOp === 'insert') return undefined
  return previewNode(change.oldNode)
}

function buildNewContent(change: DiffChange): string | undefined {
  if (change.primaryOp === 'delete') return undefined
  return previewNode(change.newNode)
}

function previewNode(node: Section | Block | undefined): string | undefined {
  if (!node) return undefined
  if (isSection(node)) return previewSection(node)
  return previewBlock(node)
}

function previewSection(section: Section): string {
  if (section.kind === 'frontmatter') return `---\n${section.frontmatterValue ?? ''}\n---`
  if (section.kind === 'heading')
    return `${'#'.repeat(section.headingDepth ?? 1)} ${section.title}`.trim()
  if (section.kind === 'listItem') return buildListItemPreview(section)
  if (section.kind === 'blockquote') return `> ${section.title}`.trim()
  if (section.kind === 'footnote') {
    const identifier = (section.heading as { identifier?: string } | undefined)?.identifier
    return identifier ? `[^${identifier}]` : section.title
  }
  return section.title
}

function previewBlock(block: Block): string {
  if (block.type === 'code') {
    const lang = typeof block.lang === 'string' ? block.lang.trim() : ''
    const meta = typeof block.meta === 'string' ? block.meta.trim() : ''
    const info = [lang, meta].filter(Boolean).join(' ')
    const opener = info ? `\`\`\`${info}` : '```'
    return `${opener}\n${String(block.value ?? '')}\n\`\`\``
  }
  if (block.type === 'definition') {
    const identifier = block.identifier ?? ''
    const url = block.url ?? ''
    const title = block.title
    return `[${identifier}]: ${url}${title ? ` "${title}"` : ''}`.trim()
  }
  if (block.type === 'table') return previewTableBlock(block)
  if (block.type === 'heading') {
    const depth = typeof block.depth === 'number' ? block.depth : 1
    return `${'#'.repeat(depth)} ${collectInlineText(block.children)}`.trim()
  }
  if (
    block.type === 'yaml' ||
    block.type === 'toml' ||
    block.type === 'html' ||
    block.type === 'math'
  ) {
    return String(block.value ?? '')
  }
  const inlineText = collectInlineText(block.children)
  if (inlineText) return inlineText
  if (typeof block.value === 'string') return block.value
  return block.type
}

function previewTableBlock(block: Block): string {
  const rows = Array.isArray(block.children) ? block.children : []
  return rows
    .map((row) => {
      const cells = Array.isArray(row.children) ? row.children : []
      return `| ${cells.map((cell) => collectInlineText(cell.children)).join(' | ')} |`
    })
    .join('\n')
}

function collectInlineText(children: Block[] | undefined): string {
  if (!children?.length) return ''
  return children
    .map((child) => {
      if (typeof child.value === 'string') return child.value
      return collectInlineText(child.children)
    })
    .filter(Boolean)
    .join('')
}

function buildListItemPreview(section: Section): string {
  const checkbox = section.checked === true ? '[x] ' : section.checked === false ? '[ ] ' : ''
  const prefix = section.ordered ? `${(section.index ?? 0) + 1}. ` : '- '
  return `${prefix}${checkbox}${section.title}`.trim()
}

function collectChangedFields(change: DiffChange, side: 'old' | 'new'): string[] {
  const fields: string[] = []
  const oldNode = change.oldNode
  const newNode = change.newNode

  if (
    newNode &&
    !isSection(newNode) &&
    change.blockType === 'definition' &&
    oldNode &&
    !isSection(oldNode)
  ) {
    const oldIdentifier = typeof oldNode.identifier === 'string' ? oldNode.identifier : ''
    const newIdentifier = typeof newNode.identifier === 'string' ? newNode.identifier : ''
    const oldUrl = typeof oldNode.url === 'string' ? oldNode.url : ''
    const newUrl = typeof newNode.url === 'string' ? newNode.url : ''
    const oldTitle = typeof oldNode.title === 'string' ? oldNode.title : ''
    const newTitle = typeof newNode.title === 'string' ? newNode.title : ''

    if (oldIdentifier !== newIdentifier) fields.push(side === 'old' ? oldIdentifier : newIdentifier)
    if (oldUrl !== newUrl) fields.push(side === 'old' ? oldUrl : newUrl)
    if (oldTitle !== newTitle) fields.push(side === 'old' ? oldTitle : newTitle)
  }

  if (
    newNode &&
    !isSection(newNode) &&
    change.blockType === 'code' &&
    oldNode &&
    !isSection(oldNode)
  ) {
    const oldLang = typeof oldNode.lang === 'string' ? oldNode.lang : ''
    const newLang = typeof newNode.lang === 'string' ? newNode.lang : ''
    const oldMeta = typeof oldNode.meta === 'string' ? oldNode.meta : ''
    const newMeta = typeof newNode.meta === 'string' ? newNode.meta : ''

    if (oldLang !== newLang) fields.push(side === 'old' ? oldLang : newLang)
    if (oldMeta !== newMeta) fields.push(side === 'old' ? oldMeta : newMeta)
  }

  if (
    newNode &&
    isSection(newNode) &&
    change.kind === 'footnote' &&
    oldNode &&
    isSection(oldNode)
  ) {
    const oldIdentifier =
      typeof oldNode.heading?.identifier === 'string' ? oldNode.heading.identifier : ''
    const newIdentifier =
      typeof newNode.heading?.identifier === 'string' ? newNode.heading.identifier : ''
    if (oldIdentifier !== newIdentifier) fields.push(side === 'old' ? oldIdentifier : newIdentifier)
  }

  return uniqueStrings(fields.filter(Boolean))
}

function collectMetadataLineRanges(
  line: string,
  metadataChange: MetadataChange,
  tone: Tone,
  side: 'old' | 'new',
): Array<{ start: number; end: number; tone: Tone }> {
  const ranges: Array<{ start: number; end: number; tone: Tone }> = []
  const key = extractMetadataKey(metadataChange.path)
  if (!key || !lineIncludesMetadata(line, key, metadataChange, side)) return ranges

  const keyIndex = line.indexOf(key)
  if (keyIndex >= 0) {
    ranges.push({
      start: keyIndex,
      end: keyIndex + key.length,
      tone,
    })
  }

  const valueText = formatMetadataValue(
    side === 'old' ? metadataChange.oldValue : metadataChange.newValue,
  )
  if (valueText && !valueText.includes('\n')) {
    const valueIndex = line.indexOf(valueText)
    if (valueIndex >= 0) {
      ranges.push({
        start: valueIndex,
        end: valueIndex + valueText.length,
        tone,
      })
    }
  }

  return ranges
}

function lineIncludesMetadata(
  line: string,
  key: string,
  change: MetadataChange,
  side: 'old' | 'new',
): boolean {
  if (line.includes(key)) return true
  const valueText = formatMetadataValue(side === 'old' ? change.oldValue : change.newValue)
  return !!(valueText && !valueText.includes('\n') && line.includes(valueText))
}

function buildFieldLineSegments(
  line: string,
  fields: string[],
  tone: Tone,
): ProjectionSegment[] | undefined {
  const ranges = fields
    .map((field) => {
      const start = line.indexOf(field)
      if (start < 0) return undefined
      return {
        start,
        end: start + field.length,
        tone,
      }
    })
    .filter((range): range is { start: number; end: number; tone: Tone } => !!range)

  if (!ranges.length) return undefined
  return buildSegmentsFromRanges(line, ranges)
}

function extractMetadataKey(path: string): string | undefined {
  const parts = path.match(/([^[.\]]+)/g)
  if (!parts?.length) return undefined
  const last = parts[parts.length - 1]
  return last === '$' ? undefined : last
}

function shouldHighlightMetadataBlock(change: MetadataChange): boolean {
  const parts = parseMetadataPath(change.path)
  return (
    parts.some((part) => /^\d+$/.test(part)) ||
    isStructuredValue(change.newValue) ||
    isStructuredValue(change.oldValue)
  )
}

function findMetadataBlockLineIndexes(lines: string[], path: string): number[] {
  const parts = parseMetadataPath(path)
  const anchorKey = [...parts].reverse().find((part) => !/^\d+$/.test(part))
  if (!anchorKey) return []

  const anchorIndex = lines.findIndex((line) => {
    const trimmed = line.trimStart()
    return trimmed.startsWith(`${anchorKey}:`)
  })
  if (anchorIndex < 0) return []

  const indexes = [anchorIndex]
  const anchorIndent = countLeadingSpaces(lines[anchorIndex] ?? '')

  for (let lineIndex = anchorIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    const trimmed = line.trim()
    if (!trimmed) {
      indexes.push(lineIndex)
      continue
    }

    const indent = countLeadingSpaces(line)
    if (indent <= anchorIndent) break
    indexes.push(lineIndex)
  }

  return indexes
}

function parseMetadataPath(path: string): string[] {
  return (path.match(/([^[.\]]+)/g) ?? []).filter((part) => part !== '$')
}

function isStructuredValue(value: unknown): boolean {
  return Array.isArray(value) || (!!value && typeof value === 'object')
}

function countLeadingSpaces(value: string): number {
  const match = value.match(/^ */)
  return match?.[0]?.length ?? 0
}

function buildMoveInfo(
  change: DiffChange,
  changeIndex?: DiffChangeIndex,
  newIndex?: SemanticIndex,
  oldIndex?: SemanticIndex,
): MoveInfo | undefined {
  if (change.primaryOp !== 'move' || !change.moveRole || !change.movePeerKey) return undefined

  const peerChange = findPeerChange(change, changeIndex)
  if (!peerChange) return undefined

  const peerRange =
    change.moveRole === 'source'
      ? peerChange.newId && newIndex
        ? newIndex.byId.get(peerChange.newId)?.sourceRange
        : undefined
      : peerChange.oldId && oldIndex
        ? oldIndex.byId.get(peerChange.oldId)?.sourceRange
        : undefined
  const peerHeading = extractMoveHeading(peerChange)

  return {
    role: change.moveRole,
    peerChangeKey: getChangeReference(peerChange),
    peerLineNumber: peerRange?.start?.line,
    peerHeading,
  }
}

function findPeerChange(change: DiffChange, changeIndex?: DiffChangeIndex): DiffChange | undefined {
  if (!changeIndex || !change.logicalMoveId) return undefined
  const peers = changeIndex.byLogicalMoveId.get(change.logicalMoveId)
  if (!peers) return undefined
  const targetRole = change.moveRole === 'source' ? 'target' : 'source'
  return peers.find((c) => c.moveRole === targetRole)
}

function extractMoveHeading(change: DiffChange): string | undefined {
  if (change.kind === 'heading' && change.newNode) {
    return (change.newNode as Section).title
  }
  if (change.kind === 'heading' && change.oldNode) {
    return (change.oldNode as Section).title
  }
  return undefined
}

function buildBacklinkInfo(
  change: DiffChange,
  oldIndex?: SemanticIndex,
  newIndex?: SemanticIndex,
): BacklinkInfo | undefined {
  const isFootnote = change.kind === 'footnote'
  const isDef = change.blockType === 'definition'
  if (!isFootnote && !isDef) return undefined

  const oldId = extractRefIdentifier(change.oldNode, isFootnote)
  const newId = extractRefIdentifier(change.newNode, isFootnote)
  if (!oldId && !newId) return undefined

  const map = isFootnote ? 'footnotes' : 'definitions'
  const oldLines = resolveBacklinkLines(oldIndex, map, oldId)
  const newLines = resolveBacklinkLines(newIndex, map, newId)
  const allLines = [...new Set([...oldLines, ...newLines])].sort((a, b) => a - b)

  return { oldIdentifier: oldId, newIdentifier: newId, affectedLines: allLines }
}

function extractRefIdentifier(
  node: Section | Block | undefined,
  isFootnote: boolean,
): string | undefined {
  if (!node) return undefined
  const raw = isFootnote ? (node as Section).heading?.identifier : (node as Block).identifier
  return typeof raw === 'string' ? normalizeId(raw) : undefined
}

function normalizeId(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function resolveBacklinkLines(
  index: SemanticIndex | undefined,
  mapKey: 'footnotes' | 'definitions',
  identifier: string | undefined,
): number[] {
  if (!index || !identifier) return []
  const holderIds = index.backlinks[mapKey].get(identifier)
  if (!holderIds) return []
  return holderIds
    .map((holderId) => index.byId.get(holderId)?.sourceRange?.start?.line)
    .filter((line): line is number => typeof line === 'number')
}
