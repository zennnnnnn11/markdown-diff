/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../../parser/index'
import { createBlock } from '../block-factory'
import {
  createRootSection,
  createHeadingSection,
  createFrontmatterSection,
  createListItemSection,
  createBlockquoteSection,
  createFootnoteSection,
} from '../section-factory'

function findNode(ast: any, type: string): any {
  if (!ast) return null
  if (ast.type === type) return ast
  if (ast.children)
    for (const c of ast.children) {
      const f = findNode(c, type)
      if (f) return f
    }
  return null
}

describe('section-factory', () => {
  it('S01: createRootSection → kind=root, depth=0, title="", titleKind=synthetic', () => {
    const s = createRootSection()
    expect(s.kind).toBe('root')
    expect(s.depth).toBe(0)
    expect(s.treeDepth).toBe(0)
    expect(s.title).toBe('')
    expect(s.titleKind).toBe('synthetic')
    expect(s.children).toEqual([])
    expect(s.items).toEqual([])
    expect(s.footnotes).toBeUndefined()
    expect(s.definitions).toBeUndefined()
  })

  it('S02: createHeadingSection → kind=heading, depth/headingDepth match', async () => {
    const ast = await parseMarkdown('# Hi')
    const h = findNode(ast, 'heading')
    const block = createBlock(h!)
    const s = createHeadingSection(block, 1, 1, 'Hi')
    expect(s.kind).toBe('heading')
    expect(s.depth).toBe(1)
    expect(s.treeDepth).toBe(1)
    expect(s.headingDepth).toBe(1)
    expect(s.titleKind).toBe('explicit')
    expect(s.heading).toBeDefined()
  })

  it('S03: createHeadingSection depth=1 → depth=1, headingDepth=1', () => {
    const block = createBlock({ type: 'heading', depth: 1, children: [] } as any)
    const s = createHeadingSection(block, 1, 1, '')
    expect(s.depth).toBe(1)
    expect(s.treeDepth).toBe(1)
    expect(s.headingDepth).toBe(1)
  })

  it('S04: createHeadingSection depth=3 → depth=3, headingDepth=3', () => {
    const block = createBlock({ type: 'heading', depth: 3, children: [] } as any)
    const s = createHeadingSection(block, 3, 2, '')
    expect(s.depth).toBe(3)
    expect(s.treeDepth).toBe(2)
    expect(s.headingDepth).toBe(3)
  })

  it('S05: createFrontmatterSection → kind=frontmatter, depth=0, titleKind=synthetic', () => {
    const s = createFrontmatterSection('yaml', 'title: X', 1)
    expect(s.kind).toBe('frontmatter')
    expect(s.depth).toBe(0)
    expect(s.treeDepth).toBe(1)
    expect(s.titleKind).toBe('synthetic')
    expect(s.frontmatterType).toBe('yaml')
    expect(s.frontmatterValue).toBe('title: X')
  })

  it('S06: createListItemSection (unordered) → ordered=false, checked=null', () => {
    const block = createBlock({ type: 'listItem', children: [] } as any)
    const s = createListItemSection(block, { ordered: false }, 0, 1, 2, 1)
    expect(s.kind).toBe('listItem')
    expect(s.depth).toBe(1)
    expect(s.treeDepth).toBe(2)
    expect(s.ordered).toBe(false)
    expect(s.checked).toBeNull()
  })

  it('S07: createListItemSection (ordered) → ordered=true, start kept', () => {
    const block = createBlock({ type: 'listItem', children: [] } as any)
    const s = createListItemSection(block, { ordered: true, start: 5 }, 2, 1, 2, 1)
    expect(s.ordered).toBe(true)
    expect(s.start).toBe(5)
  })

  it('S08: createListItemSection (checked=true)', () => {
    const block = createBlock({
      type: 'listItem',
      checked: true,
      children: [],
    } as any)
    const s = createListItemSection(block, {}, 0, 0, 1, 1)
    expect(s.checked).toBe(true)
  })

  it('S09: createListItemSection (checked=false)', () => {
    const block = createBlock({
      type: 'listItem',
      checked: false,
      children: [],
    } as any)
    const s = createListItemSection(block, {}, 0, 0, 1, 1)
    expect(s.checked).toBe(false)
  })

  it('S10: createListItemSection index correct', () => {
    const block = createBlock({ type: 'listItem', children: [] } as any)
    const s = createListItemSection(block, {}, 3, 0, 1, 1)
    expect(s.index).toBe(3)
  })

  it('S11: createListItemSection listDepth correct', () => {
    const block = createBlock({ type: 'listItem', children: [] } as any)
    const s = createListItemSection(block, {}, 0, 2, 4, 3)
    expect(s.listDepth).toBe(3)
    expect(s.depth).toBe(2)
    expect(s.treeDepth).toBe(4)
  })

  it('S12: createBlockquoteSection → semantic depth and treeDepth are separate', () => {
    const s = createBlockquoteSection(3, 2, 2, 'excerpt')
    expect(s.kind).toBe('blockquote')
    expect(s.depth).toBe(3)
    expect(s.treeDepth).toBe(2)
    expect(s.quoteDepth).toBe(2)
    expect(s.titleKind).toBe('derived')
    expect(s.title).toBe('excerpt')
  })

  it('S13: createFootnoteSection → kind=footnote, depth=0, titleKind=explicit', () => {
    const block = createBlock({
      type: 'footnoteDefinition',
      identifier: '1',
      children: [],
    } as any)
    const s = createFootnoteSection(block)
    expect(s.kind).toBe('footnote')
    expect(s.depth).toBe(0)
    expect(s.treeDepth).toBe(1)
    expect(s.titleKind).toBe('explicit')
    expect(s.heading).toBeDefined()
  })
})
