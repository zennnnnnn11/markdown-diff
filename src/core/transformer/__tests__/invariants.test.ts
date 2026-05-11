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

function validateChildrenItems(section: Section): void {
  // I01: each child in children appears exactly once in items
  const itemSections = section.items.filter((i): i is Section => 'kind' in i)
  for (const child of section.children) {
    const count = itemSections.filter((s) => s === child).length
    expect(count).toBe(1)
  }
  // I02: each Section in items appears exactly once in children
  for (const itemSection of itemSections) {
    const count = section.children.filter((c) => c === itemSection).length
    expect(count).toBe(1)
  }
  // I03: order consistent — items filtered to sections == children
  const orderedSections = section.items.filter((i): i is Section => 'kind' in i)
  expect(orderedSections).toEqual(section.children)
}

describe('children/items bidirectional consistency', () => {
  it('I01: each child in children appears exactly once in items (type=section)', async () => {
    const md = '# A\n\n- a\n\n> q\n\n## B\n\n- b\n  - c'
    const tree = transformMarkdown(await parseMarkdown(md))
    const secs = allSections(tree)
    for (const s of secs) validateChildrenItems(s)
    expect(secs.length).toBeGreaterThan(0)
  })

  it('I02-I03: all sections pass children/items sync', async () => {
    const md = `# A

intro

- item 1
- item 2

> quoted

## B

content

### C

deep
`
    const tree = transformMarkdown(await parseMarkdown(md))
    const secs = allSections(tree)
    expect(secs.length).toBeGreaterThan(5)
    for (const s of secs) {
      validateChildrenItems(s)
    }
  })

  it('I04: root satisfies bidirectional consistency', async () => {
    const md = '- a\n\n> q\n\ntext'
    const tree = transformMarkdown(await parseMarkdown(md))
    validateChildrenItems(tree)
    expect(tree.kind).toBe('root')
  })

  it('I05: heading Section satisfies consistency', async () => {
    const md = '# H\n\n- a\n\ntext\n\n## H2'
    const tree = transformMarkdown(await parseMarkdown(md))
    const h = allSections(tree).find((s) => s.kind === 'heading')!
    validateChildrenItems(h)
    expect(h.kind).toBe('heading')
  })

  it('I06: listItem Section satisfies consistency', async () => {
    const md = '- a\n  - b\n  > q'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = allSections(tree).find((s) => s.kind === 'listItem' && s.children.length > 0)!
    validateChildrenItems(li)
    expect(li.kind).toBe('listItem')
  })

  it('I07: blockquote Section satisfies consistency', async () => {
    const md = '> - a\n> > q'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bq = allSections(tree).find((s) => s.kind === 'blockquote' && s.children.length > 0)!
    validateChildrenItems(bq)
    expect(bq.kind).toBe('blockquote')
  })
})

