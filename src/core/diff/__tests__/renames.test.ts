import { describe, expect, it } from 'vitest'
import {
  sameHeadingStructure,
  hasStrongHeadingDirectMatchEvidence,
  lacksLeafHeadingRenameEvidence,
  hasUniqueIdentityRenameCandidate,
} from '../engine/renames'
import type { DiffContext } from '../engine/context'
import type { MatchPair, SemanticIndex } from '../types'
import { resolveDiffOptions } from '../options'
import { diffMarkdown, flatten } from './test-helpers'

function makeMockNode(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? 'node-1',
    entity: overrides.entity ?? ('section' as const),
    kind: overrides.kind ?? ('heading' as const),
    blockType: overrides.blockType ?? undefined,
    selfHash: overrides.selfHash ?? 'hash-1',
    identityHash: overrides.identityHash ?? 'ihash-1',
    contentOnlyHash: overrides.contentOnlyHash ?? 'cohash-1',
    siblingIndex: overrides.siblingIndex ?? 0,
    parentId: overrides.parentId as string | undefined,
    logicalChildren: overrides.logicalChildren ?? ([] as string[]),
    titleTokens: overrides.titleTokens ?? ([] as string[]),
    textTokens: overrides.textTokens ?? ([] as string[]),
    normalizedTitle: overrides.normalizedTitle ?? 'title',
    section: overrides.section ?? { headingDepth: 1, listDepth: 0, quoteDepth: 0, title: 'Title' },
    raw: overrides.raw ?? {},
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
      byIdentityHash: new Map(
        [...new Map(oldByIdEntries)].reduce((acc, [id, node]) => {
          const hash = (node as any).identityHash
          if (hash) {
            const existing = acc.get(hash) ?? []
            existing.push(id)
            acc.set(hash, existing)
          }
          return acc
        }, new Map<string, string[]>()),
      ),
    } as unknown as SemanticIndex,
    newIndex: {
      byId: new Map(newByIdEntries),
      childrenById: overrides.newChildren ?? new Map(),
      byIdentityHash: new Map(
        [...new Map(newByIdEntries)].reduce((acc, [id, node]) => {
          const hash = (node as any).identityHash
          if (hash) {
            const existing = acc.get(hash) ?? []
            existing.push(id)
            acc.set(hash, existing)
          }
          return acc
        }, new Map<string, string[]>()),
      ),
    } as unknown as SemanticIndex,
    matchesByOld: overrides.matchesByOld ?? new Map(),
    matchesByNew: overrides.matchesByNew ?? new Map(),
    warnings: [],
  } as unknown as DiffContext
}

