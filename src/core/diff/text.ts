import { isSection } from '../transformer'
import type { Block, InlineContent, Section } from '../transformer'
import type { InlineToken } from './types'
import { hashCanonical } from './hash'

export function normalizeIdentifier(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function normalizeHeadingTitle(value: string): string {
  return collapseWhitespace(stripHeadingPrefix(value.normalize('NFKC').trim().toLowerCase()))
}

export function slugifyHeading(value: string): string {
  return normalizeHeadingTitle(value)
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .trim()
    .replace(/[\s_-]+/g, '-')
}

export function tokenizeText(value: string): string[] {
  const normalized = collapseWhitespace(value)
  if (!normalized) return []

  const tokens = segmentWords(normalized)
  if (tokens.length > 0) return tokens

  const fallback = normalized
    .toLowerCase()
    .split(/[^0-9\p{L}]+/u)
    .filter(Boolean)
  return fallback.length > 0 ? fallback : cjkFallbackTokens(normalized)
}

export function structuredTextTokens(node: Section | Block | InlineContent | undefined): string[] {
  if (!node) return []
  if (isSection(node)) {
    const titleTokens = node.kind === 'heading' ? tokenizeText(node.title) : []
    const headingTokens = node.heading ? structuredTextTokens(node.heading) : []
    const itemTokens = node.items.flatMap((item) => structuredTextTokens(item))
    return [...titleTokens, ...headingTokens, ...itemTokens]
  }

  const tokens: string[] = []
  if (node.url) tokens.push(`url:${String(node.url).toLowerCase()}`)
  if (node.title) tokens.push(`title:${String(node.title).toLowerCase()}`)
  if (node.alt) tokens.push(`alt:${String(node.alt).toLowerCase()}`)
  if (node.identifier) tokens.push(`id:${normalizeIdentifier(node.identifier)}`)
  if (node.type) tokens.push(`type:${node.type}`)
  if (Array.isArray(node.children)) {
    tokens.push(...node.children.flatMap((child) => structuredTextTokens(child)))
  }
  return tokens
}

export function extractNodeText(node: Section | Block | InlineContent | undefined): string {
  if (!node) return ''
  if (isSection(node)) {
    if (node.kind === 'heading') {
      return collapseWhitespace([node.title, ...node.items.map((item) => extractNodeText(item))].join(' '))
    }
    if (node.kind === 'frontmatter') return node.frontmatterValue ?? ''
    return collapseWhitespace(node.items.map((item) => extractNodeText(item)).join(' '))
  }

  if (node.type === 'text') return String(node.value ?? '')
  if (node.type === 'inlineCode' || node.type === 'code' || node.type === 'math' || node.type === 'inlineMath') {
    return String(node.value ?? '')
  }
  if (node.type === 'image') return collapseWhitespace([node.alt, node.url].filter(Boolean).join(' '))
  if (node.type === 'definition') {
    return collapseWhitespace([node.identifier, node.url, node.title].filter(Boolean).join(' '))
  }
  if (Array.isArray(node.children)) {
    return collapseWhitespace(node.children.map((child) => extractNodeText(child)).join(' '))
  }
  return String(node.value ?? '')
}

export async function buildInlineTokens(nodes: InlineContent[]): Promise<InlineToken[]> {
  return Promise.all(nodes.map((node) => buildInlineToken(node)))
}

export async function buildInlineToken(node: InlineContent): Promise<InlineToken> {
  const children = Array.isArray(node.children) ? await buildInlineTokens(node.children) : undefined
  const tokenData = {
    type: node.type,
    value: node.value,
    url: node.url,
    alt: node.alt,
    title: node.title,
    normalizedIdentifier:
      node.identifier !== undefined ? normalizeIdentifier(node.identifier) : undefined,
    children: children?.map((child) => ({ ...child, source: undefined })),
  }

  return {
    type: node.type,
    rawText: extractNodeText(node),
    normalizedIdentifier: tokenData.normalizedIdentifier,
    url: tokenData.url,
    alt: tokenData.alt,
    title: tokenData.title,
    children,
    source: node,
    hash: await hashCanonical(tokenData),
  }
}

export function extractInlineStructure(node: Block | InlineContent | undefined): string[] {
  if (!node) return []
  const own = [node.type]
  const children = Array.isArray(node.children)
    ? node.children.flatMap((child) => extractInlineStructure(child))
    : []
  return [...own, ...children]
}

export function readTableData(block: Block | undefined): { cells: string[][]; structured: InlineContent[][][] } {
  if (!block || !Array.isArray(block.children)) return { cells: [], structured: [] }
  const cells: string[][] = []
  const structured: InlineContent[][][] = []
  for (const row of block.children) {
    if (!Array.isArray(row.children)) {
      cells.push([])
      structured.push([])
      continue
    }
    cells.push(row.children.map((cell) => extractNodeText(cell)))
    structured.push(
      row.children.map((cell) =>
        Array.isArray(cell.children) ? (cell.children as InlineContent[]) : [],
      ),
    )
  }
  return { cells, structured }
}

export function maxColumns(rows: string[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0)
}

export function pathHashInput(parts: string[]): string {
  return parts.map((part) => normalizeHeadingTitle(part)).join(' / ')
}

function stripHeadingPrefix(value: string): string {
  const match = value.match(/^([ivxlcdm]+|\d+(?:\.\d+)*|\d{1,4})[.)、：:-]\s+/iu)
  if (!match) return value

  const prefix = match[1] ?? ''
  if (/^\d{4}$/u.test(prefix)) {
    const year = Number(prefix)
    if (year >= 1900 && year <= 2100) return value
  }
  return value.slice(match[0].length)
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function segmentWords(value: string): string[] {
  const intlWithSegmenter = Intl as typeof Intl & {
    Segmenter?: new (
      locales?: Intl.LocalesArgument,
      options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
    ) => {
      segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }>
    }
  }

  if (typeof intlWithSegmenter.Segmenter !== 'function') return []

  const segmenter = new intlWithSegmenter.Segmenter(undefined, { granularity: 'word' })
  const segments = Array.from(segmenter.segment(value))
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment.toLowerCase())
    .filter(Boolean)

  if (segments.length > 0) return segments
  return cjkFallbackTokens(value)
}

function cjkFallbackTokens(value: string): string[] {
  const cleaned = value.replace(/\s+/g, '')
  if (!cleaned) return []

  const chars = [...cleaned]
  const looksCjk = chars.some((char) => /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(char))
  if (!looksCjk) return []
  if (chars.length === 1) return chars.map((char) => char.toLowerCase())

  const tokens: string[] = []
  for (let index = 0; index < chars.length - 1; index++) {
    tokens.push(`${chars[index]}${chars[index + 1]}`.toLowerCase())
  }
  return tokens
}
