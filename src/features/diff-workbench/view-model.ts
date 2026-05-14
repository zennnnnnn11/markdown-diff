import { parseMarkdown } from '@/core/parser'
import { diffMarkdownTrees, forEachChange } from '@/core/diff'
import type {
  DiffChange,
  DiffChangeIndex,
  DiffResult,
  InlineSpan,
  LineDiffSpan,
  MatchKind,
  MetadataChange,
  PairKind,
  PrimaryOp,
  SemanticIndex,
  SourceRange,
} from '@/core/diff'
import { transformMarkdown } from '@/core/transformer'
import type { Block, Section } from '@/core/transformer'

export type Tone = 'plain' | 'insert' | 'delete' | 'replace' | 'move' | 'meta' | 'rename' | 'reorder'
export type HighlightFilter = Tone | 'warning'

export interface ProjectionSegment {
  text: string
  tone: Tone
}

export interface ProjectionLine {
  key: string
  lineNumber: number
  text: string
  baseTone: Tone
  matchedTones: Tone[]
  changeKeys: string[]
  segments?: ProjectionSegment[]
  changeKey?: string
  pairKind?: PairKind
  warnings: string[]
}

export interface DetailMetadataItem {
  path: string
  op: MetadataChange['op']
  oldValueText?: string
  newValueText?: string
}

export interface DetailRenderedLine {
  key: string
  text: string
  tone: Tone
  segments?: ProjectionSegment[]
}

export interface DetailTableCellModel {
  key: string
  text: string
  tone: Tone
  segments?: ProjectionSegment[]
}

export interface DetailTableRowModel {
  key: string
  cells: DetailTableCellModel[]
}

export interface MoveInfo {
  role: 'source' | 'target'
  peerChangeKey: string
  peerLineNumber?: number
  peerHeading?: string
}

export interface DetailPanelModel {
  heading: string
  operation: string
  pairKind?: PairKind
  matchKind?: MatchKind
  matchKindLabel?: string
  score?: number
  oldContent?: string
  newContent?: string
  oldTitle?: string
  newTitle?: string
  newTitleSegments?: ProjectionSegment[]
  newInlineSegments?: ProjectionSegment[]
  highlightTone: Tone
  newHighlightedLines?: DetailRenderedLine[]
  codeLines?: Array<{
    key: string
    oldLine?: string
    newLine?: string
    op: LineDiffSpan['op']
    segments?: ProjectionSegment[]
  }>
  newTableRows?: DetailTableRowModel[]
  metadataChanges?: DetailMetadataItem[]
  moveInfo?: MoveInfo
}

export interface DebugSnapshot {
  quality: DiffResult['quality']
  warnings: string[]
  oldIndexSummary: Record<string, number>
  newIndexSummary: Record<string, number>
  matches: Array<{
    pairKey: string
    matchKind: MatchKind
    oldId: string
    newId: string
    score?: number
  }>
  changes: Array<{
    key: string
    summary: string
    entity: DiffChange['entity']
    primaryOp: DiffChange['primaryOp']
    pairKind?: DiffChange['pairKind']
    matchKind?: DiffChange['matchKind']
    warnings: string[]
    status: DiffChange['status']
    degraded?: boolean
    shortHeadingFallback?: boolean
  }>
}

const TONE_PRIORITY: Record<Tone, number> = {
  delete: 0,
  replace: 1,
  move: 2,
  insert: 3,
  meta: 4,
  rename: 5,
  reorder: 6,
  plain: 7,
}

export const matchKindLabels: Record<MatchKind, string> = {
  'forced-root': '根节点强制对应',
  'exact-subtree': '完整子树完全一致',
  'exact-self': '节点自身完全一致',
  'exact-self-with-context': '上下文确认匹配',
  'exact-direct': '直接子节点确认匹配',
  'frontmatter-anchor': '前置元数据锚点',
  'footnote-identity': '脚注正文完全一致',
  'footnote-identifier': '脚注标识符一致',
  'definition-identity': '引用定义内容一致',
  'definition-identifier': '引用定义标识符一致',
  'local-heading-slug': '局部标题标识匹配',
  'local-heading-body': '局部标题正文匹配',
  'local-similarity': '内容高度相似',
  'local-identity': '局部身份匹配',
  'move-exact': '移动：内容完全一致',
  'move-direct': '移动：结构直接匹配',
  'move-heading': '移动：标题匹配',
  'move-code': '移动：代码内容匹配',
}

