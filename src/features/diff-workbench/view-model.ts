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

export interface MergedRow {
  oldLine: ProjectionLine | null
  newLine: ProjectionLine | null
}

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
  alignmentKey?: string
  pairKind?: PairKind
  hasDescendantChange?: boolean
  warnings: string[]
  annotations: ProjectionAnnotation[]
  lineMatches: ProjectionLineMatch[]
  changeTooltip?: string
  movePeerLineNumber?: number
}

export interface ProjectionAnnotation {
  kind: 'tone' | 'warning' | 'overlap'
  label: string
  tone?: Tone
}

export interface ProjectionLineMatch {
  changeKey: string
  tone: Tone
  pairKind?: PairKind
  summary: string
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

export interface BacklinkInfo {
  oldIdentifier?: string
  newIdentifier?: string
  affectedLines: number[]
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
  oldInlineSegments?: ProjectionSegment[]
  newTitleSegments?: ProjectionSegment[]
  newInlineSegments?: ProjectionSegment[]
  highlightTone: Tone
  oldHighlightedLines?: DetailRenderedLine[]
  newHighlightedLines?: DetailRenderedLine[]
  oldCodeLines?: Array<{
    key: string
    oldLine?: string
    newLine?: string
    op: LineDiffSpan['op']
    segments?: ProjectionSegment[]
  }>
  codeLines?: Array<{
    key: string
    oldLine?: string
    newLine?: string
    op: LineDiffSpan['op']
    segments?: ProjectionSegment[]
  }>
  oldTableRows?: DetailTableRowModel[]
  newTableRows?: DetailTableRowModel[]
  metadataChanges?: DetailMetadataItem[]
  moveInfo?: MoveInfo
  backlinkInfo?: BacklinkInfo
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

const WARNING_LABELS: Record<string, string> = {
  'inline-deferred': '内容过长，已降级为区域级高亮。',
  'subtree-budget-exceeded': '结构过大，已使用简化对齐。',
  'local-window-exceeded': '局部区域过大，已使用简化对齐。',
  'enhanced-local-recovery-budget-exceeded': '局部恢复预算不足，已跳过增强恢复。',
  'enhanced-local-recovery-no-candidates': '未找到可靠的局部恢复候选。',
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

export function getAlignmentReference(change: DiffChange): string {
  if (change.primaryOp === 'move') {
    return change.logicalMoveId ?? change.movePeerKey ?? getChangeReference(change)
  }
  return getChangeReference(change)
}

export function buildProjectionLines(newMarkdown: string, result: DiffResult): ProjectionLine[] {
  return buildProjectionLinesFromMarkdown(newMarkdown, result, getProjectionRange, 'new')
}

export function buildOldProjectionLines(oldMarkdown: string, result: DiffResult): ProjectionLine[] {
  return buildProjectionLinesFromMarkdown(oldMarkdown, result, getOldProjectionRange, 'old')
}

type RangeLookup = (change: DiffChange, result: DiffResult) => SourceRange | undefined

function buildProjectionLinesFromMarkdown(
  markdown: string,
  result: DiffResult,
  getRange: RangeLookup,
  side: 'old' | 'new',
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
    const lineMatches = matched.map(({ change, tones }) => ({
      changeKey: getChangeReference(change),
      tone: tones[0] ?? 'plain',
      pairKind: change.pairKind,
      summary: `${entityLabel(change)} · ${operationLabel(change)}`,
    }))

    return {
      key: `line:${lineNumber}`,
      lineNumber,
      text,
      baseTone,
      matchedTones,
      changeKeys,
      segments: dominant ? buildProjectionSegments(text, dominant.change, side) : undefined,
      changeKey: dominant ? getChangeReference(dominant.change) : undefined,
      alignmentKey: dominant ? getAlignmentReference(dominant.change) : undefined,
      pairKind: dominant?.change.pairKind,
      hasDescendantChange:
        dominant?.change.status.descendantChanged && !dominant?.change.status.selfChanged,
      warnings,
      annotations: buildProjectionAnnotations(matchedTones, warnings, changeKeys.length),
      lineMatches,
      changeTooltip: dominant && dominant.tones[0] !== 'plain'
        ? dominant.change.summary
        : undefined,
      movePeerLineNumber: dominant?.change.primaryOp === 'move'
        ? resolvePeerLineNumber(dominant.change, result)
        : undefined,
    }
  })
}

export function buildMergedRows(
  oldMarkdown: string,
  newMarkdown: string,
  result: DiffResult,
): MergedRow[] {
  const oldLines = buildOldProjectionLines(oldMarkdown, result)
  const newLines = buildProjectionLines(newMarkdown, result)
  const oldBlocks = buildProjectionBlocks(oldLines, 'old')
  const newBlocks = buildProjectionBlocks(newLines, 'new')
  const consumedOld = new Set<number>()
  const mergedBlocks: Array<{ oldBlock?: ProjectionBlock; newBlock?: ProjectionBlock }> = []

  for (const newBlock of newBlocks) {
    if (newBlock.mode === 'pair' && newBlock.anchorKey) {
      const oldIndex = oldBlocks.findIndex(
        (candidate, index) =>
          !consumedOld.has(index) &&
          candidate.mode === 'pair' &&
          candidate.anchorKey === newBlock.anchorKey,
      )
      if (oldIndex >= 0) {
        consumedOld.add(oldIndex)
        mergedBlocks.push({ oldBlock: oldBlocks[oldIndex], newBlock })
        continue
      }
    } else if (newBlock.mode === 'plain') {
      const oldIndex = oldBlocks.findIndex(
        (candidate, index) => !consumedOld.has(index) && candidate.mode === 'plain',
      )
      if (oldIndex >= 0) {
        consumedOld.add(oldIndex)
        mergedBlocks.push({ oldBlock: oldBlocks[oldIndex], newBlock })
        continue
      }
    }
    mergedBlocks.push({ newBlock })
  }

  for (const [oldIndex, oldBlock] of oldBlocks.entries()) {
    if (consumedOld.has(oldIndex)) continue
    const insertionIndex = findInsertionIndexForOldBlock(oldBlocks, oldIndex, mergedBlocks)
    mergedBlocks.splice(insertionIndex, 0, { oldBlock })
  }

  return mergedBlocks.flatMap(({ oldBlock, newBlock }) => alignBlockRows(oldBlock, newBlock))
}

interface ProjectionBlock {
  side: 'old' | 'new'
  lines: ProjectionLine[]
  anchorKey?: string
  mode: 'pair' | 'plain' | 'old-only' | 'new-only'
  groupKey: string
}

function buildProjectionBlocks(
  lines: ProjectionLine[],
  side: 'old' | 'new',
): ProjectionBlock[] {
  const blocks: ProjectionBlock[] = []

  for (const line of lines) {
    const mode = blockMode(line, side)
    const anchorKey = blockAnchorKey(line)
    const groupKey = anchorKey
      ? `${mode}:anchor:${anchorKey}:${line.baseTone}:${line.pairKind ?? 'none'}`
      : `${mode}:plain:${line.baseTone}:${line.warnings.join('|')}:${line.hasDescendantChange ? 'desc' : 'self'}`
    const previous = blocks[blocks.length - 1]

    if (previous && previous.groupKey === groupKey) {
      previous.lines.push(line)
      continue
    }

    blocks.push({
      side,
      lines: [line],
      anchorKey,
      mode,
      groupKey,
    })
  }

  return blocks
}

function blockAnchorKey(line: ProjectionLine): string | undefined {
  if (!line.alignmentKey || line.alignmentKey === 'match:root:root') return undefined
  if (line.baseTone === 'move' || line.baseTone === 'reorder') return undefined
  if (line.baseTone === 'plain' && !line.pairKind && !line.hasDescendantChange && line.warnings.length === 0) {
    return undefined
  }
  return line.alignmentKey
}

function blockMode(line: ProjectionLine, side: 'old' | 'new'): ProjectionBlock['mode'] {
  if (side === 'old' && (line.baseTone === 'delete' || line.baseTone === 'move' || line.baseTone === 'reorder')) {
    return 'old-only'
  }
  if (side === 'new' && (line.baseTone === 'insert' || line.baseTone === 'move' || line.baseTone === 'reorder')) {
    return 'new-only'
  }
  if (blockAnchorKey(line)) return 'pair'
  return 'plain'
}

function findInsertionIndexForOldBlock(
  oldBlocks: ProjectionBlock[],
  oldIndex: number,
  mergedBlocks: Array<{ oldBlock?: ProjectionBlock; newBlock?: ProjectionBlock }>,
): number {
  for (let index = oldIndex + 1; index < oldBlocks.length; index++) {
    const nextAnchorKey = oldBlocks[index]?.anchorKey
    if (!nextAnchorKey) continue
    const mergedIndex = mergedBlocks.findIndex((entry) => entry.oldBlock?.anchorKey === nextAnchorKey)
    if (mergedIndex >= 0) return mergedIndex
  }
  return mergedBlocks.length
}

function alignBlockRows(
  oldBlock?: ProjectionBlock,
  newBlock?: ProjectionBlock,
): MergedRow[] {
  if (!oldBlock) return newBlock?.lines.map((line) => ({ oldLine: null, newLine: line })) ?? []
  if (!newBlock) return oldBlock.lines.map((line) => ({ oldLine: line, newLine: null }))

  const oldLines = oldBlock.lines
  const newLines = newBlock.lines
  if (oldLines.length === newLines.length) {
    return oldLines.map((oldLine, index) => ({ oldLine, newLine: newLines[index] ?? null }))
  }

  const matches = computeLineMatches(oldLines, newLines)
  if (matches.length === 0) {
    return zipWithResiduals(oldLines, newLines)
  }

  const merged: MergedRow[] = []
  let oldIndex = 0
  let newIndex = 0

  for (const [matchedOldIndex, matchedNewIndex] of matches) {
    while (oldIndex < matchedOldIndex && newIndex < matchedNewIndex) {
      merged.push({ oldLine: oldLines[oldIndex] ?? null, newLine: newLines[newIndex] ?? null })
      oldIndex += 1
      newIndex += 1
    }
    while (oldIndex < matchedOldIndex) {
      merged.push({ oldLine: oldLines[oldIndex] ?? null, newLine: null })
      oldIndex += 1
    }
    while (newIndex < matchedNewIndex) {
      merged.push({ oldLine: null, newLine: newLines[newIndex] ?? null })
      newIndex += 1
    }
    merged.push({ oldLine: oldLines[matchedOldIndex] ?? null, newLine: newLines[matchedNewIndex] ?? null })
    oldIndex = matchedOldIndex + 1
    newIndex = matchedNewIndex + 1
  }

  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    merged.push({ oldLine: oldLines[oldIndex] ?? null, newLine: newLines[newIndex] ?? null })
    oldIndex += 1
    newIndex += 1
  }
  while (oldIndex < oldLines.length) {
    merged.push({ oldLine: oldLines[oldIndex] ?? null, newLine: null })
    oldIndex += 1
  }
  while (newIndex < newLines.length) {
    merged.push({ oldLine: null, newLine: newLines[newIndex] ?? null })
    newIndex += 1
  }

