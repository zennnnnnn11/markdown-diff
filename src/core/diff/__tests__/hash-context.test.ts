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
    expect(r1).toBe(r2) // same result but computed independently
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
})

describe('HashContext integration', () => {
  it('buildSemanticIndex produces consistent output with caching', async () => {
    const markdown = '# Heading\n\nParagraph one.\n\n## Sub\n\nParagraph two.\n\n- item 1\n- item 2'
    const ast = await parseMarkdown(markdown)
    const tree = transformMarkdown(ast)

    const index1 = await buildSemanticIndex(tree, 'new')
    const index2 = await buildSemanticIndex(tree, 'new')

    // All DiffNode hash fields must be identical across runs
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
})
