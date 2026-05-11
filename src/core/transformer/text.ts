/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Node } from 'unist'
import type { Block, Section } from './types'

export function extractText(node: Node | Block): string {
  if (node.type === 'text') return (node as any).value ?? ''
  const parent = node as any
  if (parent.children) return parent.children.map(extractText).join('')
  if (node.type === 'inlineCode') return parent.value ?? ''
  return parent.value ?? ''
}

export function extractHeadingText(heading: Node): string {
  const h = heading as any
  if (h.children) return h.children.map(extractText).join('')
  return ''
}

export function extractListItemFirstText(item: Node | Block): string {
  const li = item as any
  if (!li.children) {
    if (li.checked !== null && li.checked !== undefined) {
      return li.checked ? '[x]' : '[ ]'
    }
    return ''
  }
  const firstPara = li.children.find((c: Node) => c.type === 'paragraph')
  if (firstPara) return extractText(firstPara)
  if (li.checked !== null && li.checked !== undefined) {
    return li.checked ? '[x]' : '[ ]'
  }
  return ''
}

export function extractBlockquoteExcerpt(blockquote: Node, maxLen = 140): string {
  const bq = blockquote as any
  if (!bq.children) return ''
  const firstPara = bq.children.find((c: Node) => c.type === 'paragraph')
  const text = firstPara ? extractText(firstPara) : bq.children.map(extractText).join(' ')
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

export function extractAttribution(blockquote: Node): string {
  const text = extractBlockquoteExcerpt(blockquote, 200)
  const match = text.match(/^(.+?)[：:]/)
  return match ? match[1]! : ''
}

// ---- contentHash ----

export function computeContentHash(section: Section): string {
  return hashString(JSON.stringify(serializeForHash(section)))
}

export function assignContentHashes(root: Section): void {
  for (const child of root.children) {
    assignContentHashes(child)
  }
  if (root.footnotes) {
    for (const fn of root.footnotes) {
      assignContentHashes(fn)
    }
  }
  root.contentHash = computeContentHash(root)
}

function serializeForHash(item: Block | Section): unknown {
  if ('kind' in item) {
    const s = item as Section
    const {
      id: _id,
      children: _c,
      contentHash: _h,
      depth: _d,
      treeDepth: _td,
      index: _i,
      definitions: _defs,
      footnotes: _fns,
      footnoteRefs: _refs,
      ...rest
    } = s
    return {
      ...rest,
      heading: rest.heading ? serializeForHash(rest.heading as Block) : undefined,
      items: s.items.map(serializeForHash),
    }
  }
  const { id: _id, depth: _d, position: _p, ...rest } = item as any
  return rest
}

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}