  return merged
}

function zipWithResiduals(oldLines: ProjectionLine[], newLines: ProjectionLine[]): MergedRow[] {
  const rows: MergedRow[] = []
  const length = Math.max(oldLines.length, newLines.length)
  for (let index = 0; index < length; index++) {
    rows.push({
      oldLine: oldLines[index] ?? null,
      newLine: newLines[index] ?? null,
    })
  }
  return rows
}

function computeLineMatches(
  oldLines: ProjectionLine[],
  newLines: ProjectionLine[],
): Array<[number, number]> {
  const signaturesOld = oldLines.map(lineAlignmentSignature)
  const signaturesNew = newLines.map(lineAlignmentSignature)
  const dp = Array.from({ length: oldLines.length + 1 }, () =>
    Array.from({ length: newLines.length + 1 }, () => 0),
  )

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      if (signaturesOld[oldIndex] === signaturesNew[newIndex]) {
        dp[oldIndex]![newIndex] = (dp[oldIndex + 1]?.[newIndex + 1] ?? 0) + 1
      } else {
        dp[oldIndex]![newIndex] = Math.max(
          dp[oldIndex + 1]?.[newIndex] ?? 0,
          dp[oldIndex]?.[newIndex + 1] ?? 0,
        )
      }
    }
  }

  const matches: Array<[number, number]> = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (signaturesOld[oldIndex] === signaturesNew[newIndex]) {
      matches.push([oldIndex, newIndex])
      oldIndex += 1
      newIndex += 1
      continue
    }

    if ((dp[oldIndex + 1]?.[newIndex] ?? 0) >= (dp[oldIndex]?.[newIndex + 1] ?? 0)) {
      oldIndex += 1
    } else {
      newIndex += 1
    }
  }

  return matches
}

