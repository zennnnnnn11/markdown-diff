import type { DiffOptions } from './types'

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  minSimilarity: 0.75,
  minUniquenessMargin: 0.12,
  maxLocalWindowSize: 50,
  enhancedLocalRecovery: false,
  maxRecursiveSubtreeSize: 500,
  maxInlineDiffCost: 500,
  longCodeLineThreshold: 200,
  preorderOffsetThreshold: 3,
  contextSiblingWindow: 5,
}

export function resolveDiffOptions(options?: Partial<DiffOptions>): DiffOptions {
  return {
    ...DEFAULT_DIFF_OPTIONS,
    ...options,
  }
}
