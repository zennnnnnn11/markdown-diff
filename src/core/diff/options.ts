import type { DiffOptions } from './types'

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  minSimilarity: 0.75,
  minUniquenessMargin: 0.12,
  maxLocalWindowSize: 50,
  enhancedLocalRecovery: false,
  minHashTokenCount: 256,
  maxRecursiveSubtreeSize: 500,
  maxInlineDiffCost: 500,
  longCodeLineThreshold: 200,
  codeFoldContextLines: 20,
  foldContextLines: 2,
  preorderOffsetThreshold: 3,
  contextSiblingWindow: 5,
  shortSequenceThreshold: 80,
  heckelUniqueRatio: 0.6,
  moveSubtreeSizeRatioMin: 0.3,
  moveSubtreeSizeRatioMax: 3,
  moveDepthDiffMax: 2,
  minHashNumFunctions: 64,
  aptedMaxSubtreeSize: 50,
  aptedUnpairedThreshold: 0.5,
}

export function resolveDiffOptions(options?: Partial<DiffOptions>): DiffOptions {
  return {
    ...DEFAULT_DIFF_OPTIONS,
    ...options,
  }
}
