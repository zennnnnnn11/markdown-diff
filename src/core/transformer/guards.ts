import type { Node } from 'unist'

export function isHeading(node: Node): boolean {
  return node != null && node.type === 'heading'
}

export function isParagraph(node: Node): boolean {
  return node.type === 'paragraph'
}

export function isList(node: Node): boolean {
  return node.type === 'list'
}

export function isListItem(node: Node): boolean {
  return node.type === 'listItem'
}

export function isBlockquote(node: Node): boolean {
  return node.type === 'blockquote'
}

export function isTable(node: Node): boolean {
  return node.type === 'table'
}

export function isCode(node: Node): boolean {
  return node.type === 'code'
}

export function isHtml(node: Node): boolean {
  return node.type === 'html'
}

export function isYaml(node: Node): boolean {
  return node.type === 'yaml'
}

export function isToml(node: Node): boolean {
  return node.type === 'toml'
}

export function isDefinition(node: Node): boolean {
  return node.type === 'definition'
}

export function isFootnoteDefinition(node: Node): boolean {
  return node.type === 'footnoteDefinition'
}

export function isFootnoteReference(node: Node): boolean {
  return node.type === 'footnoteReference'
}

export function isMath(node: Node): boolean {
  return node.type === 'math'
}

export function isThematicBreak(node: Node): boolean {
  return node.type === 'thematicBreak'
}

export function isFrontmatter(node: Node): boolean {
  return isYaml(node) || isToml(node)
}