export const toneLabels: Record<Tone, string> = {
  plain: '无变更',
  insert: '新增',
  delete: '删除',
  replace: '替换',
  move: '移动',
  meta: '元数据',
  rename: '改名',
  reorder: '重排',
}

export async function runMarkdownDiff(oldMarkdown: string, newMarkdown: string): Promise<DiffResult> {
  const [oldAst, newAst] = await Promise.all([parseMarkdown(oldMarkdown), parseMarkdown(newMarkdown)])
  const oldTree = transformMarkdown(oldAst)
  const newTree = transformMarkdown(newAst)
  return diffMarkdownTrees(oldTree, newTree)
}

export function flattenChanges(root: DiffChange): DiffChange[] {
  const changes: DiffChange[] = []
  forEachChange(root, (change) => {
    changes.push(change)
  })
  return changes
}

export function getChangeReference(change: DiffChange): string {
  if (change.pairKey) {
    if (change.moveRole && change.primaryOp === 'move') return `${change.pairKey}:${change.moveRole}`
    return change.pairKey
  }
  if (change.oldId && change.newId) return `pair:${change.oldId}:${change.newId}`
  if (change.newId) return `new:${change.newId}`
  if (change.oldId) return `old:${change.oldId}`
  if (change.metadataChanges?.[0]?.path) return `meta:${change.metadataChanges[0].path}`
  return `summary:${change.summary}`
}

export function buildProjectionLines(newMarkdown: string, result: DiffResult): ProjectionLine[] {
  return buildProjectionLinesFromMarkdown(newMarkdown, result, getProjectionRange)
}

export function buildOldProjectionLines(oldMarkdown: string, result: DiffResult): ProjectionLine[] {
  return buildProjectionLinesFromMarkdown(oldMarkdown, result, getOldProjectionRange)
}

type RangeLookup = (change: DiffChange, result: DiffResult) => SourceRange | undefined

function buildProjectionLinesFromMarkdown(
  markdown: string,
  result: DiffResult,
  getRange: RangeLookup,
): ProjectionLine[] {
  const lines = markdown.split(/\r?\n/)
  const changes = flattenChanges(result.root)

  return lines.map((text, index) => {
    const lineNumber = index + 1
    const matched = changes
      .map((change) => {
        const range = getRange(change, result)
        if (!range?.start?.line || !range?.end?.line) return undefined
        if (lineNumber < range.start.line || lineNumber > range.end.line) return undefined
        return {
          change,
          range,
          tones: tonesForChange(change),
        }
      })
      .filter((entry): entry is { change: DiffChange; range: SourceRange; tones: Tone[] } => !!entry)

    const matchedTones = uniqueTones(matched.flatMap((entry) => entry.tones))
    const dominant = pickDominantMatch(matched)
    const baseTone = dominant?.tones[0] ?? 'plain'
    const changeKeys = uniqueStrings(matched.map((entry) => getChangeReference(entry.change)))
    const warnings = uniqueStrings(matched.flatMap((entry) => entry.change.warnings))

    return {
      key: `line:${lineNumber}`,
      lineNumber,
      text,
      baseTone,
      matchedTones,
      changeKeys,
      segments: dominant ? buildProjectionSegments(text, dominant.change, baseTone) : undefined,
      changeKey: dominant ? getChangeReference(dominant.change) : undefined,
      pairKind: dominant?.change.pairKind,
      warnings,
    }
  })
}