function lineAlignmentSignature(line: ProjectionLine): string {
  const normalizedText = line.text.trim().replace(/\s+/g, ' ')
  const blankFlag = line.text.trim().length === 0 ? 'blank' : 'content'
  return `${blankFlag}:${line.baseTone}:${normalizedText}`
}

export function buildDetailPanel(
  change: DiffChange | undefined,
  changeIndex?: DiffChangeIndex,
  newIndex?: SemanticIndex,
  oldIndex?: SemanticIndex,
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

export function formatWarningLabel(code: string): string {
  if (WARNING_LABELS[code]) return WARNING_LABELS[code]
  if (code.startsWith('invalid-')) return `检测到内部一致性异常：${code}`
  return `存在差异质量提示：${code}`
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

function buildProjectionSegments(
  text: string,
  change: DiffChange,
  side: 'old' | 'new',
): ProjectionSegment[] | undefined {
  const tone = tonesForChange(change)[0] ?? 'replace'

  if (change.blockType === 'paragraph' && change.inlineSpans) {
    const segments = buildSideSegmentsFromSpans(change.inlineSpans, side, tone)
    const rendered = segments?.map((segment) => segment.text).join('')
    if (segments && rendered === text) return segments
  }

  if (change.kind === 'heading' && change.titleInlineSpans) {
    const title = buildSideSegmentsFromSpans(change.titleInlineSpans, side, 'rename')
    const prefix = headingPrefix(change)
    const rendered = `${prefix}${title?.map((segment) => segment.text).join('') ?? ''}`
    if (title?.length && rendered === text) {
      return prefix
        ? [{ text: prefix, tone: 'plain' }, ...title]
        : title
    }
  }

  return undefined
}

function buildProjectionAnnotations(
  matchedTones: Tone[],
  warnings: string[],
  changeCount: number,
): ProjectionAnnotation[] {
  const annotations: ProjectionAnnotation[] = matchedTones
    .filter((tone) => tone !== 'plain')
    .map((tone) => ({
      kind: 'tone',
      label: toneLabels[tone],
      tone,
    }))

  if (changeCount > 1) {
    annotations.push({
      kind: 'overlap',
      label: `命中 ${changeCount} 个变更`,
    })
  }

  for (const warning of warnings) {
    annotations.push({
      kind: 'warning',
      label: formatWarningLabel(warning),
    })
  }

  return annotations
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

function buildHighlightedNewLines(change: DiffChange, highlightTone: Tone): DetailRenderedLine[] | undefined {
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
  if (change.blockType !== 'table' || !node || isSectionNode(node)) return undefined
  const rows = Array.isArray(node.children) ? node.children : []
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
          ? buildSideSegmentsFromSpans(diffCell.spans, side, highlightTone)
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

function buildCodeSegment(
  span: NonNullable<LineDiffSpan['charSpans']>[number],
  side: 'old' | 'new',
  replaceTone: Tone,
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
  return span.newText ? { text: span.newText, tone: replaceTone } : undefined
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

  const valueText = formatMetadataValue(side === 'old' ? metadataChange.oldValue : metadataChange.newValue)
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

function collectChangedFields(change: DiffChange, side: 'old' | 'new'): string[] {
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

    if (oldIdentifier !== newIdentifier) fields.push(side === 'old' ? oldIdentifier : newIdentifier)
    if (oldUrl !== newUrl) fields.push(side === 'old' ? oldUrl : newUrl)
    if (oldTitle !== newTitle) fields.push(side === 'old' ? oldTitle : newTitle)
  }

  if (newNode && !isSectionNode(newNode) && change.blockType === 'code' && oldNode && !isSectionNode(oldNode)) {
    const oldLang = typeof oldNode.lang === 'string' ? oldNode.lang : ''
    const newLang = typeof newNode.lang === 'string' ? newNode.lang : ''
    const oldMeta = typeof oldNode.meta === 'string' ? oldNode.meta : ''
    const newMeta = typeof newNode.meta === 'string' ? newNode.meta : ''

    if (oldLang !== newLang) fields.push(side === 'old' ? oldLang : newLang)
    if (oldMeta !== newMeta) fields.push(side === 'old' ? oldMeta : newMeta)
  }

  if (newNode && isSectionNode(newNode) && change.kind === 'footnote' && oldNode && isSectionNode(oldNode)) {
    const oldIdentifier = typeof oldNode.heading?.identifier === 'string' ? oldNode.heading.identifier : ''
    const newIdentifier = typeof newNode.heading?.identifier === 'string' ? newNode.heading.identifier : ''
    if (oldIdentifier !== newIdentifier) fields.push(side === 'old' ? oldIdentifier : newIdentifier)
  }

  return uniqueStrings(fields.filter(Boolean))
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
  oldIndex?: SemanticIndex,
): MoveInfo | undefined {
  if (change.primaryOp !== 'move' || !change.moveRole || !change.movePeerKey) return undefined

  const peerChange = findPeerChange(change, changeIndex)
  if (!peerChange) return undefined

  const peerRange =
    change.moveRole === 'source'
      ? (peerChange.newId && newIndex ? newIndex.byId.get(peerChange.newId)?.sourceRange : undefined)
      : (peerChange.oldId && oldIndex ? oldIndex.byId.get(peerChange.oldId)?.sourceRange : undefined)
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
  const raw = isFootnote
    ? ((node as Section).heading as any)?.identifier
    : (node as Block as any).identifier
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

function uniqueTones(tones: Tone[]): Tone[] {
  return [...new Set(tones)]
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function resolvePeerLineNumber(
  change: DiffChange,
  result: DiffResult,
): number | undefined {
  if (change.primaryOp !== 'move' || !change.moveRole || !change.logicalMoveId) return undefined

  if (change.moveRole === 'source') {
    // Peer is the target (lives in new doc); find via byNewId
    const targetChange = [...result.changeIndex.byNewId.values()].find(
      (c) => c.logicalMoveId === change.logicalMoveId && c.moveRole === 'target',
    )
    const peerId = targetChange?.newId
    if (!peerId) return undefined
    return result.newIndex.byId.get(peerId)?.sourceRange?.start?.line
  } else {
    // Peer is the source (lives in old doc); find via byOldId
    const sourceChange = [...result.changeIndex.byOldId.values()].find(
      (c) => c.logicalMoveId === change.logicalMoveId && c.moveRole === 'source',
    )
    const peerId = sourceChange?.oldId
    if (!peerId) return undefined
    return result.oldIndex.byId.get(peerId)?.sourceRange?.start?.line
  }
}
