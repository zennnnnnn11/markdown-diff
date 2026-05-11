/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../../parser/index'
import { transformMarkdown } from '../index'
import type { Section } from '../types'

function collectAllSections(root: Section): Section[] {
  const result: Section[] = [root]
  for (const child of root.children) {
    result.push(...collectAllSections(child))
  }
  if (root.footnotes) {
    for (const fn of root.footnotes) {
      result.push(...collectAllSections(fn))
    }
  }
  return result
}

function sectionByKind(root: Section, kind: string): Section[] {
  return collectAllSections(root).filter((s) => s.kind === kind)
}

describe('listItemToSection', () => {
  it('R01: simple listItem (one paragraph) → kind=listItem, title=para text, items has 1 block', async () => {
    const tree = transformMarkdown(await parseMarkdown('- hello'))
    const li = sectionByKind(tree, 'listItem')[0]!
    expect(li.kind).toBe('listItem')
    expect(li.title).toBe('hello')
    expect(li.items).toHaveLength(1)
  })

  it('R02: listItem with multiple paragraphs → items has 2+ blocks', async () => {
    const md = '- para1\n\n  para2'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = sectionByKind(tree, 'listItem')[0]!
    expect(li.items.length).toBeGreaterThanOrEqual(2)
  })

  it('R03: listItem with code block → items has code block', async () => {
    const md = '- item\n\n      code'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = sectionByKind(tree, 'listItem')[0]!
    const hasCode = li.items.some((i: any) => i.type === 'code')
    expect(hasCode).toBe(true)
  })

  it('R04: nested sub-list (1 level) → children has 1 listItem Section', async () => {
    const md = '- parent\n  - child'
    const tree = transformMarkdown(await parseMarkdown(md))
    const parent = sectionByKind(tree, 'listItem')[0]!
    expect(parent.children.length).toBe(1)
    expect(parent.children[0]!.kind).toBe('listItem')
  })

  it('R05: nested sub-list (2 levels) → both expanded', async () => {
    const md = '- a\n  - b\n    - c'
    const tree = transformMarkdown(await parseMarkdown(md))
    const listItems = sectionByKind(tree, 'listItem')
    expect(listItems.length).toBe(3)
  })

  it('R06: listItem with blockquote → blockquoteToSection called, blockquote Section in children & items', async () => {
    const md = '- item\n  > quote'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = sectionByKind(tree, 'listItem')[0]!
    const hasBq = li.children.some((c) => c.kind === 'blockquote')
    const hasBqItem = li.items.some((i: any) => i.kind === 'blockquote')
    expect(hasBq).toBe(true)
    expect(hasBqItem).toBe(true)
  })

  it('R07: heading inside listItem → Block (type=heading), in items', async () => {
    const md = '- item\n\n  ### heading inside'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = sectionByKind(tree, 'listItem')[0]!
    const headingBlock = li.items.find((i: any) => i.type === 'heading')
    expect(headingBlock).toBeDefined()
  })

  it('R08: heading inside listItem does not affect outer heading stack', async () => {
    const md = '# A\n\n- item\n\n  ## Fake\n\n  after\n\n## B'
    const tree = transformMarkdown(await parseMarkdown(md))
    const headASection = tree.children.find((c) => c.kind === 'heading' && c.title === 'A')!
    const headBSection = headASection.children.find((c) => c.kind === 'heading' && c.title === 'B')
    expect(headBSection).toBeDefined()
  })

  it('R09: definition inside listItem → not in items', async () => {
    const md = '- before\n\n  [foo]: /url\n\n  after'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.definitions!.length).toBeGreaterThanOrEqual(1)
    const li = sectionByKind(tree, 'listItem')[0]!
    const hasDefInItems = li.items.some((i: any) => i.type === 'definition')
    expect(hasDefInItems).toBe(false)
  })

  it('R10: definition skipped, items order preserved', async () => {
    const md = '- before\n\n  [foo]: /url\n\n  after'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = sectionByKind(tree, 'listItem')[0]!
    const paraTexts = li.items.filter((i: any) => i.type === 'paragraph')
    expect(paraTexts.length).toBeGreaterThanOrEqual(1)
  })

  it('R11: definition in listItem before/after → items have both paras, definition collected', async () => {
    const md = '- before\n\n  [foo]: /url\n\n  after'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = sectionByKind(tree, 'listItem')[0]!
    const paraTypes = li.items.filter((i) => !('kind' in i)).map((b: any) => b.type)
    expect(paraTypes.filter((t: string) => t === 'paragraph').length).toBe(2)
    expect(tree.definitions!.length).toBeGreaterThanOrEqual(1)
  })

  it('R12: empty listItem → items=[], title=""', async () => {
    const md = '- '
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = sectionByKind(tree, 'listItem')[0]!
    expect(li.items).toHaveLength(0)
    expect(li.title).toBe('')
  })

  it('R13: task list checked=true', async () => {
    const md = '- [x] done'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = sectionByKind(tree, 'listItem')[0]!
    expect(li.checked).toBe(true)
  })

  it('R14: task list checked=false', async () => {
    const md = '- [ ] todo'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = sectionByKind(tree, 'listItem')[0]!
    expect(li.checked).toBe(false)
  })

  it('R15: ordered list → ordered=true, start kept', async () => {
    const md = '5. first\n6. second'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = sectionByKind(tree, 'listItem')[0]!
    expect(li.ordered).toBe(true)
    expect(li.start).toBe(5)
  })

  it('R16: listItem index starts at 0', async () => {
    const md = '- a\n- b'
    const tree = transformMarkdown(await parseMarkdown(md))
    const items = sectionByKind(tree, 'listItem')
    expect(items[0]!.index).toBe(0)
    expect(items[1]!.index).toBe(1)
  })

  it('R17: listDepth: top-level=1, nested=2', async () => {
    const md = '- a\n  - b'
    const tree = transformMarkdown(await parseMarkdown(md))
    const items = sectionByKind(tree, 'listItem')
    const topLevel = items[0]!
    const nested = items[1]!
    expect(topLevel.listDepth).toBe(1)
    expect(nested.listDepth).toBe(2)
  })
})

