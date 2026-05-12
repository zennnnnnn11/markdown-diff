/* eslint-disable @typescript-eslint/no-explicit-any */
import { xxhash128 } from 'hash-wasm'
import type { Block, InlineContent, Section } from '../transformer'
import type { InlineToken, MetadataChange, SourcePoint, SourceRange } from './types'

const HASH_SEED_LOW = 0
const HASH_SEED_HIGH = 0
const textEncoder = new TextEncoder()

export async function hashCanonical(value: unknown): Promise<string> {
  return xxhash128(textEncoder.encode(stableStringify(value)), HASH_SEED_LOW, HASH_SEED_HIGH)
}

export async function hashText(value: string): Promise<string> {
  return xxhash128(textEncoder.encode(value), HASH_SEED_LOW, HASH_SEED_HIGH)
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortCanonical(value))
}

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
  if ((node as any).url) tokens.push(`url:${String((node as any).url).toLowerCase()}`)
  if ((node as any).title) tokens.push(`title:${String((node as any).title).toLowerCase()}`)
  if ((node as any).alt) tokens.push(`alt:${String((node as any).alt).toLowerCase()}`)
  if ((node as any).identifier) tokens.push(`id:${normalizeIdentifier((node as any).identifier)}`)
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
  if (node.type === 'image') return collapseWhitespace([node.alt, (node as any).url].filter(Boolean).join(' '))
  if (node.type === 'definition') {
    return collapseWhitespace([node.identifier, (node as any).url, (node as any).title].filter(Boolean).join(' '))
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
    url: (node as any).url,
    alt: (node as any).alt,
    title: (node as any).title,
    normalizedIdentifier:
      (node as any).identifier !== undefined ? normalizeIdentifier((node as any).identifier) : undefined,
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

export async function charikarSimHash(tokens: readonly string[]): Promise<string | undefined> {
  if (tokens.length === 0) return undefined
  const hashed = await Promise.all(tokens.map((token) => hashText(token)))
  const weights = Array.from<number>({ length: 64 }).fill(0)
  for (const hex of hashed) {
    const value = BigInt(`0x${hex.slice(0, 16)}`)
    for (let bit = 0; bit < 64; bit++) {
      const mask = 1n << BigInt(bit)
      weights[bit] = (weights[bit] ?? 0) + ((value & mask) === 0n ? -1 : 1)
    }
  }

  let result = 0n
  for (let bit = 0; bit < 64; bit++) {
    if ((weights[bit] ?? 0) >= 0) result |= 1n << BigInt(bit)
  }
  return result.toString(16).padStart(16, '0')
}

export function simHashHammingDistance(left?: string, right?: string): number | undefined {
  if (!left || !right) return undefined
  const xor = BigInt(`0x${left}`) ^ BigInt(`0x${right}`)
  let value = xor
  let distance = 0
  while (value !== 0n) {
    distance += Number(value & 1n)
    value >>= 1n
  }
  return distance
}

export function jaccardSimilarity(left: readonly string[], right: readonly string[]): number {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  if (leftSet.size === 0 && rightSet.size === 0) return 1

  let intersection = 0
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection++
  }

  const union = new Set([...leftSet, ...rightSet]).size
  return union === 0 ? 1 : intersection / union
}

export function multisetJaccardSimilarity(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 && right.length === 0) return 1

  const leftCounts = countTokens(left)
  const rightCounts = countTokens(right)
  const keys = new Set([...leftCounts.keys(), ...rightCounts.keys()])
  let intersection = 0
  let union = 0

  for (const key of keys) {
    const leftCount = leftCounts.get(key) ?? 0
    const rightCount = rightCounts.get(key) ?? 0
    intersection += Math.min(leftCount, rightCount)
    union += Math.max(leftCount, rightCount)
  }

  return union === 0 ? 1 : intersection / union
}

export function sequenceSimilarity(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 && right.length === 0) return 1
  const distance = levenshtein(left, right)
  return 1 - distance / Math.max(left.length, right.length, 1)
}

export function makePairKey(pairKind: 'match' | 'align', oldId: string, newId: string): string {
  return `${pairKind}:${oldId}:${newId}`
}

