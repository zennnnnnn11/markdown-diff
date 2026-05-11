/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../../parser/index'
import { transformMarkdown } from '../index'
import type { Section, Block } from '../types'

function allSections(root: Section): Section[] {
  const r: Section[] = [root]
  for (const c of root.children) r.push(...allSections(c))
  if (root.footnotes) for (const f of root.footnotes) r.push(...allSections(f))
  return r
}

describe('edge cases', () => {
  it('E01: empty doc (root.children=[]) → returns root Section, no crash', async () => {
    const tree = transformMarkdown(await parseMarkdown(''))
    expect(tree.kind).toBe('root')
    expect(tree.children).toHaveLength(0)
    expect(tree.items).toHaveLength(0)
  })

  it('E02: text only, no headings → content on root.items', async () => {
    const tree = transformMarkdown(await parseMarkdown('just text'))
    expect(tree.items).toHaveLength(1)
    expect(tree.children).toHaveLength(0)
  })

  it('E03: top-level no headings: para + list + blockquote → all on root, order correct', async () => {
    const md = 'para\n\n- item\n\n> quote'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.items.length).toBe(3)
    const kinds = tree.items.map((i) => ('kind' in i ? (i as Section).kind : 'block'))
    expect(kinds[0]).toBe('block')
    expect(kinds[1]).toBe('listItem')
    expect(kinds[2]).toBe('blockquote')
  })

  it('E04: top-level no headings, semantic depth stays 0 while treeDepth is 1', async () => {
    const md = '- item\n\n> quote'
    const tree = transformMarkdown(await parseMarkdown(md))
    const containerChildren = tree.children.filter(
      (c) => c.kind === 'listItem' || c.kind === 'blockquote',
    )
    for (const child of containerChildren) {
      expect(child.depth).toBe(0)
      expect(child.treeDepth).toBe(1)
    }
  })

  it('E05: 10-level nested headings → all expanded, no stack overflow', async () => {
    let md = ''
    for (let i = 1; i <= 6; i++) {
      md += `${'#'.repeat(i)} H${i}\n\n`
    }
    const tree = transformMarkdown(await parseMarkdown(md))
    const headings = allSections(tree).filter((s) => s.kind === 'heading')
    expect(headings.length).toBe(6)
  })

  it('E06: 10-level nested list → all expanded, no stack overflow', async () => {
    let md = '- level 1\n'
    for (let i = 2; i <= 10; i++) {
      md += `${'  '.repeat(i - 1)}- level ${i}\n`
    }
    const tree = transformMarkdown(await parseMarkdown(md))
    const items = allSections(tree).filter((s) => s.kind === 'listItem')
    expect(items.length).toBe(10)
  })

  it('E07: 10-level nested blockquote → all expanded, no stack overflow', async () => {
    let md = '> level 1\n'
    for (let i = 2; i <= 10; i++) {
      md += `${'>'.repeat(i)} level ${i}\n`
    }
    const tree = transformMarkdown(await parseMarkdown(md))
    const bqs = allSections(tree).filter((s) => s.kind === 'blockquote')
    expect(bqs.length).toBe(10)
  })

  it('E08: heading depth=6 followed by depth=1 → correct pop', async () => {
    const md = '###### H6\n\n# H1'
    const tree = transformMarkdown(await parseMarkdown(md))
    const headings = allSections(tree).filter((s) => s.kind === 'heading')
    expect(headings.length).toBe(2)
  })

  it('E09: heading depth=1 followed by depth=6 → correct nesting', async () => {
    const md = '# H1\n\n###### H6'
    const tree = transformMarkdown(await parseMarkdown(md))
    const h1 = tree.children[0]!
    expect(h1.children.length).toBe(1)
    expect(h1.children[0]!.depth).toBe(6)
  })

  it('E10: unknown node → no crash, preserved as raw Block type=unknown', async () => {
    const unknown = { type: 'customWidget', foo: 'bar', children: [] }
    const tree = transformMarkdown({ type: 'root', children: [unknown] } as any)
    const items = tree.items as Block[]
    const unknownBlock = items.find((b) => b.type === 'unknown')
    expect(unknownBlock).toBeDefined()
    expect(unknownBlock!.originalType).toBe('customWidget')
    expect(unknownBlock!.raw).toBeDefined()
  })

  it('E11: unknown node does not break items order', async () => {
    const unknown = { type: 'custom', children: [] }
    const para = { type: 'paragraph', children: [{ type: 'text', value: 'text' }] }
    const tree = transformMarkdown({
      type: 'root',
      children: [para, unknown, para],
    } as any)
    expect(tree.items.length).toBe(3)
  })

  it('E12: large doc (5000+ nodes) → completes without crash/timeout', async () => {
    const children: any[] = [
      { type: 'heading', depth: 1, children: [{ type: 'text', value: 'H' }] },
    ]
    for (let i = 0; i < 5000; i++) {
      children.push({ type: 'paragraph', children: [{ type: 'text', value: `item ${i}` }] })
    }
    const root = { type: 'root', children } as any
    const tree = transformMarkdown(root)
    const heading = tree.children[0]!
    expect(heading.items.length).toBeGreaterThanOrEqual(5000)
  }, 30000)

  it('E13: footnote-only doc → root.children empty, footnotes have content', async () => {
    const md = '[^1]: footnote only'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.children).toHaveLength(0)
    expect(tree.footnotes!).toHaveLength(1)
    expect(tree.footnotes![0]!.items.length).toBeGreaterThanOrEqual(1)
  })

  it('E14: definition-only doc → definitions have content, no crash', async () => {
    const md = '[ref]: https://x.com'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.definitions).toBeDefined()
    expect(tree.definitions!.length).toBe(1)
  })

  it('E15: definition in container not in items → items = [blockBefore, blockAfter]', async () => {
    const md = '- before\n\n  [foo]: /url\n\n  after'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = allSections(tree).find((s) => s.kind === 'listItem')!
    const items = li.items.filter((i) => !('kind' in i)) as Block[]
    expect(items).toHaveLength(2)
    expect(items[0]!.type).toBe('paragraph')
    expect(items[1]!.type).toBe('paragraph')
    // definition should not be in items
    expect(items.some((b) => b.type === 'definition')).toBe(false)
    expect(tree.definitions!.length).toBeGreaterThanOrEqual(1)
  })
})
