import type { Heading, List, ListItem, Paragraph, RootContent, Yaml } from 'mdast'
import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../index'

function expectType<T extends RootContent['type']>(
  node: RootContent | undefined,
  type: T,
): Extract<RootContent, { type: T }> {
  expect(node?.type).toBe(type)
  return node as Extract<RootContent, { type: T }>
}

describe('parseMarkdown', () => {
  it('parses a heading', async () => {
    const ast = await parseMarkdown('# Hello')
    const heading = expectType(ast.children[0], 'heading') as Heading
    expect(heading).toMatchObject({ type: 'heading', depth: 1 })
    expect(heading.children[0]).toMatchObject({ type: 'text', value: 'Hello' })
  })

  it('parses a paragraph', async () => {
    const ast = await parseMarkdown('some text')
    const para = expectType(ast.children[0], 'paragraph') as Paragraph
    expect(para).toMatchObject({ type: 'paragraph' })
    expect(para.children[0]).toMatchObject({ type: 'text', value: 'some text' })
  })

  it('parses a bullet list', async () => {
    const ast = await parseMarkdown('- a\n- b\n- c')
    const list = expectType(ast.children[0], 'list') as List
    expect(list).toMatchObject({ type: 'list', ordered: false })
    expect(list.children).toHaveLength(3)
  })

  it('parses GFM tables', async () => {
    const ast = await parseMarkdown('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(ast.children[0]).toMatchObject({ type: 'table' })
  })

  it('parses GFM strikethrough', async () => {
    const ast = await parseMarkdown('~del~')
    const para = expectType(ast.children[0], 'paragraph') as Paragraph
    expect(para.children[0]).toMatchObject({ type: 'delete' })
  })

  it('parses GFM task list items', async () => {
    const ast = await parseMarkdown('- [ ] todo\n- [x] done')
    const list = expectType(ast.children[0], 'list') as List
    const item0 = list.children[0] as ListItem
    expect(item0).toMatchObject({ type: 'listItem', checked: false })
    const item1 = list.children[1] as ListItem
    expect(item1).toMatchObject({ type: 'listItem', checked: true })
  })

  it('parses YAML frontmatter', async () => {
    const ast = await parseMarkdown('---\ntitle: hello\n---\n\nbody')
    expect(expectType(ast.children[0], 'yaml') as Yaml).toMatchObject({
      type: 'yaml',
      value: 'title: hello',
    })
    expect(ast.children[1]).toMatchObject({ type: 'paragraph' })
  })

  it('parses inline math', async () => {
    const ast = await parseMarkdown('$x^2$')
    const para = expectType(ast.children[0], 'paragraph') as Paragraph
    expect(para.children[0]).toMatchObject({ type: 'inlineMath' })
  })
})
