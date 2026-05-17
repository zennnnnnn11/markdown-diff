import { describe, expect, it } from 'vitest'
import { moveCandidateAllowed } from '../engine/moves'
import { shouldUseShortHeadingFallback } from '../engine/alignment'
import { recallComparableNodes } from '../engine/local-matching'
import type { DiffContext } from '../engine/context'
import type { DiffChange, MatchPair, SemanticIndex } from '../types'
import { resolveDiffOptions } from '../options'
import { diffMarkdown, flatten, makeStatus } from './test-helpers'

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

describe('threshold boundaries', () => {
  describe('moveDepthDiffMax (default: 2)', () => {
    it.each([
      { depthDiff: 1, label: 'BELOW', expected: true },
      { depthDiff: 2, label: 'AT', expected: true },
      { depthDiff: 3, label: 'ABOVE', expected: false },
    ])('$label threshold (depthDiff=$depthDiff) → allowed=$expected', ({ depthDiff, expected }) => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'block', blockType: 'paragraph', depth: 0 }],
        newNodes: [{ id: 'n1', entity: 'block', blockType: 'paragraph', depth: depthDiff }],
        options: { moveDepthDiffMax: 2 },
      })
      expect(moveCandidateAllowed(context, makeDeleteChange('o1'), makeInsertChange('n1'))).toBe(expected)
    })
  })

  describe('moveSubtreeSizeRatioMin (default: 0.3)', () => {
    it.each([
      { oldSize: 3, newSize: 10, label: 'AT (ratio=0.3)', expected: true },
      { oldSize: 4, newSize: 10, label: 'ABOVE (ratio=0.4)', expected: true },
      { oldSize: 2, newSize: 10, label: 'BELOW (ratio=0.2)', expected: false },
    ])('$label → allowed=$expected', ({ oldSize, newSize, expected }) => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'section', kind: 'heading', subtreeSize: oldSize, depth: 0 }],
        newNodes: [{ id: 'n1', entity: 'section', kind: 'heading', subtreeSize: newSize, depth: 0 }],
        options: { moveSubtreeSizeRatioMin: 0.3, moveSubtreeSizeRatioMax: 100 },
      })
      expect(moveCandidateAllowed(context, makeDeleteChange('o1'), makeInsertChange('n1'))).toBe(expected)
    })
  })

  describe('moveSubtreeSizeRatioMax (default: 3)', () => {
    it.each([
      { oldSize: 30, newSize: 10, label: 'AT (ratio=3.0)', expected: true },
      { oldSize: 25, newSize: 10, label: 'BELOW (ratio=2.5)', expected: true },
      { oldSize: 31, newSize: 10, label: 'ABOVE (ratio=3.1)', expected: false },
    ])('$label → allowed=$expected', ({ oldSize, newSize, expected }) => {
      const context = makeContext({
        oldNodes: [{ id: 'o1', entity: 'section', kind: 'heading', subtreeSize: oldSize, depth: 0 }],
        newNodes: [{ id: 'n1', entity: 'section', kind: 'heading', subtreeSize: newSize, depth: 0 }],
        options: { moveSubtreeSizeRatioMin: 0, moveSubtreeSizeRatioMax: 3 },
      })
      expect(moveCandidateAllowed(context, makeDeleteChange('o1'), makeInsertChange('n1'))).toBe(expected)
    })
  })

  describe('minSimilarity (default: 0.55)', () => {
    it('high similarity markdown produces match pairs', async () => {
      const oldMd = '# Title\n\nThis is a paragraph with specific content about testing.'
      const newMd = '# Title\n\nThis is a paragraph with specific content about testing with minor edits.'
      const result = await diffMarkdown(oldMd, newMd, { minSimilarity: 0.1 })
      const changes = flatten(result.root)
      const matched = changes.filter((c) => c.status.isMatchPair || c.status.isAlignedPair)
      expect(matched.length).toBeGreaterThan(0)
    })

    it('very high minSimilarity rejects fuzzy matches', async () => {
      const oldMd = '# Title\n\nContent alpha.'
      const newMd = '# Title\n\nContent beta.'
      const lowThreshold = await diffMarkdown(oldMd, newMd, { minSimilarity: 0.1 })
      const highThreshold = await diffMarkdown(oldMd, newMd, { minSimilarity: 0.99 })
      const lowChanges = flatten(lowThreshold.root)
      const highChanges = flatten(highThreshold.root)
      const lowDeletes = lowChanges.filter((c) => c.primaryOp === 'delete')
      const highDeletes = highChanges.filter((c) => c.primaryOp === 'delete')
      expect(highDeletes.length).toBeGreaterThan(lowDeletes.length)
    })
  })

  describe('maxLocalAlignmentCost', () => {
    it('low cost limit triggers degradation or warning', async () => {
      const items = Array.from({ length: 20 }, (_, i) => `- item ${i}`).join('\n')
      const oldMd = `# Section\n\n${items}`
      const newMd = `# Section\n\n${items.replace('item 10', 'changed 10')}`
      const result = await diffMarkdown(oldMd, newMd, { maxLocalAlignmentCost: 1 })
      const changes = flatten(result.root)
      const degradedOrWarned = changes.filter(
        (c) => c.degraded || c.warnings.includes('local-window-exceeded'),
      )
      expect(degradedOrWarned.length).toBeGreaterThan(0)
    })

    it('high cost limit processes normally', async () => {
      const items = Array.from({ length: 10 }, (_, i) => `- item ${i}`).join('\n')
      const oldMd = `# Section\n\n${items}`
      const newMd = `# Section\n\n${items.replace('item 5', 'changed 5')}`
      const result = await diffMarkdown(oldMd, newMd, { maxLocalAlignmentCost: 100_000 })
      const changes = flatten(result.root)
      const degraded = changes.filter((c) => c.degraded)
      expect(degraded.length).toBe(0)
    })
  })

  describe('maxRecursiveAlignmentCost', () => {
    it('low cost limit triggers subtree-budget-exceeded', async () => {
      const items = Array.from({ length: 30 }, (_, i) => `- item ${i} with text content`).join('\n')
      const oldMd = `# Root\n\n${items}`
      const newMd = `# Root\n\n${items.replace('item 15', 'changed 15')}`
      const result = await diffMarkdown(oldMd, newMd, { maxRecursiveAlignmentCost: 1 })
      const changes = flatten(result.root)
      const degradedOrWarned = changes.filter(
        (c) => c.degraded || c.warnings.includes('subtree-budget-exceeded'),
      )
      expect(degradedOrWarned.length).toBeGreaterThan(0)
    })
  })

  describe('maxInlineDiffMatrixCost', () => {
    it('low cost limit triggers inline-deferred warning', async () => {
      const makeHeavy = (prefix: string) =>
        Array.from({ length: 30 }, (_, i) => `**${prefix}${i}** _${prefix}${i}_ [${prefix}${i}](u${i})`).join(' ')
      const oldMd = `# Title\n\n${makeHeavy('old')}`
      const newMd = `# Title\n\n${makeHeavy('new')}`
      const result = await diffMarkdown(oldMd, newMd, { maxInlineDiffMatrixCost: 1 })
      const changes = flatten(result.root)
      const deferred = changes.filter((c) => c.warnings.includes('inline-deferred'))
      expect(deferred.length).toBeGreaterThan(0)
    })
  })

  describe('longCodeLineThreshold + codeFoldContextLines', () => {
    it('code below threshold is not folded', async () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`)
      const oldCode = '```\n' + lines.join('\n') + '\n```'
      const modified = [...lines]
      modified[5] = 'changed line 5'
      const newCode = '```\n' + modified.join('\n') + '\n```'
      const result = await diffMarkdown(oldCode, newCode)
      const changes = flatten(result.root)
      const codeChange = changes.find((c) => c.blockType === 'code' && c.codeSpans)
      expect(codeChange).toBeDefined()
      expect(codeChange!.codeSpans!.length).toBe(10)
    })

    it('code above threshold is folded', async () => {
      const lines = Array.from({ length: 250 }, (_, i) => `line ${i}`)
      const oldCode = '```\n' + lines.join('\n') + '\n```'
      const modified = [...lines]
      modified[125] = 'changed line 125'
      const newCode = '```\n' + modified.join('\n') + '\n```'
      const result = await diffMarkdown(oldCode, newCode, {
        longCodeLineThreshold: 200,
        codeFoldContextLines: 5,
      })
      const changes = flatten(result.root)
      const codeChange = changes.find((c) => c.blockType === 'code' && c.codeSpans)
      expect(codeChange).toBeDefined()
      expect(codeChange!.codeSpans!.length).toBeLessThan(250)
    })
  })

  describe('shortHeadingSiblingTolerance (heuristic: 1)', () => {
    it('allows fallback when sibling distance <= tolerance', () => {
      const old = makeMockNode({
        id: 'o1', entity: 'section', kind: 'heading', siblingIndex: 0,
        section: { headingDepth: 2 }, headingBodyHash: 'same', logicalChildren: [],
      })
      const nw = makeMockNode({
        id: 'n1', entity: 'section', kind: 'heading', siblingIndex: 1,
        section: { headingDepth: 2 }, headingBodyHash: 'same', logicalChildren: [],
      })
      const parentPair = makePair('p1', 'p2')
      const context = makeContext({
        oldNodes: [old, { id: 'o1-sib', entity: 'section', kind: 'heading', siblingIndex: 1, section: { headingDepth: 2 }, titleSlug: 'other' }],
        newNodes: [nw, { id: 'n1-sib', entity: 'section', kind: 'heading', siblingIndex: 0, section: { headingDepth: 2 }, titleSlug: 'other2' }],
        oldChildren: new Map([['p1', ['o1', 'o1-sib']]]),
        newChildren: new Map([['p2', ['n1-sib', 'n1']]]),
        matchesByOld: new Map([['p1', parentPair]]),
      })
      const result = shouldUseShortHeadingFallback(context, old as any, nw as any, 'p1', 'p2')
      expect(result).toBe(true)
    })

    it('rejects fallback when sibling distance > tolerance', () => {
      const old = makeMockNode({
        id: 'o1', entity: 'section', kind: 'heading', siblingIndex: 0,
        section: { headingDepth: 2 }, headingBodyHash: 'same', logicalChildren: [],
      })
      const nw = makeMockNode({
        id: 'n1', entity: 'section', kind: 'heading', siblingIndex: 3,
        section: { headingDepth: 2 }, headingBodyHash: 'same', logicalChildren: [],
      })
      const parentPair = makePair('p1', 'p2')
      const context = makeContext({
        oldNodes: [old],
        newNodes: [nw],
        matchesByOld: new Map([['p1', parentPair]]),
      })
      const result = shouldUseShortHeadingFallback(context, old as any, nw as any, 'p1', 'p2')
      expect(result).toBe(false)
    })
  })

  describe('maxComparableNodes (heuristic: 6)', () => {
    it('returns all candidates when count is at threshold', () => {
      const oldNode = makeMockNode({ id: 'o1', entity: 'block', blockType: 'paragraph', siblingIndex: 0, parentId: 'p1' })
      const newNodes = Array.from({ length: 6 }, (_, i) => ({
        id: `n${i}`, entity: 'block', blockType: 'paragraph', siblingIndex: i,
      }))
      const context = makeContext({
        oldNodes: [oldNode],
        newNodes,
        oldChildren: new Map([['p1', ['o1']]]),
        newChildren: new Map([['p2', newNodes.map((n) => n.id)]]),
      })
      const result = recallComparableNodes(context, oldNode as any, newNodes.map((n) => n.id), 'p1', 'p2')
      expect(result.length).toBe(6)
    })

    it('truncates candidates when count exceeds threshold', () => {
      const oldNode = makeMockNode({ id: 'o1', entity: 'block', blockType: 'paragraph', siblingIndex: 0, parentId: 'p1' })
      const newNodes = Array.from({ length: 7 }, (_, i) => ({
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
  })

  describe('preorderOffsetThreshold (default: 3)', () => {
    it('offset within threshold matches with context', async () => {
      const items = Array.from({ length: 5 }, (_, i) => `- item ${i}`).join('\n')
      const oldMd = `# Section\n\n${items}`
      const newMd = `# Section\n\n- new item\n${items}`
      const result = await diffMarkdown(oldMd, newMd, { preorderOffsetThreshold: 10 })
      const changes = flatten(result.root)
      const matched = changes.filter((c) => c.status.isMatchPair || c.status.isAlignedPair)
      expect(matched.length).toBeGreaterThan(0)
    })
  })
})
