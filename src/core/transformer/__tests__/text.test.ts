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
  })
})
