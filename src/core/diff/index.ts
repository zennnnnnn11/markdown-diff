export { diffMarkdownTrees } from './engine'
export { buildSemanticIndex } from './indexer'
export { resolveDiffOptions, DEFAULT_DIFF_OPTIONS } from './options'
export { forEachChange, forEachChangeAsync, summarizeChanges } from './summary'
export type {
  AlignedPair,
  DiffChange,
  DiffEntity,
  DiffNode,
  DiffOptions,
  DiffResult,
  DiffStats,
  DiffStatus,
  InlineSpan,
  LineDiffSpan,
  MatchKind,
  MatchPair,
  MetadataChange,
  PairKind,
  PrimaryOp,
  SemanticIndex,
  SourceRange,
} from './types'
