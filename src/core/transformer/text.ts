/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Node } from 'unist'
import type { Block } from './types'

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
