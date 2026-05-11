/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../../parser/index'
import { createBlock } from '../block-factory'

function findNode(ast: any, type: string): any {
  if (!ast) return null
  if (ast.type === type) return ast
  if (ast.children) {
    for (const c of ast.children) {
      const found = findNode(c, type)
      if (found) return found
    }
  }
  return null
}

describe('block-factory', () => {
  it('B01: heading node → Block { type=heading, preserves depth }', async () => {
    const ast = await parseMarkdown('# Hi')
    const h = findNode(ast, 'heading')
    const b = createBlock(h!)
    expect(b.type).toBe('heading')
    expect((b as any).depth).toBe(1)
    expect(b.id).toBeDefined()
    expect(typeof b.id).toBe('string')
  })

  it('B02: paragraph node → Block { type=paragraph }', async () => {
    const ast = await parseMarkdown('text')
    const p = findNode(ast, 'paragraph')
    const b = createBlock(p!)
    expect(b.type).toBe('paragraph')
  })

  it('B03: code node → Block { type=code, keeps lang & value }', async () => {
    const ast = await parseMarkdown('```js\nx\n```')
    const c = findNode(ast, 'code')
    const b = createBlock(c!)
    expect(b.type).toBe('code')
    expect(b.lang).toBe('js')
    expect(b.value).toBeTruthy()
  })

  it('B04: table node → Block { type=table }', async () => {
    const ast = await parseMarkdown('| a |\n| - |\n| 1 |')
    const t = findNode(ast, 'table')
    const b = createBlock(t!)
    expect(b.type).toBe('table')
  })

  it('B05: html node → Block { type=html }', async () => {
    const ast = await parseMarkdown('<div>x</div>')
    const h = findNode(ast, 'html')
    const b = createBlock(h!)
    expect(b.type).toBe('html')
  })

  it('B06: thematicBreak → Block { type=thematicBreak }', async () => {
    const ast = await parseMarkdown('---\n')
    const tb = findNode(ast, 'thematicBreak')
    const b = createBlock(tb!)
    expect(b.type).toBe('thematicBreak')
  })

  it('B07: image node → Block { type=image, keeps url/alt }', async () => {
    const ast = await parseMarkdown('![alt](http://x.com)')
    const img = findNode(ast, 'image')
    const b = createBlock(img!)
    expect(b.type).toBe('image')
    expect(b.url).toBe('http://x.com')
    expect(b.alt).toBe('alt')
  })

  it('B08: math node → Block { type=math }', async () => {
    const ast = await parseMarkdown('$$\nx^2\n$$')
    const m = findNode(ast, 'math')
    expect(m).toBeDefined()
    const b = createBlock(m!)
    expect(b.type).toBe('math')
  })

  it('B09: unknown node → { type=unknown, originalType kept, raw kept }', () => {
    const unknown = { type: 'customWidget', foo: 'bar', position: {} } as any
    const b = createBlock(unknown)
    expect(b.type).toBe('unknown')
    expect(b.originalType).toBe('customWidget')
    expect(b.raw).toBeDefined()
    expect((b.raw as any).foo).toBe('bar')
  })

  it('B10: generated Block has unique string id', async () => {
    const ast = await parseMarkdown('a\n\nb')
    const ids = new Set<string>()
    for (const child of ast.children) {
      const b = createBlock(child as any)
      expect(typeof b.id).toBe('string')
      ids.add(b.id)
    }
    expect(ids.size).toBe(2)
  })

  it('B11: generated Block retains position', async () => {
    const ast = await parseMarkdown('# Hi')
    const h = findNode(ast, 'heading')
    const b = createBlock(h!)
    expect((b as any).position).toBeDefined()
    expect((b as any).position.start).toBeDefined()
  })
})
