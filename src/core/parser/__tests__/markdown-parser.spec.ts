import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../index'

describe('parseMarkdown', () => {
  it('parses a heading', async () => {
    const ast = await parseMarkdown('# Hello')
    const heading = ast.children[0]
    expect(heading).toMatchObject({ type: 'heading', depth: 1 })
    expect((heading as any).children[0].value).toBe('Hello')
  })

  it('parses a paragraph', async () => {
    const ast = await parseMarkdown('some text')
    const para = ast.children[0]
    expect(para).toMatchObject({ type: 'paragraph' })
    expect((para as any).children[0].value).toBe('some text')
  })

  it('parses a bullet list', async () => {
    const ast = await parseMarkdown('- a\n- b\n- c')
    expect(ast.children[0]).toMatchObject({ type: 'list', ordered: false })
    expect((ast.children[0] as any).children).toHaveLength(3)
  })

  it('parses GFM tables', async () => {
    const ast = await parseMarkdown('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(ast.children[0]).toMatchObject({ type: 'table' })
  })

  it('parses GFM strikethrough', async () => {
    const ast = await parseMarkdown('~del~')
    const para = ast.children[0]!
    expect((para as any).children[0]).toMatchObject({ type: 'delete' })
  })

  it('parses GFM task list items', async () => {
    const ast = await parseMarkdown('- [ ] todo\n- [x] done')
    const list = ast.children[0]!
    const item0 = (list as any).children[0]
    expect(item0).toMatchObject({ type: 'listItem', checked: false })
    const item1 = (list as any).children[1]
    expect(item1).toMatchObject({ type: 'listItem', checked: true })
  })

  it('parses YAML frontmatter', async () => {
    const ast = await parseMarkdown('---\ntitle: hello\n---\n\nbody')
    expect(ast.children[0]).toMatchObject({ type: 'yaml', value: 'title: hello' })
    expect(ast.children[1]).toMatchObject({ type: 'paragraph' })
  })

  it('parses inline math', async () => {
    const ast = await parseMarkdown('$x^2$')
    const para = ast.children[0]!
    expect((para as any).children[0]).toMatchObject({ type: 'inlineMath' })
  })
})
