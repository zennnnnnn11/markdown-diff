import { describe, expect, it } from 'vitest'
import {
  normalizeIdentifier,
  normalizeHeadingTitle,
  slugifyHeading,
  tokenizeText,
  structuredTextTokens,
  extractNodeText,
  buildInlineTokens,
  buildInlineToken,
  extractInlineStructure,
  readTableData,
  maxColumns,
  pathHashInput,
} from '../text'

describe('text module', () => {
  describe('normalizeIdentifier', () => {
    it('trims and lowercases', () => {
      expect(normalizeIdentifier('  Hello World  ')).toBe('hello world')
    })

    it('collapses whitespace', () => {
      expect(normalizeIdentifier('hello   world')).toBe('hello world')
    })

    it('handles undefined and null', () => {
      expect(normalizeIdentifier(undefined)).toBe('')
      expect(normalizeIdentifier(null)).toBe('')
    })
  })

  describe('normalizeHeadingTitle', () => {
    it('lowercases and trims', () => {
      expect(normalizeHeadingTitle('  Hello World  ')).toBe('hello world')
    })

    it('strips numbered prefixes', () => {
      expect(normalizeHeadingTitle('1. Introduction')).toBe('introduction')
      expect(normalizeHeadingTitle('IV. Methods')).toBe('methods')
    })

    it('preserves year-like prefixes', () => {
      expect(normalizeHeadingTitle('2024. A Great Year')).toBe('2024. a great year')
    })

    it('normalizes unicode (NFKC)', () => {
      expect(normalizeHeadingTitle('ＡＢＣ')).toBe('abc')
    })
  })

  describe('slugifyHeading', () => {
    it('produces kebab-case slugs', () => {
      expect(slugifyHeading('Hello World')).toBe('hello-world')
    })

    it('strips special characters', () => {
      expect(slugifyHeading('API (v2) Reference!')).toBe('api-v2-reference')
    })

    it('collapses multiple separators', () => {
      expect(slugifyHeading('a   ---   b')).toBe('a-b')
    })
  })

  describe('tokenizeText', () => {
    it('tokenizes English text into words', () => {
      const tokens = tokenizeText('hello world')
      expect(tokens).toContain('hello')
      expect(tokens).toContain('world')
    })

    it('returns empty array for empty string', () => {
      expect(tokenizeText('')).toHaveLength(0)
    })

    it('returns empty array for whitespace only', () => {
      expect(tokenizeText('   ')).toHaveLength(0)
    })

    it('handles mixed alphanumeric', () => {
      const tokens = tokenizeText('version 2.0 release')
      expect(tokens.length).toBeGreaterThan(0)
    })
  })

  describe('structuredTextTokens', () => {
    it('returns empty for undefined', () => {
      expect(structuredTextTokens(undefined)).toHaveLength(0)
    })

    it('extracts tokens from text nodes', () => {
      const node = { type: 'text', value: 'hello' } as any
      const tokens = structuredTextTokens(node)
      expect(tokens).toContain('type:text')
    })

    it('includes url/alt/title as tokens', () => {
      const node = { type: 'image', url: 'http://example.com', alt: 'My Image' } as any
      const tokens = structuredTextTokens(node)
      expect(tokens.some((t) => t.startsWith('url:'))).toBe(true)
      expect(tokens.some((t) => t.startsWith('alt:'))).toBe(true)
    })

    it('extracts tokens from sections', () => {
      const section = {
        kind: 'heading',
        depth: 1,
        title: 'Overview',
        heading: null,
        items: [],
        children: [],
        id: 'test',
      } as any
      const tokens = structuredTextTokens(section)
      expect(tokens.some((t) => t === 'overview')).toBe(true)
    })
  })

  describe('extractNodeText', () => {
    it('returns empty for undefined', () => {
      expect(extractNodeText(undefined)).toBe('')
    })

    it('extracts text from text nodes', () => {
      expect(extractNodeText({ type: 'text', value: 'hello' } as any)).toBe('hello')
    })

    it('extracts text from code nodes', () => {
      expect(extractNodeText({ type: 'code', value: 'const x = 1' } as any)).toBe('const x = 1')
    })

    it('extracts text from paragraphs with children', () => {
      const para = {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'hello ' },
          { type: 'strong', children: [{ type: 'text', value: 'world' }] },
        ],
      } as any
      expect(extractNodeText(para)).toBe('hello world')
    })

    it('extracts from sections', () => {
      const section = {
        kind: 'heading',
        depth: 1,
        title: 'Intro',
        items: [{ type: 'paragraph', children: [{ type: 'text', value: 'content' }] }],
        children: [],
        id: 's1',
      } as any
      const text = extractNodeText(section)
      expect(text).toContain('Intro')
      expect(text).toContain('content')
    })
  })

  describe('buildInlineToken / buildInlineTokens', () => {
    it('creates token with hash for text node', async () => {
      const token = await buildInlineToken({ type: 'text', value: 'hello' } as any)
      expect(token.type).toBe('text')
      expect(token.rawText).toBe('hello')
      expect(token.hash).toBeDefined()
    })

    it('creates tokens for array of nodes', async () => {
      const tokens = await buildInlineTokens([
        { type: 'text', value: 'hello' },
        { type: 'text', value: 'world' },
      ] as any[])
      expect(tokens).toHaveLength(2)
      expect(tokens.every((t) => t.hash)).toBe(true)
    })

    it('handles nodes with children', async () => {
      const token = await buildInlineToken({
        type: 'emphasis',
        children: [{ type: 'text', value: 'italic' }],
      } as any)
      expect(token.type).toBe('emphasis')
      expect(token.children).toHaveLength(1)
    })
  })

  describe('extractInlineStructure', () => {
    it('returns empty for undefined', () => {
      expect(extractInlineStructure(undefined)).toHaveLength(0)
    })

    it('returns type chain for nested inline', () => {
      const node = {
        type: 'emphasis',
        children: [{ type: 'text', value: 'word' }],
      } as any
      expect(extractInlineStructure(node)).toEqual(['emphasis', 'text'])
    })
  })

  describe('readTableData', () => {
    it('returns empty for undefined', () => {
      const { cells, structured } = readTableData(undefined)
      expect(cells).toHaveLength(0)
      expect(structured).toHaveLength(0)
    })

    it('extracts text cells from table block', () => {
      const block = {
        type: 'table',
        children: [
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'A' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'B' }] },
            ],
          },
        ],
      } as any
      const { cells } = readTableData(block)
      expect(cells).toHaveLength(1)
      expect(cells[0]).toEqual(['A', 'B'])
    })
  })

  describe('maxColumns', () => {
    it('returns max row length', () => {
      expect(maxColumns([['a', 'b'], ['c', 'd', 'e'], ['f']])).toBe(3)
    })

    it('returns 0 for empty rows', () => {
      expect(maxColumns([])).toBe(0)
    })
  })

  describe('pathHashInput', () => {
    it('joins normalized parts with separator', () => {
      expect(pathHashInput(['Root', 'Sub Section'])).toBe('root / sub section')
    })
  })

  describe('module independence', () => {
    it('text.ts does not import from utils.ts', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const source = fs.readFileSync(
        path.resolve(__dirname, '../text.ts'),
        'utf-8',
      )
      expect(source).not.toContain("from './utils'")
      expect(source).not.toContain("from '../utils'")
    })
  })
})
