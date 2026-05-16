import { describe, expect, it } from 'vitest'
import {
  matchLocalBy,
  headingBodyLocalKey,
  recallComparableNodes,
  boundCandidateIdsBySiblingAnchors,
} from '../engine/local-matching'
import type { DiffContext } from '../engine/context'
import type { MatchPair, SemanticIndex } from '../types'
import { resolveDiffOptions } from '../options'

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
    pathHash: overrides.pathHash as string | undefined,
    titleSlug: overrides.titleSlug as string | undefined,
    textTokens: overrides.textTokens ?? ([] as string[]),
    textSimHash: overrides.textSimHash as string | undefined,
    logicalChildren: overrides.logicalChildren ?? [],
    normalizedTitle: overrides.normalizedTitle ?? '',
    titleTokens: overrides.titleTokens ?? ([] as string[]),
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
    options: resolveDiffOptions({}),
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

describe('local-matching module', () => {
  describe('headingBodyLocalKey', () => {
    it('returns undefined for non-heading node', () => {
      const node = makeMockNode({ entity: 'block', kind: undefined, blockType: 'paragraph' })
      expect(headingBodyLocalKey(node as any)).toBeUndefined()
    })

    it('returns undefined for heading without headingBodyHash', () => {
      const node = makeMockNode({
        entity: 'section', kind: 'heading', headingBodyHash: undefined,
        section: { headingDepth: 2, listDepth: 0, quoteDepth: 0 },
      })
      expect(headingBodyLocalKey(node as any)).toBeUndefined()
    })

    it('returns depth-composite key for heading with headingBodyHash', () => {
      const node = makeMockNode({
        entity: 'section', kind: 'heading', headingBodyHash: 'body-hash-1',
        section: { headingDepth: 2, listDepth: 1, quoteDepth: 0 },
      })
      expect(headingBodyLocalKey(node as any)).toBe('2:1:0:body-hash-1')
    })

    it('uses empty string for missing depth values', () => {
      const node = makeMockNode({
        entity: 'section', kind: 'heading', headingBodyHash: 'bh',
        section: {},
      })
      expect(headingBodyLocalKey(node as any)).toBe(':::bh')
    })

    it('returns undefined for undefined node', () => {
      expect(headingBodyLocalKey(undefined as any)).toBeUndefined()
    })
  })

  describe('matchLocalBy', () => {
    it('matches unique 1:1 key pairs', () => {
      const context = makeContext({
        oldNodes: [
          { id: 'o1', selfHash: 'aaa' },
          { id: 'o2', selfHash: 'bbb' },
        ],
        newNodes: [
          { id: 'n1', selfHash: 'aaa' },
          { id: 'n2', selfHash: 'bbb' },
        ],
      })
      matchLocalBy(context, ['o1', 'o2'], ['n1', 'n2'], (n) => n?.selfHash, 'exact-self')
      expect(context.matchesByOld.has('o1')).toBe(true)
      expect(context.matchesByOld.get('o1')!.newId).toBe('n1')
      expect(context.matchesByOld.has('o2')).toBe(true)
      expect(context.matchesByOld.get('o2')!.newId).toBe('n2')
    })

    it('skips bucket with 2 old entries for same key', () => {
      const context = makeContext({
        oldNodes: [
          { id: 'o1', selfHash: 'same' },
          { id: 'o2', selfHash: 'same' },
        ],
        newNodes: [{ id: 'n1', selfHash: 'same' }],
      })
      matchLocalBy(context, ['o1', 'o2'], ['n1'], (n) => n?.selfHash, 'exact-self')
      expect(context.matchesByOld.size).toBe(0)
    })

    it('skips bucket with 2 new entries for same key', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', selfHash: 'same' }],
        newNodes: [
          { id: 'n1', selfHash: 'same' },
          { id: 'n2', selfHash: 'same' },
        ],
      })
      matchLocalBy(context, ['o1'], ['n1', 'n2'], (n) => n?.selfHash, 'exact-self')
      expect(context.matchesByOld.size).toBe(0)
    })

    it('skips already-matched old nodes', () => {
      const existingPair = makePair('o1', 'nx')
      const context = makeContext({
        oldNodes: [{ id: 'o1', selfHash: 'aaa' }],
        newNodes: [{ id: 'n1', selfHash: 'aaa' }],
        matchesByOld: new Map([['o1', existingPair]]),
      })
      matchLocalBy(context, ['o1'], ['n1'], (n) => n?.selfHash, 'exact-self')
      expect(context.matchesByOld.get('o1')!.newId).toBe('nx')
    })

    it('skips already-matched new nodes', () => {
      const existingPair = makePair('ox', 'n1')
      const context = makeContext({
        oldNodes: [{ id: 'o1', selfHash: 'aaa' }],
        newNodes: [{ id: 'n1', selfHash: 'aaa' }],
        matchesByNew: new Map([['n1', existingPair]]),
      })
      matchLocalBy(context, ['o1'], ['n1'], (n) => n?.selfHash, 'exact-self')
      expect(context.matchesByOld.size).toBe(0)
    })

    it('skips nodes where getKey returns undefined', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', selfHash: undefined }],
        newNodes: [{ id: 'n1', selfHash: undefined }],
      })
      matchLocalBy(context, ['o1'], ['n1'], (n) => n?.selfHash, 'exact-self')
      expect(context.matchesByOld.size).toBe(0)
    })

    it('handles empty id lists', () => {
      const context = makeContext({})
      matchLocalBy(context, [], [], (n) => n?.selfHash, 'exact-self')
      expect(context.matchesByOld.size).toBe(0)
    })

    it('matches only the unique pair when mixed buckets exist', () => {
      const context = makeContext({
        oldNodes: [
          { id: 'o1', selfHash: 'unique' },
          { id: 'o2', selfHash: 'dup' },
          { id: 'o3', selfHash: 'dup' },
        ],
        newNodes: [
          { id: 'n1', selfHash: 'unique' },
          { id: 'n2', selfHash: 'dup' },
        ],
      })
      matchLocalBy(context, ['o1', 'o2', 'o3'], ['n1', 'n2'], (n) => n?.selfHash, 'exact-self')
      expect(context.matchesByOld.size).toBe(1)
      expect(context.matchesByOld.get('o1')!.newId).toBe('n1')
    })

    it('records correct matchKind on the created pair', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', selfHash: 'x' }],
        newNodes: [{ id: 'n1', selfHash: 'x' }],
      })
      matchLocalBy(context, ['o1'], ['n1'], (n) => n?.selfHash, 'local-heading-slug')
      expect(context.matchesByOld.get('o1')!.matchKind).toBe('local-heading-slug')
    })
  })

  describe('boundCandidateIdsBySiblingAnchors', () => {
    it('returns full list when no sibling anchors exist', () => {
      const oldNode = makeMockNode({ id: 'o2', siblingIndex: 1, parentId: 'p1' })
      const context = makeContext({
        oldNodes: [oldNode],
        newNodes: [
          { id: 'n1', siblingIndex: 0 },
          { id: 'n2', siblingIndex: 1 },
          { id: 'n3', siblingIndex: 2 },
        ],
        oldChildren: new Map([['p1', ['o1', 'o2', 'o3']]]),
        newChildren: new Map([['p2', ['n1', 'n2', 'n3']]]),
      })
      const result = boundCandidateIdsBySiblingAnchors(context, oldNode as any, ['n1', 'n2', 'n3'], 'p1', 'p2')
      expect(result).toEqual(['n1', 'n2', 'n3'])
    })

    it('narrows candidates when left anchor exists', () => {
      const oldNode = makeMockNode({ id: 'o3', siblingIndex: 2, parentId: 'p1' })
      const pair = makePair('o1', 'n1')
      const context = makeContext({
        oldNodes: [
          { id: 'o1', siblingIndex: 0, parentId: 'p1' },
          { id: 'o2', siblingIndex: 1, parentId: 'p1' },
          oldNode,
        ],
        newNodes: [
          { id: 'n1', siblingIndex: 0, parentId: 'p2' },
          { id: 'n2', siblingIndex: 1, parentId: 'p2' },
          { id: 'n3', siblingIndex: 2, parentId: 'p2' },
        ],
        oldChildren: new Map([['p1', ['o1', 'o2', 'o3']]]),
        newChildren: new Map([['p2', ['n1', 'n2', 'n3']]]),
        matchesByOld: new Map([['o1', pair]]),
      })
      const result = boundCandidateIdsBySiblingAnchors(context, oldNode as any, ['n1', 'n2', 'n3'], 'p1', 'p2')
      expect(result.length).toBeGreaterThan(0)
      expect(result.length).toBeLessThanOrEqual(3)
    })

    it('falls back to full list when bounded set is empty', () => {
      const oldNode = makeMockNode({ id: 'o2', siblingIndex: 1, parentId: 'p1' })
      const context = makeContext({
        oldNodes: [oldNode],
        newNodes: [],
        oldChildren: new Map([['p1', ['o1', 'o2']]]),
        newChildren: new Map([['p2', []]]),
      })
      const result = boundCandidateIdsBySiblingAnchors(context, oldNode as any, ['n1', 'n2'], 'p1', 'p2')
      expect(result).toEqual(['n1', 'n2'])
    })
  })

  describe('recallComparableNodes', () => {
    it('returns same-shape unmatched nodes when count <= maxComparableNodes', () => {
      const oldNode = makeMockNode({ id: 'o1', entity: 'block', blockType: 'paragraph', siblingIndex: 0, parentId: 'p1' })
      const context = makeContext({
        oldNodes: [oldNode],
        newNodes: [
          { id: 'n1', entity: 'block', blockType: 'paragraph', siblingIndex: 0 },
          { id: 'n2', entity: 'block', blockType: 'paragraph', siblingIndex: 1 },
          { id: 'n3', entity: 'block', blockType: 'paragraph', siblingIndex: 2 },
        ],
        oldChildren: new Map([['p1', ['o1']]]),
        newChildren: new Map([['p2', ['n1', 'n2', 'n3']]]),
      })
      const result = recallComparableNodes(context, oldNode as any, ['n1', 'n2', 'n3'], 'p1', 'p2')
      expect(result.length).toBe(3)
    })

    it('filters out nodes with different shape', () => {
      const oldNode = makeMockNode({ id: 'o1', entity: 'block', blockType: 'paragraph', siblingIndex: 0, parentId: 'p1' })
      const context = makeContext({
        oldNodes: [oldNode],
        newNodes: [
          { id: 'n1', entity: 'block', blockType: 'paragraph', siblingIndex: 0 },
          { id: 'n2', entity: 'block', blockType: 'code', siblingIndex: 1 },
          { id: 'n3', entity: 'section', kind: 'heading', siblingIndex: 2 },
        ],
        oldChildren: new Map([['p1', ['o1']]]),
        newChildren: new Map([['p2', ['n1', 'n2', 'n3']]]),
      })
      const result = recallComparableNodes(context, oldNode as any, ['n1', 'n2', 'n3'], 'p1', 'p2')
      expect(result.length).toBe(1)
      expect(result[0]!.id).toBe('n1')
    })

    it('filters out already-matched new nodes', () => {
      const oldNode = makeMockNode({ id: 'o1', entity: 'block', blockType: 'paragraph', siblingIndex: 0, parentId: 'p1' })
      const matchedPair = makePair('ox', 'n1')
      const context = makeContext({
        oldNodes: [oldNode],
        newNodes: [
          { id: 'n1', entity: 'block', blockType: 'paragraph', siblingIndex: 0 },
          { id: 'n2', entity: 'block', blockType: 'paragraph', siblingIndex: 1 },
        ],
        oldChildren: new Map([['p1', ['o1']]]),
        newChildren: new Map([['p2', ['n1', 'n2']]]),
        matchesByNew: new Map([['n1', matchedPair]]),
      })
      const result = recallComparableNodes(context, oldNode as any, ['n1', 'n2'], 'p1', 'p2')
      expect(result.length).toBe(1)
      expect(result[0]!.id).toBe('n2')
    })

    it('truncates to maxComparableNodes when more candidates exist', () => {
      const oldNode = makeMockNode({ id: 'o1', entity: 'block', blockType: 'paragraph', siblingIndex: 0, parentId: 'p1' })
      const newNodes = Array.from({ length: 10 }, (_, i) => ({
        id: `n${i}`, entity: 'block', blockType: 'paragraph', siblingIndex: i,
      }))
      const context = makeContext({
        oldNodes: [oldNode],
        newNodes,
        oldChildren: new Map([['p1', ['o1']]]),
        newChildren: new Map([['p2', newNodes.map((n) => n.id)]]),
      })
      const result = recallComparableNodes(context, oldNode as any, newNodes.map((n) => n.id), 'p1', 'p2')
      expect(result.length).toBeLessThanOrEqual(6)
    })

    it('returns empty array when no same-shape candidates', () => {
      const oldNode = makeMockNode({ id: 'o1', entity: 'block', blockType: 'paragraph', siblingIndex: 0, parentId: 'p1' })
      const context = makeContext({
        oldNodes: [oldNode],
        newNodes: [
          { id: 'n1', entity: 'block', blockType: 'code', siblingIndex: 0 },
        ],
        oldChildren: new Map([['p1', ['o1']]]),
        newChildren: new Map([['p2', ['n1']]]),
      })
      const result = recallComparableNodes(context, oldNode as any, ['n1'], 'p1', 'p2')
      expect(result.length).toBe(0)
    })

    it('falls back to unranked sameShape when all SimHash distances exceed threshold', () => {
      const oldNode = makeMockNode({
        id: 'o1', entity: 'block', blockType: 'paragraph', siblingIndex: 0, parentId: 'p1',
        textSimHash: 'ffffffffffffffff',
      })
      const newNodes = Array.from({ length: 8 }, (_, i) => ({
        id: `n${i}`, entity: 'block', blockType: 'paragraph', siblingIndex: i,
        textSimHash: '0000000000000000',
      }))
      const context = makeContext({
        oldNodes: [oldNode],
        newNodes,
        oldChildren: new Map([['p1', ['o1']]]),
        newChildren: new Map([['p2', newNodes.map((n) => n.id)]]),
      })
      const result = recallComparableNodes(context, oldNode as any, newNodes.map((n) => n.id), 'p1', 'p2')
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
