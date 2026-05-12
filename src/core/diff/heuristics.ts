import type { DiffOptions } from './types'

export const DIFF_HEURISTICS = {
  recall: {
    // SimHash 汉明距离超过该阈值时，候选通常被视为文本过远而丢弃。
    textSimThreshold: 24,
    // 局部召回阶段最多保留的候选节点数，避免两两比对爆炸。
    maxComparableNodes: 6,
    // 路径不一致时附加的结构惩罚，值越大越不鼓励跨路径候选。
    pathMismatchPenalty: 4,
    // SimHash 越接近时给 fallback 评分补的额外权重。
    simHashBonusWeight: 0.05,
  },
  context: {
    // 父节点已匹配时给相似度模型的完整上下文分数。
    matchedParentScore: 1,
    // 父节点未匹配时仍保留的上下文分数，避免把候选直接清零。
    unmatchedParentScore: 0.7,
    // 短标题兜底时允许的 sibling 位置偏移。
    shortHeadingSiblingTolerance: 1,
  },
  similarity: {
    // 通用节点纯文本完全一致时给的高分，但仍低于真正 selfHash 相等的 1.0。
    genericContentOnlyScore: 0.95,
    paragraph: {
      // paragraph 相似度里，文本内容部分的权重。
      textWeight: 0.7,
      // paragraph 相似度里，inline 结构部分的权重。
      structureWeight: 0.3,
    },
    heading: {
      // heading bodyHash 不一致时给的保底正文相似度。
      bodyHashMismatchScore: 0.5,
      // heading depth 不一致时给的层级匹配分。
      depthMismatchScore: 0.6,
      withChildren: {
        // 有子内容的 heading 中，标题 token 相似度的权重。
        titleWeight: 0.4,
        // 有子内容的 heading 中，正文 bodyHash 相似度的权重。
        bodyWeight: 0.3,
        // 有子内容的 heading 中，层级一致性的权重。
        depthWeight: 0.15,
        // 有子内容的 heading 中，父上下文分数的权重。
        contextWeight: 0.15,
      },
      leaf: {
        // 叶子 heading 中，标题 token 相似度的权重。
        titleWeight: 0.6,
        // 叶子 heading 中，层级一致性的权重。
        depthWeight: 0.2,
        // 叶子 heading 中，父上下文分数的权重。
        contextWeight: 0.2,
      },
    },
    code: {
      // code block 语言标记相同后的额外加分。
      langBonus: 0.1,
    },
    table: {
      // table 相似度中，行列形状相近程度的权重。
      shapeWeight: 0.3,
      // table 相似度中，cell 文本内容相近程度的权重。
      cellContentWeight: 0.5,
      // table 相似度中，列对齐方式一致性的权重。
      alignmentWeight: 0.2,
    },
    definition: {
      // definition 相似度中，URL 字段的权重。
      urlWeight: 0.5,
      // definition 相似度中，title 字段的权重。
      titleWeight: 0.25,
      // definition 相似度中，label 字段的权重。
      labelWeight: 0.25,
    },
  },
  fallback: {
    // APTED 回退评分里，路径完全一致时额外补的分。
    aptedPathBonus: 0.1,
    // APTED 回退评分里，源码位置接近程度的附加权重。
    aptedRangeBonusWeight: 0.05,
    score: {
      // APTED 回退综合评分中，基础节点相似度的权重。
      baseWeight: 0.35,
      // APTED 回退综合评分中，子节点 shape 相似度的权重。
      childShapeWeight: 0.3,
      // APTED 回退综合评分中，路径一致性的权重。
      pathWeight: 0.15,
      // APTED 回退综合评分中，源码位置接近程度的权重。
      rangeWeight: 0.1,
      // 子节点数量和 shape 完全一致时给的结构奖励。
      structuralBonus: 0.2,
      // 路径不一致时仍保留的基础路径分，而不是直接记 0。
      pathMismatchScore: 0.7,
    },
    sourceRange: {
      // 行号差每增加这么多，sourceRange 接近度大约下降 1.0。
      lineDivisor: 10,
      // offset 差每增加这么多，sourceRange 接近度大约下降 1.0。
      offsetDivisor: 400,
      // 缺失位置信息时使用的默认接近度。
      fallbackScore: 0.7,
    },
  },
} as const

export function sequenceTuning(
  options: Pick<DiffOptions, 'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'>,
): Pick<DiffOptions, 'shortSequenceThreshold' | 'maxQuadraticSequenceCost' | 'heckelUniqueRatio'> {
  return {
    shortSequenceThreshold: options.shortSequenceThreshold,
    maxQuadraticSequenceCost: options.maxQuadraticSequenceCost,
    heckelUniqueRatio: options.heckelUniqueRatio,
  }
}
