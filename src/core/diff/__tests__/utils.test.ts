import { afterEach, describe, expect, it } from 'vitest'
import {
  buildInlineToken,
  buildInlineTokens,
  charikarSimHash,
  extractInlineStructure,
  extractNodeText,
  jaccardSimilarity,
  makeMoveId,
  makePairKey,
  mergeSourceRanges,
  metadataDiff,
  multisetJaccardSimilarity,
  normalizeHeadingTitle,
  pathHashInput,
  sequenceSimilarity,
  slugifyHeading,
  sourceRangeFromPosition,
  stableStringify,
  structuredTextTokens,
  tokenizeText,
} from '../utils'

const originalSegmenter = (Intl as typeof Intl & { Segmenter?: unknown }).Segmenter

afterEach(() => {
  Object.defineProperty(Intl, 'Segmenter', {
    configurable: true,
    writable: true,
    value: originalSegmenter,
  })
})

describe('diff utilities', () => {
  it('stableStringify sorts object keys, strips undefined fields, and preserves array order', () => {
    const value = {
      b: 2,
      a: 1,
      nested: {
        z: undefined,
        y: null,
        x: 'x',
      },
      array: [{ b: 2, a: 1 }, 3, 2, 1],
    }

    expect(stableStringify(value)).toBe('{"a":1,"array":[{"a":1,"b":2},3,2,1],"b":2,"nested":{"x":"x","y":null}}')
  })

  it('normalizes headings and slugifies titles without stripping year prefixes', () => {
    expect(normalizeHeadingTitle('1. Getting Started')).toBe('getting started')
    expect(normalizeHeadingTitle('2024: Roadmap')).toBe('2024: roadmap')
    expect(slugifyHeading('Hello, 世界!')).toBe('hello-世界')
  })

  it('tokenizes latin text through Segmenter and falls back to regex tokenization when Segmenter is unavailable', () => {
    expect(tokenizeText('Hello, world 2024')).toEqual(['hello', 'world', '2024'])

    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    expect(tokenizeText('Alpha-beta 2024')).toEqual(['alpha', 'beta', '2024'])
  })

  it('returns no tokens for punctuation-only text when both segmenters and regex fallback find nothing', () => {
    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    expect(tokenizeText('... --- !!!')).toEqual([])
  })

  it('preserves contiguous CJK runs as a fallback token when Segmenter is unavailable', () => {
    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    expect(tokenizeText('中文测试')).toEqual(['中文测试'])
  })

  it('extracts structured tokens and plain text from mixed inline and section nodes', () => {
    const section = {
      kind: 'heading',
      title: 'Docs Overview',
      heading: undefined,
      items: [
        {
          type: 'paragraph',
          children: [
            { type: 'link', url: 'https://example.com', children: [{ type: 'text', value: 'Docs' }] },
            { type: 'text', value: ' image ' },
            { type: 'image', alt: 'Logo', url: 'https://example.com/logo.png' },
          ],
        },
      ],
      children: [],
    } as any
    const definition = {
      type: 'definition',
      identifier: 'Repo',
      url: 'https://example.com/repo',
      title: 'Repository',
    } as any

    expect(structuredTextTokens(section)).toEqual(
      expect.arrayContaining([
        'docs',
        'overview',
        'type:paragraph',
        'type:link',
        'url:https://example.com',
        'type:image',
        'alt:logo',
      ]),
    )
    expect(extractNodeText(section)).toContain('Docs Overview')
    expect(extractNodeText(definition)).toBe('Repo https://example.com/repo Repository')
  })

  it('extracts frontmatter, image, math, and non-heading section text consistently', () => {
    const frontmatter = {
      kind: 'frontmatter',
      frontmatterValue: 'title: Test',
      items: [],
      children: [],
    } as any
    const blockquote = {
      kind: 'blockquote',
      items: [
        { type: 'paragraph', children: [{ type: 'text', value: 'Quoted' }] },
        { type: 'math', value: 'x^2' },
      ],
      children: [],
    } as any
    const image = { type: 'image', alt: 'Diagram', url: 'https://example.com/diagram.png' } as any

    expect(extractNodeText(frontmatter)).toBe('title: Test')
    expect(extractNodeText(blockquote)).toBe('Quoted x^2')
    expect(extractNodeText(image)).toBe('Diagram https://example.com/diagram.png')
  })

  it('builds normalized inline token hashes and nested inline structures', async () => {
    const left = await buildInlineToken({
      type: 'linkReference',
      identifier: '  Docs Ref  ',
      children: [{ type: 'text', value: 'Docs' }],
    } as any)
    const right = await buildInlineToken({
      type: 'linkReference',
      identifier: 'docs ref',
      children: [{ type: 'text', value: 'Docs' }],
    } as any)
    const nestedTokens = await buildInlineTokens([
      {
        type: 'strong',
        children: [
          { type: 'text', value: 'Bold' },
          { type: 'inlineCode', value: 'code' },
        ],
      } as any,
    ])

    expect(left.hash).toBe(right.hash)
    expect(extractInlineStructure(nestedTokens[0]?.source as any)).toEqual(['strong', 'text', 'inlineCode'])
  })

    it('computes simhashes and similarity helpers consistently', async () => {
      const first = await charikarSimHash(['alpha', 'beta', 'gamma'])
      const second = await charikarSimHash(['alpha', 'beta', 'gamma'])
      const third = await charikarSimHash(['delta', 'epsilon'])

    expect(first).toBe(second)
    expect(first).toBeDefined()
    expect(third).toBeDefined()
    expect(await charikarSimHash([])).toBeUndefined()
    expect(jaccardSimilarity(['a', 'a', 'b'], ['a', 'c'])).toBe(1 / 3)
      expect(multisetJaccardSimilarity(['a', 'a', 'b'], ['a', 'c'])).toBe(1 / 4)
      expect(sequenceSimilarity(['a', 'b', 'c'], ['a', 'x', 'c'])).toBeCloseTo(2 / 3)
    })

    it('preserves the legacy simhash outputs for representative token sets', async () => {
      expect(await charikarSimHash(['hello', 'world'])).toBe('ffedf9adb79bbeff')
      expect(
        await charikarSimHash([
          'token',
          'set',
          '1',
          'alpha',
          'beta',
          'gamma',
          'delta',
          'epsilon',
          'zeta',
          'eta',
          'theta',
          'iota',
          'kappa',
          'lambda',
          'mu',
        ]),
      ).toBe('1d2475a58e7db019')
      expect(await charikarSimHash(['你好', '世界', 'foo', 'bar', 'baz', 'qux'])).toBe('fdabfbfe94012d21')
    })

  it('creates pair and move keys and hashes path parts deterministically', () => {
    expect(makePairKey('match', 'old-1', 'new-2')).toBe('match:old-1:new-2')
    expect(makeMoveId('old-1', 'new-2')).toBe('move:old-1:new-2')
    expect(pathHashInput([' 1. Intro ', 'Overview'])).toBe('intro / overview')
  })

  it('builds source ranges from positions and merges them by earliest start and latest end', () => {
    const first = sourceRangeFromPosition({
      start: { offset: 20, line: 3, column: 1 },
      end: { offset: 30, line: 4, column: 2 },
    })
    const second = sourceRangeFromPosition({
      start: { offset: 5, line: 1, column: 1 },
      end: { offset: 50, line: 7, column: 3 },
    })

    expect(first).toEqual({
      start: { offset: 20, line: 3, column: 1 },
      end: { offset: 30, line: 4, column: 2 },
    })
    expect(mergeSourceRanges([first, undefined, second])).toEqual({
      start: { offset: 5, line: 1, column: 1 },
      end: { offset: 50, line: 7, column: 3 },
    })
  })

  it('merges source ranges even when some ranges are missing start or end points', () => {
    expect(
      mergeSourceRanges([
        { start: { line: 3, column: 2 }, end: undefined },
        { start: undefined, end: { line: 9, column: 4 } },
      ]),
    ).toEqual({
      start: { line: 3, column: 2 },
      end: { line: 9, column: 4 },
    })
  })

  it('computes nested metadata diffs and root scalar replacements', () => {
    expect(
      metadataDiff(
        { title: 'Old', meta: { owner: 'alice', flags: { preview: true } } },
        { title: 'New', meta: { flags: { preview: false }, tags: ['diff'] } },
        '$',
      ),
    ).toEqual([
      { path: '$.meta.flags.preview', oldValue: true, newValue: false, op: 'replace' },
      { path: '$.meta.owner', oldValue: 'alice', op: 'delete' },
      { path: '$.meta.tags', newValue: ['diff'], op: 'insert' },
      { path: '$.title', oldValue: 'Old', newValue: 'New', op: 'replace' },
    ])
    expect(metadataDiff('old raw', 'new raw', '$')).toEqual([
      { path: '$', oldValue: 'old raw', newValue: 'new raw', op: 'replace' },
    ])
  })

  it('treats array and object shape changes as stable metadata replacements', () => {
    expect(metadataDiff({ tags: ['a', 'b'] }, { tags: ['a', 'c'] }, '$')).toEqual([
      { path: '$.tags', oldValue: ['a', 'b'], newValue: ['a', 'c'], op: 'replace' },
    ])
    expect(metadataDiff({ tags: ['a'] }, 'disabled', '$')).toEqual([
      { path: '$', oldValue: { tags: ['a'] }, newValue: 'disabled', op: 'replace' },
    ])
  })
})
