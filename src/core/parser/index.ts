import type { Root } from 'mdast'
import { MarkdownParser } from './markdown-parser'

export async function parseMarkdown(content: string): Promise<Root> {
  const parser = new MarkdownParser()
  return parser.parse(content)
}
