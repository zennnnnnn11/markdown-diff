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
      node.entity === 'section' ? `${node.kind}:${node.section?.title ?? ''}` : `${node.blockType}:${extractNodeText(node.block)}`,
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
    expect(multisetJaccardSimilarity(['paragraph', 'paragraph', 'blockquote'], ['paragraph', 'blockquote', 'blockquote'])).toBe(0.5)
    expect(multisetJaccardSimilarity(['paragraph', 'paragraph'], ['paragraph', 'paragraph'])).toBe(1)
  })
})
