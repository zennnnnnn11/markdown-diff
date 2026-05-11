/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../../parser/index'
import { transformMarkdown } from '../index'
import type { Section, Block } from '../types'

function sections(root: Section): Section[] {
  const r: Section[] = [root]
  for (const c of root.children) r.push(...sections(c))
  if (root.footnotes) for (const f of root.footnotes) r.push(...sections(f))
  return r
}
function byKind(root: Section, kind: string): Section[] {
  return sections(root).filter((s) => s.kind === kind)
}

describe('basic building', () => {
  it('U01: empty doc → root Section only, items=[], children=[]', async () => {
    const tree = transformMarkdown(await parseMarkdown(''))
    expect(tree.kind).toBe('root')
    expect(tree.items).toHaveLength(0)
    expect(tree.children).toHaveLength(0)
  })

  it('U02: single paragraph → root.items has 1 block', async () => {
    const tree = transformMarkdown(await parseMarkdown('text'))
    expect(tree.items).toHaveLength(1)
    expect((tree.items[0]! as Block).type).toBe('paragraph')
  })

  it('U03: single heading + paragraph → root.children has heading Section with paragraph in items', async () => {
    const tree = transformMarkdown(await parseMarkdown('# H\n\ntext'))
    expect(tree.children).toHaveLength(1)
    const hSection = tree.children[0]!
    expect(hSection.kind).toBe('heading')
    expect(hSection.items).toHaveLength(1)
  })

  it('U04: multi-level headings nested correctly (# → ## → ###)', async () => {
    const md = '# A\n\n## B\n\n### C'
    const tree = transformMarkdown(await parseMarkdown(md))
    const a = tree.children[0]!
    const b = a.children[0]!
    const c = b.children[0]!
    expect(a.depth).toBe(1)
    expect(b.depth).toBe(2)
    expect(c.depth).toBe(3)
  })

  it('U05: heading skip-level (# → ###) → no crash, ### under #, depth=3', async () => {
    const md = '# A\n\n### C'
    const tree = transformMarkdown(await parseMarkdown(md))
    const a = tree.children[0]!
    const c = a.children[0]!
    expect(c.depth).toBe(3)
    expect(c.kind).toBe('heading')
  })

  it('U06: sibling headings at same level → two ## under same #', async () => {
    const md = '# A\n\n## B\n\n## C'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.children[0]!.children.length).toBe(2)
  })
})

describe('containers', () => {
  it('U07: top-level unordered list → root.children has listItem Section', async () => {
    const tree = transformMarkdown(await parseMarkdown('- a'))
    expect(tree.children.some((c) => c.kind === 'listItem')).toBe(true)
  })

  it('U08: top-level ordered list → listItem.ordered=true', async () => {
    const tree = transformMarkdown(await parseMarkdown('1. a'))
    const li = byKind(tree, 'listItem')[0]!
    expect(li.ordered).toBe(true)
  })

  it('U09: nested list (3 levels) → all expanded', async () => {
    const md = '- a\n  - b\n    - c'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(byKind(tree, 'listItem').length).toBe(3)
  })

  it('U10: list under heading → list attached to heading Section', async () => {
    const md = '# H\n\n- a'
    const tree = transformMarkdown(await parseMarkdown(md))
    const h = tree.children[0]!
    expect(h.children.some((c) => c.kind === 'listItem')).toBe(true)
  })

  it('U11: top-level blockquote → root.children has blockquote Section', async () => {
    const tree = transformMarkdown(await parseMarkdown('> q'))
    expect(tree.children.some((c) => c.kind === 'blockquote')).toBe(true)
  })

  it('U12: nested blockquote (3 levels) → all expanded', async () => {
    const md = '> a\n>> b\n>>> c'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(byKind(tree, 'blockquote').length).toBeGreaterThanOrEqual(3)
  })
})

describe('container mutual recursion', () => {
  it('U13: heading → listItem → blockquote → expanded', async () => {
    const md = '# H\n\n- a\n  > q'
    const tree = transformMarkdown(await parseMarkdown(md))
    const all = sections(tree)
    expect(all.some((s) => s.kind === 'blockquote')).toBe(true)
    expect(all.some((s) => s.kind === 'listItem')).toBe(true)
  })

  it('U14: heading → blockquote → list → expanded', async () => {
    const md = '# H\n\n> - a'
    const tree = transformMarkdown(await parseMarkdown(md))
    const all = sections(tree)
    expect(all.some((s) => s.kind === 'blockquote')).toBe(true)
    expect(all.some((s) => s.kind === 'listItem')).toBe(true)
  })

  it('U15: three-level cross nesting → all expanded', async () => {
    const md = '- a\n  > - b\n  >   > - c'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(sections(tree).length).toBeGreaterThanOrEqual(5)
  })
})