export function buildDetailPanel(
  change: DiffChange | undefined,
  changeIndex?: DiffChangeIndex,
  newIndex?: SemanticIndex,
): DetailPanelModel | undefined {
  if (!change) return undefined

  const highlightTone = tonesForChange(change)[0] ?? 'replace'

  const isHeadingRename = change.status.renamed && change.kind === 'heading'
  const oldSection = isHeadingRename && change.oldNode && isSectionNode(change.oldNode) ? change.oldNode : undefined
  const newSection = isHeadingRename && change.newNode && isSectionNode(change.newNode) ? change.newNode : undefined
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
    newTitleSegments: stripHeadingPrefix(rawTitleSegments),
    newInlineSegments: isHeadingRename ? undefined : buildSideInlineSegments(change, 'new'),
    highlightTone,
    newHighlightedLines: buildHighlightedNewLines(change, highlightTone),
    codeLines: buildCodeLineDetails(change.codeSpans),
    newTableRows: buildTableRows(change, highlightTone),
    metadataChanges: change.metadataChanges?.map((entry) => ({
      path: entry.path,
      op: entry.op,
      oldValueText: formatMetadataValue(entry.oldValue),
      newValueText: formatMetadataValue(entry.newValue),
    })),
    moveInfo: buildMoveInfo(change, changeIndex, newIndex),
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

function pickDominantMatch(
  matched: Array<{ change: DiffChange; range: SourceRange; tones: Tone[] }>,
): { change: DiffChange; range: SourceRange; tones: Tone[] } | undefined {
  return [...matched].sort((left, right) => {
    const toneDiff = TONE_PRIORITY[left.tones[0] ?? 'plain'] - TONE_PRIORITY[right.tones[0] ?? 'plain']
    if (toneDiff !== 0) return toneDiff
    return rangeSpan(left.range) - rangeSpan(right.range)
  })[0]
}

function buildProjectionSegments(text: string, change: DiffChange, tone: Tone): ProjectionSegment[] | undefined {
  if (change.blockType === 'paragraph' && change.inlineSpans) {
    const segments = spansToSegments(change.inlineSpans, tone)
    const rendered = segments.map((segment) => segment.text).join('')
    if (rendered === text) return segments
  }

  if (change.kind === 'heading' && change.titleInlineSpans) {
    const title = spansToSegments(change.titleInlineSpans, tone)
    const prefix = headingPrefix(change)
    const rendered = `${prefix}${title.map((segment) => segment.text).join('')}`
    if (rendered === text) {
      return prefix
        ? [{ text: prefix, tone: 'plain' }, ...title]
        : title
    }
  }

  return undefined
}

function buildSideInlineSegments(
  change: DiffChange,
  side: 'old' | 'new',
): ProjectionSegment[] | undefined {
  const spans = change.kind === 'heading' ? change.titleInlineSpans : change.inlineSpans
  if (!spans?.length) return undefined

  const tone = change.kind === 'heading' ? 'rename' : tonesForChange(change)[0] ?? 'replace'
  const prefix = change.kind === 'heading' ? headingPrefix(change) : ''
  const segments: ProjectionSegment[] = []

  if (prefix) {
    segments.push({
      text: prefix,
      tone: 'plain',
    })
  }

  for (const span of spans) {
    const next = buildPreciseSideSegments(span, side, tone)
    if (next?.length) segments.push(...next)
  }

  const merged = mergeAdjacentSegments(segments)
  return merged.length > 0 ? merged : undefined
}

function stripHeadingPrefix(
  segments: ProjectionSegment[] | undefined,
): ProjectionSegment[] | undefined {
  if (!segments?.length) return segments
  const first = segments[0]
  if (!first) return segments
  if (first.tone === 'plain' && /^#+ $/.test(first.text)) {
    return segments.length === 1 ? undefined : segments.slice(1)
  }
  return segments
}

function buildCodeLineDetails(codeSpans?: LineDiffSpan[]): DetailPanelModel['codeLines'] {
  if (!codeSpans?.length) return undefined

  const lines: NonNullable<DetailPanelModel['codeLines']> = []
  for (const [index, line] of codeSpans.entries()) {
    const segments = line.charSpans
      ?.map((span) => buildNewCodeSegment(span))
      .filter((segment): segment is ProjectionSegment => !!segment)

    const newLine = line.newLine ?? segments?.map((segment) => segment.text).join('')
    if (line.op === 'delete' && !newLine) continue

    lines.push({
      key: `code:${index}`,
      oldLine: line.oldLine,
      newLine,
      op: line.op,
      segments: segments?.length ? mergeAdjacentSegments(segments) : undefined,
    })
  }

  return lines.length ? lines : undefined
}

function buildHighlightedNewLines(change: DiffChange, highlightTone: Tone): DetailRenderedLine[] | undefined {
  if (change.kind === 'frontmatter' && change.metadataChanges?.length) {
    return buildMetadataHighlightedLines(change, highlightTone)
  }

  if (change.primaryOp === 'meta-update' || change.status.metaChanged || change.status.renamed) {
    return buildFieldHighlightedLines(change, highlightTone)
  }

  return undefined
}

function buildMetadataHighlightedLines(change: DiffChange, highlightTone: Tone): DetailRenderedLine[] | undefined {
  const newContent = buildNewContent(change)
  if (!newContent || !change.metadataChanges?.length) return undefined

  const lines = newContent.split('\n')
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
      lineRanges[lineIndex]!.push(...collectMetadataLineRanges(line, metadataChange, highlightTone))
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

function buildFieldHighlightedLines(change: DiffChange, highlightTone: Tone): DetailRenderedLine[] | undefined {
  const newContent = buildNewContent(change)
  if (!newContent) return undefined

  const fields = collectChangedFields(change)
  if (!fields.length) return undefined

  const highlighted = newContent.split('\n').map((line, index) => {
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

function buildTableRows(change: DiffChange, highlightTone: Tone): DetailTableRowModel[] | undefined {
  if (change.blockType !== 'table' || !change.newNode || isSectionNode(change.newNode)) return undefined
  const rows = Array.isArray(change.newNode.children) ? change.newNode.children : []
  if (!rows.length) return undefined

  const diffCells = new Map(
    (change.tableDiff?.cellDiffs ?? []).map((cell) => [`${cell.row}:${cell.column}`, cell]),
  )

  const renderedRows = rows.map((row, rowIndex) => {
    const cells = Array.isArray(row.children) ? row.children : []
    return {
      key: `table:${rowIndex}`,
      cells: cells.map((cell, cellIndex) => {
        const diffCell = diffCells.get(`${rowIndex}:${cellIndex}`)
        const segments = diffCell
          ? buildSideSegmentsFromSpans(diffCell.spans, 'new', highlightTone)
          : undefined
        const text = collectInlineText(cell.children)
        const tone = diffCell || change.tableDiff?.structureChanged ? highlightTone : 'plain'
        return {
          key: `table:${rowIndex}:${cellIndex}`,
          text,
          tone,
          segments,
        }
      }),
    }
  })

  return renderedRows.some((row) => row.cells.some((cell) => cell.tone !== 'plain')) ? renderedRows : undefined
}

function tonesForChange(change: DiffChange): Tone[] {
  const tones: Tone[] = []
  const primaryTone = primaryOpTone(change.primaryOp)
  if (primaryTone !== 'plain') tones.push(primaryTone)
  if (change.primaryOp === 'equal' && change.status.metaChanged) tones.push('meta')
  if (change.primaryOp === 'meta-update') tones.push('meta')
  if (change.status.renamed) tones.push('rename')
  if (change.status.movedWithinParent || change.reordered) tones.push('reorder')
  if (tones.length === 0) tones.push('plain')
  return uniqueTones(tones).sort((left, right) => TONE_PRIORITY[left] - TONE_PRIORITY[right])
}

function getProjectionRange(change: DiffChange, result: DiffResult): SourceRange | undefined {
  if (change.newId) {
    const newNode = result.newIndex.byId.get(change.newId)
    if (newNode?.sourceRange) return narrowSectionRange(change, newNode.sourceRange, change.newNode)
  }

  return undefined
}

function narrowSectionRange(change: DiffChange, sourceRange: SourceRange, node?: Section | Block): SourceRange {
  const headingRange = getHeadingRange(node)
  if (!headingRange) return sourceRange

  if (change.status.renamed) return headingRange
  if (change.primaryOp === 'meta-update' && change.entity === 'section') return headingRange
  return sourceRange
}

function getOldProjectionRange(change: DiffChange, result: DiffResult): SourceRange | undefined {
  if (change.oldId) {
    const oldNode = result.oldIndex.byId.get(change.oldId)
    if (oldNode?.sourceRange) return narrowSectionRange(change, oldNode.sourceRange, change.oldNode)
  }

  return undefined
}

function getHeadingRange(node: Section | Block | undefined): SourceRange | undefined {
  if (!node || !isSectionNode(node) || !node.heading) return undefined
  const position = (node.heading as Block & { position?: { start?: SourceRange['start']; end?: SourceRange['end'] } })
    .position
  if (!position) return undefined
  return {
    start: position.start,
    end: position.end,
  }
}

function primaryOpTone(op: PrimaryOp): Tone {
  if (op === 'insert') return 'insert'
  if (op === 'delete') return 'delete'
  if (op === 'replace') return 'replace'
  if (op === 'move') return 'move'
  if (op === 'meta-update') return 'meta'
  return 'plain'
}

function spansToSegments(spans: InlineSpan[], changeTone: Tone): ProjectionSegment[] {
  const segments: ProjectionSegment[] = []

  for (const span of spans) {
    if (span.wordSpans?.length) {
      for (const wordSpan of span.wordSpans) {
        const text = wordSpan.newText ?? wordSpan.oldText ?? ''
        if (!text) continue
        segments.push({
          text,
          tone: wordSpan.op === 'equal' ? 'plain' : wordSpan.op === 'insert' ? 'insert' : wordSpan.op === 'delete' ? 'delete' : changeTone,
        })
      }
      continue
    }

    const text = span.newText ?? span.oldText ?? ''
    if (!text) continue
    segments.push({
      text,
      tone: span.op === 'equal' ? 'plain' : span.op === 'insert' ? 'insert' : span.op === 'delete' ? 'delete' : changeTone,
    })
  }

  return mergeAdjacentSegments(segments)
}

function mergeAdjacentSegments(segments: ProjectionSegment[]): ProjectionSegment[] {
  const merged: ProjectionSegment[] = []
  for (const segment of segments) {
    const previous = merged[merged.length - 1]
    if (previous && previous.tone === segment.tone) {
      previous.text += segment.text
      continue
    }
    merged.push({ ...segment })
  }
  return merged
}

function headingPrefix(change: DiffChange): string {
  const depth = getHeadingDepth(change.newNode) ?? getHeadingDepth(change.oldNode)
  return depth ? `${'#'.repeat(depth)} ` : ''
}

function getHeadingDepth(node: Section | Block | undefined): number | undefined {
  if (!node) return undefined
  if (isSectionNode(node)) return node.headingDepth
  return typeof node.depth === 'number' ? node.depth : undefined
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
  if (isSectionNode(node)) return previewSection(node)
  return previewBlock(node)
}

function previewSection(section: Section): string {
  if (section.kind === 'frontmatter') return `---\n${section.frontmatterValue ?? ''}\n---`
  if (section.kind === 'heading') return `${'#'.repeat(section.headingDepth ?? 1)} ${section.title}`.trim()
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
    const identifier = (block as { identifier?: string }).identifier ?? ''
    const url = (block as { url?: string }).url ?? ''
    const title = (block as { title?: string }).title
    return `[${identifier}]: ${url}${title ? ` "${title}"` : ''}`.trim()
  }
  if (block.type === 'table') return previewTableBlock(block)
  if (block.type === 'heading') {
    const depth = typeof block.depth === 'number' ? block.depth : 1
    return `${'#'.repeat(depth)} ${collectInlineText(block.children)}`.trim()
  }
  if (block.type === 'yaml' || block.type === 'toml' || block.type === 'html' || block.type === 'math') {
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
  const checkbox =
    section.checked === true ? '[x] ' : section.checked === false ? '[ ] ' : ''
  const prefix = section.ordered ? `${(section.index ?? 0) + 1}. ` : '- '
  return `${prefix}${checkbox}${section.title}`.trim()
}

function buildNewCodeSegment(
  span: NonNullable<LineDiffSpan['charSpans']>[number],
): ProjectionSegment | undefined {
  if (span.op === 'equal') {
    const text = span.newText ?? span.oldText ?? ''
    return text ? { text, tone: 'plain' } : undefined
  }
  if (span.op === 'insert') {
    return span.newText ? { text: span.newText, tone: 'insert' } : undefined
  }
  if (span.op === 'delete') {
    return undefined
  }
  return span.newText ? { text: span.newText, tone: 'replace' } : undefined
}

function buildSideWordSegment(
  span: NonNullable<InlineSpan['wordSpans']>[number],
  side: 'old' | 'new',
  tone: Tone,
): ProjectionSegment | undefined {
  if (span.op === 'equal') {
    const text = side === 'old' ? (span.oldText ?? span.newText ?? '') : (span.newText ?? span.oldText ?? '')
    return text ? { text, tone: 'plain' } : undefined
  }

  if (span.op === 'insert') {
    if (side === 'old') return undefined
    return span.newText ? { text: span.newText, tone: 'insert' } : undefined
  }

  if (span.op === 'delete') {
    if (side === 'new') return undefined
    return span.oldText ? { text: span.oldText, tone: 'delete' } : undefined
  }

  if (side === 'old') {
    return span.oldText ? { text: span.oldText, tone: 'delete' } : undefined
  }
  return span.newText ? { text: span.newText, tone } : undefined
}

function buildPreciseSideSegments(
  span: InlineSpan,
  side: 'old' | 'new',
  tone: Tone,
): ProjectionSegment[] | undefined {
  const sourceText = side === 'old' ? span.oldText : span.newText
  if (sourceText && span.wordSpans?.length) {
    const precise = buildPreciseWordSegments(sourceText, span.wordSpans, side, tone)
    if (precise?.length) return precise
  }

  const fallback = buildSideSpanSegment(span, side, tone)
  return fallback ? [fallback] : undefined
}

function buildPreciseWordSegments(
  sourceText: string,
  wordSpans: NonNullable<InlineSpan['wordSpans']>,
  side: 'old' | 'new',
  tone: Tone,
): ProjectionSegment[] | undefined {
  const segments: ProjectionSegment[] = []
  const loweredSource = sourceText.toLowerCase()
  let cursor = 0

  for (const wordSpan of wordSpans) {
    const next = buildSideWordSegment(wordSpan, side, tone)
    if (!next?.text) continue

    const matchIndex = loweredSource.indexOf(next.text.toLowerCase(), cursor)
    if (matchIndex < 0) return undefined

    if (matchIndex > cursor) {
      segments.push({
        text: sourceText.slice(cursor, matchIndex),
        tone: 'plain',
      })
    }

    segments.push({
      text: sourceText.slice(matchIndex, matchIndex + next.text.length),
      tone: next.tone,
    })
    cursor = matchIndex + next.text.length
  }

  if (cursor < sourceText.length) {
    segments.push({
      text: sourceText.slice(cursor),
      tone: 'plain',
    })
  }

  const merged = mergeAdjacentSegments(segments.filter((segment) => segment.text.length > 0))
  return merged.length > 0 ? merged : undefined
}

function buildSideSpanSegment(
  span: InlineSpan,
  side: 'old' | 'new',
  tone: Tone,
): ProjectionSegment | undefined {
  if (span.op === 'equal') {
    const text = side === 'old' ? (span.oldText ?? span.newText ?? '') : (span.newText ?? span.oldText ?? '')
    return text ? { text, tone: 'plain' } : undefined
  }

  if (span.op === 'insert') {
    if (side === 'old') return undefined
    return span.newText ? { text: span.newText, tone: 'insert' } : undefined
  }

  if (span.op === 'delete') {
    if (side === 'new') return undefined
    return span.oldText ? { text: span.oldText, tone: 'delete' } : undefined
  }

  if (side === 'old') {
    return span.oldText ? { text: span.oldText, tone: 'delete' } : undefined
  }
  return span.newText ? { text: span.newText, tone } : undefined
}

function buildSideSegmentsFromSpans(
  spans: InlineSpan[],
  side: 'old' | 'new',
  tone: Tone,
): ProjectionSegment[] | undefined {
  const segments: ProjectionSegment[] = []
  for (const span of spans) {
    const next = buildPreciseSideSegments(span, side, tone)
    if (next?.length) segments.push(...next)
  }

  const merged = mergeAdjacentSegments(segments)
  return merged.length > 0 ? merged : undefined
}

function isSectionNode(node: Section | Block): node is Section {
  return 'kind' in node && Array.isArray((node as Section).items)
}

function formatMetadataValue(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function collectMetadataLineRanges(
  line: string,
  metadataChange: MetadataChange,
  tone: Tone,
): Array<{ start: number; end: number; tone: Tone }> {
  const ranges: Array<{ start: number; end: number; tone: Tone }> = []
  const key = extractMetadataKey(metadataChange.path)
  if (!key || !lineIncludesMetadata(line, key, metadataChange)) return ranges

  const keyIndex = line.indexOf(key)
  if (keyIndex >= 0) {
    ranges.push({
      start: keyIndex,
      end: keyIndex + key.length,
      tone,
    })
  }

  const newValueText = formatMetadataValue(metadataChange.newValue)
  if (newValueText && !newValueText.includes('\n')) {
    const valueIndex = line.indexOf(newValueText)
    if (valueIndex >= 0) {
      ranges.push({
        start: valueIndex,
        end: valueIndex + newValueText.length,
        tone,
      })
    }
  }

  return ranges
}

function lineIncludesMetadata(line: string, key: string, change: MetadataChange): boolean {
  if (line.includes(key)) return true
  const newValueText = formatMetadataValue(change.newValue)
  return !!(newValueText && !newValueText.includes('\n') && line.includes(newValueText))
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

function collectChangedFields(change: DiffChange): string[] {
  const fields: string[] = []
  const oldNode = change.oldNode
  const newNode = change.newNode

  if (newNode && !isSectionNode(newNode) && change.blockType === 'definition' && oldNode && !isSectionNode(oldNode)) {
    const oldIdentifier = typeof oldNode.identifier === 'string' ? oldNode.identifier : ''
    const newIdentifier = typeof newNode.identifier === 'string' ? newNode.identifier : ''
    const oldUrl = typeof oldNode.url === 'string' ? oldNode.url : ''
    const newUrl = typeof newNode.url === 'string' ? newNode.url : ''
    const oldTitle = typeof oldNode.title === 'string' ? oldNode.title : ''
    const newTitle = typeof newNode.title === 'string' ? newNode.title : ''

    if (newIdentifier && oldIdentifier !== newIdentifier) fields.push(newIdentifier)
    if (newUrl && oldUrl !== newUrl) fields.push(newUrl)
    if (newTitle && oldTitle !== newTitle) fields.push(newTitle)
  }

  if (newNode && !isSectionNode(newNode) && change.blockType === 'code' && oldNode && !isSectionNode(oldNode)) {
    const oldLang = typeof oldNode.lang === 'string' ? oldNode.lang : ''
    const newLang = typeof newNode.lang === 'string' ? newNode.lang : ''
    const oldMeta = typeof oldNode.meta === 'string' ? oldNode.meta : ''
    const newMeta = typeof newNode.meta === 'string' ? newNode.meta : ''

    if (newLang && oldLang !== newLang) fields.push(newLang)
    if (newMeta && oldMeta !== newMeta) fields.push(newMeta)
  }

  if (newNode && isSectionNode(newNode) && change.kind === 'footnote' && oldNode && isSectionNode(oldNode)) {
    const oldIdentifier = typeof oldNode.heading?.identifier === 'string' ? oldNode.heading.identifier : ''
    const newIdentifier = typeof newNode.heading?.identifier === 'string' ? newNode.heading.identifier : ''
    if (newIdentifier && oldIdentifier !== newIdentifier) fields.push(newIdentifier)
  }

  return uniqueStrings(fields)
}

function extractMetadataKey(path: string): string | undefined {
  const parts = path.match(/([^[.\]]+)/g)
  if (!parts?.length) return undefined
  const last = parts[parts.length - 1]
  return last === '$' ? undefined : last
}

function buildSegmentsFromRanges(
  text: string,
  ranges: Array<{ start: number; end: number; tone: Tone }>,
): ProjectionSegment[] | undefined {
  const sorted = [...ranges]
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)

  if (!sorted.length) return undefined

  const mergedRanges: Array<{ start: number; end: number; tone: Tone }> = []
  for (const range of sorted) {
    const previous = mergedRanges[mergedRanges.length - 1]
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
      continue
    }
    mergedRanges.push({ ...range })
  }

  const segments: ProjectionSegment[] = []
  let cursor = 0

  for (const range of mergedRanges) {
    if (range.start > cursor) {
      segments.push({
        text: text.slice(cursor, range.start),
        tone: 'plain',
      })
    }

    segments.push({
      text: text.slice(range.start, range.end),
      tone: range.tone,
    })
    cursor = range.end
  }

  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      tone: 'plain',
    })
  }

  return mergeAdjacentSegments(segments.filter((segment) => segment.text.length > 0))
}

function shouldHighlightMetadataBlock(change: MetadataChange): boolean {
  const parts = parseMetadataPath(change.path)
  return parts.some((part) => /^\d+$/.test(part)) || isStructuredValue(change.newValue) || isStructuredValue(change.oldValue)
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

function entityLabel(change: DiffChange): string {
  if (change.entity === 'metadata') return '元数据'
  if (change.kind === 'heading') return '标题'
  if (change.kind === 'frontmatter') return 'Frontmatter'
  if (change.kind === 'listItem') return '列表项'
  if (change.kind === 'blockquote') return '引用块'
  if (change.kind === 'footnote') return '脚注'
  if (change.blockType === 'paragraph') return '段落'
  if (change.blockType === 'code') return '代码块'
  if (change.blockType === 'table') return '表格'
  if (change.blockType === 'definition') return '引用定义'
  return change.entity === 'section' ? 'Section' : 'Block'
}

function operationLabel(change: DiffChange): string {
  if (change.status.renamed && change.primaryOp === 'equal') return '改名'
  if (change.primaryOp === 'insert') return '新增'
  if (change.primaryOp === 'delete') return '删除'
  if (change.primaryOp === 'replace') return '替换'
  if (change.primaryOp === 'move') return '移动'
  if (change.primaryOp === 'meta-update') return '元数据更新'
  if (change.status.metaChanged) return '元数据更新'
  if (change.status.movedWithinParent || change.reordered) return '重排'
  return '无变更'
}

function rangeSpan(range: SourceRange): number {
  const start = range.start?.line
  const end = range.end?.line
  if (!start || !end) return Number.MAX_SAFE_INTEGER
  return end - start
}

function buildMoveInfo(
  change: DiffChange,
  changeIndex?: DiffChangeIndex,
  newIndex?: SemanticIndex,
): MoveInfo | undefined {
  if (change.primaryOp !== 'move' || !change.moveRole || !change.movePeerKey) return undefined

  const peerChange = findPeerChange(change, changeIndex)
  if (!peerChange) return undefined

  const peerRange =
    peerChange.newId && newIndex
      ? newIndex.byId.get(peerChange.newId)?.sourceRange
      : undefined
  const peerHeading = extractMoveHeading(peerChange)

  return {
    role: change.moveRole,
    peerChangeKey: getChangeReference(peerChange),
    peerLineNumber: peerRange?.start?.line,
    peerHeading,
  }
}

function findPeerChange(
  change: DiffChange,
  changeIndex?: DiffChangeIndex,
): DiffChange | undefined {
  if (!changeIndex || !change.logicalMoveId) return undefined

  if (change.moveRole === 'source') {
    return [...changeIndex.byNewId.values()].find(
      (c) => c.logicalMoveId === change.logicalMoveId && c.moveRole === 'target',
    )
  }
  return [...changeIndex.byOldId.values()].find(
    (c) => c.logicalMoveId === change.logicalMoveId && c.moveRole === 'source',
  )
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

function uniqueTones(tones: Tone[]): Tone[] {
  return [...new Set(tones)]
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}
