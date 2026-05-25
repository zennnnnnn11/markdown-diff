import { describe, expect, it } from 'vitest'
import { resolveDiffOptions } from '../../options'
import { DIFF_HEURISTICS } from '../../heuristics'
import type { DiffNode, SemanticIndex, AlignedPair } from '../../types'
import type { DiffContext } from '../context'
import {
  sourceRangeCloseness,
  childShapeSimilarity,
  withinTextRecallWindow,
  simHashDistanceForRecall,
  simHashBonusForRecall,
  buildAptedTree,
  computeAptedRelabelScore,
  computeStructuralFallbackScore,
  collectStructuralFallbackPairs,
} from '../structural-fallback'

function makeDiffNode(overrides: Partial<DiffNode>): DiffNode {
  return {
    id: 'node-1',
    sourceId: 'src-1',
    tree: 'old',
    entity: 'block',
    raw: { type: 'paragraph', children: [] } as unknown as DiffNode['raw'],
    logicalChildren: [],
    preorder: 0,
    subtreeSize: 1,
    siblingIndex: 0,
    depth: 1,
    selfHash: 'aaa',
    directHash: 'bbb',
    subtreeHash: 'ccc',
    identityHash: 'ddd',
    contentOnlyHash: 'eee',
    titleTokens: [],
    textTokens: ['hello'],
    structuredTokens: ['hello'],
    pathParts: ['root'],
    ...overrides,
  }
}

function makeSemanticIndex(nodes: DiffNode[], tree: 'old' | 'new' = 'old'): SemanticIndex {
  const byId = new Map<string, DiffNode>()
  const childrenById = new Map<string, string[]>()
  for (const node of nodes) {
    byId.set(node.id, node)
    childrenById.set(node.id, node.logicalChildren)
  }
  return {
    tree,
    rootId: nodes[0]?.id ?? 'root',
    byId,
    nodesInPreorder: nodes,
    childrenById,
    byKind: new Map(),
    byBlockType: new Map(),
    byHeadingDepth: new Map(),
    bySelfHash: new Map(),
    byDirectHash: new Map(),
    bySubtreeHash: new Map(),
    byIdentityHash: new Map(),
    byHeadingBodyHash: new Map(),
    byPathHash: new Map(),
    backlinks: { footnotes: new Map(), definitions: new Map() },
  }
}

function makeDiffContext(overrides?: {
  oldNodes?: DiffNode[]
  newNodes?: DiffNode[]
}): DiffContext {
  const oldNodes = overrides?.oldNodes ?? []
  const newNodes = overrides?.newNodes ?? []
  return {
    options: resolveDiffOptions(),
    oldIndex: makeSemanticIndex(oldNodes, 'old'),
    newIndex: makeSemanticIndex(newNodes, 'new'),
    matchesByOld: new Map(),
    matchesByNew: new Map(),
    warnings: [],
  }
}

describe('sourceRangeCloseness', () => {
  it('returns fallbackScore when no sourceRange', () => {
    const a = makeDiffNode({ sourceRange: undefined })
    const b = makeDiffNode({ sourceRange: undefined })
    expect(sourceRangeCloseness(a, b)).toBe(DIFF_HEURISTICS.fallback.sourceRange.fallbackScore)
  })

  it('computes line-based closeness', () => {
    const a = makeDiffNode({ sourceRange: { start: { line: 10 }, end: { line: 12 } } })
    const b = makeDiffNode({ sourceRange: { start: { line: 15 }, end: { line: 17 } } })
    const expected = Math.max(0, 1 - 5 / DIFF_HEURISTICS.fallback.sourceRange.lineDivisor)
    expect(sourceRangeCloseness(a, b)).toBeCloseTo(expected)
  })

  it('computes offset-based closeness', () => {
    const a = makeDiffNode({ sourceRange: { start: { offset: 100 }, end: { offset: 200 } } })
    const b = makeDiffNode({ sourceRange: { start: { offset: 300 }, end: { offset: 400 } } })
    const expected = Math.max(0, 1 - 200 / DIFF_HEURISTICS.fallback.sourceRange.offsetDivisor)
    expect(sourceRangeCloseness(a, b)).toBeCloseTo(expected)
  })

  it('clamps to 0 for very distant lines', () => {
    const a = makeDiffNode({ sourceRange: { start: { line: 0 }, end: { line: 1 } } })
    const b = makeDiffNode({ sourceRange: { start: { line: 1000 }, end: { line: 1001 } } })
    expect(sourceRangeCloseness(a, b)).toBe(0)
  })

  it('returns fallbackScore when start exists but has no line or offset', () => {
    const a = makeDiffNode({ sourceRange: { start: {}, end: {} } })
    const b = makeDiffNode({ sourceRange: { start: {}, end: {} } })
    expect(sourceRangeCloseness(a, b)).toBe(DIFF_HEURISTICS.fallback.sourceRange.fallbackScore)
  })
})

