import type { Block, Section } from './types'
import { extractListItemFirstText } from './text'

export function createRootSection(): Section {
  return {
    id: '',
    kind: 'root',
    depth: 0,
    treeDepth: 0,
    title: '',
    titleKind: 'synthetic',
    children: [],
    items: [],
  }
}

export function createHeadingSection(
  heading: Block,
  depth: number,
  treeDepth: number,
  title: string,
): Section {
  return {
    id: '',
    kind: 'heading',
    depth,
    treeDepth,
    title,
    titleKind: 'explicit',
    heading,
    headingDepth: depth,
    children: [],
    items: [],
  }
}

export function createFrontmatterSection(
  type: 'yaml' | 'toml',
  value: string,
  treeDepth: number,
  position?: Section['position'],
): Section {
  return {
    id: '',
    kind: 'frontmatter',
    position,
    depth: 0,
    treeDepth,
    title: '',
    titleKind: 'synthetic',
    children: [],
    items: [],
    frontmatterType: type,
    frontmatterValue: value,
  }
}

export function createListItemSection(
  item: Block,
  listMeta: {
    ordered?: boolean | null
    start?: number | null
    spread?: boolean | null
  },
  index: number,
  depth: number,
  treeDepth: number,
  listDepth: number,
): Section {
  const title = extractListItemFirstText(item)
  return {
    id: '',
    kind: 'listItem',
    depth,
    treeDepth,
    title,
    titleKind: 'derived',
    heading: item,
    listDepth,
    children: [],
    items: [],
    ordered: listMeta.ordered ?? false,
    start: listMeta.start ?? undefined,
    spread: listMeta.spread ?? undefined,
    index,
    checked: (item.checked as boolean | null) ?? null,
  }
}

export function createBlockquoteSection(
  depth: number,
  treeDepth: number,
  quoteDepth: number,
  title: string,
): Section {
  return {
    id: '',
    kind: 'blockquote',
    depth,
    treeDepth,
    title,
    titleKind: 'derived',
    quoteDepth,
    children: [],
    items: [],
  }
}

export function createFootnoteSection(definition: Block, depth = 0, treeDepth = 1): Section {
  return {
    id: '',
    kind: 'footnote',
    depth,
    treeDepth,
    title: '',
    titleKind: 'explicit',
    heading: definition,
    children: [],
    items: [],
  }
}
