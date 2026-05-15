import type { Blockquote, Heading, ListItem } from 'mdast'
import type { Node } from 'unist'
import type { Block } from './types'

export function extractText(node: Node | Block): string {
  if (node.type === 'text' && 'value' in node) return String(node.value ?? '')
  if ('children' in node && Array.isArray(node.children)) {
    return (node.children as (Node | Block)[]).map(extractText).join('')
  }
  if ('value' in node) return String(node.value ?? '')
  return ''
}

export function extractHeadingText(heading: Heading | Node): string {
  if ('children' in heading && Array.isArray(heading.children)) {
    return (heading.children as (Node | Block)[]).map(extractText).join('')
  }
  return ''
}

export function extractListItemFirstText(item: ListItem | Node | Block): string {
  if (!('children' in item) || !Array.isArray(item.children)) {
    const checked = 'checked' in item ? item.checked : undefined
    if (checked !== null && checked !== undefined) {
      return checked ? '[x]' : '[ ]'
    }
    return ''
  }
  const firstPara = (item.children as Node[]).find((c) => c.type === 'paragraph')
  if (firstPara) return extractText(firstPara)
  const checked = 'checked' in item ? item.checked : undefined
  if (checked !== null && checked !== undefined) {
    return checked ? '[x]' : '[ ]'
  }
  return ''
}

export function extractBlockquoteExcerpt(blockquote: Blockquote | Node, maxLen = 140): string {
  if (!('children' in blockquote) || !Array.isArray(blockquote.children)) return ''
  const children = blockquote.children as Node[]
  const firstPara = children.find((c) => c.type === 'paragraph')
  const text = firstPara ? extractText(firstPara) : children.map(extractText).join(' ')
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

export function extractAttribution(blockquote: Blockquote | Node): string {
  const text = extractBlockquoteExcerpt(blockquote, 200)
  const match = text.match(/^(.+?)[：:]/)
  return match ? match[1]! : ''
}
