import { describe, expect, it } from 'vitest'
import {
  projectToken,
  collectGapMatches,
  definitionGapPairAllowed,
  countDefinitionIdentifier,
  markReorderedChildren,
  buildDeleteChange,
  buildInsertChange,
  buildAlignedChange,
  expandChildren,
  shouldUseShortHeadingFallback,
  pairGapNodes,
} from '../engine/alignment'
import type { DiffContext } from '../engine/context'
import type { MatchPair, AlignedPair, SemanticIndex } from '../types'
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
    identityHash: overrides.identityHash ?? 'ihash-1',
    contentOnlyHash: overrides.contentOnlyHash ?? 'cohash-1',
    headingBodyHash: overrides.headingBodyHash as string | undefined,
    siblingIndex: overrides.siblingIndex ?? 0,
    depth: overrides.depth ?? 0,
    subtreeSize: overrides.subtreeSize ?? 1,
    preorder: overrides.preorder ?? 0,
    parentId: overrides.parentId as string | undefined,
    pathParts: overrides.pathParts ?? [],
    titleSlug: overrides.titleSlug as string | undefined,
    normalizedTitle: overrides.normalizedTitle as string | undefined,
    titleTokens: overrides.titleTokens ?? [],
    textTokens: overrides.textTokens ?? [],
    structuredTokens: overrides.structuredTokens ?? [],
    textSimHash: overrides.textSimHash as string | undefined,
    logicalChildren: overrides.logicalChildren ?? [],
    raw: overrides.raw ?? {},
    block: overrides.block,
    section: overrides.section,
    sourceRange: undefined,
    ...overrides,
  }
}

function makePair(oldId: string, newId: string, matchKind = 'exact-self' as const): MatchPair {
  return {
    oldId,
    newId,
    pairKind: 'match',
    pairKey: `match:${oldId}:${newId}`,
    matchKind,
    score: 1,
  }
}

function makeContext(overrides: Partial<DiffContext> & {
  oldNodes?: Record<string, any>[]
  newNodes?: Record<string, any>[]
  oldChildren?: Map<string, string[]>
  newChildren?: Map<string, string[]>
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
      byBlockType: new Map(),
      byKind: new Map(),
    } as unknown as SemanticIndex,
    newIndex: {
      byId: new Map(newByIdEntries),
      childrenById: overrides.newChildren ?? new Map(),
      byBlockType: new Map(),
      byKind: new Map(),
    } as unknown as SemanticIndex,
    matchesByOld: overrides.matchesByOld ?? new Map(),
    matchesByNew: overrides.matchesByNew ?? new Map(),
    warnings: [],
    ...overrides,
  } as unknown as DiffContext
}