describe('childShapeSimilarity', () => {
  it('returns 1 for two empty child lists', () => {
    const ctx = makeDiffContext()
    expect(childShapeSimilarity(ctx, [], [])).toBe(1)
  })

  it('returns 1 for identical signatures', () => {
    const node1 = makeDiffNode({ id: 'c1', entity: 'block', blockType: 'paragraph' })
    const node2 = makeDiffNode({ id: 'c2', entity: 'block', blockType: 'paragraph' })
    const ctx = makeDiffContext({ oldNodes: [node1], newNodes: [node2] })
    expect(childShapeSimilarity(ctx, ['c1'], ['c2'])).toBe(1)
  })

  it('returns 0 for completely disjoint signatures', () => {
    const node1 = makeDiffNode({ id: 'c1', entity: 'block', blockType: 'paragraph' })
    const node2 = makeDiffNode({ id: 'c2', entity: 'block', blockType: 'code' })
    const ctx = makeDiffContext({ oldNodes: [node1], newNodes: [node2] })
    expect(childShapeSimilarity(ctx, ['c1'], ['c2'])).toBe(0)
  })

  it('uses section:kind for section entities', () => {
    const node1 = makeDiffNode({ id: 'c1', entity: 'section', kind: 'heading' })
    const node2 = makeDiffNode({ id: 'c2', entity: 'section', kind: 'heading' })
    const ctx = makeDiffContext({ oldNodes: [node1], newNodes: [node2] })
    expect(childShapeSimilarity(ctx, ['c1'], ['c2'])).toBe(1)
  })
})

describe('withinTextRecallWindow', () => {
  it('returns true when selfHash matches', () => {
    const a = makeDiffNode({ selfHash: 'xyz' })
    const b = makeDiffNode({ selfHash: 'xyz' })
    expect(withinTextRecallWindow(a, b)).toBe(true)
  })

  it('returns true when identityHash matches', () => {
    const a = makeDiffNode({ selfHash: 'a', identityHash: 'xyz' })
    const b = makeDiffNode({ selfHash: 'b', identityHash: 'xyz' })
    expect(withinTextRecallWindow(a, b)).toBe(true)
  })

  it('returns true when contentOnlyHash matches', () => {
    const a = makeDiffNode({ selfHash: 'a', identityHash: 'a', contentOnlyHash: 'xyz' })
    const b = makeDiffNode({ selfHash: 'b', identityHash: 'b', contentOnlyHash: 'xyz' })
    expect(withinTextRecallWindow(a, b)).toBe(true)
  })

  it('returns true when headingBodyHash matches', () => {
    const a = makeDiffNode({
      selfHash: 'a',
      identityHash: 'a',
      contentOnlyHash: 'a',
      headingBodyHash: 'xyz',
    })
    const b = makeDiffNode({
      selfHash: 'b',
      identityHash: 'b',
      contentOnlyHash: 'b',
      headingBodyHash: 'xyz',
    })
    expect(withinTextRecallWindow(a, b)).toBe(true)
  })

  it('returns true when neither has textSimHash (distance is undefined)', () => {
    const a = makeDiffNode({
      selfHash: 'a',
      identityHash: 'a',
      contentOnlyHash: 'a',
      textSimHash: undefined,
    })
    const b = makeDiffNode({
      selfHash: 'b',
      identityHash: 'b',
      contentOnlyHash: 'b',
      textSimHash: undefined,
    })
    expect(withinTextRecallWindow(a, b)).toBe(true)
  })

  it('returns false when simHash distance exceeds threshold', () => {
    const a = makeDiffNode({
      selfHash: 'a',
      identityHash: 'a',
      contentOnlyHash: 'a',
      textSimHash: '0000000000000000',
    })
    const b = makeDiffNode({
      selfHash: 'b',
      identityHash: 'b',
      contentOnlyHash: 'b',
      textSimHash: 'ffffffffffffffff',
    })
    expect(withinTextRecallWindow(a, b)).toBe(false)
  })
})

