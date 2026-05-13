import type { Node } from 'unist'

export interface Block {
  id: string
  type: string
  [key: string]: unknown
  children?: InlineContent[]
  value?: string
  originalType?: string
  raw?: unknown
}

export type InlineContent = Block

export interface FootnoteRef {
  identifier: string
  sectionId: string
  blockId: string
}

export type SectionKind =
  | 'root'
  | 'heading'
  | 'frontmatter'
  | 'listItem'
  | 'blockquote'
  | 'footnote'

export interface Section {
  id: string
  kind: SectionKind
  position?: Node['position']
  depth: number
  treeDepth: number
  title: string
  titleKind: 'explicit' | 'derived' | 'synthetic'
  heading?: Block
  headingDepth?: number
  listDepth?: number
  quoteDepth?: number
  children: Section[]
  items: (Block | Section)[]
  definitions?: Block[]
  footnotes?: Section[]
  footnoteRefs?: FootnoteRef[]
  // listItem
  ordered?: boolean
  start?: number
  index?: number
  checked?: boolean | null
  spread?: boolean
  // frontmatter
  frontmatterType?: 'yaml' | 'toml'
  frontmatterValue?: string
}

export interface TransformContext {
  root: Section
  headingStack: Section[]
  footnotes: Section[]
  footnoteMap: Map<string, Section>
  definitions: Node[]
  definitionMap: Map<string, Node>
  footnoteRefs: FootnoteRef[]
  idCounter: number
}