describe('alignment module', () => {
  describe('projectToken', () => {
    it('returns MATCHED:pairKey when child match exists and opposite parent matches', () => {
      const pair = makePair('oc-1', 'nc-1')
      const context = makeContext({
        oldNodes: [{ id: 'oc-1' }],
        newNodes: [{ id: 'nc-1', parentId: 'new-parent' }],
        matchesByOld: new Map([['oc-1', pair]]),
      })
      expect(projectToken(context, 'oc-1', 'new-parent', 'old')).toBe(`MATCHED:${pair.pairKey}`)
    })

    it('returns SELF:selfHash when child has no match', () => {
      const context = makeContext({
        oldNodes: [{ id: 'oc-1', selfHash: 'shash-1' }],
      })
      expect(projectToken(context, 'oc-1', 'any-parent', 'old')).toBe('SELF:shash-1')
    })

    it('returns SELF:selfHash when match exists but opposite parent differs', () => {
      const pair = makePair('oc-1', 'nc-1')
      const context = makeContext({
        oldNodes: [{ id: 'oc-1', selfHash: 'shash-1' }],
        newNodes: [{ id: 'nc-1', parentId: 'wrong-parent' }],
        matchesByOld: new Map([['oc-1', pair]]),
      })
      expect(projectToken(context, 'oc-1', 'correct-parent', 'old')).toBe('SELF:shash-1')
    })

    it('works for tree=new using matchesByNew', () => {
      const pair = makePair('oc-1', 'nc-1')
      const context = makeContext({
        oldNodes: [{ id: 'oc-1', parentId: 'old-parent' }],
        newNodes: [{ id: 'nc-1' }],
        matchesByNew: new Map([['nc-1', pair]]),
      })
      expect(projectToken(context, 'nc-1', 'old-parent', 'new')).toBe(`MATCHED:${pair.pairKey}`)
    })

    it('returns SELF:childId when node not found in index', () => {
      const context = makeContext({})
      expect(projectToken(context, 'missing-id', 'any-parent', 'old')).toBe('SELF:missing-id')
    })
  })

  describe('collectGapMatches', () => {
    it('returns empty array when oldGap is empty', () => {
      const context = makeContext({})
      expect(collectGapMatches(context, [], ['n1'])).toEqual([])
    })

    it('returns empty array when newGap is empty', () => {
      const context = makeContext({})
      expect(collectGapMatches(context, ['o1'], [])).toEqual([])
    })

    it('collects matches where newId is in newGap', () => {
      const pair = makePair('o1', 'n1')
      const context = makeContext({
        matchesByOld: new Map([['o1', pair]]),
        matchesByNew: new Map([['n1', pair]]),
      })
      const result = collectGapMatches(context, ['o1'], ['n1'])
      expect(result).toHaveLength(1)
      expect(result[0]!.oldId).toBe('o1')
      expect(result[0]!.newId).toBe('n1')
    })

    it('skips when newId is not in newGap set', () => {
      const pair = makePair('o1', 'n-other')
      const context = makeContext({
        matchesByOld: new Map([['o1', pair]]),
        matchesByNew: new Map([['n-other', pair]]),
      })
      expect(collectGapMatches(context, ['o1'], ['n1'])).toEqual([])
    })

    it('skips when bidirectional check fails', () => {
      const pair = makePair('o1', 'n1')
      const wrongPair = makePair('o-other', 'n1')
      const context = makeContext({
        matchesByOld: new Map([['o1', pair]]),
        matchesByNew: new Map([['n1', wrongPair]]),
      })
      expect(collectGapMatches(context, ['o1'], ['n1'])).toEqual([])
    })

    it('skips already consumed newId', () => {
      const pair1 = makePair('o1', 'n1')
      const pair2 = makePair('o2', 'n1')
      const context = makeContext({
        matchesByOld: new Map([['o1', pair1], ['o2', pair2]]),
        matchesByNew: new Map([['n1', pair1]]),
      })
      const result = collectGapMatches(context, ['o1', 'o2'], ['n1'])
      expect(result).toHaveLength(1)
    })
  })

  describe('definitionGapPairAllowed', () => {
    it('returns true when oldNode is not a definition', () => {
      const old = makeMockNode({ blockType: 'paragraph' })
      const nw = makeMockNode({ blockType: 'definition', block: { identifier: 'foo' } })
      const context = makeContext({})
      expect(definitionGapPairAllowed(context, old as any, nw as any, [], [])).toBe(true)
    })

    it('returns true when identifiers are different', () => {
      const old = makeMockNode({ blockType: 'definition', block: { identifier: 'foo' } })
      const nw = makeMockNode({ blockType: 'definition', block: { identifier: 'bar' } })
      const context = makeContext({})
      expect(definitionGapPairAllowed(context, old as any, nw as any, [], [])).toBe(true)
    })

    it('returns true when both identifier counts are 1', () => {
      const old = makeMockNode({ id: 'o1', blockType: 'definition', block: { identifier: 'foo' } })
      const nw = makeMockNode({ id: 'n1', blockType: 'definition', block: { identifier: 'foo' } })
      const context = makeContext({
        oldNodes: [old],
        newNodes: [nw],
      })
      expect(definitionGapPairAllowed(context, old as any, nw as any, ['o1'], ['n1'])).toBe(true)
    })

    it('returns false when old identifier count > 1', () => {
      const old = makeMockNode({ id: 'o1', blockType: 'definition', block: { identifier: 'foo' } })
      const old2 = makeMockNode({ id: 'o2', blockType: 'definition', block: { identifier: 'foo' } })
      const nw = makeMockNode({ id: 'n1', blockType: 'definition', block: { identifier: 'foo' } })
      const context = makeContext({
        oldNodes: [old, old2],
        newNodes: [nw],
      })
      expect(definitionGapPairAllowed(context, old as any, nw as any, ['o1', 'o2'], ['n1'])).toBe(false)
    })
  })

  describe('countDefinitionIdentifier', () => {
    it('returns 0 when no definitions match', () => {
      const node = makeMockNode({ id: 'o1', blockType: 'paragraph' })
      const index = { byId: new Map([['o1', node]]) } as unknown as SemanticIndex
      expect(countDefinitionIdentifier(index, ['o1'], 'foo')).toBe(0)
    })

    it('returns count of matching definitions', () => {
      const n1 = makeMockNode({ id: 'o1', blockType: 'definition', block: { identifier: 'foo' } })
      const n2 = makeMockNode({ id: 'o2', blockType: 'definition', block: { identifier: 'foo' } })
      const n3 = makeMockNode({ id: 'o3', blockType: 'definition', block: { identifier: 'bar' } })
      const index = { byId: new Map([['o1', n1], ['o2', n2], ['o3', n3]]) } as unknown as SemanticIndex
      expect(countDefinitionIdentifier(index, ['o1', 'o2', 'o3'], 'foo')).toBe(2)
    })
  })

  describe('shouldUseShortHeadingFallback', () => {
    function makeHeadingNode(overrides: Record<string, any> = {}) {
      return makeMockNode({
        entity: 'section',
        kind: 'heading',
        siblingIndex: 0,
        parentId: 'parent-1',
        normalizedTitle: 'title-a',
        headingBodyHash: 'body-hash-1',
        logicalChildren: ['c1'],
        section: { headingDepth: 2 },
        ...overrides,
      })
    }

    it('returns false when oldNode is not a heading', () => {
      const old = makeMockNode({ kind: 'listItem' })
      const nw = makeHeadingNode({ id: 'n1' })
      const context = makeContext({ oldNodes: [old], newNodes: [nw] })
      expect(shouldUseShortHeadingFallback(context, old as any, nw as any, 'p1', 'p2')).toBe(false)
    })

    it('returns false when heading depths differ', () => {
      const old = makeHeadingNode({ id: 'o1', section: { headingDepth: 2 } })
      const nw = makeHeadingNode({ id: 'n1', section: { headingDepth: 3 } })
      const context = makeContext({ oldNodes: [old], newNodes: [nw] })
      expect(shouldUseShortHeadingFallback(context, old as any, nw as any, 'p1', 'p2')).toBe(false)
    })

    it('returns false when sibling index diff exceeds tolerance', () => {
      const old = makeHeadingNode({ id: 'o1', siblingIndex: 0 })
      const nw = makeHeadingNode({ id: 'n1', siblingIndex: 3 })
      const context = makeContext({ oldNodes: [old], newNodes: [nw] })
      expect(shouldUseShortHeadingFallback(context, old as any, nw as any, 'p1', 'p2')).toBe(false)
    })

    it('returns false when parents are not matched', () => {
      const old = makeHeadingNode({ id: 'o1', siblingIndex: 0 })
      const nw = makeHeadingNode({ id: 'n1', siblingIndex: 0 })
      const context = makeContext({
        oldNodes: [old],
        newNodes: [nw],
      })
      expect(shouldUseShortHeadingFallback(context, old as any, nw as any, 'p1', 'p2')).toBe(false)
    })

    it('returns true when headingBodyHash matches and all conditions met', () => {
      const old = makeHeadingNode({ id: 'o1', siblingIndex: 0, parentId: 'p1', normalizedTitle: 'a' })
      const nw = makeHeadingNode({ id: 'n1', siblingIndex: 0, parentId: 'p2', normalizedTitle: 'b' })
      const parentPair = makePair('p1', 'p2')
      const context = makeContext({
        oldNodes: [old],
        newNodes: [nw],
        oldChildren: new Map([['p1', ['o1']]]),
        newChildren: new Map([['p2', ['n1']]]),
        matchesByOld: new Map([['p1', parentPair]]),
      })
      expect(shouldUseShortHeadingFallback(context, old as any, nw as any, 'p1', 'p2')).toBe(true)
    })

    it('returns true when both have 0 logicalChildren', () => {
      const old = makeHeadingNode({ id: 'o1', siblingIndex: 0, parentId: 'p1', normalizedTitle: 'a', logicalChildren: [], headingBodyHash: 'different-1' })
      const nw = makeHeadingNode({ id: 'n1', siblingIndex: 0, parentId: 'p2', normalizedTitle: 'b', logicalChildren: [], headingBodyHash: 'different-2' })
      const parentPair = makePair('p1', 'p2')
      const context = makeContext({
        oldNodes: [old],
        newNodes: [nw],
        oldChildren: new Map([['p1', ['o1']]]),
        newChildren: new Map([['p2', ['n1']]]),
        matchesByOld: new Map([['p1', parentPair]]),
      })
      expect(shouldUseShortHeadingFallback(context, old as any, nw as any, 'p1', 'p2')).toBe(true)
    })
  })

  describe('markReorderedChildren', () => {
    it('does not mark when order is preserved', () => {
      const context = makeContext({
        newNodes: [
          { id: 'n1', siblingIndex: 0 },
          { id: 'n2', siblingIndex: 1 },
        ],
      })
      const changes = [
        { oldId: 'o1', newId: 'n1', status: makeStatus({ isMatchPair: true }), primaryOp: 'equal' as const, entity: 'block' as const, summary: '', children: [], warnings: [] },
        { oldId: 'o2', newId: 'n2', status: makeStatus({ isMatchPair: true }), primaryOp: 'equal' as const, entity: 'block' as const, summary: '', children: [], warnings: [] },
      ]
      markReorderedChildren(context, changes as any)
      expect((changes[0] as any).reordered).toBeUndefined()
      expect((changes[1] as any).reordered).toBeUndefined()
    })

    it('marks reordered changes outside the LIS', () => {
      const context = makeContext({
        newNodes: [
          { id: 'n1', siblingIndex: 1 },
          { id: 'n2', siblingIndex: 0 },
        ],
      })
      const changes = [
        { oldId: 'o1', newId: 'n1', status: makeStatus({ isMatchPair: true }), primaryOp: 'equal' as const, entity: 'block' as const, summary: '', children: [], warnings: [] },
        { oldId: 'o2', newId: 'n2', status: makeStatus({ isMatchPair: true }), primaryOp: 'equal' as const, entity: 'block' as const, summary: '', children: [], warnings: [] },
      ]
      markReorderedChildren(context, changes as any)
      const reordered = changes.filter((c: any) => c.reordered)
      expect(reordered.length).toBe(1)
      expect(reordered[0]!.status.movedWithinParent).toBe(true)
    })

    it('handles empty changes array', () => {
      const context = makeContext({})
      const changes: any[] = []
      markReorderedChildren(context, changes)
      expect(changes).toHaveLength(0)
    })

    it('ignores unpaired changes', () => {
      const context = makeContext({})
      const changes = [
        { primaryOp: 'delete' as const, oldId: 'o1', status: makeStatus({ selfChanged: true }), entity: 'block' as const, summary: '', children: [], warnings: [] },
        { primaryOp: 'insert' as const, newId: 'n1', status: makeStatus({ selfChanged: true }), entity: 'block' as const, summary: '', children: [], warnings: [] },
      ]
      markReorderedChildren(context, changes as any)
      expect((changes[0] as any).reordered).toBeUndefined()
    })
  })

  describe('buildDeleteChange', () => {
    it('creates delete change with correct entity and blockType', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'block', blockType: 'paragraph', raw: { type: 'paragraph' } }],
      })
      const change = buildDeleteChange(context, 'o1')
      expect(change.primaryOp).toBe('delete')
      expect(change.entity).toBe('block')
      expect(change.blockType).toBe('paragraph')
      expect(change.oldId).toBe('o1')
    })

    it('throws when oldId is not found', () => {
      const context = makeContext({})
      expect(() => buildDeleteChange(context, 'missing')).toThrow()
    })

    it('expands children for section entities', () => {
      const context = makeContext({
        oldNodes: [
          { id: 'o1', entity: 'section', kind: 'heading', raw: {} },
          { id: 'oc1', entity: 'block', blockType: 'paragraph', raw: {} },
        ],
        oldChildren: new Map([['o1', ['oc1']]]),
      })
      const change = buildDeleteChange(context, 'o1')
      expect(change.children).toHaveLength(1)
      expect(change.children[0]!.primaryOp).toBe('delete')
    })

    it('does not expand children for block entities', () => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'block', blockType: 'paragraph', raw: {} }],
        oldChildren: new Map([['o1', ['oc1']]]),
      })
      const change = buildDeleteChange(context, 'o1')
      expect(change.children).toHaveLength(0)
    })
  })

  describe('buildInsertChange', () => {
    it('creates insert change with correct entity and blockType', () => {
      const context = makeContext({
        newNodes: [{ id: 'n1', entity: 'block', blockType: 'code', raw: {} }],
      })
      const change = buildInsertChange(context, 'n1')
      expect(change.primaryOp).toBe('insert')
      expect(change.entity).toBe('block')
      expect(change.blockType).toBe('code')
      expect(change.newId).toBe('n1')
    })

    it('throws when newId is not found', () => {
      const context = makeContext({})
      expect(() => buildInsertChange(context, 'missing')).toThrow()
    })

    it('expands children for section entities', () => {
      const context = makeContext({
        newNodes: [
          { id: 'n1', entity: 'section', kind: 'heading', raw: {} },
          { id: 'nc1', entity: 'block', blockType: 'paragraph', raw: {} },
        ],
        newChildren: new Map([['n1', ['nc1']]]),
      })
      const change = buildInsertChange(context, 'n1')
      expect(change.children).toHaveLength(1)
      expect(change.children[0]!.primaryOp).toBe('insert')
    })
  })

  describe('expandChildren', () => {
    it('builds delete changes for old parent children', () => {
      const context = makeContext({
        oldNodes: [
          { id: 'oc1', entity: 'block', blockType: 'paragraph', raw: {} },
          { id: 'oc2', entity: 'block', blockType: 'code', raw: {} },
        ],
        oldChildren: new Map([['parent', ['oc1', 'oc2']]]),
      })
      const children = expandChildren(context, 'parent', 'delete')
      expect(children).toHaveLength(2)
      expect(children[0]!.primaryOp).toBe('delete')
      expect(children[1]!.primaryOp).toBe('delete')
    })

    it('builds insert changes for new parent children', () => {
      const context = makeContext({
        newNodes: [{ id: 'nc1', entity: 'block', blockType: 'paragraph', raw: {} }],
        newChildren: new Map([['parent', ['nc1']]]),
      })
      const children = expandChildren(context, 'parent', 'insert')
      expect(children).toHaveLength(1)
      expect(children[0]!.primaryOp).toBe('insert')
    })

    it('returns empty array when parent has no children', () => {
      const context = makeContext({})
      expect(expandChildren(context, 'parent', 'delete')).toHaveLength(0)
    })
  })

  describe('pairGapNodes', () => {
    it('returns empty array when oldIds is empty', async () => {
      const context = makeContext({})
      expect(await pairGapNodes(context, [], ['n1'], 'p1', 'p2')).toEqual([])
    })

    it('returns empty array when newIds is empty', async () => {
      const context = makeContext({})
      expect(await pairGapNodes(context, ['o1'], [], 'p1', 'p2')).toEqual([])
    })

    it('pairs single old and new nodes when they pass similarity threshold', async () => {
      const old = makeMockNode({
        id: 'o1', entity: 'block', blockType: 'paragraph', siblingIndex: 0,
        selfHash: 'same', textTokens: ['hello', 'world'], structuredTokens: ['hello', 'world'],
      })
      const nw = makeMockNode({
        id: 'n1', entity: 'block', blockType: 'paragraph', siblingIndex: 0,
        selfHash: 'same', textTokens: ['hello', 'world'], structuredTokens: ['hello', 'world'],
      })
      const context = makeContext({
        oldNodes: [old],
        newNodes: [nw],
        matchesByOld: new Map([['p1', makePair('p1', 'p2')]]),
      })
      const result = await pairGapNodes(context, ['o1'], ['n1'], 'p1', 'p2')
      expect(result.length).toBe(1)
      expect(result[0]!.pairKind).toBe('align')
    })

    it('returns empty when shapes do not match', async () => {
      const old = makeMockNode({ id: 'o1', entity: 'block', blockType: 'paragraph' })
      const nw = makeMockNode({ id: 'n1', entity: 'block', blockType: 'code' })
      const context = makeContext({ oldNodes: [old], newNodes: [nw] })
      const result = await pairGapNodes(context, ['o1'], ['n1'], 'p1', 'p2')
      expect(result).toEqual([])
    })
  })

  describe('buildAlignedChange', () => {
    function makeAligned(oldId: string, newId: string, overrides: Partial<AlignedPair> = {}): AlignedPair {
      return {
        oldId,
        newId,
        pairKind: 'align',
        pairKey: `align:${oldId}:${newId}`,
        score: 0.8,
        ...overrides,
      }
    }

    it('sets primaryOp to equal when selfHash and subtreeHash both match', async () => {
      const hash = 'identical-hash'
      const old = makeMockNode({ id: 'o1', entity: 'block', selfHash: hash, subtreeHash: hash })
      const nw = makeMockNode({ id: 'n1', entity: 'block', selfHash: hash, subtreeHash: hash })
      const context = makeContext({ oldNodes: [old], newNodes: [nw] })
      const change = await buildAlignedChange(context, makeAligned('o1', 'n1'), 'global')
      expect(change.primaryOp).toBe('equal')
      expect(change.status.selfChanged).toBe(false)
      expect(change.status.descendantChanged).toBe(false)
    })

    it('sets primaryOp to replace when selfHash differs', async () => {
      const old = makeMockNode({ id: 'o1', entity: 'block', selfHash: 'a', subtreeHash: 'a' })
      const nw = makeMockNode({ id: 'n1', entity: 'block', selfHash: 'b', subtreeHash: 'b' })
      const context = makeContext({ oldNodes: [old], newNodes: [nw] })
      const change = await buildAlignedChange(context, makeAligned('o1', 'n1'), 'global')
      expect(change.primaryOp).toBe('replace')
      expect(change.status.selfChanged).toBe(true)
    })

    it('sets primaryOp to replace when subtreeHash differs but selfHash matches', async () => {
      const old = makeMockNode({ id: 'o1', entity: 'block', selfHash: 'same', subtreeHash: 'x' })
      const nw = makeMockNode({ id: 'n1', entity: 'block', selfHash: 'same', subtreeHash: 'y' })
      const context = makeContext({ oldNodes: [old], newNodes: [nw] })
      const change = await buildAlignedChange(context, makeAligned('o1', 'n1'), 'global')
      expect(change.primaryOp).toBe('replace')
      expect(change.status.selfChanged).toBe(false)
      expect(change.status.descendantChanged).toBe(true)
    })

    it('sets primaryOp to equal for identical section in local mode', async () => {
      const hash = 'same'
      const old = makeMockNode({
        id: 'o1', entity: 'section', kind: 'heading',
        selfHash: hash, subtreeHash: hash,
        section: { kind: 'heading', headingDepth: 1 },
      })
      const nw = makeMockNode({
        id: 'n1', entity: 'section', kind: 'heading',
        selfHash: hash, subtreeHash: hash,
        section: { kind: 'heading', headingDepth: 1 },
      })
      const context = makeContext({
        oldNodes: [old], newNodes: [nw],
        oldChildren: new Map([['o1', []]]),
        newChildren: new Map([['n1', []]]),
      })
      const change = await buildAlignedChange(context, makeAligned('o1', 'n1'), 'local')
      expect(change.primaryOp).toBe('equal')
      expect(change.status.selfChanged).toBe(false)
      expect(change.status.descendantChanged).toBe(false)
    })

    it('preserves pairKind as align', async () => {
      const old = makeMockNode({ id: 'o1', selfHash: 'a', subtreeHash: 'a' })
      const nw = makeMockNode({ id: 'n1', selfHash: 'a', subtreeHash: 'a' })
      const context = makeContext({ oldNodes: [old], newNodes: [nw] })
      const change = await buildAlignedChange(context, makeAligned('o1', 'n1'), 'global')
      expect(change.pairKind).toBe('align')
      expect(change.status.isAlignedPair).toBe(true)
    })
  })
})
