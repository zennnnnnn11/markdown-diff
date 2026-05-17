/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import {
  extractText,
  extractHeadingText,
  extractListItemFirstText,
  extractBlockquoteExcerpt,
  extractAttribution,
} from '../text'

function node(type: string, extra?: Record<string, unknown>) {
  return { type, ...extra } as any
}
function text(value: string) {
  return node('text', { value })
}

describe('text extraction', () => {
  describe('extractHeadingText', () => {
    it('T01: extracts plain text from heading (single text)', () => {
      const h = node('heading', { depth: 1, children: [text('Hello World')] })
      expect(extractHeadingText(h)).toBe('Hello World')
    })
    it('T02: extracts text stripping inline format (bold/code)', () => {
      const h = node('heading', {
        depth: 1,
        children: [
          text('a '),
          node('strong', { children: [text('bold')] }),
          text(' and '),
          node('inlineCode', { value: 'code' }),
        ],
      })
      expect(extractHeadingText(h)).toBe('a bold and code')
    })
    it('T03: extracts text keeping link text', () => {
      const h = node('heading', {
        depth: 1,
        children: [text('see '), node('link', { url: 'http://x.com', children: [text('docs')] })],
      })
      expect(extractHeadingText(h)).toBe('see docs')
    })
    it('T03b: returns an empty string for an empty heading node', () => {
      const h = node('heading', { depth: 2, children: [] })
      expect(extractHeadingText(h)).toBe('')
    })
  })

  describe('extractText', () => {
    it('T04: extracts paragraph text', () => {
      const p = node('paragraph', { children: [text('some text')] })
      expect(extractText(p)).toBe('some text')
    })
    it('T04b: extracts inline code and raw value nodes', () => {
      expect(extractText(node('inlineCode', { value: 'const x = 1' }))).toBe('const x = 1')
      expect(extractText(node('html', { value: '<br />' }))).toBe('<br />')
    })
    it('T04c-img: returns alt text for image node', () => {
      expect(extractText(node('image', { url: 'pic.png', alt: 'sunset photo' }))).toBe('sunset photo')
    })
    it('T04c-img-null: returns empty string for image with null alt', () => {
      expect(extractText(node('image', { url: 'pic.png', alt: null }))).toBe('')
    })
    it('T04c-img-none: returns empty string for image with no alt property', () => {
      expect(extractText(node('image', { url: 'pic.png' }))).toBe('')
    })
    it('T04c-img-heading: heading with inline image preserves alt text', () => {
      const h = node('heading', {
        depth: 1,
        children: [text('Click '), node('image', { url: 'img.png', alt: 'icon' }), text(' here')],
      })
      expect(extractHeadingText(h)).toBe('Click icon here')
    })
    it('T04c-img-nested: paragraph with emphasis wrapping an image extracts alt', () => {
      const p = node('paragraph', {
        children: [
          text('see '),
          node('emphasis', { children: [node('image', { url: 'a.png', alt: 'diagram' })] }),
        ],
      })
      expect(extractText(p)).toBe('see diagram')
    })
    it('T04c: recursively extracts nested emphasis and link-reference text', () => {
      const p = node('paragraph', {
        children: [
          node('emphasis', {
            children: [
              text('nested '),
              node('linkReference', { identifier: 'docs', children: [text('docs')] }),
            ],
          }),
        ],
      })

      expect(extractText(p)).toBe('nested docs')
    })
    it('T04d-break: returns space for break node', () => {
      expect(extractText(node('break'))).toBe(' ')
    })
    it('T04d-break-heading: setext heading with break preserves word boundary', () => {
      const h = node('heading', {
        depth: 1,
        children: [text('Part 1'), node('break'), text('Part 2')],
      })
      expect(extractHeadingText(h)).toBe('Part 1 Part 2')
    })
    it('T04d-break-para: paragraph with break separates words', () => {
      const p = node('paragraph', {
        children: [text('line one'), node('break'), text('line two')],
      })
      expect(extractText(p)).toBe('line one line two')
    })
  })

  describe('extractListItemFirstText', () => {
    it('T05: extracts first paragraph as title', () => {
      const li = node('listItem', {
        children: [
          node('paragraph', { children: [text('first')] }),
          node('paragraph', { children: [text('second')] }),
        ],
      })
      expect(extractListItemFirstText(li)).toBe('first')
    })
    it('T06: returns checkbox text when no paragraph', () => {
      const li = node('listItem', { checked: true, children: [] })
      expect(extractListItemFirstText(li)).toBe('[x]')
    })
    it('T06b: returns unchecked checkbox text and can find a later paragraph', () => {
      const unchecked = node('listItem', { checked: false, children: [] })
      const laterParagraph = node('listItem', {
        children: [
          node('list', { children: [] }),
          node('paragraph', { children: [text('later')] }),
        ],
      })

      expect(extractListItemFirstText(unchecked)).toBe('[ ]')
      expect(extractListItemFirstText(laterParagraph)).toBe('later')
    })
    it('T07: returns empty string for no paragraph, no checkbox', () => {
      const li = node('listItem', { children: [] })
      expect(extractListItemFirstText(li)).toBe('')
    })
  })

  describe('extractBlockquoteExcerpt', () => {
    it('T08: truncates to 50 chars', () => {
      const longText = 'a'.repeat(60)
      const bq = node('blockquote', {
        children: [node('paragraph', { children: [text(longText)] })],
      })
      const result = extractBlockquoteExcerpt(bq, 50)
      expect(result).toHaveLength(51) // 50 chars + '…'
      expect(result.endsWith('…')).toBe(true)
    })
    it('T09: does not truncate short text', () => {
      const bq = node('blockquote', {
        children: [node('paragraph', { children: [text('short')] })],
      })
      expect(extractBlockquoteExcerpt(bq, 50)).toBe('short')
    })
    it('T10: returns empty string for empty blockquote', () => {
      const bq = node('blockquote', { children: [] })
      expect(extractBlockquoteExcerpt(bq)).toBe('')
    })
    it('T10b: falls back to concatenating non-paragraph children', () => {
      const bq = node('blockquote', {
        children: [
          node('list', {
            children: [
              node('listItem', { children: [node('paragraph', { children: [text('quoted item')] })] }),
            ],
          }),
        ],
      })
      expect(extractBlockquoteExcerpt(bq)).toContain('quoted item')
    })
    it('T10c: prefers the first paragraph even when headings appear before it', () => {
      const bq = node('blockquote', {
        children: [
          node('heading', { depth: 3, children: [text('Ignored heading')] }),
          node('paragraph', { children: [text('Chosen paragraph')] }),
          node('paragraph', { children: [text('Later paragraph')] }),
        ],
      })

      expect(extractBlockquoteExcerpt(bq)).toBe('Chosen paragraph')
    })
  })

  describe('extractAttribution', () => {
    it('T11: extracts person name from pattern', () => {
      const bq = node('blockquote', {
        children: [node('paragraph', { children: [text('孔子说：学而时习之')] })],
      })
      expect(extractAttribution(bq)).toBe('孔子说')
    })
    it('T12: supports english colons and returns empty string when no attribution exists', () => {
      const english = node('blockquote', {
        children: [node('paragraph', { children: [text('Ada Lovelace: Analytical Engine')] })],
      })
      const plain = node('blockquote', {
        children: [node('paragraph', { children: [text('No attribution here')] })],
      })

      expect(extractAttribution(english)).toBe('Ada Lovelace')
      expect(extractAttribution(plain)).toBe('')
    })
    it('T12b: supports full-width colons with surrounding spaces', () => {
      const quote = node('blockquote', {
        children: [node('paragraph', { children: [text('设计者 ： 保持语义稳定')] })],
      })

      expect(extractAttribution(quote)).toBe('设计者 ')
    })
  })
})
