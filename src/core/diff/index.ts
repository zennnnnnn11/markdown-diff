export { diffMarkdownTrees } from './engine'
export { buildSemanticIndex } from './indexer'
export { resolveDiffOptions, DEFAULT_DIFF_OPTIONS } from './options'
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
  PairKind,
  PrimaryOp,
  SemanticIndex,
} from './types'
