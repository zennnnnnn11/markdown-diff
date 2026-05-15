import type { HighlightFilter } from './view-model'

export interface StatCardModel {
  key: string
  label: string
  value: number
  filter: HighlightFilter
  description: string
}
