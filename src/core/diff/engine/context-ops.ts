import type { DiffChange, MatchKind, MatchPair } from '../types'
import { makePairKey } from '../utils'
import type { DiffContext } from './context'

export function addMatch(
  context: DiffContext,
  oldId: string,
  newId: string,
  matchKind: MatchKind,
  logicalMoveId?: string,
  score?: number,
): MatchPair | undefined {
  const existingOld = context.matchesByOld.get(oldId)
  const existingNew = context.matchesByNew.get(newId)
  if (existingOld || existingNew) {
    if (existingOld && existingOld.newId === newId) {
      if (logicalMoveId && !existingOld.logicalMoveId) existingOld.logicalMoveId = logicalMoveId
      if (score !== undefined) existingOld.score = score
      return existingOld
    }
    return undefined
  }

  const pair: MatchPair = {
    oldId,
    newId,
    pairKind: 'match',
    pairKey: makePairKey('match', oldId, newId),
    matchKind,
    logicalMoveId,
    score,
  }
  context.matchesByOld.set(oldId, pair)
  context.matchesByNew.set(newId, pair)
  return pair
}

export function convertChangeToMove(
  change: DiffChange,
  pair: MatchPair,
  role: 'source' | 'target',
): void {
  change.primaryOp = 'move'
  change.pairKind = 'match'
  change.pairKey = pair.pairKey
  change.matchKind = pair.matchKind
  change.logicalMoveId = pair.logicalMoveId
  change.moveRole = role
  change.movePeerKey = pair.logicalMoveId
  change.status.isMatchPair = true
  change.status.isAlignedPair = false
  change.status.moved = true
}

export function upgradeToMatch(change: DiffChange): void {
  if (!change.oldId || !change.newId) return
  change.pairKind = 'match'
  change.pairKey = makePairKey('match', change.oldId, change.newId)
  change.status.isMatchPair = true
  change.status.isAlignedPair = false
}
