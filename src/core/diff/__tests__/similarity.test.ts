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
    const section = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: 'A', items: [], children: [] } as any,
    })
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
      blockType: 'html',
      block: { type: 'html', value: '<div>left</div>' } as any,
      selfHash: 'left',
      contentOnlyHash: 'shared',
      textTokens: ['alpha'],
    })
    const right = makeNode({
      blockType: 'html',
      block: { type: 'html', value: '<div>right</div>' } as any,
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
          {
            type: 'link',
            url: 'https://example.com',
            children: [{ type: 'text', value: 'omega' }],
          },
        ],
      } as any,
    })

    const similarScore = computeNodeSimilarity(oldParagraph, similarParagraph, OPTIONS)
    const distantScore = computeNodeSimilarity(oldParagraph, distantParagraph, OPTIONS)

    expect(similarScore).toBeGreaterThan(distantScore)
  })

  it('adds a structure fallback floor for paragraph replacements with stable inline shape', () => {
    const oldParagraph = makeNode({
      selfHash: 'old',
      textTokens: ['hello'],
      block: { type: 'paragraph', children: [{ type: 'text', value: 'hello' }] } as any,
    })
    const newParagraph = makeNode({
      selfHash: 'new',
      textTokens: ['world'],
      block: { type: 'paragraph', children: [{ type: 'text', value: 'world' }] } as any,
    })

    expect(computeNodeSimilarity(oldParagraph, newParagraph, OPTIONS, 1)).toBeGreaterThanOrEqual(
      0.75,
    )
  })

  it('keeps punctuation-only paragraph replacements pairable without treating them as perfect matches', () => {
    const oldParagraph = makeNode({
      selfHash: 'old-punct',
      textTokens: [],
      block: { type: 'paragraph', children: [{ type: 'text', value: '...' }] } as any,
    })
    const newParagraph = makeNode({
      selfHash: 'new-punct',
      textTokens: [],
      block: { type: 'paragraph', children: [{ type: 'text', value: '!!!' }] } as any,
    })

    const score = computeNodeSimilarity(oldParagraph, newParagraph, OPTIONS, 1)
    expect(score).toBeGreaterThanOrEqual(0.75)
    expect(score).toBeLessThan(1)
  })

  it('falls back to character-level title similarity for punctuation-only headings', () => {
    const oldHeading = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: '...', headingDepth: 2, items: [], children: [] } as any,
      raw: { kind: 'heading' } as any,
      selfHash: 'old-heading',
      titleTokens: [],
      logicalChildren: [],
    })
    const newHeading = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: '!!!', headingDepth: 2, items: [], children: [] } as any,
      raw: { kind: 'heading' } as any,
      selfHash: 'new-heading',
      titleTokens: [],
      logicalChildren: [],
    })

    const score = computeNodeSimilarity(oldHeading, newHeading, OPTIONS, 1)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
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
      section: {
        kind: 'heading',
        title: 'Alpha Project',
        headingDepth: 2,
        items: [],
        children: [],
      } as any,
      raw: { kind: 'heading' } as any,
      selfHash: 'close',
      headingBodyHash: 'body',
      titleTokens: ['alpha', 'project'],
      logicalChildren: ['child'],
    })
    const weakerHeading = makeNode({
      entity: 'section',
      kind: 'heading',
      section: {
        kind: 'heading',
        title: 'Alpha Project',
        headingDepth: 3,
        items: [],
        children: [],
      } as any,
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
      section: {
        kind: 'heading',
        title: 'Leaf Next',
        headingDepth: 3,
        items: [],
        children: [],
      } as any,
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

  it('keeps blockquote and listItem edits pairable when their local structure stays aligned', () => {
    const oldBlockquote = makeNode({
      entity: 'section',
      kind: 'blockquote',
      section: {
        kind: 'blockquote',
        title: 'old',
        items: [{ type: 'paragraph', children: [{ type: 'text', value: 'old' }] }],
        children: [],
      } as any,
      raw: { kind: 'blockquote' } as any,
      selfHash: 'bq-old',
      textTokens: ['old'],
    })
    const newBlockquote = makeNode({
      entity: 'section',
      kind: 'blockquote',
      section: {
        kind: 'blockquote',
        title: 'new',
        items: [{ type: 'paragraph', children: [{ type: 'text', value: 'new' }] }],
        children: [],
      } as any,
      raw: { kind: 'blockquote' } as any,
      selfHash: 'bq-new',
      textTokens: ['new'],
    })
    const oldListItem = makeNode({
      entity: 'section',
      kind: 'listItem',
      section: {
        kind: 'listItem',
        title: 'old',
        items: [{ type: 'paragraph', children: [{ type: 'text', value: 'old' }] }],
        children: [],
      } as any,
      raw: { kind: 'listItem' } as any,
      selfHash: 'li-old',
      textTokens: ['old'],
    })
    const newListItem = makeNode({
      entity: 'section',
      kind: 'listItem',
      section: {
        kind: 'listItem',
        title: 'new',
        items: [{ type: 'paragraph', children: [{ type: 'text', value: 'new' }] }],
        children: [],
      } as any,
      raw: { kind: 'listItem' } as any,
      selfHash: 'li-new',
      textTokens: ['new'],
    })

    expect(computeNodeSimilarity(oldBlockquote, newBlockquote, OPTIONS, 1)).toBeGreaterThanOrEqual(
      0.75,
    )
    expect(computeNodeSimilarity(oldListItem, newListItem, OPTIONS, 1)).toBeGreaterThanOrEqual(0.75)
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
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'A1' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'B1' }] },
            ],
          },
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'A2' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'B2' }] },
            ],
          },
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
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'A1' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'B1 updated' }] },
            ],
          },
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'A2' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'B2' }] },
            ],
          },
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
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'A1' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'B1 updated' }] },
            ],
          },
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
    const newTokens = Array.from(
      { length: 80 },
      (_, index) => `token-${index < 60 ? index : index + 20}`,
    )
    const oldParagraph = makeNode({
      selfHash: 'old',
      textTokens: oldTokens,
      block: {
        type: 'paragraph',
        children: oldTokens.map((token) => ({ type: 'text', value: token })),
      } as any,
    })
    const newParagraph = makeNode({
      selfHash: 'new',
      textTokens: newTokens,
      block: {
        type: 'paragraph',
        children: newTokens.map((token) => ({ type: 'text', value: token })),
      } as any,
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

describe('codeSimilarity size guard', () => {
  function makeCodeNode(value: string, hash?: string): DiffNode {
    return makeNode({
      entity: 'block',
      blockType: 'code',
      block: { type: 'code', value, lang: 'js' } as any,
      contentOnlyHash: hash ?? `hash-${value.length}`,
      textTokens: value.split(/\s+/).filter(Boolean),
    })
  }

  it('returns 1 for identical code via hash shortcut', () => {
    const node = makeCodeNode('const x = 1', 'same')
    const other = makeCodeNode('const x = 1', 'same')
    expect(computeNodeSimilarity(node, other, OPTIONS)).toBe(1)
  })

  it('returns high similarity for small similar code blocks', () => {
    const old = makeCodeNode('function add(a, b) {\n  return a + b\n}')
    const newNode = makeCodeNode('function multiply(a, b) {\n  return a * b\n}')
    const score = computeNodeSimilarity(old, newNode, OPTIONS)
    expect(score).toBeGreaterThan(0.3)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('handles large code blocks without OOM', () => {
    const largeCode = 'x'.repeat(6000)
    const old = makeCodeNode(largeCode)
    const newNode = makeCodeNode(largeCode + 'y')
    const score = computeNodeSimilarity(old, newNode, OPTIONS)
    expect(score).toBeGreaterThan(0)
    expect(Number.isFinite(score)).toBe(true)
  })
})

describe('type-specific similarity via computeNodeSimilarity', () => {
  it('headingSimilarity: same heading returns 1', () => {
    const a = makeNode({
      entity: 'section',
      kind: 'heading',
      section: {
        kind: 'heading',
        title: 'Introduction',
        headingDepth: 2,
        items: [],
        children: [],
      } as any,
      block: {
        type: 'heading',
        depth: 2,
        children: [{ type: 'text', value: 'Introduction' }],
      } as any,
      titleTokens: ['introduction'],
      textTokens: ['introduction'],
      contentOnlyHash: 'h1',
    })
    const b = makeNode({
      entity: 'section',
      kind: 'heading',
      section: {
        kind: 'heading',
        title: 'Introduction',
        headingDepth: 2,
        items: [],
        children: [],
      } as any,
      block: {
        type: 'heading',
        depth: 2,
        children: [{ type: 'text', value: 'Introduction' }],
      } as any,
      titleTokens: ['introduction'],
      textTokens: ['introduction'],
      contentOnlyHash: 'h1',
    })
    expect(computeNodeSimilarity(a, b, OPTIONS)).toBe(1)
  })

  it('headingSimilarity: different depth reduces score', () => {
    const a = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: 'Test', headingDepth: 1, items: [], children: [] } as any,
      block: { type: 'heading', depth: 1, children: [{ type: 'text', value: 'Test' }] } as any,
      titleTokens: ['test'],
      textTokens: ['test'],
      selfHash: 'sha',
      contentOnlyHash: 'ha',
    })
    const b = makeNode({
      entity: 'section',
      kind: 'heading',
      section: { kind: 'heading', title: 'Test', headingDepth: 3, items: [], children: [] } as any,
      block: { type: 'heading', depth: 3, children: [{ type: 'text', value: 'Test' }] } as any,
      titleTokens: ['test'],
      textTokens: ['test'],
      selfHash: 'shb',
      contentOnlyHash: 'hb',
    })
    const score = computeNodeSimilarity(a, b, OPTIONS)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('paragraphSimilarity: identical text returns 1', () => {
    const text = 'This is a test paragraph with some content.'
    const a = makeNode({
      textTokens: text.split(/\s+/),
      contentOnlyHash: 'p1',
      block: { type: 'paragraph', children: [{ type: 'text', value: text }] } as any,
    })
    const b = makeNode({
      textTokens: text.split(/\s+/),
      contentOnlyHash: 'p1',
      block: { type: 'paragraph', children: [{ type: 'text', value: text }] } as any,
    })
    expect(computeNodeSimilarity(a, b, OPTIONS)).toBe(1)
  })

  it('paragraphSimilarity: minor edit gives high score', () => {
    const a = makeNode({
      textTokens: ['hello', 'world', 'test'],
      selfHash: 'spa',
      contentOnlyHash: 'pa',
      block: { type: 'paragraph', children: [{ type: 'text', value: 'hello world test' }] } as any,
    })
    const b = makeNode({
      textTokens: ['hello', 'earth', 'test'],
      selfHash: 'spb',
      contentOnlyHash: 'pb',
      block: { type: 'paragraph', children: [{ type: 'text', value: 'hello earth test' }] } as any,
    })
    const score = computeNodeSimilarity(a, b, OPTIONS)
    expect(score).toBeGreaterThan(0.5)
  })

  it('paragraphSimilarity: completely different text and structure gives low score', () => {
    const a = makeNode({
      textTokens: ['alpha', 'beta', 'gamma'],
      selfHash: 'spc',
      contentOnlyHash: 'pa',
      block: {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'alpha ' },
          { type: 'strong', children: [{ type: 'text', value: 'beta' }] },
          { type: 'text', value: ' gamma' },
        ],
      } as any,
    })
    const b = makeNode({
      textTokens: ['one', 'two', 'three', 'four', 'five'],
      selfHash: 'spd',
      contentOnlyHash: 'pb',
      block: {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: 'https://example.com',
            children: [{ type: 'text', value: 'one two three four five' }],
          },
        ],
      } as any,
    })
    const score = computeNodeSimilarity(a, b, OPTIONS)
    expect(score).toBeLessThan(1)
  })

  it('tableSimilarity: identical table returns 1', () => {
    const tableBlock = {
      type: 'table',
      children: [
        {
          children: [
            { children: [{ type: 'text', value: 'A' }] },
            { children: [{ type: 'text', value: 'B' }] },
          ],
        },
        {
          children: [
            { children: [{ type: 'text', value: '1' }] },
            { children: [{ type: 'text', value: '2' }] },
          ],
        },
      ],
    } as any
    const a = makeNode({
      blockType: 'table',
      block: tableBlock,
      contentOnlyHash: 't1',
      textTokens: ['a', 'b', '1', '2'],
    })
    const b = makeNode({
      blockType: 'table',
      block: tableBlock,
      contentOnlyHash: 't1',
      textTokens: ['a', 'b', '1', '2'],
    })
    expect(computeNodeSimilarity(a, b, OPTIONS)).toBe(1)
  })
})
