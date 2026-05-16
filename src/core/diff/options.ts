import type { DiffOptions } from './types'

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  // 形成 AlignedPair / move-heading 等候选时要求的最低相似度。
  minSimilarity: 0.55,
  // 局部候选第一名必须领先第二名的最小分差，防止模糊误配。
  minUniquenessMargin: 0.12,
  // 单个 replace section 做局部对齐时允许的最大矩阵成本（≈ n×m 格数）。
  maxLocalAlignmentCost: 12_000,
  enhancedLocalRecovery: true,
  // token 数量超过该阈值后，文本相似度从精确 Jaccard 切到 MinHash 估算。
  minHashTokenCount: 256,
  // MatchPair 递归对齐子节点时允许的最大矩阵成本。
  maxRecursiveAlignmentCost: 60_000,
  // paragraph / heading / table cell 做 token 级内联 diff 时允许的最大矩阵成本。
  maxInlineDiffMatrixCost: 4_000,
  // 代码块超过该行数后，会折叠不变片段而不是完整展开所有 equal 行。
  longCodeLineThreshold: 200,
  // 长代码块折叠后，在每个变更区域前后额外保留的上下文行数。
  codeFoldContextLines: 20,
  // 预留的"前后位置偏移"阈值，设计上用于 exact-self-with-context 的位置约束。
  preorderOffsetThreshold: 3,
  // 预留的 sibling 上下文窗口大小，设计上用于 witness hash 搜索范围。
  contextSiblingWindow: 5,
  // 序列较短时优先走 Myers。
  shortSequenceThreshold: 80,
  // 允许使用 O(n*m) 序列算法的最大乘积成本，超出后转 Heckel / Histogram。
  maxQuadraticSequenceCost: 6_400,
  // 共享唯一 token 比例高于该值时，序列对齐优先选择 Heckel。
  heckelUniqueRatio: 0.6,
  // move 候选允许的最小子树大小比，过小说明两侧规模差异太大。
  moveSubtreeSizeRatioMin: 0.3,
  // move 候选允许的最大子树大小比，过大同样视为不可信。
  moveSubtreeSizeRatioMax: 3,
  // move 候选允许的最大深度差；超过后必须靠路径兼容性兜底。
  moveDepthDiffMax: 2,
  // MinHash sketch 使用的哈希函数数量，越大越稳但越慢。
  minHashNumFunctions: 64,
  // APTED 结构回退允许的最大乘积成本。
  maxAptedCost: 10_000,
  // replace section 中未配对子节点占比超过该值时，才考虑启用 APTED 回退。
  aptedUnpairedThreshold: 0.35,
}

export function resolveDiffOptions(options?: Partial<DiffOptions>): DiffOptions {
  return {
    ...DEFAULT_DIFF_OPTIONS,
    ...options,
  }
}