describe('renames module', () => {
  describe('sameHeadingStructure', () => {
    it('returns true when all depths match', () => {
      const old = makeMockNode({ section: { headingDepth: 2, listDepth: 1, quoteDepth: 0 } })
      const nw = makeMockNode({ section: { headingDepth: 2, listDepth: 1, quoteDepth: 0 } })
      expect(sameHeadingStructure(old as any, nw as any)).toBe(true)
    })

    it('returns false when headingDepth differs', () => {
      const old = makeMockNode({ section: { headingDepth: 2, listDepth: 0, quoteDepth: 0 } })
      const nw = makeMockNode({ section: { headingDepth: 3, listDepth: 0, quoteDepth: 0 } })
      expect(sameHeadingStructure(old as any, nw as any)).toBe(false)
    })

    it('returns false when listDepth differs', () => {
      const old = makeMockNode({ section: { headingDepth: 2, listDepth: 0, quoteDepth: 0 } })
      const nw = makeMockNode({ section: { headingDepth: 2, listDepth: 1, quoteDepth: 0 } })
      expect(sameHeadingStructure(old as any, nw as any)).toBe(false)
    })

    it('returns false when quoteDepth differs', () => {
      const old = makeMockNode({ section: { headingDepth: 2, listDepth: 0, quoteDepth: 0 } })
      const nw = makeMockNode({ section: { headingDepth: 2, listDepth: 0, quoteDepth: 1 } })
      expect(sameHeadingStructure(old as any, nw as any)).toBe(false)
    })

    it('returns true when all depths are undefined', () => {
      const old = makeMockNode({ section: {} })
      const nw = makeMockNode({ section: {} })
      expect(sameHeadingStructure(old as any, nw as any)).toBe(true)
    })
  })

  describe('hasStrongHeadingDirectMatchEvidence', () => {
    it('returns false when oldNode has no children', () => {
      const old = makeMockNode({ id: 'o1' })
      const nw = makeMockNode({ id: 'n1' })
      const context = makeContext({
        oldNodes: [old],
        newNodes: [nw],
        oldChildren: new Map(),
        newChildren: new Map([['n1', ['nc1', 'nc2']]]),
      })
      expect(hasStrongHeadingDirectMatchEvidence(context, old as any, nw as any)).toBe(false)
    })

    it('returns false when newNode has no children', () => {
      const old = makeMockNode({ id: 'o1' })
      const nw = makeMockNode({ id: 'n1' })
      const context = makeContext({
        oldNodes: [old],
        newNodes: [nw],
        oldChildren: new Map([['o1', ['oc1', 'oc2']]]),
        newChildren: new Map(),
      })
      expect(hasStrongHeadingDirectMatchEvidence(context, old as any, nw as any)).toBe(false)
    })

    it('returns true when matched children >= threshold for 4:4 (need 2)', () => {
      const old = makeMockNode({ id: 'o1' })
      const nw = makeMockNode({ id: 'n1' })
      const pair1 = makePair('oc1', 'nc1')
      const pair2 = makePair('oc2', 'nc2')
      const context = makeContext({
        oldNodes: [old],
        newNodes: [nw],
        oldChildren: new Map([['o1', ['oc1', 'oc2', 'oc3', 'oc4']]]),
        newChildren: new Map([['n1', ['nc1', 'nc2', 'nc3', 'nc4']]]),
        matchesByOld: new Map([['oc1', pair1], ['oc2', pair2]]),
      })
      expect(hasStrongHeadingDirectMatchEvidence(context, old as any, nw as any)).toBe(true)
    })

    it('returns false for 6:6 with 2 matches (below ceil(6/2)=3)', () => {
      const old = makeMockNode({ id: 'o1' })
      const nw = makeMockNode({ id: 'n1' })
      const pair1 = makePair('oc1', 'nc1')
      const pair2 = makePair('oc2', 'nc2')
      const context = makeContext({
        oldNodes: [old],
        newNodes: [nw],
        oldChildren: new Map([['o1', ['oc1', 'oc2', 'oc3', 'oc4', 'oc5', 'oc6']]]),
        newChildren: new Map([['n1', ['nc1', 'nc2', 'nc3', 'nc4', 'nc5', 'nc6']]]),
        matchesByOld: new Map([['oc1', pair1], ['oc2', pair2]]),
      })
      expect(hasStrongHeadingDirectMatchEvidence(context, old as any, nw as any)).toBe(false)
    })

    it('returns true for 6:6 with 3 matches (equals ceil(6/2)=3)', () => {
      const old = makeMockNode({ id: 'o1' })
      const nw = makeMockNode({ id: 'n1' })
      const context = makeContext({
        oldNodes: [old],
        newNodes: [nw],
        oldChildren: new Map([['o1', ['oc1', 'oc2', 'oc3', 'oc4', 'oc5', 'oc6']]]),
        newChildren: new Map([['n1', ['nc1', 'nc2', 'nc3', 'nc4', 'nc5', 'nc6']]]),
        matchesByOld: new Map([
          ['oc1', makePair('oc1', 'nc1')],
          ['oc2', makePair('oc2', 'nc2')],
          ['oc3', makePair('oc3', 'nc3')],
        ]),
      })
      expect(hasStrongHeadingDirectMatchEvidence(context, old as any, nw as any)).toBe(true)
    })
  })

  describe('lacksLeafHeadingRenameEvidence', () => {
    it('returns false when oldNode has logicalChildren (non-leaf)', () => {
      const old = makeMockNode({ logicalChildren: ['c1'] })
      const nw = makeMockNode({ logicalChildren: [] })
      expect(lacksLeafHeadingRenameEvidence(old as any, nw as any)).toBe(false)
    })

    it('returns false when newNode has logicalChildren (non-leaf)', () => {
      const old = makeMockNode({ logicalChildren: [] })
      const nw = makeMockNode({ logicalChildren: ['c1'] })
      expect(lacksLeafHeadingRenameEvidence(old as any, nw as any)).toBe(false)
    })

    it('returns true when both leaf and titleTokens are completely disjoint', () => {
      const old = makeMockNode({ logicalChildren: [], titleTokens: ['alpha', 'beta'] })
      const nw = makeMockNode({ logicalChildren: [], titleTokens: ['gamma', 'delta'] })
      expect(lacksLeafHeadingRenameEvidence(old as any, nw as any)).toBe(true)
    })

    it('returns false when both leaf and titleTokens have overlap', () => {
      const old = makeMockNode({ logicalChildren: [], titleTokens: ['hello', 'world'] })
      const nw = makeMockNode({ logicalChildren: [], titleTokens: ['hello', 'earth'] })
      expect(lacksLeafHeadingRenameEvidence(old as any, nw as any)).toBe(false)
    })

    it('uses character-level similarity when titleTokens are empty', () => {
      const old = makeMockNode({ logicalChildren: [], titleTokens: [], section: { title: 'abc' } })
      const nw = makeMockNode({ logicalChildren: [], titleTokens: [], section: { title: 'abd' } })
      expect(lacksLeafHeadingRenameEvidence(old as any, nw as any)).toBe(false)
    })
  })

  describe('hasUniqueIdentityRenameCandidate', () => {
    it('returns true when both identity hash groups have exactly 1 same-shape candidate', () => {
      const old = makeMockNode({ id: 'o1', identityHash: 'ih-1', entity: 'section', kind: 'footnote' })
      const nw = makeMockNode({ id: 'n1', identityHash: 'ih-1', entity: 'section', kind: 'footnote' })
      const context = makeContext({ oldNodes: [old], newNodes: [nw] })
      expect(hasUniqueIdentityRenameCandidate(context, old as any, nw as any)).toBe(true)
    })

    it('returns false when old hash group has 2 same-shape candidates', () => {
      const old = makeMockNode({ id: 'o1', identityHash: 'ih-1', entity: 'section', kind: 'footnote' })
      const old2 = makeMockNode({ id: 'o2', identityHash: 'ih-1', entity: 'section', kind: 'footnote' })
      const nw = makeMockNode({ id: 'n1', identityHash: 'ih-1', entity: 'section', kind: 'footnote' })
      const context = makeContext({ oldNodes: [old, old2], newNodes: [nw] })
      expect(hasUniqueIdentityRenameCandidate(context, old as any, nw as any)).toBe(false)
    })

    it('returns true when extra candidates are filtered by shape mismatch', () => {
      const old = makeMockNode({ id: 'o1', identityHash: 'ih-1', entity: 'section', kind: 'footnote' })
      const old2 = makeMockNode({ id: 'o2', identityHash: 'ih-1', entity: 'block', kind: undefined, blockType: 'paragraph' })
      const nw = makeMockNode({ id: 'n1', identityHash: 'ih-1', entity: 'section', kind: 'footnote' })
      const context = makeContext({ oldNodes: [old, old2], newNodes: [nw] })
      expect(hasUniqueIdentityRenameCandidate(context, old as any, nw as any)).toBe(true)
    })
  })

  describe('integration: heading rename detection', () => {
    it('renames heading when body unchanged', async () => {
      const oldMd = '# Old Title\n\nContent here.'
      const newMd = '# New Title\n\nContent here.'
      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const renamed = changes.filter((c) => c.status.renamed)
      expect(renamed.length).toBeGreaterThan(0)
    })

    it('does not rename heading with zero token overlap', async () => {
      const oldMd = '# Alpha Beta\n\nContent.'
      const newMd = '# Gamma Delta\n\nDifferent content.'
      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const renamed = changes.filter((c) => c.status.renamed && c.kind === 'heading')
      expect(renamed.length).toBe(0)
    })
  })
})
