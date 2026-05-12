import { describe, expect, it } from 'vitest'
import { computeNodeSimilarity, isSameShape, uniquenessMargin } from '../similarity'
import type { DiffNode } from '../types'

const OPTIONS = {
  minHashTokenCount: 64,
  minHashNumFunctions: 32,
} as const

function makeNode(overrides: Partial<DiffNode> = {}): DiffNode {
  const baseBlock = {
    type: 'paragraph',
    children: [{ type: 'text', value: 'text' }],
  } as any

  return {
    id: 'node',
    sourceId: 'source',
    tree: 'old',
    entity: 'block',
    raw: baseBlock,
    block: baseBlock,
    blockType: 'paragraph',
    logicalChildren: [],
    preorder: 0,
    subtreeSize: 1,
    siblingIndex: 0,
    depth: 0,
    selfHash: 'self',
    directHash: 'direct',
    subtreeHash: 'subtree',
    identityHash: 'identity',
    contentOnlyHash: 'content',
    titleTokens: [],
    textTokens: ['text'],
    structuredTokens: [],
    pathParts: [],
    ...overrides,
  }
}

describe('node similarity', () => {
  it('checks shape compatibility before computing similarity', () => {
    const section = makeNode({ entity: 'section', kind: 'heading', section: { kind: 'heading', title: 'A', items: [], children: [] } as any })
    const block = makeNode({ entity: 'block', blockType: 'paragraph' })
    const otherBlock = makeNode({ blockType: 'code', block: { type: 'code', value: 'x' } as any })

    expect(isSameShape(section, block)).toBe(false)
    expect(isSameShape(block, otherBlock)).toBe(false)
    expect(computeNodeSimilarity(section, block, OPTIONS)).toBe(0)
  })

  it('returns 1 for identical self hashes and for identity-based footnote matches', () => {
    const left = makeNode()
    const right = makeNode({ selfHash: 'self' })
    const footnoteLeft = makeNode({
      entity: 'section',
      kind: 'footnote',
      section: { kind: 'footnote', title: '', items: [], children: [] } as any,
      raw: { kind: 'footnote' } as any,
      selfHash: 'left',
      identityHash: 'shared',
    })
    const footnoteRight = makeNode({
      entity: 'section',
      kind: 'footnote',
      section: { kind: 'footnote', title: '', items: [], children: [] } as any,
      raw: { kind: 'footnote' } as any,
      selfHash: 'right',
      identityHash: 'shared',
    })

    expect(computeNodeSimilarity(left, right, OPTIONS)).toBe(1)
    expect(computeNodeSimilarity(footnoteLeft, footnoteRight, OPTIONS)).toBe(1)
  })

  it('uses the generic content-only score for same-shape non-special nodes', () => {
    const left = makeNode({
      entity: 'section',
      kind: 'listItem',
      section: { kind: 'listItem', title: '', items: [], children: [] } as any,
      raw: { kind: 'listItem' } as any,
      selfHash: 'left',
      contentOnlyHash: 'shared',
      textTokens: ['alpha'],
    })
    const right = makeNode({
      entity: 'section',
      kind: 'listItem',
      section: { kind: 'listItem', title: '', items: [], children: [] } as any,
      raw: { kind: 'listItem' } as any,
      selfHash: 'right',
      contentOnlyHash: 'shared',
      textTokens: ['beta'],
    })

    expect(computeNodeSimilarity(left, right, OPTIONS)).toBe(0.95)
  })

  it('scores paragraph pairs higher when text and inline structure stay closer', () => {
    const oldParagraph = makeNode({
      selfHash: 'old',
      textTokens: ['alpha', 'beta', 'gamma'],
      block: {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'alpha beta ' },
          { type: 'strong', children: [{ type: 'text', value: 'gamma' }] },
        ],
      } as any,
    })
    const similarParagraph = makeNode({
      selfHash: 'similar',
      textTokens: ['alpha', 'beta', 'delta'],
      block: {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'alpha beta ' },
          { type: 'strong', children: [{ type: 'text', value: 'delta' }] },
        ],
      } as any,
    })
    const distantParagraph = makeNode({
      selfHash: 'distant',
      textTokens: ['omega', 'theta'],
      block: {
        type: 'paragraph',
        children: [
          { type: 'link', url: 'https://example.com', children: [{ type: 'text', value: 'omega' }] },
        ],
      } as any,
    })

    const similarScore = computeNodeSimilarity(oldParagraph, similarParagraph, OPTIONS)
    const distantScore = computeNodeSimilarity(oldParagraph, distantParagraph, OPTIONS)

    expect(similarScore).toBeGreaterThan(distantScore)
  })

  it('scores headings with matching body hashes and stronger context higher than weaker alternatives', () => {
    const oldHeading = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: 'Alpha', headingDepth: 2, items: [], children: [] } as any,
      raw: { kind: 'heading' } as any,
      selfHash: 'old',
      headingBodyHash: 'body',
      titleTokens: ['alpha'],
      logicalChildren: ['child'],
    })
    const closeHeading = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: 'Alpha Project', headingDepth: 2, items: [], children: [] } as any,
      raw: { kind: 'heading' } as any,
      selfHash: 'close',
      headingBodyHash: 'body',
      titleTokens: ['alpha', 'project'],
      logicalChildren: ['child'],
    })
    const weakerHeading = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: 'Alpha Project', headingDepth: 3, items: [], children: [] } as any,
      raw: { kind: 'heading' } as any,
      selfHash: 'weak',
      headingBodyHash: 'other',
      titleTokens: ['alpha', 'project'],
      logicalChildren: ['child'],
    })
    const leafHeading = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: 'Leaf', headingDepth: 2, items: [], children: [] } as any,
      raw: { kind: 'heading' } as any,
      selfHash: 'leaf-old',
      headingBodyHash: 'leaf',
      titleTokens: ['leaf'],
      logicalChildren: [],
    })
    const leafVariant = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: 'Leaf Next', headingDepth: 3, items: [], children: [] } as any,
      raw: { kind: 'heading' } as any,
      selfHash: 'leaf-new',
      headingBodyHash: 'leaf-other',
      titleTokens: ['leaf', 'next'],
      logicalChildren: [],
    })

    expect(computeNodeSimilarity(oldHeading, closeHeading, OPTIONS, 1)).toBeGreaterThan(
      computeNodeSimilarity(oldHeading, weakerHeading, OPTIONS, 0.7),
    )
    expect(computeNodeSimilarity(leafHeading, leafVariant, OPTIONS, 1)).toBeGreaterThan(0)
  })

  it('adds a language bonus for similar code blocks with the same language', () => {
    const oldCode = makeNode({
      blockType: 'code',
      block: { type: 'code', value: 'const answer = 1', lang: 'ts' } as any,
      textTokens: ['const', 'answer', '1'],
      contentOnlyHash: 'old-code',
      selfHash: 'old',
    })
    const sameLanguage = makeNode({
      blockType: 'code',
      block: { type: 'code', value: 'const answer = 2', lang: 'ts' } as any,
      textTokens: ['const', 'answer', '2'],
      contentOnlyHash: 'new-code',
      selfHash: 'same-lang',
    })
    const differentLanguage = makeNode({
      blockType: 'code',
      block: { type: 'code', value: 'const answer = 2', lang: 'js' } as any,
      textTokens: ['const', 'answer', '2'],
      contentOnlyHash: 'new-code',
      selfHash: 'diff-lang',
    })

    expect(computeNodeSimilarity(oldCode, sameLanguage, OPTIONS)).toBeGreaterThan(
      computeNodeSimilarity(oldCode, differentLanguage, OPTIONS),
    )
  })

  it('caps same-language code similarity at 1 even when line similarity and language bonus both max out', () => {
    const oldCode = makeNode({
      blockType: 'code',
      block: { type: 'code', value: 'const answer = 1', lang: 'ts' } as any,
      textTokens: ['const', 'answer', '1'],
      contentOnlyHash: 'old-content',
      selfHash: 'old',
    })
    const sameCode = makeNode({
      blockType: 'code',
      block: { type: 'code', value: 'const answer = 1', lang: 'ts' } as any,
      textTokens: ['const', 'answer', '1'],
      contentOnlyHash: 'new-content',
      selfHash: 'new',
    })

    expect(computeNodeSimilarity(oldCode, sameCode, OPTIONS)).toBe(1)
  })

  it('considers table shape, cell text, and alignment together', () => {
    const oldTable = makeNode({
      blockType: 'table',
      block: {
        type: 'table',
        align: ['left', 'right'],
        children: [
          { type: 'tableRow', children: [{ type: 'tableCell', children: [{ type: 'text', value: 'A1' }] }, { type: 'tableCell', children: [{ type: 'text', value: 'B1' }] }] },
          { type: 'tableRow', children: [{ type: 'tableCell', children: [{ type: 'text', value: 'A2' }] }, { type: 'tableCell', children: [{ type: 'text', value: 'B2' }] }] },
        ],
      } as any,
      selfHash: 'old',
    })
    const alignedTable = makeNode({
      blockType: 'table',
      block: {
        type: 'table',
        align: ['left', 'right'],
        children: [
          { type: 'tableRow', children: [{ type: 'tableCell', children: [{ type: 'text', value: 'A1' }] }, { type: 'tableCell', children: [{ type: 'text', value: 'B1 updated' }] }] },
          { type: 'tableRow', children: [{ type: 'tableCell', children: [{ type: 'text', value: 'A2' }] }, { type: 'tableCell', children: [{ type: 'text', value: 'B2' }] }] },
        ],
      } as any,
      selfHash: 'aligned',
    })
    const misalignedTable = makeNode({
      blockType: 'table',
      block: {
        type: 'table',
        align: ['center', 'center'],
        children: [
          { type: 'tableRow', children: [{ type: 'tableCell', children: [{ type: 'text', value: 'A1' }] }, { type: 'tableCell', children: [{ type: 'text', value: 'B1 updated' }] }] },
        ],
      } as any,
      selfHash: 'misaligned',
    })

    expect(computeNodeSimilarity(oldTable, alignedTable, OPTIONS)).toBeGreaterThan(
      computeNodeSimilarity(oldTable, misalignedTable, OPTIONS),
    )
  })

  it('keeps empty tables moderately similar even without any comparable cell text', () => {
    const oldTable = makeNode({
      blockType: 'table',
      block: { type: 'table', align: [], children: [] } as any,
      selfHash: 'old',
    })
    const newTable = makeNode({
      blockType: 'table',
      block: { type: 'table', align: [], children: [] } as any,
      selfHash: 'new',
    })

    expect(computeNodeSimilarity(oldTable, newTable, OPTIONS)).toBe(0.5)
  })

  it('compares definition fields when identity hashes differ', () => {
    const oldDefinition = makeNode({
      blockType: 'definition',
      block: {
        type: 'definition',
        identifier: 'docs',
        url: 'https://example.com/old',
        title: 'Old Docs',
        label: 'Project Docs',
      } as any,
      selfHash: 'old',
      identityHash: 'left',
    })
    const closeDefinition = makeNode({
      blockType: 'definition',
      block: {
        type: 'definition',
        identifier: 'repo',
        url: 'https://example.com/new',
        title: 'New Docs',
        label: 'Project Docs',
      } as any,
      selfHash: 'close',
      identityHash: 'right',
    })

    const score = computeNodeSimilarity(oldDefinition, closeDefinition, OPTIONS)

    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('weights matching url and title above matching label text for definitions', () => {
    const oldDefinition = makeNode({
      blockType: 'definition',
      block: {
        type: 'definition',
        identifier: 'docs',
        url: 'https://example.com/docs',
        title: 'Documentation',
        label: 'Docs Label',
      } as any,
      selfHash: 'old',
      identityHash: 'left',
    })
    const matchingUrlTitle = makeNode({
      blockType: 'definition',
      block: {
        type: 'definition',
        identifier: 'source',
        url: 'https://example.com/docs',
        title: 'Documentation',
        label: 'Different Label',
      } as any,
      selfHash: 'url-title',
      identityHash: 'right',
    })
    const matchingLabelOnly = makeNode({
      blockType: 'definition',
      block: {
        type: 'definition',
        identifier: 'source',
        url: 'https://vendor.example.net/spec',
        title: 'Specification',
        label: 'Docs Label',
      } as any,
      selfHash: 'label-only',
      identityHash: 'other',
    })

    expect(computeNodeSimilarity(oldDefinition, matchingUrlTitle, OPTIONS)).toBeGreaterThan(
      computeNodeSimilarity(oldDefinition, matchingLabelOnly, OPTIONS),
    )
  })

  it('prefers matching heading depth for leaf headings when title tokens are otherwise identical', () => {
    const oldHeading = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: 'Leaf', headingDepth: 2, items: [], children: [] } as any,
      raw: { kind: 'heading' } as any,
      selfHash: 'old',
      titleTokens: ['leaf'],
      logicalChildren: [],
    })
    const sameDepth = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: 'Leaf', headingDepth: 2, items: [], children: [] } as any,
      raw: { kind: 'heading' } as any,
      selfHash: 'same-depth',
      titleTokens: ['leaf'],
      logicalChildren: [],
    })
    const differentDepth = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: 'Leaf', headingDepth: 4, items: [], children: [] } as any,
      raw: { kind: 'heading' } as any,
      selfHash: 'different-depth',
      titleTokens: ['leaf'],
      logicalChildren: [],
    })

    expect(computeNodeSimilarity(oldHeading, sameDepth, OPTIONS, 1)).toBeGreaterThan(
      computeNodeSimilarity(oldHeading, differentDepth, OPTIONS, 1),
    )
  })

  it('uses the minhash approximation path for very large token sets', () => {
    const oldTokens = Array.from({ length: 80 }, (_, index) => `token-${index}`)
    const newTokens = Array.from({ length: 80 }, (_, index) => `token-${index < 60 ? index : index + 20}`)
    const oldParagraph = makeNode({
      selfHash: 'old',
      textTokens: oldTokens,
      block: { type: 'paragraph', children: oldTokens.map((token) => ({ type: 'text', value: token })) } as any,
    })
    const newParagraph = makeNode({
      selfHash: 'new',
      textTokens: newTokens,
      block: { type: 'paragraph', children: newTokens.map((token) => ({ type: 'text', value: token })) } as any,
    })

    const score = computeNodeSimilarity(oldParagraph, newParagraph, {
      minHashTokenCount: 4,
      minHashNumFunctions: 16,
    })

    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('computes uniqueness margins from the top two scores only', () => {
    expect(uniquenessMargin([])).toBe(1)
    expect(uniquenessMargin([0.5])).toBe(1)
    expect(uniquenessMargin([0.9, 0.9, 0.2])).toBe(0)
    expect(uniquenessMargin([0.95, 0.7, 0.4])).toBeCloseTo(0.25)
  })
})
