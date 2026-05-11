import type { Block, InlineContent, Section } from '../transformer'

type SectionKind = Section['kind']

export type DiffEntity = 'section' | 'block'
export type PairKind = 'match' | 'align'
export type PrimaryOp = 'equal' | 'insert' | 'delete' | 'replace' | 'move' | 'meta-update'
export type MatchKind =
  | 'forced-root'
  | 'exact-subtree'
  | 'exact-self'
  | 'exact-self-with-context'
  | 'exact-direct'
  | 'frontmatter-anchor'
  | 'footnote-identity'
  | 'definition-identity'
  | 'local-heading-slug'
  | 'local-similarity'
  | 'local-identity'
  | 'move-exact'
  | 'move-direct'
  | 'move-heading'
  | 'move-code'

export interface DiffOptions {
  minSimilarity: number
  minUniquenessMargin: number
  maxLocalWindowSize: number
  enhancedLocalRecovery: boolean
  maxRecursiveSubtreeSize: number
  maxInlineDiffCost: number
  longCodeLineThreshold: number
  preorderOffsetThreshold: number
  contextSiblingWindow: number
}

export interface DiffNode {
  id: string
  tree: 'old' | 'new'
  entity: DiffEntity
  raw: Section | Block
  section?: Section
  block?: Block
  kind?: SectionKind
  blockType?: string
  parentId?: string
  preorder: number
  subtreeSize: number
  siblingIndex: number
  selfHash: string
  directHash: string
  subtreeHash: string
  identityHash: string
  contentOnlyHash: string
  headingBodyHash?: string
  textSimHash?: string
  normalizedTitle?: string
  titleSlug?: string
  titleTokens: string[]
  textTokens: string[]
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

export interface InlineSpan {
  op: 'equal' | 'insert' | 'delete' | 'replace'
  oldText?: string
  newText?: string
  oldTokens?: InlineContent[]
  newTokens?: InlineContent[]
}

export interface LineDiffSpan {
  op: 'equal' | 'insert' | 'delete' | 'replace'
  oldLine?: string
  newLine?: string
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
}

export interface DiffResult {
  root: DiffChange
  oldIndex: SemanticIndex
  newIndex: SemanticIndex
  matches: MatchPair[]
  stats: DiffStats
  warnings: string[]
}
