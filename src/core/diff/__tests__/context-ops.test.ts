import { describe, expect, it } from 'vitest'
import {
  addMatch,
  convertChangeToMove,
  upgradeToMatch,
} from '../engine/context-ops'
import { makeChange, makeStatus } from './test-helpers'
import type { DiffContext } from '../engine/context'
import type { MatchPair } from '../types'

function makeMinimalContext(): DiffContext {
  return {
    matchesByOld: new Map(),
    matchesByNew: new Map(),
  } as unknown as DiffContext
}

describe('context-ops module', () => {
  describe('addMatch', () => {
    it('creates a new match pair and registers in both maps', () => {
      const context = makeMinimalContext()
      const pair = addMatch(context, 'old-1', 'new-1', 'local-identity')
      expect(pair).toBeDefined()
      expect(pair!.oldId).toBe('old-1')
      expect(pair!.newId).toBe('new-1')
      expect(pair!.matchKind).toBe('local-identity')
      expect(pair!.pairKind).toBe('match')
      expect(pair!.pairKey).toBe('match:old-1:new-1')
      expect(context.matchesByOld.get('old-1')).toBe(pair)
      expect(context.matchesByNew.get('new-1')).toBe(pair)
    })

    it('returns undefined when oldId is already matched to a different newId', () => {
      const context = makeMinimalContext()
      addMatch(context, 'old-1', 'new-1', 'local-identity')
      const result = addMatch(context, 'old-1', 'new-2', 'local-similarity')
      expect(result).toBeUndefined()
    })

    it('returns undefined when newId is already matched', () => {
      const context = makeMinimalContext()
      addMatch(context, 'old-1', 'new-1', 'local-identity')
      const result = addMatch(context, 'old-2', 'new-1', 'local-similarity')
      expect(result).toBeUndefined()
    })

    it('returns existing pair when re-adding same old-new combination', () => {
      const context = makeMinimalContext()
      const first = addMatch(context, 'old-1', 'new-1', 'local-identity')
      const second = addMatch(context, 'old-1', 'new-1', 'local-identity')
      expect(second).toBe(first)
    })

    it('augments logicalMoveId on re-add if not already set', () => {
      const context = makeMinimalContext()
      const first = addMatch(context, 'old-1', 'new-1', 'local-identity')
      addMatch(context, 'old-1', 'new-1', 'local-identity', 'move-1')
      expect(first!.logicalMoveId).toBe('move-1')
    })

    it('does not overwrite existing logicalMoveId', () => {
      const context = makeMinimalContext()
      addMatch(context, 'old-1', 'new-1', 'local-identity', 'move-1')
      const result = addMatch(context, 'old-1', 'new-1', 'local-identity', 'move-2')
      expect(result!.logicalMoveId).toBe('move-1')
    })

    it('updates score on re-add', () => {
      const context = makeMinimalContext()
      addMatch(context, 'old-1', 'new-1', 'local-identity', undefined, 0.5)
      const result = addMatch(context, 'old-1', 'new-1', 'local-identity', undefined, 0.9)
      expect(result!.score).toBe(0.9)
    })

    it('stores optional logicalMoveId and score', () => {
      const context = makeMinimalContext()
      const pair = addMatch(context, 'old-1', 'new-1', 'local-similarity', 'mv-1', 0.85)
      expect(pair!.logicalMoveId).toBe('mv-1')
      expect(pair!.score).toBe(0.85)
    })
  })

  describe('convertChangeToMove', () => {
    it('sets all move-related fields on the change', () => {
      const change = makeChange({
        primaryOp: 'delete',
        summary: 'test',
        status: makeStatus(),
        oldId: 'old-1',
      })
      const pair: MatchPair = {
        oldId: 'old-1',
        newId: 'new-1',
        pairKind: 'match',
        pairKey: 'match:old-1:new-1',
        matchKind: 'local-identity',
        logicalMoveId: 'mv-1',
      }

      convertChangeToMove(change, pair, 'source')

      expect(change.primaryOp).toBe('move')
      expect(change.pairKind).toBe('match')
      expect(change.pairKey).toBe('match:old-1:new-1')
      expect(change.matchKind).toBe('local-identity')
      expect(change.logicalMoveId).toBe('mv-1')
      expect(change.moveRole).toBe('source')
      expect(change.movePeerKey).toBe('mv-1')
      expect(change.status.isMatchPair).toBe(true)
      expect(change.status.isAlignedPair).toBe(false)
      expect(change.status.moved).toBe(true)
    })

    it('works with target role', () => {
      const change = makeChange({
        primaryOp: 'insert',
        summary: 'test',
        status: makeStatus(),
        newId: 'new-1',
      })
      const pair: MatchPair = {
        oldId: 'old-1',
        newId: 'new-1',
        pairKind: 'match',
        pairKey: 'match:old-1:new-1',
        matchKind: 'local-similarity',
      }

      convertChangeToMove(change, pair, 'target')

      expect(change.moveRole).toBe('target')
      expect(change.status.moved).toBe(true)
    })

    it('clears isAlignedPair when converting', () => {
      const change = makeChange({
        primaryOp: 'equal',
        summary: 'test',
        status: makeStatus({ isAlignedPair: true }),
      })
      const pair: MatchPair = {
        oldId: 'old-1',
        newId: 'new-1',
        pairKind: 'match',
        pairKey: 'match:old-1:new-1',
        matchKind: 'local-identity',
      }

      convertChangeToMove(change, pair, 'source')
      expect(change.status.isAlignedPair).toBe(false)
    })
  })

  describe('upgradeToMatch', () => {
    it('upgrades an aligned pair to a match pair', () => {
      const change = makeChange({
        primaryOp: 'equal',
        summary: 'test',
        status: makeStatus({ isAlignedPair: true }),
        oldId: 'old-1',
        newId: 'new-1',
        pairKind: 'align',
        pairKey: 'align:old-1:new-1',
      })

      upgradeToMatch(change)

      expect(change.pairKind).toBe('match')
      expect(change.pairKey).toBe('match:old-1:new-1')
      expect(change.status.isMatchPair).toBe(true)
      expect(change.status.isAlignedPair).toBe(false)
    })

    it('is a no-op when oldId is missing', () => {
      const change = makeChange({
        primaryOp: 'insert',
        summary: 'test',
        status: makeStatus(),
        newId: 'new-1',
      })

      upgradeToMatch(change)

      expect(change.pairKind).toBeUndefined()
      expect(change.status.isMatchPair).toBe(false)
    })

    it('is a no-op when newId is missing', () => {
      const change = makeChange({
        primaryOp: 'delete',
        summary: 'test',
        status: makeStatus(),
        oldId: 'old-1',
      })

      upgradeToMatch(change)

      expect(change.pairKind).toBeUndefined()
      expect(change.status.isMatchPair).toBe(false)
    })
  })

  describe('module independence', () => {
    it('context-ops.ts only imports from types and utils', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const source = fs.readFileSync(
        path.resolve(__dirname, '../engine/context-ops.ts'),
        'utf-8',
      )
      expect(source).not.toContain("from './helpers'")
      expect(source).not.toContain("from './alignment'")
      expect(source).not.toContain("from './presentation'")
    })

    it('helpers.ts re-exports context-ops functions', async () => {
      const helpers = await import('../engine/helpers')
      expect(typeof helpers.addMatch).toBe('function')
      expect(typeof helpers.convertChangeToMove).toBe('function')
      expect(typeof helpers.upgradeToMatch).toBe('function')
    })
  })
})
