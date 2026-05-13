import { parseMarkdown } from '@/core/parser'
import { diffMarkdownTrees, forEachChange } from '@/core/diff'
import type {
  DiffChange,
  DiffResult,
  InlineSpan,
  LineDiffSpan,
  MatchKind,
  MetadataChange,
  PrimaryOp,
  SemanticIndex,
  SourceRange,
} from '@/core/diff'
import { transformMarkdown } from '@/core/transformer'
import type { Block, Section } from '@/core/transformer'

export type Tone = 'plain' | 'insert' | 'delete' | 'replace' | 'move' | 'meta' | 'rename'
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
  segments?: ProjectionSegment[]
  changeKey?: string
  warnings: string[]
}

export interface DetailPanelModel {
  heading: string
  operation: string
  summary: string
  oldContent?: string
  newContent?: string
  inlineSegments?: ProjectionSegment[]
  codeLines?: Array<{
    key: string
    oldLine?: string
    newLine?: string
    op: LineDiffSpan['op']
    segments?: ProjectionSegment[]
  }>
  tableCells?: Array<{
    key: string
    row: number
    column: number
    segments: ProjectionSegment[]
  }>
  metadataChanges?: MetadataChange[]
  pairing?: string
  evidence?: string
  score?: string
  moveSummary?: string
  warnings: string[]
}

export interface DebugSnapshot {
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
  }>
}

const TONE_PRIORITY: Record<Tone, number> = {
  delete: 0,
  replace: 1,
  move: 2,
  insert: 3,
  meta: 4,
  rename: 5,
  plain: 6,
}

export const toneLabels: Record<Tone, string> = {
  plain: '无变更',
  insert: '新增',
  delete: '删除',
  replace: '替换',
  move: '移动',
  meta: '元数据',
  rename: '改名',
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
  if (change.pairKey) return change.pairKey
  if (change.oldId && change.newId) return `pair:${change.oldId}:${change.newId}`
  if (change.newId) return `new:${change.newId}`
  if (change.oldId) return `old:${change.oldId}`
  if (change.metadataChanges?.[0]?.path) return `meta:${change.metadataChanges[0].path}`
  return `summary:${change.summary}`
}