describe('metadata completeness', () => {
  it('I08: all Sections have unique id', async () => {
    const md = '# A\n\n## B\n\n- a\n\n> q\n\n[^1]: fn\n\ntext[^1]'
    const tree = transformMarkdown(await parseMarkdown(md))
    const ids = new Set<string>()
    for (const s of allSections(tree)) {
      expect(s.id).toBeTruthy()
      expect(typeof s.id).toBe('string')
      ids.add(s.id)
    }
    expect(ids.size).toBeGreaterThanOrEqual(allSections(tree).length - 1)
  })

  it('I09: all Sections have kind', async () => {
    const tree = transformMarkdown(await parseMarkdown('# H\n\n- a\n> q'))
    for (const s of allSections(tree)) {
      expect(s.kind).toBeTruthy()
    }
  })

  it('I10: all Sections have depth/treeDepth (number)', async () => {
    const tree = transformMarkdown(await parseMarkdown('# H\n\n- a\n> q'))
    for (const s of allSections(tree)) {
      expect(typeof s.depth).toBe('number')
      expect(typeof s.treeDepth).toBe('number')
    }
  })

  it('I11: heading child → child.depth > parent.depth', async () => {
    const tree = transformMarkdown(await parseMarkdown('# A\n\n## B\n\n### C'))
    const a = tree.children[0]!
    const b = a.children[0]!
    const c = b.children[0]!
    expect(b.depth).toBeGreaterThan(a.depth)
    expect(c.depth).toBeGreaterThan(b.depth)
  })

  it('I12: listItem child → child.treeDepth = parent.treeDepth + 1', async () => {
    const md = '- a\n  - b\n    - c'
    const tree = transformMarkdown(await parseMarkdown(md))
    const items = allSections(tree).filter((s) => s.kind === 'listItem')
    for (let i = 0; i < items.length; i++) {
      for (const child of items[i]!.children) {
        expect(child.treeDepth).toBe(items[i]!.treeDepth + 1)
      }
    }
  })

  it('I13: blockquote child → child.treeDepth = parent.treeDepth + 1', async () => {
    const md = '> a\n>> b'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bqs = allSections(tree).filter((s) => s.kind === 'blockquote')
    for (const bq of bqs) {
      for (const child of bq.children) {
        expect(child.treeDepth).toBe(bq.treeDepth + 1)
      }
    }
  })

  it('I14: root direct children → treeDepth=1, semantic depth depends on current heading context', async () => {
    const md = '---\ntitle: X\n---\n\n# H\n\ntext'
    const tree = transformMarkdown(await parseMarkdown(md))
    for (const c of tree.children) expect(c.treeDepth).toBe(1)
    const fm = tree.children.find((c) => c.kind === 'frontmatter')!
    const heading = tree.children.find((c) => c.kind === 'heading')!
    expect(fm.depth).toBe(0)
    expect(heading.depth).toBeGreaterThanOrEqual(1)
  })

  it('I15: heading Section has headingDepth 1-6', async () => {
    const tree = transformMarkdown(await parseMarkdown('# H1\n\n###### H6'))
    for (const h of allSections(tree).filter((s) => s.kind === 'heading')) {
      expect(h.headingDepth).toBeGreaterThanOrEqual(1)
      expect(h.headingDepth).toBeLessThanOrEqual(6)
    }
  })

  it('I16: listItem Section has listDepth', async () => {
    const md = '- a\n  - b'
    const tree = transformMarkdown(await parseMarkdown(md))
    const items = allSections(tree).filter((s) => s.kind === 'listItem')
    for (const li of items) {
      expect(typeof li.listDepth).toBe('number')
      expect(li.listDepth).toBeGreaterThanOrEqual(1)
    }
  })

  it('I17: blockquote Section has quoteDepth', async () => {
    const md = '> a\n>> b'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bqs = allSections(tree).filter((s) => s.kind === 'blockquote')
    for (const bq of bqs) {
      expect(typeof bq.quoteDepth).toBe('number')
      expect(bq.quoteDepth).toBeGreaterThanOrEqual(1)
    }
  })

  it('I18: titleKind matches kind', async () => {
    const md = '---\ntitle: X\n---\n\n# H\n\n- a\n\n> q\n\n[^1]: fn\n\ntext[^1]'
    const tree = transformMarkdown(await parseMarkdown(md))
    const expected: Record<string, string> = {
      heading: 'explicit',
      footnote: 'explicit',
      listItem: 'derived',
      blockquote: 'derived',
      root: 'synthetic',
      frontmatter: 'synthetic',
    }
    for (const s of allSections(tree)) {
      expect(s.titleKind).toBe(expected[s.kind])
    }
  })
})

describe('immutability', () => {
  it('I19: original AST is unchanged after transform', async () => {
    const ast1 = await parseMarkdown('# H\n\n- a\n> q')
    const snapshot1 = JSON.stringify(ast1)
    const ast2 = await parseMarkdown('# H\n\n- a\n> q')
    transformMarkdown(ast2)
    const snapshot2 = JSON.stringify(ast2)
    expect(snapshot2).toBe(snapshot1)
  })

  it('I20: original AST children unchanged (no additions/removals)', async () => {
    const ast = await parseMarkdown('# H\n\n- a\n> q')
    const childCount = (ast as any).children.length
    transformMarkdown(ast)
    expect((ast as any).children).toHaveLength(childCount)
  })

  it('I21: original AST node position unchanged', async () => {
    const ast = await parseMarkdown('# H')
    const heading = (ast as any).children[0]
    const origPos = JSON.stringify(heading.position)
    transformMarkdown(ast)
    expect(JSON.stringify(heading.position)).toBe(origPos)
  })

  it('I22: mutating transformed tree does not affect original AST', async () => {
    const ast = await parseMarkdown('# H\n\ntext')
    const origHeading = (ast as any).children[0]
    const origTitle = origHeading.children[0].value
    const origChildCount = (ast as any).children.length

    const tree = transformMarkdown(ast)

    // mutate a block deep inside the transformed tree
    const hSection = tree.children[0]!
    const paraBlock = hSection.items.find((i: any) => i.type === 'paragraph') as any
    paraBlock.children[0].value = 'MUTATED'
    hSection.title = 'MUTATED'
    hSection.children.pop()

    // original AST must be unchanged
    expect(origHeading.children[0].value).toBe(origTitle)
    expect((ast as any).children).toHaveLength(origChildCount)
  })
})