describe('simHashDistanceForRecall', () => {
  it('returns undefined when both lack textSimHash', () => {
    const a = makeDiffNode({ textSimHash: undefined })
    const b = makeDiffNode({ textSimHash: undefined })
    expect(simHashDistanceForRecall(a, b)).toBeUndefined()
  })

  it('returns 0 for identical textSimHashes', () => {
    const a = makeDiffNode({ textSimHash: 'abcd1234abcd1234' })
    const b = makeDiffNode({ textSimHash: 'abcd1234abcd1234' })
    expect(simHashDistanceForRecall(a, b)).toBe(0)
  })

  it('returns positive distance for different textSimHashes', () => {
    const a = makeDiffNode({ textSimHash: '0000000000000000' })
    const b = makeDiffNode({ textSimHash: '0000000000000001' })
    expect(simHashDistanceForRecall(a, b)).toBe(1)
  })
})

describe('simHashBonusForRecall', () => {
  it('returns 0 when distance is undefined', () => {
    const a = makeDiffNode({ textSimHash: undefined })
    const b = makeDiffNode({ textSimHash: undefined })
    expect(simHashBonusForRecall(a, b)).toBe(0)
  })

  it('returns positive bonus for close hashes', () => {
    const a = makeDiffNode({ textSimHash: '0000000000000000' })
    const b = makeDiffNode({ textSimHash: '0000000000000001' })
    expect(simHashBonusForRecall(a, b)).toBeGreaterThan(0)
  })

  it('returns 0 for distance at or above threshold', () => {
    const a = makeDiffNode({ textSimHash: '0000000000000000' })
    const b = makeDiffNode({ textSimHash: 'ffffffffffffffff' })
    expect(simHashBonusForRecall(a, b)).toBe(0)
  })
})

describe('buildAptedTree', () => {
  it('returns undefined for nonexistent id', () => {
    const index = makeSemanticIndex([])
    expect(buildAptedTree(index, 'missing')).toBeUndefined()
  })

  it('builds leaf node', () => {
    const node = makeDiffNode({ id: 'leaf', logicalChildren: [] })
    const index = makeSemanticIndex([node])
    const tree = buildAptedTree(index, 'leaf')
    expect(tree).toBeDefined()
    expect(tree!.id).toBe('leaf')
    expect(tree!.children).toHaveLength(0)
  })

  it('builds node with children recursively', () => {
    const child = makeDiffNode({ id: 'child', logicalChildren: [] })
    const parent = makeDiffNode({ id: 'parent', logicalChildren: ['child'] })
    const index = makeSemanticIndex([parent, child])
    const tree = buildAptedTree(index, 'parent')
    expect(tree).toBeDefined()
    expect(tree!.children).toHaveLength(1)
    expect(tree!.children[0]!.id).toBe('child')
  })
})

