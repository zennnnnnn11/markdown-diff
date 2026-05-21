export type {
  Tone,
  HighlightFilter,
  MergedRow,
  ProjectionSegment,
  ProjectionLine,
  ProjectionAnnotation,
  ProjectionLineMatch,
  DetailMetadataItem,
  DetailRenderedLine,
  DetailTableCellModel,
  DetailTableRowModel,
  MoveInfo,
  BacklinkInfo,
  DetailPanelModel,
  DebugSnapshot,
} from './view-model/types'

export { matchKindLabels, toneLabels, formatWarningLabel } from './view-model/labels'
export { flattenChanges, getChangeReference, getAlignmentReference } from './view-model/utils'
export { buildProjectionLines, buildOldProjectionLines } from './view-model/projection'
export { buildMergedRows, tokenizeForSimilarity } from './view-model/merged-rows'
export { buildDetailPanel, buildDebugSnapshot, lineMatchesFilter } from './view-model/detail'
