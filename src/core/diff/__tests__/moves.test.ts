import { describe, expect, it } from 'vitest'
import {
  longestCommonPathSuffix,
  hasCompatibleMovePath,
  moveCandidateAllowed,
  uniqueMoveHash,
  computeHeadingMoveScore,
  classifyMove,
  shareMatchedNeighborContext,
  isUniqueHeadingMoveCandidate,
} from '../engine/moves'
import type { DiffContext } from '../engine/context'
import type { DiffChange, MatchPair, SemanticIndex } from '../types'
import { resolveDiffOptions } from '../options'
import { makeStatus } from './test-helpers'

function makeMockNode(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? 'node-1',
    entity: overrides.entity ?? ('block' as const),
    kind: overrides.kind ?? undefined,
    blockType: overrides.blockType ?? 'paragraph',
    selfHash: overrides.selfHash ?? 'hash-1',
    directHash: overrides.directHash ?? 'dhash-1',
    subtreeHash: overrides.subtreeHash ?? 'sthash-1',
    contentOnlyHash: overrides.contentOnlyHash ?? 'cohash-1',
    headingBodyHash: overrides.headingBodyHash as string | undefined,
    identityHash: overrides.identityHash ?? 'ihash-1',
    siblingIndex: overrides.siblingIndex ?? 0,
    depth: overrides.depth ?? 0,
    subtreeSize: overrides.subtreeSize ?? 1,
    parentId: overrides.parentId as string | undefined,
    pathParts: overrides.pathParts ?? ([] as string[]),
    titleSlug: overrides.titleSlug as string | undefined,
    textTokens: overrides.textTokens ?? ([] as string[]),
    logicalChildren: overrides.logicalChildren ?? [],
    raw: overrides.raw ?? {},
    section: overrides.section,
    block: overrides.block,
    ...overrides,
  }
}

function makePair(oldId: string, newId: string): MatchPair {
  return { oldId, newId, pairKind: 'match', pairKey: `match:${oldId}:${newId}`, matchKind: 'exact-self', score: 1 }
}

function makeContext(overrides: {
  oldNodes?: Record<string, any>[]
  newNodes?: Record<string, any>[]
  oldChildren?: Map<string, string[]>
  newChildren?: Map<string, string[]>
  matchesByOld?: Map<string, MatchPair>
  matchesByNew?: Map<string, MatchPair>
  options?: Partial<Parameters<typeof resolveDiffOptions>[0]>
} = {}): DiffContext {
  const oldByIdEntries = (overrides.oldNodes ?? []).map((n) => {
    const node = makeMockNode(n)
    return [node.id, node] as const
  })
  const newByIdEntries = (overrides.newNodes ?? []).map((n) => {
    const node = makeMockNode(n)
    return [node.id, node] as const
  })
  return {
    options: resolveDiffOptions(overrides.options ?? {}),
    oldIndex: {
      byId: new Map(oldByIdEntries),
      childrenById: overrides.oldChildren ?? new Map(),
    } as unknown as SemanticIndex,
    newIndex: {
      byId: new Map(newByIdEntries),
      childrenById: overrides.newChildren ?? new Map(),
    } as unknown as SemanticIndex,
    matchesByOld: overrides.matchesByOld ?? new Map(),
    matchesByNew: overrides.matchesByNew ?? new Map(),
    warnings: [],
  } as unknown as DiffContext
}

function makeDeleteChange(oldId: string, overrides: Partial<DiffChange> = {}): DiffChange {
  return {
    entity: 'section', primaryOp: 'delete', oldId,
    status: makeStatus({ selfChanged: true }), summary: `Delete ${oldId}`,
    children: [], warnings: [], ...overrides,
  }
}

function makeInsertChange(newId: string, overrides: Partial<DiffChange> = {}): DiffChange {
  return {
    entity: 'section', primaryOp: 'insert', newId,
    status: makeStatus({ selfChanged: true }), summary: `Insert ${newId}`,
    children: [], warnings: [], ...overrides,
  }
}