describe('computeAptedRelabelScore', () => {
  it('returns 0 for different shapes', () => {
    const a = makeDiffNode({ entity: 'section', kind: 'heading' })
    const b = makeDiffNode({ entity: 'block', blockType: 'code' })
    const ctx = makeDiffContext({ oldNodes: [a], newNodes: [b] })
    expect(computeAptedRelabelScore(ctx, a, b)).toBe(0)
  })

  it('returns 1 for identical selfHash', () => {
    const a = makeDiffNode({ entity: 'block', blockType: 'paragraph', selfHash: 'same' })
    const b = makeDiffNode({ entity: 'block', blockType: 'paragraph', selfHash: 'same' })
    const ctx = makeDiffContext({ oldNodes: [a], newNodes: [b] })
    expect(computeAptedRelabelScore(ctx, a, b)).toBe(1)
  })

  it('adds pathBonus when pathHash matches', () => {
    const a = makeDiffNode({
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'a1',
      pathHash: 'path1',
      textTokens: ['alpha', 'beta'],
      structuredTokens: ['alpha', 'beta'],
    })
    const b = makeDiffNode({
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'b1',
      pathHash: 'path1',
      textTokens: ['alpha', 'gamma'],
      structuredTokens: ['alpha', 'gamma'],
    })
    const aNoPath = makeDiffNode({
      ...a,
      id: 'a2',
      pathHash: 'pathA',
    })
    const bNoPath = makeDiffNode({
      ...b,
      id: 'b2',
      pathHash: 'pathB',
    })
    const ctx = makeDiffContext({
      oldNodes: [a, aNoPath],
      newNodes: [b, bNoPath],
    })
    const withPath = computeAptedRelabelScore(ctx, a, b)
    const withoutPath = computeAptedRelabelScore(ctx, aNoPath, bNoPath)
    expect(withPath).toBeGreaterThanOrEqual(withoutPath)
    expect(withPath).toBeGreaterThan(0)
  })

  it('clamps result to [0, 1]', () => {
    const a = makeDiffNode({ entity: 'block', blockType: 'paragraph', selfHash: 'a' })
    const b = makeDiffNode({ entity: 'block', blockType: 'paragraph', selfHash: 'b' })
    const ctx = makeDiffContext({ oldNodes: [a], newNodes: [b] })
    const score = computeAptedRelabelScore(ctx, a, b)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})

describe('computeStructuralFallbackScore', () => {
  it('returns score in [0, 1]', () => {
    const a = makeDiffNode({ id: 'old-1', entity: 'block', blockType: 'paragraph', selfHash: 'a' })
    const b = makeDiffNode({ id: 'new-1', entity: 'block', blockType: 'paragraph', selfHash: 'b' })
    const ctx = makeDiffContext({ oldNodes: [a], newNodes: [b] })
    const score = computeStructuralFallbackScore(ctx, a, b, 'old-parent', 'new-parent')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('adds structuralBonus when children count and shape match', () => {
    const oldChild = makeDiffNode({ id: 'oc1', entity: 'block', blockType: 'paragraph' })
    const newChild = makeDiffNode({ id: 'nc1', entity: 'block', blockType: 'paragraph' })
    const oldParent = makeDiffNode({
      id: 'op',
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'a',
      logicalChildren: ['oc1'],
    })
    const newParent = makeDiffNode({
      id: 'np',
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'b',
      logicalChildren: ['nc1'],
    })
    const ctx = makeDiffContext({
      oldNodes: [oldParent, oldChild],
      newNodes: [newParent, newChild],
    })

    const noChildOld = makeDiffNode({
      id: 'op2',
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'a',
      logicalChildren: [],
    })
    const noChildNew = makeDiffNode({
      id: 'np2',
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'b',
      logicalChildren: [],
    })
    const ctx2 = makeDiffContext({ oldNodes: [noChildOld], newNodes: [noChildNew] })

    const withChildren = computeStructuralFallbackScore(
      ctx,
      oldParent,
      newParent,
      'root-old',
      'root-new',
    )
    const withoutChildren = computeStructuralFallbackScore(
      ctx2,
      noChildOld,
      noChildNew,
      'root-old',
      'root-new',
    )
    expect(withChildren).toBeGreaterThanOrEqual(withoutChildren)
  })

  it('uses pathMismatchScore when paths differ', () => {
    const a = makeDiffNode({
      id: 'a',
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'x',
      pathHash: 'pA',
    })
    const b = makeDiffNode({
      id: 'b',
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'y',
      pathHash: 'pB',
    })
    const ctx = makeDiffContext({ oldNodes: [a], newNodes: [b] })
    const score = computeStructuralFallbackScore(ctx, a, b, 'root-old', 'root-new')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})

describe('collectStructuralFallbackPairs', () => {
  it('returns empty for empty aptedMatches', () => {
    const ctx = makeDiffContext()
    const change = {
      entity: 'block' as const,
      primaryOp: 'replace' as const,
      status: {
        isMatchPair: false,
        isAlignedPair: false,
        moved: false,
        movedWithinParent: false,
        renamed: false,
        selfChanged: true,
        descendantChanged: false,
        metaChanged: false,
        inlineStructureChanged: false,
      },
      summary: '',
      children: [],
      warnings: [],
    }
    const result = collectStructuralFallbackPairs(ctx, change, 'old-parent', 'new-parent', [])
    expect(result).toEqual([])
  })

  it('filters out pairs with different shapes', () => {
    const oldNode = makeDiffNode({
      id: 'o1',
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'a',
    })
    const newNode = makeDiffNode({ id: 'n1', entity: 'section', kind: 'heading', selfHash: 'b' })
    const ctx = makeDiffContext({ oldNodes: [oldNode], newNodes: [newNode] })
    const change = {
      entity: 'block' as const,
      primaryOp: 'replace' as const,
      status: {
        isMatchPair: false,
        isAlignedPair: false,
        moved: false,
        movedWithinParent: false,
        renamed: false,
        selfChanged: true,
        descendantChanged: false,
        metaChanged: false,
        inlineStructureChanged: false,
      },
      summary: '',
      children: [],
      warnings: [],
    }
    const result = collectStructuralFallbackPairs(ctx, change, 'old-parent', 'new-parent', [
      { oldId: 'o1', newId: 'n1', tedCost: 1 },
    ])
    expect(result).toEqual([])
  })

  it('performs greedy 1:1 dedup', () => {
    const o1 = makeDiffNode({
      id: 'o1',
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'a',
      textTokens: ['hello', 'world'],
    })
    const o2 = makeDiffNode({
      id: 'o2',
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'c',
      textTokens: ['hello', 'world'],
    })
    const n1 = makeDiffNode({
      id: 'n1',
      entity: 'block',
      blockType: 'paragraph',
      selfHash: 'b',
      textTokens: ['hello', 'world'],
    })
    const ctx = makeDiffContext({ oldNodes: [o1, o2], newNodes: [n1] })
    const change = {
      entity: 'block' as const,
      primaryOp: 'replace' as const,
      status: {
        isMatchPair: false,
        isAlignedPair: false,
        moved: false,
        movedWithinParent: false,
        renamed: false,
        selfChanged: true,
        descendantChanged: false,
        metaChanged: false,
        inlineStructureChanged: false,
      },
      summary: '',
      children: [],
      warnings: [],
    }
    const result = collectStructuralFallbackPairs(ctx, change, 'old-parent', 'new-parent', [
      { oldId: 'o1', newId: 'n1', tedCost: 1 },
      { oldId: 'o2', newId: 'n1', tedCost: 2 },
    ])
    const usedNew = result.map((p) => p.newId)
    expect(new Set(usedNew).size).toBe(usedNew.length)
  })
})