export function makeMoveId(oldId: string, newId: string): string {
  return `move:${oldId}:${newId}`
}

export function sourceRangeFromPosition(position: any): SourceRange | undefined {
  if (!position) return undefined
  return {
    start: toSourcePoint(position.start),
    end: toSourcePoint(position.end),
  }
}

export function mergeSourceRanges(ranges: Array<SourceRange | undefined>): SourceRange | undefined {
  const filtered = ranges.filter((range): range is SourceRange => !!range)
  if (filtered.length === 0) return undefined

  const starts = filtered.map((range) => range.start).filter((point): point is SourcePoint => !!point)
  const ends = filtered.map((range) => range.end).filter((point): point is SourcePoint => !!point)

  return {
    start: starts.sort(compareSourcePoint)[0],
    end: ends.sort(compareSourcePoint)[ends.length - 1],
  }
}

export function pathHashInput(parts: string[]): string {
  return parts.map((part) => normalizeHeadingTitle(part)).join(' / ')
}

export function metadataDiff(oldValue: unknown, newValue: unknown, basePath = ''): MetadataChange[] {
  if (deepEqual(oldValue, newValue)) return []

  if (!isRecordLike(oldValue) || !isRecordLike(newValue)) {
    return [
      {
        path: basePath || '$',
        oldValue,
        newValue,
        op: oldValue === undefined ? 'insert' : newValue === undefined ? 'delete' : 'replace',
      },
    ]
  }

  const result: MetadataChange[] = []
  const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)])
  for (const key of [...keys].sort()) {
    const nextPath = basePath ? `${basePath}.${key}` : key
    const oldChild = oldValue[key]
    const newChild = newValue[key]
    if (oldChild === undefined) {
      result.push({ path: nextPath, newValue: newChild, op: 'insert' })
      continue
    }
    if (newChild === undefined) {
      result.push({ path: nextPath, oldValue: oldChild, op: 'delete' })
      continue
    }
    result.push(...metadataDiff(oldChild, newChild, nextPath))
  }
  return result
}

export function isSection(value: Section | Block | InlineContent): value is Section {
  return 'kind' in value
}

function sortCanonical(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((item) => sortCanonical(item))
  if (typeof value === 'number') return Number(value)
  if (typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    const entry = sortCanonical(record[key])
    if (entry !== undefined) result[key] = entry
  }
  return result
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

function levenshtein(left: readonly string[], right: readonly string[]): number {
  const rows = left.length + 1
  const cols = right.length + 1
  const matrix = Array.from({ length: rows }, () => Array.from<number>({ length: cols }).fill(0))

  for (let row = 0; row < rows; row++) matrix[row]![0] = row
  for (let col = 0; col < cols; col++) matrix[0]![col] = col

  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1
      const deletion = matrix[row - 1]?.[col] ?? Number.POSITIVE_INFINITY
      const insertion = matrix[row]?.[col - 1] ?? Number.POSITIVE_INFINITY
      const substitution = matrix[row - 1]?.[col - 1] ?? Number.POSITIVE_INFINITY
      matrix[row]![col] = Math.min(deletion + 1, insertion + 1, substitution + cost)
    }
  }

  return matrix[rows - 1]?.[cols - 1] ?? 0
}

function deepEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right)
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toSourcePoint(point: any): SourcePoint | undefined {
  if (!point) return undefined
  return {
    offset: typeof point.offset === 'number' ? point.offset : undefined,
    line: typeof point.line === 'number' ? point.line : undefined,
    column: typeof point.column === 'number' ? point.column : undefined,
  }
}

function compareSourcePoint(left: SourcePoint, right: SourcePoint): number {
  const leftOffset = left.offset ?? Number.POSITIVE_INFINITY
  const rightOffset = right.offset ?? Number.POSITIVE_INFINITY
  if (leftOffset !== rightOffset) return leftOffset - rightOffset

  const leftLine = left.line ?? Number.POSITIVE_INFINITY
  const rightLine = right.line ?? Number.POSITIVE_INFINITY
  if (leftLine !== rightLine) return leftLine - rightLine

  return (left.column ?? Number.POSITIVE_INFINITY) - (right.column ?? Number.POSITIVE_INFINITY)
}

function countTokens(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return counts
}