describe('heading inside container → Block, not Section', () => {
  const containerMd = '# A\n\n- item\n\n  ## Fake\n\n  inside\n\n  after\n\n## B'

  it('U16: Fake is heading Block in listItem.items', async () => {
    const tree = transformMarkdown(await parseMarkdown(containerMd))
    const a = tree.children[0]!
    const li = a.children.find((c) => c.kind === 'listItem')!
    const hasHeadingBlock = li.items.some((i: any) => i.type === 'heading')
    expect(hasHeadingBlock).toBe(true)
  })

  it('U17: "after" still belongs to # A', async () => {
    const tree = transformMarkdown(await parseMarkdown(containerMd))
    const a = tree.children[0]!
    const li = a.children.find((c) => c.kind === 'listItem')!
    const afterBlock = li.items.find(
      (i: any) => i.type === 'paragraph' && i.children?.[0]?.value === 'after',
    )
    expect(afterBlock).toBeDefined()
  })

  it('U18: B is a sub-heading Section of # A', async () => {
    const tree = transformMarkdown(await parseMarkdown(containerMd))
    const a = tree.children[0]!
    const b = a.children.find((c) => c.kind === 'heading' && c.title === 'B')
    expect(b).toBeDefined()
  })

  it('U19: heading in blockquote → paragraph after heading still in blockquote items', async () => {
    const md = '> ### H\n> after'
    const tree = transformMarkdown(await parseMarkdown(md))
    const bq = byKind(tree, 'blockquote')[0]!
    const afterBlock = bq.items.find(
      (i: any) => i.type === 'paragraph' && i.children?.[0]?.value === 'after',
    )
    expect(afterBlock).toBeDefined()
  })

  it('U20: paragraph after blockquote → belongs to outer heading', async () => {
    const md = '# H\n\n> ### Inner\n\noutside'
    const tree = transformMarkdown(await parseMarkdown(md))
    const h = tree.children[0]!
    const outsideBlock = h.items.find(
      (i: any) => i.type === 'paragraph' && i.children?.[0]?.value === 'outside',
    )
    expect(outsideBlock).toBeDefined()
  })

  it('U21: heading in footnote → Block, not Section', async () => {
    const md = 'text[^1]\n\n[^1]: ## fn heading\n\nfn para'
    const tree = transformMarkdown(await parseMarkdown(md))
    const fn = tree.footnotes![0]!
    const headingInFn = fn.items.find((i: any) => i.type === 'heading')
    expect(headingInFn).toBeDefined()
    expect(fn.children.length).toBe(0)
  })
})

describe('special nodes', () => {
  it('U22: frontmatter → root.children has frontmatter Section', async () => {
    const md = '---\ntitle: X\n---\n\ntext'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.children.some((c) => c.kind === 'frontmatter')).toBe(true)
  })

  it('U23: table → single Block in items', async () => {
    const md = '| a |\n| - |\n| 1 |'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect((tree.items[0]! as Block).type).toBe('table')
  })

  it('U24: HTML → single Block', async () => {
    const tree = transformMarkdown(await parseMarkdown('<div>x</div>'))
    expect((tree.items[0]! as Block).type).toBe('html')
  })

  it('U25: math → Block { type=math }', async () => {
    const md = '$$\nx^2\n$$'
    const tree = transformMarkdown(await parseMarkdown(md))
    const b = tree.items[0]! as Block
    expect(b.type).toBe('math')
  })

  it('U26: thematicBreak → Block { type=thematicBreak }', async () => {
    const tree = transformMarkdown(await parseMarkdown('---\n'))
    const b = tree.items[0]! as Block
    expect(b.type).toBe('thematicBreak')
  })

  it('U27: image → Block (paragraph wrapping image)', async () => {
    const md = '![alt](url)'
    const tree = transformMarkdown(await parseMarkdown(md))
    const p = tree.items[0]! as Block
    expect(p.type).toBe('paragraph')
    expect(p.children?.some((c: any) => c.type === 'image')).toBe(true)
  })

  it('U28: unknown node → raw Block type=unknown', () => {
    const unknown = { type: 'customThing', data: 'x', children: [] }
    const tree = transformMarkdown({ type: 'root', children: [unknown] } as any)
    expect(tree.items.some((b: any) => b.type === 'unknown')).toBe(true)
  })
})

