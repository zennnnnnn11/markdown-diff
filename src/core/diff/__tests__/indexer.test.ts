import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../parser'
import { transformMarkdown } from '../../transformer'
import { buildSemanticIndex, diffMarkdownTrees } from '../index'
import {
  extractNodeText,
  multisetJaccardSimilarity,
  normalizeHeadingTitle,
  normalizeIdentifier,
  simHashHammingDistance,
  slugifyHeading,
} from '../utils'

describe('diff indexer', () => {
  it('builds semantic index from transformer root items, definitions, and footnotes', async () => {
    const markdown = `# Intro

Paragraph with [ref][docs] and footnote[^1].

[docs]: https://example.com "Docs"

[^1]: Footnote body`

    const tree = transformMarkdown(await parseMarkdown(markdown))
    const index = await buildSemanticIndex(tree, 'old')

    expect(index.byId.has('root')).toBe(true)
    expect(index.byKind.get('heading')?.length).toBe(1)
    expect(index.byBlockType.get('definition')?.length).toBe(1)
    expect(index.byKind.get('footnote')?.length).toBe(1)
    expect(index.backlinks.definitions.has('docs')).toBe(true)
    expect(index.backlinks.footnotes.has('1')).toBe(true)
  })

  it('derives stable heading normalization metadata', async () => {
    const tree = transformMarkdown(await parseMarkdown('# 1. Intro Title'))
    const index = await buildSemanticIndex(tree, 'old')
    const headingId = index.byKind.get('heading')?.[0]
    const heading = headingId ? index.byId.get(headingId) : undefined

    expect(heading?.normalizedTitle).toBe('intro title')
    expect(heading?.titleSlug).toBe('intro-title')
    expect(heading?.titleTokens).toEqual(['intro', 'title'])
  })

  it('computes headingBodyHash without title text', async () => {
    const oldTree = transformMarkdown(await parseMarkdown('# Alpha\n\nBody text'))
    const newTree = transformMarkdown(await parseMarkdown('# Beta\n\nBody text'))
    const oldIndex = await buildSemanticIndex(oldTree, 'old')
    const newIndex = await buildSemanticIndex(newTree, 'new')
    const oldHeading = oldIndex.byId.get(oldIndex.byKind.get('heading')![0]!)
    const newHeading = newIndex.byId.get(newIndex.byKind.get('heading')![0]!)

    expect(oldHeading?.headingBodyHash).toBeDefined()
    expect(oldHeading?.headingBodyHash).toBe(newHeading?.headingBodyHash)
    expect(oldHeading?.selfHash).not.toBe(newHeading?.selfHash)
  })

  it('creates a root skeleton diff result', async () => {
    const oldTree = transformMarkdown(await parseMarkdown('# Old'))
    const newTree = transformMarkdown(await parseMarkdown('# New'))
    const result = await diffMarkdownTrees(oldTree, newTree)

    expect(result.root.matchKind).toBe('forced-root')
    expect(result.matches).toHaveLength(1)
    expect(result.oldIndex.rootId).toBe('root')
    expect(result.newIndex.rootId).toBe('root')
    expect(result.changeIndex.byOldId.get('root')).toBe(result.root)
    expect(result.changeIndex.byNewId.get('root')).toBe(result.root)
    expect(result.changeIndex.byPairKey.get('match:root:root')).toBe(result.root)
    expect(result.quality).toEqual({
      degradedCount: 0,
      inlineDeferredCount: 0,
      warningCount: 0,
    })
  })

  it('assigns preorder indexes in parent-before-child order', async () => {
    const tree = transformMarkdown(await parseMarkdown('# Intro\n\nParagraph\n\n## Child\n\nLeaf'))
    const index = await buildSemanticIndex(tree, 'old')
    const labels = index.nodesInPreorder.map((node) =>
      node.entity === 'section'
        ? `${node.kind}:${node.section?.title ?? ''}`
        : `${node.blockType}:${extractNodeText(node.block)}`,
    )

    expect(labels[0]).toBe('root:')
    expect(labels[1]).toBe('heading:Intro')
    expect(labels[2]).toBe('paragraph:Paragraph')
    expect(labels[3]).toBe('heading:Child')
    expect(labels[4]).toBe('paragraph:Leaf')
    expect(index.byId.get('root')?.preorder).toBe(0)
  })

  it('merges synthetic definitions and footnotes into root logical order by source position', async () => {
    const markdown = `Before [docs][ref].

[ref]: https://example.com "Docs"

After note[^1].

[^1]: Footnote body`
    const tree = transformMarkdown(await parseMarkdown(markdown))
    const index = await buildSemanticIndex(tree, 'old')
    const rootChildren = index.childrenById.get(index.rootId) ?? []
    const orderedKinds = rootChildren.map((id) => {
      const node = index.byId.get(id)
      return node?.entity === 'section' ? node.kind : node?.blockType
    })
    const orderedTexts = rootChildren.map((id) => {
      const node = index.byId.get(id)
      return node ? extractNodeText(node.raw) : ''
    })

    expect(orderedKinds).toEqual(['paragraph', 'definition', 'paragraph', 'footnote'])
    expect(orderedTexts[0]).toContain('Before')
    expect(orderedTexts[1]).toContain('https://example.com')
    expect(orderedTexts[2]).toContain('After note')
    expect(orderedTexts[3]).toContain('Footnote body')
  })

  it('treats definition identity as url/title-based so pure label renames stay stable', async () => {
    const oldTree = transformMarkdown(
      await parseMarkdown('[repo]: https://example.com/docs "Documentation"'),
    )
    const newTree = transformMarkdown(
      await parseMarkdown('[source]: https://example.com/docs "Documentation"'),
    )
    const oldIndex = await buildSemanticIndex(oldTree, 'old')
    const newIndex = await buildSemanticIndex(newTree, 'new')
    const oldDefinition = oldIndex.byId.get(oldIndex.byBlockType.get('definition')![0]!)
    const newDefinition = newIndex.byId.get(newIndex.byBlockType.get('definition')![0]!)

    expect(oldDefinition?.identityHash).toBe(newDefinition?.identityHash)
    expect(oldDefinition?.selfHash).not.toBe(newDefinition?.selfHash)
  })

  it('reuses selfHash as the identity hash for ordinary blocks and sections', async () => {
    const tree = transformMarkdown(
      await parseMarkdown(`# Heading

Paragraph body.

- item one
- item two`),
    )
    const index = await buildSemanticIndex(tree, 'old')
    const heading = index.byId.get(index.byKind.get('heading')![0]!)
    const paragraph = index.byId.get(index.byBlockType.get('paragraph')![0]!)
    const listItem = index.byId.get(index.byKind.get('listItem')![0]!)

    expect(heading?.identityHash).toBe(heading?.selfHash)
    expect(paragraph?.identityHash).toBe(paragraph?.selfHash)
    expect(listItem?.identityHash).toBe(listItem?.selfHash)
  })

  it('assigns non-overlapping preorder indexes with sibling parallelism', async () => {
    const markdown = `# A

Para A

## B

Para B

## C

Para C

### D

Para D`
    const tree = transformMarkdown(await parseMarkdown(markdown))
    const index = await buildSemanticIndex(tree, 'new')

    const preorders = index.nodesInPreorder.map((node) => node.preorder)
    const uniquePreorders = new Set(preorders)
    expect(uniquePreorders.size).toBe(preorders.length)

    for (const [, node] of index.byId) {
      const childIds = index.childrenById.get(node.id) ?? []
      for (const childId of childIds) {
        const child = index.byId.get(childId)!
        expect(child.preorder).toBeGreaterThan(node.preorder)
      }
    }
  })

  it('produces identical hashes across repeated builds with parallel visitation', async () => {
    const markdown = `# Heading

Paragraph one.

## Sub

Paragraph two.

- item 1
- item 2

> blockquote

[^1]: Footnote body

[ref]: https://example.com "Title"`
    const tree = transformMarkdown(await parseMarkdown(markdown))

    const index1 = await buildSemanticIndex(tree, 'new')
    const index2 = await buildSemanticIndex(tree, 'new')

    for (const [id, node1] of index1.byId) {
      const node2 = index2.byId.get(id)!
      expect(node2).toBeDefined()
      expect(node1.selfHash).toBe(node2.selfHash)
      expect(node1.directHash).toBe(node2.directHash)
      expect(node1.subtreeHash).toBe(node2.subtreeHash)
      expect(node1.identityHash).toBe(node2.identityHash)
      expect(node1.preorder).toBe(node2.preorder)
    }
  })

  it('subtreeSize for leaf block nodes is 1', async () => {
    const tree = transformMarkdown(await parseMarkdown('Just a paragraph.'))
    const index = await buildSemanticIndex(tree, 'new')

    const paragraphs = index.byBlockType.get('paragraph') ?? []
    for (const id of paragraphs) {
      const node = index.byId.get(id)!
      expect(node.subtreeSize).toBe(1)
    }
  })

  it('subtreeSize of parent equals 1 plus sum of children sizes', async () => {
    const tree = transformMarkdown(await parseMarkdown('# Heading\n\nPara 1\n\nPara 2'))
    const index = await buildSemanticIndex(tree, 'new')

    const headingId = index.byKind.get('heading')?.[0]
    const heading = headingId ? index.byId.get(headingId) : undefined
    expect(heading).toBeDefined()

    const childIds = index.childrenById.get(heading!.id) ?? []
    const childSizeSum = childIds.reduce(
      (sum, id) => sum + (index.byId.get(id)?.subtreeSize ?? 0),
      0,
    )
    expect(heading!.subtreeSize).toBe(1 + childSizeSum)
  })

  it('root subtreeSize equals total node count', async () => {
    const markdown = `# A

Para

## B

- item 1
- item 2

### C

Deep para`
    const tree = transformMarkdown(await parseMarkdown(markdown))
    const index = await buildSemanticIndex(tree, 'new')

    const root = index.byId.get(index.rootId)!
    expect(root.subtreeSize).toBe(index.byId.size)
  })

  it('preorder range of children is contiguous and within parent range', async () => {
    const markdown = `# A

Para A

## B

Para B

## C

Para C`
    const tree = transformMarkdown(await parseMarkdown(markdown))
    const index = await buildSemanticIndex(tree, 'new')

    for (const [, node] of index.byId) {
      const childIds = index.childrenById.get(node.id) ?? []
      if (childIds.length === 0) continue

      const children = childIds.map((id) => index.byId.get(id)!)
      for (let i = 1; i < children.length; i++) {
        const prev = children[i - 1]!
        const curr = children[i]!
        expect(curr.preorder).toBe(prev.preorder + prev.subtreeSize)
      }

      const firstChild = children[0]!
      expect(firstChild.preorder).toBe(node.preorder + 1)
    }
  })

  it('deeply nested headings maintain correct preorder and subtreeSize', async () => {
    const markdown = `# L1

## L2

### L3

#### L4

##### L5

Leaf paragraph`
    const tree = transformMarkdown(await parseMarkdown(markdown))
    const index = await buildSemanticIndex(tree, 'new')

    const allNodes = [...index.byId.values()]
    const preorders = allNodes.map((n) => n.preorder).sort((a, b) => a - b)

    for (let i = 0; i < preorders.length; i++) {
      expect(preorders[i]).toBe(i)
    }
  })

  it('heading section with shared heading block caches block self-hash', async () => {
    const markdown = `# Heading

Para 1

## Sub

Para 2`
    const tree = transformMarkdown(await parseMarkdown(markdown))

    const index1 = await buildSemanticIndex(tree, 'new')
    const index2 = await buildSemanticIndex(tree, 'new')

    for (const [id, node1] of index1.byId) {
      const node2 = index2.byId.get(id)!
      expect(node1.selfHash).toBe(node2.selfHash)
    }
  })

  it('all preorder slots are filled with no holes', async () => {
    const markdown = `# H1

P1

## H2

P2

- L1
- L2

## H3

> Quote`
    const tree = transformMarkdown(await parseMarkdown(markdown))
    const index = await buildSemanticIndex(tree, 'new')

    for (let i = 0; i < index.nodesInPreorder.length; i++) {
      expect(index.nodesInPreorder[i]).toBeDefined()
      expect(index.nodesInPreorder[i]!.preorder).toBe(i)
    }
    expect(index.nodesInPreorder.length).toBe(index.byId.size)
  })
})

describe('diff utils', () => {
  it('normalizes identifiers and headings conservatively', () => {
    expect(normalizeIdentifier('  Foo   BAR  ')).toBe('foo bar')
    expect(normalizeHeadingTitle('1. Getting Started')).toBe('getting started')
    expect(slugifyHeading('Hello, 世界!')).toBe('hello-世界')
  })

  it('computes simhash hamming distance on hex digests', () => {
    expect(simHashHammingDistance('0f', '0f')).toBe(0)
    expect(simHashHammingDistance('0f', '00')).toBe(4)
    expect(simHashHammingDistance(undefined, '00')).toBeUndefined()
  })

  it('accounts for duplicate tokens in multiset similarity', () => {
    expect(
      multisetJaccardSimilarity(
        ['paragraph', 'paragraph', 'blockquote'],
        ['paragraph', 'blockquote', 'blockquote'],
      ),
    ).toBe(0.5)
    expect(multisetJaccardSimilarity(['paragraph', 'paragraph'], ['paragraph', 'paragraph'])).toBe(
      1,
    )
  })
})