export function buildProjectionLines(newMarkdown: string, result: DiffResult): ProjectionLine[] {
  const lines = newMarkdown.split(/\r?\n/)
  const changes = flattenChanges(result.root)

  return lines.map((text, index) => {
    const lineNumber = index + 1
    const matched = changes
      .map((change) => {
        const range = getProjectionRange(change, result)
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
    const warnings = uniqueStrings(matched.flatMap((entry) => entry.change.warnings))

    return {
      key: `line:${lineNumber}`,
      lineNumber,
      text,
      baseTone,
      matchedTones,
      segments: dominant ? buildProjectionSegments(text, dominant.change, baseTone) : undefined,
      changeKey: dominant ? getChangeReference(dominant.change) : undefined,
      warnings,
    }
  })
}

export function buildDetailPanel(change: DiffChange | undefined): DetailPanelModel | undefined {
  if (!change) return undefined

  return {
    heading: `${entityLabel(change)} · ${operationLabel(change)}`,
    operation: operationLabel(change),
    summary: change.summary,
    oldContent: buildOldContent(change),
    newContent: buildNewContent(change),
    inlineSegments: buildInlineDetailSegments(change),
    codeLines: buildCodeLineDetails(change.codeSpans),
    tableCells: change.tableDiff?.cellDiffs.map((cell) => ({
      key: `cell:${cell.row}:${cell.column}`,
      row: cell.row,
      column: cell.column,
      segments: spansToSegments(cell.spans, 'replace'),
    })),
    metadataChanges: change.metadataChanges,
    pairing: buildPairingText(change),
    evidence: buildEvidenceText(change.matchKind),
    score: formatScore(change.score),
    moveSummary: change.logicalMoveId
      ? `${change.moveRole === 'source' ? '移动来源' : '移动目标'} · ${change.logicalMoveId}`
      : undefined,
    warnings: change.warnings,
  }
}

export function buildDebugSnapshot(result: DiffResult): DebugSnapshot {
  const changes = flattenChanges(result.root)
  return {
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

function buildInlineDetailSegments(change: DiffChange): ProjectionSegment[] | undefined {
  if (change.kind === 'heading' && change.titleInlineSpans) {
    return spansToSegments(change.titleInlineSpans, 'rename')
  }
  if (change.inlineSpans) {
    return spansToSegments(change.inlineSpans, tonesForChange(change)[0] ?? 'replace')
  }
  return undefined
}

function buildCodeLineDetails(codeSpans?: LineDiffSpan[]): DetailPanelModel['codeLines'] {
  return codeSpans?.map((line, index) => ({
    key: `code:${index}`,
    oldLine: line.oldLine,
    newLine: line.newLine,
    op: line.op,
    segments: line.charSpans
      ?.map((span) => ({
        text: span.newText ?? span.oldText ?? '',
        tone: charSpanTone(span.op),
      }))
      .filter((segment) => segment.text.length > 0),
  }))
}

function tonesForChange(change: DiffChange): Tone[] {
  const tones: Tone[] = []
  const primaryTone = primaryOpTone(change.primaryOp)
  if (primaryTone !== 'plain') tones.push(primaryTone)
  if (change.primaryOp === 'equal' && change.status.metaChanged) tones.push('meta')
  if (change.primaryOp === 'meta-update') tones.push('meta')
  if (change.status.renamed) tones.push('rename')
  if (tones.length === 0) tones.push('plain')
  return uniqueTones(tones).sort((left, right) => TONE_PRIORITY[left] - TONE_PRIORITY[right])
}

function getProjectionRange(change: DiffChange, result: DiffResult): SourceRange | undefined {
  if (change.newId) {
    const newNode = result.newIndex.byId.get(change.newId)
    if (newNode?.sourceRange) return narrowSectionRange(change, newNode.sourceRange)
  }

  return undefined
}

function narrowSectionRange(change: DiffChange, sourceRange: SourceRange): SourceRange {
  const headingRange = getHeadingRange(change.newNode)
  if (!headingRange) return sourceRange

  if (change.status.renamed) return headingRange
  if (change.primaryOp === 'meta-update' && change.entity === 'section') return headingRange
  return sourceRange
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
  if (block.type === 'code') return String(block.value ?? '')
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

function charSpanTone(op: LineDiffSpan['op']): Tone {
  if (op === 'insert') return 'insert'
  if (op === 'delete') return 'delete'
  if (op === 'replace') return 'replace'
  return 'plain'
}

function isSectionNode(node: Section | Block): node is Section {
  return 'kind' in node && Array.isArray((node as Section).items)
}

function buildPairingText(change: DiffChange): string | undefined {
  if (!change.pairKind) return undefined
  return change.pairKind === 'match' ? '稳定匹配' : '对齐匹配'
}

function buildEvidenceText(matchKind: MatchKind | undefined): string | undefined {
  if (!matchKind) return undefined
  const map: Record<MatchKind, string> = {
    'forced-root': '根节点强制匹配',
    'exact-subtree': '整棵子树完全一致',
    'exact-self': '节点自身完全一致',
    'exact-self-with-context': '节点自身一致且上下文支持',
    'exact-direct': '直接子节点结构一致',
    'frontmatter-anchor': 'frontmatter 锚点',
    'footnote-identity': '脚注正文身份',
    'footnote-identifier': '脚注标识符',
    'definition-identity': 'definition 身份',
    'definition-identifier': 'definition 标识符',
    'local-heading-slug': '局部标题 slug',
    'local-heading-body': '局部标题正文',
    'local-similarity': '局部相似度',
    'local-identity': '局部身份',
    'move-exact': '移动恢复: 完全一致',
    'move-direct': '移动恢复: 直接结构',
    'move-heading': '移动恢复: 标题路径',
    'move-code': '移动恢复: 代码特征',
  }
  return map[matchKind]
}

function formatScore(score: number | undefined): string | undefined {
  if (typeof score !== 'number') return undefined
  return `${Math.round(score * 100)}%`
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
  return '无变更'
}

function rangeSpan(range: SourceRange): number {
  const start = range.start?.line
  const end = range.end?.line
  if (!start || !end) return Number.MAX_SAFE_INTEGER
  return end - start
}

function uniqueTones(tones: Tone[]): Tone[] {
  return [...new Set(tones)]
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}
