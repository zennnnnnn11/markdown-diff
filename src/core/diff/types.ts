import type { Block, InlineContent, Section } from '../transformer'

export type DiffEntity = 'section' | 'block' | 'metadata'
export type PairKind = 'match' | 'align'
export type PrimaryOp = 'equal' | 'insert' | 'delete' | 'replace' | 'move' | 'meta-update'
export type MatchKind =
  | 'forced-root'
  | 'exact-subtree'
  | 'exact-subtree-resolved'
  | 'exact-self'
  | 'exact-self-with-context'
  | 'exact-direct'
  | 'frontmatter-anchor'
  | 'footnote-identity'
  | 'footnote-identifier'
  | 'definition-identity'
  | 'definition-identifier'
  | 'local-heading-slug'
  | 'local-heading-body'
  | 'local-similarity'
  | 'local-identity'
  | 'move-exact'
  | 'move-direct'
  | 'move-heading'
  | 'move-code'

export type SectionKind = Section['kind']

export interface SourcePoint {
  offset?: number
  line?: number
  column?: number
}

export interface SourceRange {
  start?: SourcePoint
  end?: SourcePoint
}

export interface DiffOptions {
  minSimilarity: number
  minUniquenessMargin: number
  maxLocalAlignmentCost: number
  enhancedLocalRecovery: boolean
  minHashTokenCount: number
  maxRecursiveAlignmentCost: number
  maxInlineDiffMatrixCost: number
  longCodeLineThreshold: number
  codeFoldContextLines: number
  preorderOffsetThreshold: number
  contextSiblingWindow: number
  shortSequenceThreshold: number
  maxQuadraticSequenceCost: number
  heckelUniqueRatio: number
  moveSubtreeSizeRatioMin: number
  moveSubtreeSizeRatioMax: number
  moveDepthDiffMax: number
  minHashNumFunctions: number
  maxAptedCost: number
  aptedUnpairedThreshold: number
}

export interface MetadataChange {
  path: string
  oldValue?: unknown
  newValue?: unknown
  op: 'insert' | 'delete' | 'replace'
}

export interface InlineToken {
  type: string
  hash: string
  rawText: string
  normalizedIdentifier?: string
  url?: string
  title?: string
  alt?: string
  children?: InlineToken[]
  source?: InlineContent
}

export interface InlineSpan {
  op: 'equal' | 'insert' | 'delete' | 'replace'
  oldText?: string
  newText?: string
  oldTokens?: InlineToken[]
  newTokens?: InlineToken[]
  wordSpans?: Array<{
    op: 'equal' | 'insert' | 'delete' | 'replace'
    oldText?: string
    newText?: string
  }>
}

export interface CodeCharSpan {
  op: 'equal' | 'insert' | 'delete' | 'replace'
  oldText?: string
  newText?: string
}

export interface LineDiffSpan {
  op: 'equal' | 'insert' | 'delete' | 'replace'
  oldLine?: string
  newLine?: string
  charSpans?: CodeCharSpan[]
}

export interface TableCellDiff {
  row: number
  column: number
  spans: InlineSpan[]
}

export interface TableRowEdit {
  op: 'equal' | 'insert' | 'delete'
  oldIndex?: number
  newIndex?: number
}

export interface TableColumnEdit {
  op: 'equal' | 'insert' | 'delete'
  oldIndex?: number
  newIndex?: number
}

export interface TableDiff {
  structureChanged: boolean
  shapeChanged: boolean
  alignmentChanged: boolean
  cellDiffs: TableCellDiff[]
  rowEdits?: TableRowEdit[]
  columnEdits?: TableColumnEdit[]
}

export interface DiffNode {
  id: string
  sourceId: string
  tree: 'old' | 'new'
  entity: 'section' | 'block'
  raw: Section | Block
  section?: Section
  block?: Block
  kind?: SectionKind
  blockType?: string
  parentId?: string
  logicalChildren: string[]
  preorder: number
  subtreeSize: number
  siblingIndex: number
  depth: number
  sourceRange?: SourceRange
  selfHash: string
  directHash: string
  subtreeHash: string
  identityHash: string
  contentOnlyHash: string
  headingBodyHash?: string
  pathHash?: string
  textSimHash?: string
  normalizedTitle?: string
  titleSlug?: string
  titleTokens: string[]
  textTokens: string[]
  structuredTokens: string[]
  pathParts: string[]
}

export interface MatchPair {
  oldId: string
  newId: string
  pairKind: 'match'
  pairKey: string
  matchKind: MatchKind
  logicalMoveId?: string
  score?: number
}

export interface AlignedPair {
  oldId: string
  newId: string
  pairKind: 'align'
  pairKey: string
  score?: number
  shortHeadingFallback?: boolean
}

export interface BacklinkIndex {
  footnotes: Map<string, string[]>
  definitions: Map<string, string[]>
}

export interface SemanticIndex {
  tree: 'old' | 'new'
  rootId: string
  byId: Map<string, DiffNode>
  nodesInPreorder: DiffNode[]
  childrenById: Map<string, string[]>
  byKind: Map<string, string[]>
  byBlockType: Map<string, string[]>
  byHeadingDepth: Map<number, string[]>
  bySelfHash: Map<string, string[]>
  byDirectHash: Map<string, string[]>
  bySubtreeHash: Map<string, string[]>
  byIdentityHash: Map<string, string[]>
  byHeadingBodyHash: Map<string, string[]>
  byPathHash: Map<string, string[]>
  backlinks: BacklinkIndex
}

export interface DiffStatus {
  isMatchPair: boolean
  isAlignedPair: boolean
  moved: boolean
  movedWithinParent: boolean
  renamed: boolean
  selfChanged: boolean
  descendantChanged: boolean
  metaChanged: boolean
  inlineStructureChanged: boolean
}

export interface DiffChange {
  entity: DiffEntity
  kind?: SectionKind
  blockType?: string
  oldId?: string
  newId?: string
  oldNode?: Section | Block
  newNode?: Section | Block
  pairKey?: string
  pairKind?: PairKind
  primaryOp: PrimaryOp
  status: DiffStatus
  matchKind?: MatchKind
  score?: number
  summary: string
  inlineSpans?: InlineSpan[]
  titleInlineSpans?: InlineSpan[]
  codeSpans?: LineDiffSpan[]
  tableDiff?: TableDiff
  metadataChanges?: MetadataChange[]
  children: DiffChange[]
  reordered?: boolean
  degraded?: boolean
  shortHeadingFallback?: boolean
  warnings: string[]
  logicalMoveId?: string
  moveRole?: 'source' | 'target'
  movePeerKey?: string
}

export interface DiffStats {
  inserts: number
  deletes: number
  replaces: number
  moves: number
  metaUpdates: number
  renames: number
  reorders: number
}

export interface DiffChangeIndex {
  byOldId: Map<string, DiffChange>
  byNewId: Map<string, DiffChange>
  byPairKey: Map<string, DiffChange>
  byLogicalMoveId: Map<string, DiffChange[]>
}

export interface DiffQualitySummary {
  degradedCount: number
  inlineDeferredCount: number
  warningCount: number
}

export interface DiffResult {
  root: DiffChange
  oldIndex: SemanticIndex
  newIndex: SemanticIndex
  matches: MatchPair[]
  changeIndex: DiffChangeIndex
  stats: DiffStats
  quality: DiffQualitySummary
  warnings: string[]
}
