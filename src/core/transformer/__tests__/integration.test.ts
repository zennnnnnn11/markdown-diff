/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../../parser/index'
import { transformMarkdown } from '../index'
import type { Section } from '../types'

function allSections(root: Section): Section[] {
  const r: Section[] = [root]
  for (const c of root.children) r.push(...allSections(c))
  if (root.footnotes) for (const f of root.footnotes) r.push(...allSections(f))
  return r
}

describe('integration', () => {
  it('INT01: parse then transform → no crash', async () => {
    const ast = await parseMarkdown('# H\n\ntext')
    const tree = transformMarkdown(ast)
    expect(tree.kind).toBe('root')
  })

  it('INT02: full doc with all features → structure correct', async () => {
    const md = `---
title: Test
---

# Introduction

Some text with [a link][ref] and a footnote[^1].

[ref]: https://example.com "title"

## Section A

Content in A.

- item 1
- item 2

> A quotation

| col1 | col2 |
| ---- | ---- |
| a    | b    |

### Sub A

\`\`\`js
const x = 1
\`\`\`

Deep content here.

## Section B

Final content.

[^1]: This is the footnote with *emphasis*.

    And a second paragraph.
`
    const ast = await parseMarkdown(md)
    const tree = transformMarkdown(ast)

    expect(tree.kind).toBe('root')
    expect(tree.children.length).toBeGreaterThanOrEqual(2)
    expect(tree.definitions).toBeDefined()
    expect(tree.footnotes).toBeDefined()
    expect(tree.contentHash).toBeDefined()

    const kinds = allSections(tree).map((s) => s.kind)
    expect(kinds).toContain('heading')
    expect(kinds).toContain('listItem')
    expect(kinds).toContain('blockquote')
    expect(kinds).toContain('frontmatter')
    expect(kinds).toContain('footnote')
  })

  it('INT03: all Section ids unique', async () => {
    const md = '# A\n\n## B\n\n### C\n\n- a\n  - b\n\n> q\n\n[^1]: fn\n\ntext[^1]'
    const tree = transformMarkdown(await parseMarkdown(md))
    const ids = allSections(tree).map((s) => s.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('INT04: semantic depth and treeDepth both stay consistent', async () => {
    const md = '# A\n\n## B\n\n### C\n\n- a\n  - b\n\n> q\n\n[^1]: fn\n\ntext[^1]'
    const tree = transformMarkdown(await parseMarkdown(md))
    const all = allSections(tree)
    for (const s of all.filter((s) => s.kind === 'heading')) {
      for (const child of s.children.filter((c) => c.kind === 'heading')) {
        expect(child.depth).toBeGreaterThan(s.depth)
      }
    }
    for (const s of all.filter((s) => s.kind === 'listItem' || s.kind === 'blockquote')) {
      for (const child of s.children) {
        expect(child.treeDepth).toBe(s.treeDepth + 1)
      }
    }
  })

  it('INT05: root Section has all structural fields', async () => {
    const md = '# H\n\n[ref]: url\n\ntext[^1]\n\n[^1]: fn'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.children).toBeDefined()
    expect(tree.items).toBeDefined()
    expect(tree.footnotes).toBeDefined()
    expect(tree.definitions).toBeDefined()
  })

  it('INT06: container mutual recursion → listItem → blockquote → listItem nesting verified', async () => {
    const md = '# A\n\n- item\n  > - nested quote\n  >   > deep'
    const tree = transformMarkdown(await parseMarkdown(md))
    const outerLi = tree.children[0]!.children[0]!
    expect(outerLi.kind).toBe('listItem')
    expect(outerLi.depth).toBe(1)
    expect(outerLi.treeDepth).toBe(2)
    // outer listItem contains blockquote
    const innerBq = outerLi.children.find((c: any) => c.kind === 'blockquote')!
    expect(innerBq).toBeDefined()
    expect(innerBq.depth).toBe(1)
    expect(innerBq.treeDepth).toBe(outerLi.treeDepth + 1)
    // blockquote contains nested listItem
    const nestedLi = innerBq.children.find((c: any) => c.kind === 'listItem')!
    expect(nestedLi).toBeDefined()
    expect(nestedLi.depth).toBe(1)
    expect(nestedLi.treeDepth).toBe(innerBq.treeDepth + 1)
    // nested listItem contains another blockquote (deep)
    const deepBq = nestedLi.children.find((c: any) => c.kind === 'blockquote')!
    expect(deepBq).toBeDefined()
    expect(deepBq.depth).toBe(1)
    expect(deepBq.treeDepth).toBe(nestedLi.treeDepth + 1)
  })

  it('INT07: heading inside container in real doc degrades to Block', async () => {
    const md = '# A\n\n- item\n\n  ## Fake\n\ntext after\n\n## B'
    const tree = transformMarkdown(await parseMarkdown(md))
    // Fake should NOT appear as a heading Section (it's in a listItem)
    const headings = allSections(tree).filter((s) => s.kind === 'heading')
    const fakeHeadings = headings.filter((h) => h.title === 'Fake')
    expect(fakeHeadings.length).toBe(0)
  })

  it('INT08: same input, repeated transform → structure snapshot consistent', async () => {
    const md = '# H\n\n- a\n> q\n\n[^1]: fn\n\ntext[^1]'
    const ast1 = await parseMarkdown(md)
    const ast2 = await parseMarkdown(md)
    const t1 = JSON.parse(JSON.stringify(transformMarkdown(ast1)))
    const t2 = JSON.parse(JSON.stringify(transformMarkdown(ast2)))
    const stripMeta = (o: any): any => {
      if (Array.isArray(o)) return o.map(stripMeta)
      if (o && typeof o === 'object') {
        const { id, position, contentHash, ...rest } = o
        for (const k of Object.keys(rest)) rest[k] = stripMeta(rest[k])
        return rest
      }
      return o
    }
    expect(stripMeta(t1)).toEqual(stripMeta(t2))
  })

  it('INT09: complex doc result is serializable', async () => {
    const md = '# H\n\n- a\n  > q\n\n```\ncode\n```\n\ntext'
    const tree = transformMarkdown(await parseMarkdown(md))
    const json = JSON.stringify(tree)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('INT10: heading inside container does not affect outer stack (full doc)', async () => {
    const md = '# A\n\n- item\n\n  ## Fake\n\n  inside\n\n  after\n\n## B'
    const tree = transformMarkdown(await parseMarkdown(md))
    const a = tree.children.find((c) => c.kind === 'heading' && c.title === 'A')!
    const b = a.children.find((c) => c.kind === 'heading' && c.title === 'B')
    expect(b).toBeDefined()
  })
})
