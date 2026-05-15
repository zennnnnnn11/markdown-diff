import type { Node } from 'unist'
import type {
  Blockquote,
  Code,
  Definition,
  FootnoteDefinition,
  Heading,
  List,
  ListItem,
} from 'mdast'

export function isHeading(node: Node): node is Heading {
  return node != null && node.type === 'heading'
}

export function isParagraph(node: Node): boolean {
  return node.type === 'paragraph'
}

export function isList(node: Node): node is List {
  return node.type === 'list'
}

export function isListItem(node: Node): node is ListItem {
  return node.type === 'listItem'
}

export function isBlockquote(node: Node): node is Blockquote {
  return node.type === 'blockquote'
}

export function isTable(node: Node): boolean {
  return node.type === 'table'
}

export function isCode(node: Node): node is Code {
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

export function isDefinition(node: Node): node is Definition {
  return node.type === 'definition'
}

export function isFootnoteDefinition(node: Node): node is FootnoteDefinition {
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