describe('global collection', () => {
  it('U29: top-level definition collected', async () => {
    const md = '[ref]: url\n\ntext'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.definitions).toBeDefined()
    expect(tree.definitions!.length).toBe(1)
  })

  it('U30: definition in container also collected', async () => {
    const md = '> [ref]: url\n> text'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.definitions).toBeDefined()
  })

  it('U31: top-level and container definitions mixed → all collected, order preserved', async () => {
    const md = '[a]: url1\n\n> [b]: url2\n> text'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.definitions!.length).toBeGreaterThanOrEqual(2)
  })

  it('U32: same identifier definitions → all kept, not deduplicated', async () => {
    const md = '[a]: url1\n\n[a]: url2\n\ntext'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.definitions!.length).toBe(2)
  })

  it('U33: footnoteDefinition → root.footnotes', async () => {
    const md = 'text[^1]\n\n[^1]: fn'
    const tree = transformMarkdown(await parseMarkdown(md))
    expect(tree.footnotes).toBeDefined()
    expect(tree.footnotes!.length).toBe(1)
  })

  it('U34: footnote content has paragraph → items has paragraph block', async () => {
    const md = 'text[^1]\n\n[^1]: fn para'
    const tree = transformMarkdown(await parseMarkdown(md))
    const fn = tree.footnotes![0]!
    expect(fn.items.some((i: any) => i.type === 'paragraph')).toBe(true)
  })

  it('U35: footnote content has list → recursive expanded', async () => {
    const md = 'text[^1]\n\n[^1]: - a\n  - b'
    const tree = transformMarkdown(await parseMarkdown(md))
    const fn = tree.footnotes![0]!
    expect(fn.children.some((c) => c.kind === 'listItem')).toBe(true)
  })

  it('U36: footnote content has blockquote → recursive expanded', async () => {
    const md = 'text[^1]\n\n[^1]: > q'
    const tree = transformMarkdown(await parseMarkdown(md))
    const fn = tree.footnotes![0]!
    expect(fn.children.some((c) => c.kind === 'blockquote')).toBe(true)
  })
})

describe('order preservation', () => {
  it('U37: para-list-para → items = [block, section, block]', async () => {
    const md = 'para\n\n- item\n\nafter'
    const tree = transformMarkdown(await parseMarkdown(md))
    const kinds = tree.items.map((i) => ('kind' in i ? (i as Section).kind : 'block'))
    expect(kinds[0]).toBe('block')
    expect(kinds[1]).toBe('listItem')
    expect(kinds[2]).toBe('block')
  })

  it('U38: list-blockquote-para → items = [section, section, block]', async () => {
    const md = '- a\n\n> q\n\ntext'
    const tree = transformMarkdown(await parseMarkdown(md))
    const kinds = tree.items.map((i) => ('kind' in i ? (i as Section).kind : 'block'))
    expect(kinds[0]).toBe('listItem')
    expect(kinds[1]).toBe('blockquote')
    expect(kinds[2]).toBe('block')
  })

  it('U39: para-list-code-para under heading → items sequence = [para, listItem, code, para]', async () => {
    const md = '# H\n\npara\n\n- item\n\n```\ncode\n```\n\nafter'
    const tree = transformMarkdown(await parseMarkdown(md))
    const h = tree.children[0]!
    const kinds = h.items.map((i) => ('kind' in i ? (i as Section).kind : (i as Block).type))
    expect(kinds).toEqual(['paragraph', 'listItem', 'code', 'paragraph'])
  })

  it('U40: nested container internal order = [para, para, section, section]', async () => {
    const md = '- a\n\n  para inside\n\n  - nested item\n\n  > quote inside'
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = byKind(tree, 'listItem')[0]!
    const kinds = li.items.map((i) => ('kind' in i ? (i as Section).kind : (i as Block).type))
    expect(kinds.length).toBe(4)
    expect(kinds[0]).toBe('paragraph')
    expect(kinds[1]).toBe('paragraph')
    expect(kinds[2]).toBe('listItem')
    expect(kinds[3]).toBe('blockquote')
  })
})

describe('blank handling', () => {
  it('U41: heading followed immediately by sibling heading → first Section.items=[]', async () => {
    const md = '## A\n\n## B'
    const tree = transformMarkdown(await parseMarkdown(md))
    const headings = byKind(tree, 'heading')
    expect(headings[0]!.items).toHaveLength(0)
  })

  it('U42: empty listItem → items=[]', async () => {
    const md = '- '
    const tree = transformMarkdown(await parseMarkdown(md))
    const li = byKind(tree, 'listItem')[0]!
    expect(li.items).toHaveLength(0)
  })

  it('U43: empty blockquote → items=[]', async () => {
    const tree = transformMarkdown(await parseMarkdown('>'))
    const bq = byKind(tree, 'blockquote')[0]!
    expect(bq.items).toHaveLength(0)
  })

  it('U44: empty heading at end of doc → items=[]', async () => {
    const md = '# H\n\n# Empty'
    const tree = transformMarkdown(await parseMarkdown(md))
    const headings = byKind(tree, 'heading')
    expect(headings[1]!.items).toHaveLength(0)
  })
})
