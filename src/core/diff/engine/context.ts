import type { DiffOptions, MatchKind, MatchPair, SemanticIndex } from '../types'

export interface MatchCandidate {
  oldId: string
  newId: string
  matchKind: MatchKind
  priority: number
  score: number
}

export interface DiffContext {
  options: DiffOptions
  oldIndex: SemanticIndex
  newIndex: SemanticIndex
  matchesByOld: Map<string, MatchPair>
  matchesByNew: Map<string, MatchPair>
  warnings: string[]
}

export interface AptedDiffMeta {
  node: NonNullable<ReturnType<SemanticIndex['byId']['get']>>
}

export class AnchorRegistry {
  private globalAnchors: Array<{ oldPreorder: number; newPreorder: number }> = []

  register(oldPreorder: number, newPreorder: number): void {
    const arr = this.globalAnchors
    let lo = 0
    let hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (arr[mid]!.oldPreorder < oldPreorder) lo = mid + 1
      else hi = mid
    }
    for (let i = lo; i < arr.length && arr[i]!.oldPreorder === oldPreorder; i++) {
      if (arr[i]!.newPreorder === newPreorder) return
    }
    arr.splice(lo, 0, { oldPreorder, newPreorder })
  }

  getGlobalInterval(
    oldPreorder: number,
    newTreeSize: number,
  ): { min: number; max: number } | undefined {
    if (this.globalAnchors.length === 0) {
      return {
        min: 0,
        max: Math.max(0, newTreeSize - 1),
      }
    }

    let leftNewPreorder = -1
    let rightNewPreorder = newTreeSize
    for (const anchor of this.globalAnchors) {
      if (anchor.oldPreorder < oldPreorder) {
        leftNewPreorder = anchor.newPreorder
        continue
      }

      if (anchor.oldPreorder > oldPreorder) {
        rightNewPreorder = anchor.newPreorder
        break
      }
    }

    const min = Math.max(0, leftNewPreorder + 1)
    const max = Math.min(newTreeSize - 1, rightNewPreorder - 1)
    if (min > max) return undefined
    return { min, max }
  }
}

export interface SiblingAnchorBounds {
  leftOldAnchorIndex: number
  rightOldAnchorIndex: number
  leftNewAnchorIndex: number
  rightNewAnchorIndex: number
  oldMin: number
  oldMax: number
  newMin: number
  newMax: number
}