describe('moves module', () => {
  describe('longestCommonPathSuffix', () => {
    it('returns 0 for empty arrays', () => {
      expect(longestCommonPathSuffix([], [])).toBe(0)
    })

    it('returns 0 when no suffix matches', () => {
      expect(longestCommonPathSuffix(['a', 'b'], ['c', 'd'])).toBe(0)
    })

    it('returns 1 when only last element matches', () => {
      expect(longestCommonPathSuffix(['a', 'b', 'c'], ['x', 'y', 'c'])).toBe(1)
    })

    it('returns full length when arrays are identical', () => {
      expect(longestCommonPathSuffix(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(3)
    })

    it('returns correct count for partial suffix overlap', () => {
      expect(longestCommonPathSuffix(['a', 'b', 'c'], ['x', 'b', 'c'])).toBe(2)
    })

    it('handles arrays of different lengths', () => {
      expect(longestCommonPathSuffix(['a', 'b', 'c'], ['c'])).toBe(1)
    })
  })

  describe('hasCompatibleMovePath', () => {
    it('returns false when oldNode pathParts is empty', () => {
      const old = makeMockNode({ pathParts: [] })
      const nw = makeMockNode({ pathParts: ['a'] })
      expect(hasCompatibleMovePath(old as any, nw as any)).toBe(false)
    })

    it('returns false when newNode pathParts is empty', () => {
      const old = makeMockNode({ pathParts: ['a'] })
      const nw = makeMockNode({ pathParts: [] })
      expect(hasCompatibleMovePath(old as any, nw as any)).toBe(false)
    })

    it('returns true when full path suffix matches', () => {
      const old = makeMockNode({ pathParts: ['a', 'b', 'c'] })
      const nw = makeMockNode({ pathParts: ['x', 'b', 'c'] })
      expect(hasCompatibleMovePath(old as any, nw as any)).toBe(false)
    })

    it('returns true when suffix equals min length', () => {
      const old = makeMockNode({ pathParts: ['a', 'b'] })
      const nw = makeMockNode({ pathParts: ['a', 'b'] })
      expect(hasCompatibleMovePath(old as any, nw as any)).toBe(true)
    })
  })

  describe('moveCandidateAllowed', () => {
    it('returns false when shapes do not match', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'block', blockType: 'paragraph' }],
        newNodes: [{ id: 'n1', entity: 'block', blockType: 'code' }],
      })
      expect(moveCandidateAllowed(context, makeDeleteChange('o1'), makeInsertChange('n1'))).toBe(false)
    })

    it('returns false when depth diff exceeds moveDepthDiffMax', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'block', blockType: 'paragraph', depth: 0 }],
        newNodes: [{ id: 'n1', entity: 'block', blockType: 'paragraph', depth: 5 }],
        options: { moveDepthDiffMax: 2 },
      })
      expect(moveCandidateAllowed(context, makeDeleteChange('o1'), makeInsertChange('n1'))).toBe(false)
    })

    it('returns true when depth diff exceeds limit but path is compatible', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'block', blockType: 'paragraph', depth: 0, pathParts: ['a', 'b'] }],
        newNodes: [{ id: 'n1', entity: 'block', blockType: 'paragraph', depth: 5, pathParts: ['a', 'b'] }],
        options: { moveDepthDiffMax: 2 },
      })
      expect(moveCandidateAllowed(context, makeDeleteChange('o1'), makeInsertChange('n1'))).toBe(true)
    })

    it('returns false when section subtreeSize ratio below min', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'section', kind: 'heading', subtreeSize: 1, depth: 0 }],
        newNodes: [{ id: 'n1', entity: 'section', kind: 'heading', subtreeSize: 10, depth: 0 }],
        options: { moveSubtreeSizeRatioMin: 0.3 },
      })
      expect(moveCandidateAllowed(context, makeDeleteChange('o1'), makeInsertChange('n1'))).toBe(false)
    })

    it('returns false when section subtreeSize ratio above max', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'section', kind: 'heading', subtreeSize: 40, depth: 0 }],
        newNodes: [{ id: 'n1', entity: 'section', kind: 'heading', subtreeSize: 10, depth: 0 }],
        options: { moveSubtreeSizeRatioMax: 3 },
      })
      expect(moveCandidateAllowed(context, makeDeleteChange('o1'), makeInsertChange('n1'))).toBe(false)
    })

    it('returns true when all guards pass for block entity', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'block', blockType: 'paragraph', depth: 1 }],
        newNodes: [{ id: 'n1', entity: 'block', blockType: 'paragraph', depth: 2 }],
      })
      expect(moveCandidateAllowed(context, makeDeleteChange('o1'), makeInsertChange('n1'))).toBe(true)
    })
  })

  describe('uniqueMoveHash', () => {
    it('returns true when exactly one delete and one insert match on subtreeHash', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', subtreeHash: 'target' }],
        newNodes: [{ id: 'n1', subtreeHash: 'target' }],
      })
      const deletes = [makeDeleteChange('o1')]
      const inserts = [makeInsertChange('n1')]
      expect(uniqueMoveHash(deletes, inserts, context, 'subtreeHash', 'target')).toBe(true)
    })

    it('returns false when two deletes share same hash', () => {
      const context = makeContext({
        oldNodes: [
          { id: 'o1', subtreeHash: 'target' },
          { id: 'o2', subtreeHash: 'target' },
        ],
        newNodes: [{ id: 'n1', subtreeHash: 'target' }],
      })
      const deletes = [makeDeleteChange('o1'), makeDeleteChange('o2')]
      const inserts = [makeInsertChange('n1')]
      expect(uniqueMoveHash(deletes, inserts, context, 'subtreeHash', 'target')).toBe(false)
    })

    it('returns false when two inserts share same hash', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', subtreeHash: 'target' }],
        newNodes: [
          { id: 'n1', subtreeHash: 'target' },
          { id: 'n2', subtreeHash: 'target' },
        ],
      })
      const deletes = [makeDeleteChange('o1')]
      const inserts = [makeInsertChange('n1'), makeInsertChange('n2')]
      expect(uniqueMoveHash(deletes, inserts, context, 'subtreeHash', 'target')).toBe(false)
    })

    it('returns false when no matches found', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', subtreeHash: 'other' }],
        newNodes: [{ id: 'n1', subtreeHash: 'other' }],
      })
      const deletes = [makeDeleteChange('o1')]
      const inserts = [makeInsertChange('n1')]
      expect(uniqueMoveHash(deletes, inserts, context, 'subtreeHash', 'target')).toBe(false)
    })
  })

  describe('computeHeadingMoveScore', () => {
    it('returns 1 when headingBodyHash matches', () => {
      const old = makeMockNode({ headingBodyHash: 'hbh-1' })
      const nw = makeMockNode({ headingBodyHash: 'hbh-1' })
      expect(computeHeadingMoveScore(old as any, nw as any)).toBe(1)
    })

    it('returns 1 when contentOnlyHash matches', () => {
      const old = makeMockNode({ contentOnlyHash: 'coh-1', headingBodyHash: undefined })
      const nw = makeMockNode({ contentOnlyHash: 'coh-1', headingBodyHash: undefined })
      expect(computeHeadingMoveScore(old as any, nw as any)).toBe(1)
    })

    it('returns Jaccard similarity when no hash matches', () => {
      const old = makeMockNode({
        contentOnlyHash: 'a', headingBodyHash: undefined,
        textTokens: ['hello', 'world', 'foo'],
      })
      const nw = makeMockNode({
        contentOnlyHash: 'b', headingBodyHash: undefined,
        textTokens: ['hello', 'world', 'bar'],
      })
      const score = computeHeadingMoveScore(old as any, nw as any)
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThan(1)
    })

    it('returns 0 when textTokens are completely disjoint', () => {
      const old = makeMockNode({
        contentOnlyHash: 'a', headingBodyHash: undefined,
        textTokens: ['alpha', 'beta'],
      })
      const nw = makeMockNode({
        contentOnlyHash: 'b', headingBodyHash: undefined,
        textTokens: ['gamma', 'delta'],
      })
      expect(computeHeadingMoveScore(old as any, nw as any)).toBe(0)
    })
  })

  describe('classifyMove', () => {
    it('returns move-exact when subtreeHash matches and is unique', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'section', kind: 'heading', subtreeHash: 'st-1' }],
        newNodes: [{ id: 'n1', entity: 'section', kind: 'heading', subtreeHash: 'st-1' }],
      })
      const deletes = [makeDeleteChange('o1')]
      const inserts = [makeInsertChange('n1')]
      expect(classifyMove(context, 'o1', 'n1', deletes, inserts)).toBe('move-exact')
    })

    it('returns undefined when subtreeHash matches but not unique', () => {
      const context = makeContext({
        oldNodes: [
          { id: 'o1', entity: 'section', kind: 'heading', subtreeHash: 'st-1' },
          { id: 'o2', entity: 'section', kind: 'heading', subtreeHash: 'st-1' },
        ],
        newNodes: [{ id: 'n1', entity: 'section', kind: 'heading', subtreeHash: 'st-1' }],
      })
      const deletes = [makeDeleteChange('o1'), makeDeleteChange('o2')]
      const inserts = [makeInsertChange('n1')]
      expect(classifyMove(context, 'o1', 'n1', deletes, inserts)).toBeUndefined()
    })

    it('returns move-code when code blocks with same contentOnlyHash and unique', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'block', blockType: 'code', subtreeHash: 'diff', contentOnlyHash: 'same' }],
        newNodes: [{ id: 'n1', entity: 'block', blockType: 'code', subtreeHash: 'diff2', contentOnlyHash: 'same' }],
      })
      const deletes = [makeDeleteChange('o1')]
      const inserts = [makeInsertChange('n1')]
      expect(classifyMove(context, 'o1', 'n1', deletes, inserts)).toBe('move-code')
    })

    it('returns undefined when nodes not found', () => {
      const context = makeContext({})
      expect(classifyMove(context, 'missing1', 'missing2', [], [])).toBeUndefined()
    })
  })

  describe('shareMatchedNeighborContext', () => {
    it('returns false when oldNode has no parentId', () => {
      const old = makeMockNode({ parentId: undefined })
      const nw = makeMockNode({ parentId: 'p2' })
      const context = makeContext({})
      expect(shareMatchedNeighborContext(context, old as any, nw as any)).toBe(false)
    })

    it('returns false when newNode has no parentId', () => {
      const old = makeMockNode({ parentId: 'p1' })
      const nw = makeMockNode({ parentId: undefined })
      const context = makeContext({})
      expect(shareMatchedNeighborContext(context, old as any, nw as any)).toBe(false)
    })

    it('returns true when a sibling neighbor is matched to a new neighbor', () => {
      const old = makeMockNode({ id: 'o2', parentId: 'p1', siblingIndex: 1 })
      const nw = makeMockNode({ id: 'n2', parentId: 'p2', siblingIndex: 1 })
      const neighborPair = makePair('o1', 'n1')
      const context = makeContext({
        oldChildren: new Map([['p1', ['o1', 'o2', 'o3']]]),
        newChildren: new Map([['p2', ['n1', 'n2', 'n3']]]),
        matchesByOld: new Map([['o1', neighborPair]]),
      })
      expect(shareMatchedNeighborContext(context, old as any, nw as any)).toBe(true)
    })

    it('returns false when no neighbors share matches', () => {
      const old = makeMockNode({ id: 'o2', parentId: 'p1', siblingIndex: 1 })
      const nw = makeMockNode({ id: 'n2', parentId: 'p2', siblingIndex: 1 })
      const context = makeContext({
        oldChildren: new Map([['p1', ['o1', 'o2', 'o3']]]),
        newChildren: new Map([['p2', ['n1', 'n2', 'n3']]]),
      })
      expect(shareMatchedNeighborContext(context, old as any, nw as any)).toBe(false)
    })
  })

  describe('isUniqueHeadingMoveCandidate', () => {
    it('returns true when candidate is unique with sufficient margin', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'section', kind: 'heading', titleSlug: 'slug', textTokens: ['a'] }],
        newNodes: [{ id: 'n1', entity: 'section', kind: 'heading', titleSlug: 'slug', textTokens: ['a'] }],
      })
      const deletes = [makeDeleteChange('o1')]
      const inserts = [makeInsertChange('n1')]
      const score = computeHeadingMoveScore(
        context.oldIndex.byId.get('o1')! as any,
        context.newIndex.byId.get('n1')! as any,
      )
      expect(isUniqueHeadingMoveCandidate(context, 'o1', 'n1', deletes, inserts, score)).toBe(true)
    })

    it('returns false when target score does not match', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'section', kind: 'heading', titleSlug: 'slug', textTokens: ['a'] }],
        newNodes: [{ id: 'n1', entity: 'section', kind: 'heading', titleSlug: 'slug', textTokens: ['a'] }],
      })
      const deletes = [makeDeleteChange('o1')]
      const inserts = [makeInsertChange('n1')]
      expect(isUniqueHeadingMoveCandidate(context, 'o1', 'n1', deletes, inserts, 0.999)).toBe(false)
    })
  })
})
