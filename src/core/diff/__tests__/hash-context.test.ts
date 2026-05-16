import { describe, expect, it } from 'vitest'
import { createHashContext } from '../hash-context'
import { hashCanonical, hashText } from '../utils'
import { parseMarkdown } from '@/core/parser'
import { transformMarkdown } from '@/core/transformer'
import { buildSemanticIndex } from '../indexer'

describe('createHashContext', () => {
  it('produces same results as uncached hashText', async () => {
    const hctx = createHashContext()
    const input = 'hello world'
    const expected = await hashText(input)
    const actual = await hctx.hashText(input)
    expect(actual).toBe(expected)
  })

  it('produces same results as uncached hashCanonical', async () => {
    const hctx = createHashContext()
    const input = { type: 'paragraph', value: 'test', children: [{ type: 'text' }] }
    const expected = await hashCanonical(input)
    const actual = await hctx.hashCanonical(input)
    expect(actual).toBe(expected)
  })

  it('returns cached result for identical text input', async () => {
    const hctx = createHashContext()
    const first = await hctx.hashText('same string')
    const second = await hctx.hashText('same string')
    expect(second).toBe(first)
  })

  it('returns cached result for structurally equal canonical input', async () => {
    const hctx = createHashContext()
    const obj1 = { a: 1, b: 'x' }
    const obj2 = { a: 1, b: 'x' }
    const first = await hctx.hashCanonical(obj1)
    const second = await hctx.hashCanonical(obj2)
    expect(second).toBe(first)
  })

  it('returns different results for different text inputs', async () => {
    const hctx = createHashContext()
    const a = await hctx.hashText('alpha')
    const b = await hctx.hashText('beta')
    expect(a).not.toBe(b)
  })

  it('returns different results for different canonical inputs', async () => {
    const hctx = createHashContext()
    const a = await hctx.hashCanonical({ x: 1 })
    const b = await hctx.hashCanonical({ x: 2 })
    expect(a).not.toBe(b)
  })

  it('separate contexts do not share cache', async () => {
    const ctx1 = createHashContext()
    const ctx2 = createHashContext()
    const r1 = await ctx1.hashText('shared')
    const r2 = await ctx2.hashText('shared')
    expect(r1).toBe(r2)
  })

  it('handles empty string', async () => {
    const hctx = createHashContext()
    const expected = await hashText('')
    expect(await hctx.hashText('')).toBe(expected)
  })

  it('handles null and undefined in canonical', async () => {
    const hctx = createHashContext()
    const expected = await hashCanonical(null)
    expect(await hctx.hashCanonical(null)).toBe(expected)
    const expectedUndef = await hashCanonical(undefined)
    expect(await hctx.hashCanonical(undefined)).toBe(expectedUndef)
  })

  it('handles deeply nested canonical objects', async () => {
    const hctx = createHashContext()
    const deep = { a: { b: { c: { d: { e: 'leaf' } } } } }
    const expected = await hashCanonical(deep)
    expect(await hctx.hashCanonical(deep)).toBe(expected)
  })

  it('handles arrays in canonical', async () => {
    const hctx = createHashContext()
    const arr = [1, 'two', { three: 3 }, [4, 5]]
    const expected = await hashCanonical(arr)
    expect(await hctx.hashCanonical(arr)).toBe(expected)
  })

  it('handles canonical objects with undefined values consistently', async () => {
    const hctx = createHashContext()
    const r1 = await hctx.hashCanonical({ a: 1, b: undefined })
    const r2 = await hctx.hashCanonical({ a: 1, b: undefined })
    expect(r1).toBe(r2)
  })

  it('handles long strings', async () => {
    const hctx = createHashContext()
    const longStr = 'x'.repeat(100_000)
    const expected = await hashText(longStr)
    expect(await hctx.hashText(longStr)).toBe(expected)
  })
})

describe('HashContext integration', () => {
  it('buildSemanticIndex produces consistent output with caching', async () => {
    const markdown = '# Heading\n\nParagraph one.\n\n## Sub\n\nParagraph two.\n\n- item 1\n- item 2'
    const ast = await parseMarkdown(markdown)
    const tree = transformMarkdown(ast)

    const index1 = await buildSemanticIndex(tree, 'new')
    const index2 = await buildSemanticIndex(tree, 'new')

    for (const [id, node1] of index1.byId) {
      const node2 = index2.byId.get(id)
      expect(node2).toBeDefined()
      expect(node1.selfHash).toBe(node2!.selfHash)
      expect(node1.directHash).toBe(node2!.directHash)
      expect(node1.subtreeHash).toBe(node2!.subtreeHash)
      expect(node1.identityHash).toBe(node2!.identityHash)
      expect(node1.contentOnlyHash).toBe(node2!.contentOnlyHash)
      if (node1.headingBodyHash) expect(node1.headingBodyHash).toBe(node2!.headingBodyHash)
      if (node1.pathHash) expect(node1.pathHash).toBe(node2!.pathHash)
    }
  })

  it('buildSemanticIndex with complex nested document produces consistent output', async () => {
    const markdown = `# Doc

## A

- list 1
  - nested
- list 2

## B

> blockquote

\`\`\`js
code()
\`\`\`

[^1]: Footnote

[ref]: https://example.com`
    const ast = await parseMarkdown(markdown)
    const tree = transformMarkdown(ast)

    const index1 = await buildSemanticIndex(tree, 'old')
    const index2 = await buildSemanticIndex(tree, 'old')

    expect(index1.byId.size).toBe(index2.byId.size)
    for (const [id, node1] of index1.byId) {
      const node2 = index2.byId.get(id)!
      expect(node1.selfHash).toBe(node2.selfHash)
      expect(node1.subtreeHash).toBe(node2.subtreeHash)
      expect(node1.preorder).toBe(node2.preorder)
    }
  })
})