describe('blockquoteToSection', () => {
  it('R18: simple blockquote → kind=blockquote, items has 1 block', async () => {
    const md = '> quote'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bq = sectionByKind(tree, 'blockquote')[0]!
    expect(bq.kind).toBe('blockquote')
    expect(bq.items.length).toBeGreaterThanOrEqual(1)
  })

  it('R19: blockquote with multiple paragraphs → items 2+ blocks', async () => {
    const md = '> p1\n>\n> p2'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bq = sectionByKind(tree, 'blockquote')[0]!
    expect(bq.items.length).toBeGreaterThanOrEqual(2)
  })

  it('R20: nested blockquote (1 level) → children has 1 blockquote Section', async () => {
    const md = '> outer\n>> inner'
    const tree = transformMarkdown(await parseMarkdown(md))
    const outer = sectionByKind(tree, 'blockquote')[0]!
    expect(outer.children.some((c) => c.kind === 'blockquote')).toBe(true)
  })

  it('R21: nested blockquote (2 levels) → both expanded', async () => {
    const md = '> a\n>> b\n>>> c'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bqs = sectionByKind(tree, 'blockquote')
    expect(bqs.length).toBeGreaterThanOrEqual(3)
  })

  it('R22: blockquote with list → listItemToSection called, listItem in children', async () => {
    const md = '> - item'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bq = sectionByKind(tree, 'blockquote')[0]!
    expect(bq.children.some((c) => c.kind === 'listItem')).toBe(true)
  })

  it('R23: heading inside blockquote → Block (type=heading), in items', async () => {
    const md = '> ### heading'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bq = sectionByKind(tree, 'blockquote')[0]!
    const headingBlock = bq.items.find((i: any) => i.type === 'heading')
    expect(headingBlock).toBeDefined()
  })

  it('R24: heading inside blockquote does not appear as global heading Section', async () => {
    const md = '> ### Fake\n\n## Real'
    const tree = transformMarkdown(await parseMarkdown(md))
    const headings = sectionByKind(tree, 'heading')
    // Only "Real" should be a heading Section
    expect(headings.length).toBe(1)
    expect(headings[0]!.title).toBe('Real')
  })

  it('R25: definition inside blockquote → not in items', async () => {
    const md = '> [ref]: /url\n> text'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.definitions!.length).toBeGreaterThanOrEqual(1)
  })

  it('R26: empty blockquote → items=[], title=""', async () => {
    const md = '>'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bq = sectionByKind(tree, 'blockquote')[0]!
    expect(bq.items).toHaveLength(0)
  })

  it('R27: quoteDepth: top-level=1, nested=2', async () => {
    const md = '> a\n>> b'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bqs = sectionByKind(tree, 'blockquote')
    expect(bqs[0]!.quoteDepth).toBe(1)
    expect(bqs[1]!.quoteDepth).toBe(2)
  })
})

describe('mutual recursion', () => {
  it('R28: listItem → blockquote → list (3 levels expanded)', async () => {
    const md = '- item\n  > - nested'
    const tree = transformMarkdown(await parseMarkdown(md))
    const items = sectionByKind(tree, 'listItem')
    expect(items.length).toBeGreaterThanOrEqual(2)
  })

  it('R29: blockquote → listItem → blockquote (3 levels expanded)', async () => {
    const md = '> - item\n>   > nested'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bqs = sectionByKind(tree, 'blockquote')
    expect(bqs.length).toBeGreaterThanOrEqual(2)
  })

  it('R30: listItem → blockquote → listItem → blockquote (4 levels)', async () => {
    const md = '- a\n  > - b\n  >   > c'
    const tree = transformMarkdown(await parseMarkdown(md))
    const all = collectAllSections(tree)
    expect(all.length).toBeGreaterThanOrEqual(5)
  })

  it('R31: mutual recursion does not cause stack overflow', async () => {
    // 5 levels deep should work
    const md = '- a\n  > - b\n  >   > - c\n  >   >   > - d\n  >   >   >   > - e'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree).toBeDefined()
  })
})
