import type { DiffOptions } from './types'

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  // 形成 AlignedPair / move-heading 等候选时要求的最低相似度。
  minSimilarity: 0.75,
  // 局部候选第一名必须领先第二名的最小分差，防止模糊误配。
  minUniquenessMargin: 0.12,
  // 面向调用方的“局部恢复窗口”尺寸；未显式传 cost 时会平方映射到 maxLocalAlignmentCost。
  maxLocalWindowSize: 50,
  // 单个 replace section 做局部对齐时允许的最大矩阵成本。
  maxLocalAlignmentCost: 12_000,
  enhancedLocalRecovery: false,
  // token 数量超过该阈值后，文本相似度从精确 Jaccard 切到 MinHash 估算。
  minHashTokenCount: 256,
  // 面向调用方的“递归展开子树大小”预算；未显式传 cost 时会平方映射到 maxRecursiveAlignmentCost。
  maxRecursiveSubtreeSize: 500,
  // MatchPair 递归对齐子节点时允许的最大矩阵成本。
  maxRecursiveAlignmentCost: 60_000,
  // 面向调用方的“内联 diff 规模”预算；未显式传 cost 时会平方映射到 maxInlineDiffMatrixCost。
  maxInlineDiffCost: 500,
  // paragraph / heading / table cell 做 token 级内联 diff 时允许的最大矩阵成本。
  maxInlineDiffMatrixCost: 4_000,
  // 代码块超过该行数后，会折叠不变片段而不是完整展开所有 equal 行。
  longCodeLineThreshold: 200,
  // 长代码块折叠后，在每个变更区域前后额外保留的上下文行数。
  codeFoldContextLines: 20,
  // 普通未变更区域折叠时，首尾各保留的上下文行数。
  foldContextLines: 2,
  // 预留的“前后位置偏移”阈值，设计上用于 exact-self-with-context 的位置约束。
  preorderOffsetThreshold: 3,
  // 预留的 sibling 上下文窗口大小，设计上用于 witness hash 搜索范围。
  contextSiblingWindow: 5,
  // 序列较短时优先走 Myers；同时可作为 maxQuadraticSequenceCost 的派生输入。
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
  // 面向调用方的 APTED 子树规模预算；未显式传 cost 时会平方映射到 maxAptedCost。
  aptedMaxSubtreeSize: 50,
  // APTED 结构回退允许的最大乘积成本。
  maxAptedCost: 2_500,
  // replace section 中未配对子节点占比超过该值时，才考虑启用 APTED 回退。
  aptedUnpairedThreshold: 0.5,
}

export function resolveDiffOptions(options?: Partial<DiffOptions>): DiffOptions {
  const resolved: DiffOptions = {
    ...DEFAULT_DIFF_OPTIONS,
    ...options,
  }

  if (options && !('maxLocalAlignmentCost' in options) && options.maxLocalWindowSize !== undefined) {
    resolved.maxLocalAlignmentCost = options.maxLocalWindowSize * options.maxLocalWindowSize
  }
  if (options && !('maxRecursiveAlignmentCost' in options) && options.maxRecursiveSubtreeSize !== undefined) {
    resolved.maxRecursiveAlignmentCost = options.maxRecursiveSubtreeSize * options.maxRecursiveSubtreeSize
  }
  if (options && !('maxInlineDiffMatrixCost' in options) && options.maxInlineDiffCost !== undefined) {
    resolved.maxInlineDiffMatrixCost = options.maxInlineDiffCost * options.maxInlineDiffCost
  }
  if (options && !('maxQuadraticSequenceCost' in options) && options.shortSequenceThreshold !== undefined) {
    resolved.maxQuadraticSequenceCost = options.shortSequenceThreshold * options.shortSequenceThreshold
  }
  if (options && !('maxAptedCost' in options) && options.aptedMaxSubtreeSize !== undefined) {
    resolved.maxAptedCost = options.aptedMaxSubtreeSize * options.aptedMaxSubtreeSize
  }

  return resolved
}
