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
import type { Block, Section } from '@/core/transformer'

export type Tone =
  | 'plain'
  | 'insert'
  | 'delete'
  | 'replace'
  | 'move'
  | 'meta'
  | 'rename'
  | 'reorder'
export type HighlightFilter = Tone | 'warning'

export interface MergedRow {
  key: string
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
  movePeerRowIndex?: number
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
  columnOp?: 'equal' | 'insert' | 'delete'
}

export interface DetailTableRowModel {
  key: string
  cells: DetailTableCellModel[]
  rowOp?: 'equal' | 'insert' | 'delete'
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

export type {
  Block,
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
  Section,
  SourceRange,
}
