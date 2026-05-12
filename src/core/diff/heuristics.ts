import type { DiffOptions } from './types'

export const DIFF_HEURISTICS = {
  recall: {
    textSimThreshold: 24,
    maxComparableNodes: 6,
    pathMismatchPenalty: 4,
    simHashBonusWeight: 0.05,
  },
  context: {
    matchedParentScore: 1,
    unmatchedParentScore: 0.7,
    shortHeadingSiblingTolerance: 1,
  },
  similarity: {
    genericContentOnlyScore: 0.95,
    paragraph: {
      textWeight: 0.7,
      structureWeight: 0.3,
    },
    heading: {
      bodyHashMismatchScore: 0.5,
      depthMismatchScore: 0.6,
      withChildren: {
        titleWeight: 0.4,
        bodyWeight: 0.3,
        depthWeight: 0.15,
        contextWeight: 0.15,
      },
      leaf: {
        titleWeight: 0.6,
        depthWeight: 0.2,
        contextWeight: 0.2,
      },
    },
    code: {
      langBonus: 0.1,
    },
    table: {
      shapeWeight: 0.3,
      cellContentWeight: 0.5,
      alignmentWeight: 0.2,
    },
    definition: {
      urlWeight: 0.5,
      titleWeight: 0.25,
      labelWeight: 0.25,
    },
  },
  fallback: {
    aptedPathBonus: 0.1,
    aptedRangeBonusWeight: 0.05,
    score: {
      baseWeight: 0.35,
      childShapeWeight: 0.3,
      pathWeight: 0.15,
      rangeWeight: 0.1,
      structuralBonus: 0.2,
      pathMismatchScore: 0.7,
    },
    sourceRange: {
      lineDivisor: 10,
      offsetDivisor: 400,
      fallbackScore: 0.7,
    },
  },
} as const

export function sequenceTuning(
  options: Pick<DiffOptions, 'shortSequenceThreshold' | 'heckelUniqueRatio'>,
): Pick<DiffOptions, 'shortSequenceThreshold' | 'heckelUniqueRatio'> {
  return {
    shortSequenceThreshold: options.shortSequenceThreshold,
    heckelUniqueRatio: options.heckelUniqueRatio,
  }
}
