/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Block, InlineContent, Section } from '../transformer'

const FNV_OFFSET_64 = 0xcbf29ce484222325n
const FNV_OFFSET_64_ALT = 0x84222325cbf29cen
const FNV_PRIME_64 = 0x100000001b3n
const MASK_64 = 0xffffffffffffffffn

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

export function stableHash128(value: unknown): string {
  const serialized = typeof value === 'string' ? value : stableStringify(value)
  const bytes = new TextEncoder().encode(serialized)
  return toHex(fnv1a64(bytes, FNV_OFFSET_64)) + toHex(fnv1a64(bytes, FNV_OFFSET_64_ALT))
}

export function normalizeIdentifier(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function normalizeHeadingTitle(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/^(?:chapter|section|part)\s+/u, '')
    .replace(/^((?:\d{1,2}|[ivxlcdm]+)[.)、：:-]\s+)/iu, '')
    .replace(/\s+/g, ' ')
}

export function slugifyHeading(value: string): string {
  return normalizeHeadingTitle(value)
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .trim()
    .replace(/[\s_-]+/g, '-')
}

export function tokenizeText(value: string): string[] {
  const text = value.trim()
  if (!text) return []

  const intlWithSegmenter = Intl as typeof Intl & {
    Segmenter?: new (
      locales?: Intl.LocalesArgument,
      options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
    ) => {
      segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }>
    }
  }

  if (typeof intlWithSegmenter.Segmenter === 'function') {
    const segmenter = new intlWithSegmenter.Segmenter(undefined, { granularity: 'word' })
    const tokens = Array.from(segmenter.segment(text))
      .filter((segment) => segment.isWordLike)
      .map((segment) => segment.segment.toLowerCase())
      .filter(Boolean)
    if (tokens.length > 0) return tokens
  }

  return text
    .toLowerCase()
    .split(/[^0-9\p{L}]+/u)
    .filter(Boolean)
}

export function extractNodeText(node: Section | Block | InlineContent | undefined): string {
  if (!node) return ''
  if (isSection(node)) {
    if (node.kind === 'heading') return [node.title, ...node.items.map(extractNodeText)].join(' ').trim()
    if (node.kind === 'frontmatter') return node.frontmatterValue ?? ''
    return node.items.map(extractNodeText).join(' ').trim()
  }

  if (node.type === 'text') return String(node.value ?? '')
  if (node.type === 'inlineCode' || node.type === 'code' || node.type === 'html' || node.type === 'math') {
    return String(node.value ?? '')
  }
  if (node.type === 'image') return [node.alt, node.url].filter(Boolean).join(' ')
  if (node.type === 'definition') return [node.identifier, node.url, node.title].filter(Boolean).join(' ')
  if (Array.isArray(node.children)) {
    return node.children.map((child) => extractNodeText(child)).join('')
  }
  return String(node.value ?? '')
}

export function extractInlineStructure(node: Block | InlineContent | undefined): string[] {
  if (!node) return []
  const self = [node.type]
  const children = Array.isArray(node.children)
    ? node.children.flatMap((child) => extractInlineStructure(child))
    : []
  return [...self, ...children]
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

export function charikarSimHash(tokens: readonly string[]): string | undefined {
  if (tokens.length === 0) return undefined

  const weights = Array.from<number>({ length: 64 }).fill(0)
  for (const token of tokens) {
    const hex = stableHash128(token)
    const slice = hex.slice(0, 16)
    const value = BigInt(`0x${slice}`)
    for (let bit = 0; bit < 64; bit++) {
      const mask = 1n << BigInt(bit)
      const current = weights[bit] ?? 0
      weights[bit] = current + ((value & mask) === 0n ? -1 : 1)
    }
  }

  let result = 0n
  for (let bit = 0; bit < 64; bit++) {
    if ((weights[bit] ?? 0) >= 0) result |= 1n << BigInt(bit)
  }
  return result.toString(16).padStart(16, '0')
}

export function serializeInline(node: InlineContent): unknown {
  const base: Record<string, unknown> = { type: node.type }
  if (node.value !== undefined) base.value = node.value
  if ((node as any).url !== undefined) base.url = (node as any).url
  if ((node as any).title !== undefined) base.title = (node as any).title
  if ((node as any).alt !== undefined) base.alt = (node as any).alt
  if ((node as any).identifier !== undefined) base.identifier = normalizeIdentifier((node as any).identifier)
  if (Array.isArray(node.children)) {
    base.children = node.children.map((child) => serializeInline(child))
  }
  return base
}

export function isSection(value: Section | Block | InlineContent): value is Section {
  return 'kind' in value
}

function sortValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((item) => sortValue(item))
  if (typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    result[key] = sortValue(record[key])
  }
  return result
}

function fnv1a64(bytes: Uint8Array, seed: bigint): bigint {
  let hash = seed
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = (hash * FNV_PRIME_64) & MASK_64
  }
  return hash
}

function toHex(value: bigint): string {
  return value.toString(16).padStart(16, '0')
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
      const rowValues = matrix[row]
      if (!rowValues) continue
      rowValues[col] = Math.min(deletion + 1, insertion + 1, substitution + cost)
    }
  }

  return matrix[rows - 1]?.[cols - 1] ?? 0
}
