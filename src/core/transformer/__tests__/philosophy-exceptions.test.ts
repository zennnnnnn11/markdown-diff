import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../parser'
import { transformMarkdown } from '../index'
import type { Block, Section } from '../types'

function allSections(root: Section): Section[] {
  const result: Section[] = [root]
  for (const child of root.children) result.push(...allSections(child))
  if (root.footnotes) {
    for (const footnote of root.footnotes) result.push(...allSections(footnote))
  }
  return result
}

describe('testing philosophy exception matrix', () => {
  it('EX-002: whitespace-only input returns a stable empty root', async () => {
    const tree = transformMarkdown(await parseMarkdown('  \n\n  '))

    expect(tree.kind).toBe('root')
    expect(tree.items).toHaveLength(0)
    expect(tree.children).toHaveLength(0)
  })

  it('EX-003: very long single-line plain text remains a paragraph without crashing', async () => {
    const text = 'a'.repeat(100000)
    const tree = transformMarkdown(await parseMarkdown(text))

    expect(tree.items).toHaveLength(1)
    expect((tree.items[0] as Block).type).toBe('paragraph')
  })

  it('EX-004: many headings remain structurally traversable', async () => {
    const markdown = Array.from({ length: 100 }, (_, index) => `## H${index}\n\nbody ${index}`).join('\n\n')
    const tree = transformMarkdown(await parseMarkdown(markdown))
    const headings = allSections(tree).filter((section) => section.kind === 'heading')

    expect(headings).toHaveLength(100)
  })

  it('EX-005: deeply nested lists do not crash the transformer', async () => {
    let markdown = '- level 1\n'
    for (let depth = 2; depth <= 20; depth++) {
      markdown += `${'  '.repeat(depth - 1)}- level ${depth}\n`
    }

    const tree = transformMarkdown(await parseMarkdown(markdown))
    const listItems = allSections(tree).filter((section) => section.kind === 'listItem')

    expect(listItems.length).toBeGreaterThanOrEqual(20)
  })

  it('EX-006: malformed markdown with an unclosed fenced block remains parseable', async () => {
    const tree = transformMarkdown(await parseMarkdown('```ts\nconst a = 1'))

    expect(tree.items.length + tree.children.length).toBeGreaterThanOrEqual(1)
  })

  it('EX-009: empty fenced code block stays a code block', async () => {
    const tree = transformMarkdown(await parseMarkdown('```\n```'))
    const code = tree.items.find((item) => !('kind' in item) && item.type === 'code')

    expect(code).toBeDefined()
  })

  it('EX-011: frontmatter-only documents stay structurally valid', async () => {
    const tree = transformMarkdown(await parseMarkdown('---\na: 1\n---'))
    const frontmatter = tree.items.find((item) => 'kind' in item && item.kind === 'frontmatter')

    expect(frontmatter).toBeDefined()
  })

  it('EX-013/EX-014: incomplete footnote and definition references do not crash transformation', async () => {
    const footnoteTree = transformMarkdown(await parseMarkdown('[^1] missing definition'))
    const definitionTree = transformMarkdown(await parseMarkdown('[id] missing url'))

    expect(footnoteTree.items.length + footnoteTree.children.length).toBeGreaterThanOrEqual(1)
    expect(definitionTree.items.length + definitionTree.children.length).toBeGreaterThanOrEqual(1)
  })

  it('EX-015/EX-016: plain text and JSON-like text both stay as paragraph content', async () => {
    const plain = transformMarkdown(await parseMarkdown('plain text without markdown'))
    const json = transformMarkdown(await parseMarkdown('{"a":1}'))

    expect((plain.items[0] as Block).type).toBe('paragraph')
    expect((json.items[0] as Block).type).toBe('paragraph')
  })

  it('EX-018/EX-019: uppercase-only and symbol-only text remain valid paragraph blocks', async () => {
    const upper = transformMarkdown(await parseMarkdown('HELLO'))
    const symbols = transformMarkdown(await parseMarkdown('@#$%^&*()'))

    expect((upper.items[0] as Block).type).toBe('paragraph')
    expect((symbols.items[0] as Block).type).toBe('paragraph')
  })

  it('EX-001: empty string remains a valid empty root', async () => {
    const tree = transformMarkdown(await parseMarkdown(''))

    expect(tree.kind).toBe('root')
    expect(tree.items).toHaveLength(0)
  })

  it('EX-007: mixed line endings are accepted without crashing', async () => {
    const tree = transformMarkdown(await parseMarkdown('# A\r\n\rtext\n\n## B\rbody'))

    expect(tree.kind).toBe('root')
    expect(tree.items.length + tree.children.length).toBeGreaterThanOrEqual(1)
  })

  it('EX-008: a UTF-8 BOM-prefixed document still parses into content', async () => {
    const tree = transformMarkdown(await parseMarkdown('\uFEFF# A\n\ntext'))

    expect(tree.items.length + tree.children.length).toBeGreaterThanOrEqual(1)
  })

  it('EX-010: minimal empty-looking table syntax does not crash parsing or transform', async () => {
    const tree = transformMarkdown(await parseMarkdown('| |'))

    expect(tree.kind).toBe('root')
  })

  it('EX-012: unclosed frontmatter-like input is tolerated', async () => {
    const tree = transformMarkdown(await parseMarkdown('---\na:1\n'))

    expect(tree.kind).toBe('root')
    expect(tree.items.length + tree.children.length).toBeGreaterThan(0)
  })

  it('EX-017: documents containing null bytes are tolerated as text input', async () => {
    const tree = transformMarkdown(await parseMarkdown(`before${String.fromCharCode(0)}after`))

    expect(tree.kind).toBe('root')
  })

  it('EX-020: zero-width characters do not crash paragraph extraction', async () => {
    const tree = transformMarkdown(await parseMarkdown('zero\u200Bwidth'))

    expect((tree.items[0] as Block).type).toBe('paragraph')
  })
})
