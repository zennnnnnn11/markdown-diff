/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../../parser/index'
import { transformMarkdown } from '../index'

describe('collector', () => {
  describe('definitions', () => {
    it('C01: collects single definition → root.definitions length=1', async () => {
      const md = '[ref]: https://x.com\n\ntext'
      const tree = transformMarkdown(await parseMarkdown(md))
      expect(tree.definitions).toHaveLength(1)
    })

    it('C02: collects multiple definitions (different identifiers)', async () => {
      const md = '[a]: url1\n[b]: url2\n\ntext'
      const tree = transformMarkdown(await parseMarkdown(md))
      expect(tree.definitions).toHaveLength(2)
    })

    it('C03: same identifier definitions all collected, order preserved', async () => {
      const md = '[a]: url1\n[a]: url2\n\ntext'
      const tree = transformMarkdown(await parseMarkdown(md))
      expect(tree.definitions).toHaveLength(2)
    })

    it('C04: definition fields: identifier, url, title preserved', async () => {
      const md = '[ref]: https://x.com "title"\n\ntext'
      const tree = transformMarkdown(await parseMarkdown(md))
      const def = tree.definitions![0]!
      expect(def.type).toBe('definition')
      expect(def.identifier).toBe('ref')
      expect(def.url).toBe('https://x.com')
      expect(def.title).toBe('title')
      expect((def as any).position).toBeDefined()
    })

    it('C07: no definitions → empty array', async () => {
      const tree = transformMarkdown(await parseMarkdown('just text'))
      expect(tree.definitions).toEqual([])
    })

    it('C10: definition inside container also collected', async () => {
      const md = '> [ref]: url\n> text'
      const tree = transformMarkdown(await parseMarkdown(md))
      expect(tree.definitions).toBeDefined()
      expect(tree.definitions!.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('footnotes', () => {
    it('C05: footnoteDefinition creates Section → root.footnotes length correct', async () => {
      const md = 'text[^1]\n\n[^1]: fn text'
      const tree = transformMarkdown(await parseMarkdown(md))
      expect(tree.footnotes).toBeDefined()
      expect(tree.footnotes!.length).toBe(1)
    })

    it('C06: footnoteReference records identifier, sectionId, blockId', async () => {
      const md = 'text[^1]\n\n[^1]: fn text'
      const tree = transformMarkdown(await parseMarkdown(md))
      expect(tree.footnoteRefs).toBeDefined()
      expect(tree.footnoteRefs!.length).toBeGreaterThanOrEqual(1)
      const ref = tree.footnoteRefs![0]!
      expect(ref.identifier).toBe('1')
      expect(ref.sectionId).toBeTruthy()
      expect(typeof ref.sectionId).toBe('string')
      expect(ref.blockId).toBeTruthy()
      expect(typeof ref.blockId).toBe('string')
    })

    it('C06b: footnote ref inside footnote content (forward reference) → sectionId resolved', async () => {
      const md = 'body[^1]\n\n[^1]: fn with ref to [^2]\n\n[^2]: second fn'
      const tree = transformMarkdown(await parseMarkdown(md))
      expect(tree.footnotes).toHaveLength(2)
      expect(tree.footnoteRefs).toBeDefined()
      const refs = tree.footnoteRefs!.filter((r) => r.identifier === '2')
      expect(refs.length).toBeGreaterThanOrEqual(1)
      const ref = refs[0]!
      expect(ref.sectionId).toBeTruthy()
      expect(ref.sectionId).not.toBe('')
    })

    it('C08: no footnote → empty array', async () => {
      const tree = transformMarkdown(await parseMarkdown('just text'))
      expect(tree.footnotes).toEqual([])
    })

    it('C09: no footnoteReference → empty array', async () => {
      const md = '[^1]: foot\n\ntext'
      const tree = transformMarkdown(await parseMarkdown(md))
      expect(tree.footnoteRefs).toEqual([])
    })
  })
})
