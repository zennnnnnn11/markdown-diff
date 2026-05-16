import { describe, expect, it } from 'vitest'
import { childMatchOverlap } from '../engine/helpers'
import type { DiffContext } from '../engine/context'
import type { MatchPair, SemanticIndex } from '../types'
import { resolveDiffOptions } from '../options'

function makeMockContext(overrides: {
  oldChildren: Map<string, string[]>
  newChildren: Map<string, string[]>
  matchesByOld: Map<string, MatchPair>
}): DiffContext {
  return {
    options: resolveDiffOptions({}),
    oldIndex: {
      childrenById: overrides.oldChildren,
    } as unknown as SemanticIndex,
    newIndex: {
      childrenById: overrides.newChildren,
    } as unknown as SemanticIndex,
    matchesByOld: overrides.matchesByOld,
    matchesByNew: new Map(),
    warnings: [],
  }
}

describe('childMatchOverlap', () => {
  it('returns 0 when old node has no children', () => {
    const context = makeMockContext({
      oldChildren: new Map(),
      newChildren: new Map([['new-1', ['nc-1', 'nc-2']]]),
      matchesByOld: new Map(),
    })
    expect(childMatchOverlap(context, 'old-1', 'new-1')).toBe(0)
  })

  it('returns 0 when new node has no children', () => {
    const context = makeMockContext({
      oldChildren: new Map([['old-1', ['oc-1', 'oc-2']]]),
      newChildren: new Map(),
      matchesByOld: new Map(),
    })
    expect(childMatchOverlap(context, 'old-1', 'new-1')).toBe(0)
  })

  it('returns 0 when no children are matched', () => {
    const context = makeMockContext({
      oldChildren: new Map([['old-1', ['oc-1', 'oc-2']]]),
      newChildren: new Map([['new-1', ['nc-1', 'nc-2']]]),
      matchesByOld: new Map(),
    })
    expect(childMatchOverlap(context, 'old-1', 'new-1')).toBe(0)
  })

  it('returns correct ratio when some children are mutually matched', () => {
    const context = makeMockContext({
      oldChildren: new Map([['old-1', ['oc-1', 'oc-2', 'oc-3']]]),
      newChildren: new Map([['new-1', ['nc-1', 'nc-2', 'nc-3']]]),
      matchesByOld: new Map([
        ['oc-1', { oldId: 'oc-1', newId: 'nc-1', matchKind: 'exact-self', score: 1 }],
        ['oc-2', { oldId: 'oc-2', newId: 'nc-2', matchKind: 'exact-self', score: 1 }],
      ]),
    })
    expect(childMatchOverlap(context, 'old-1', 'new-1')).toBeCloseTo(2 / 3)
  })

  it('returns 0 when children are matched to nodes outside the target', () => {
    const context = makeMockContext({
      oldChildren: new Map([['old-1', ['oc-1', 'oc-2']]]),
      newChildren: new Map([['new-1', ['nc-1', 'nc-2']]]),
      matchesByOld: new Map([
        ['oc-1', { oldId: 'oc-1', newId: 'nc-other', matchKind: 'exact-self', score: 1 }],
      ]),
    })
    expect(childMatchOverlap(context, 'old-1', 'new-1')).toBe(0)
  })

  it('returns 1 when all children are mutually matched', () => {
    const context = makeMockContext({
      oldChildren: new Map([['old-1', ['oc-1', 'oc-2']]]),
      newChildren: new Map([['new-1', ['nc-1', 'nc-2']]]),
      matchesByOld: new Map([
        ['oc-1', { oldId: 'oc-1', newId: 'nc-1', matchKind: 'exact-self', score: 1 }],
        ['oc-2', { oldId: 'oc-2', newId: 'nc-2', matchKind: 'exact-self', score: 1 }],
      ]),
    })
    expect(childMatchOverlap(context, 'old-1', 'new-1')).toBe(1)
  })

  it('uses max(oldCount, newCount) as denominator for asymmetric child counts', () => {
    const context = makeMockContext({
      oldChildren: new Map([['old-1', ['oc-1', 'oc-2']]]),
      newChildren: new Map([['new-1', ['nc-1', 'nc-2', 'nc-3']]]),
      matchesByOld: new Map([
        ['oc-1', { oldId: 'oc-1', newId: 'nc-1', matchKind: 'exact-self', score: 1 }],
      ]),
    })
    expect(childMatchOverlap(context, 'old-1', 'new-1')).toBeCloseTo(1 / 3)
  })
})
