import type { Blockquote, FootnoteDefinition, List, ListItem } from 'mdast'
import type { Node } from 'unist'
import type { TransformContext, Section } from './types'
import {
  isList,
  isListItem,
  isBlockquote,
  isHeading,
  isDefinition,
  isFootnoteDefinition,
} from './guards'
import { createBlock } from './block-factory'
import {
  createListItemSection,
  createBlockquoteSection,
  createFootnoteSection,
} from './section-factory'
import {
  collectDefinition,
  collectFootnoteDefinition,
  collectFootnoteRefsFromBlock,
} from './collector'
import { addToParent, generateId } from './context'
import { extractBlockquoteExcerpt } from './text'

export function listItemToSection(
  ctx: TransformContext,
  listItem: ListItem | Node,
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
  const block = createBlock(listItem, ctx)
  const section = createListItemSection(block, listMeta, index, depth, treeDepth, listDepth)
  section.id = generateId(ctx)

  if ('children' in listItem && Array.isArray(listItem.children)) {
    processContainerChildren(ctx, section, listItem.children as Node[])
  }

  return section
}

export function blockquoteToSection(
  ctx: TransformContext,
  blockquote: Blockquote | Node,
  depth: number,
  treeDepth: number,
  quoteDepth: number,
): Section {
  const title = extractBlockquoteExcerpt(blockquote, 50)
  const section = createBlockquoteSection(depth, treeDepth, quoteDepth, title)
  section.id = generateId(ctx)

  if ('children' in blockquote && Array.isArray(blockquote.children)) {
    processContainerChildren(ctx, section, blockquote.children as Node[])
  }

  return section
}

export function transformFootnoteDefinition(ctx: TransformContext, node: FootnoteDefinition | Node): void {
  const block = createBlock(node, ctx)
  const section = createFootnoteSection(block)
  section.id = generateId(ctx)

  if ('children' in node && Array.isArray(node.children)) {
    processContainerChildren(ctx, section, node.children as Node[])
  }

  const identifier = 'identifier' in node ? (node.identifier as string) : undefined
  collectFootnoteDefinition(ctx, identifier, section)
}

// ---- internal ----

function processContainerChildren(
  ctx: TransformContext,
  parent: Section,
  children: Node[],
): void {
  for (const child of children) {
    if (isList(child)) {
      processChildList(ctx, parent, child)
    } else if (isBlockquote(child)) {
      const cs = blockquoteToSection(
        ctx,
        child,
        parent.depth,
        parent.treeDepth + 1,
        nextQuoteDepth(parent),
      )
      addToParent(parent, cs)
    } else if (isDefinition(child)) {
      collectDefinition(ctx, child)
    } else if (isFootnoteDefinition(child)) {
      transformFootnoteDefinition(ctx, child)
    } else if (isHeading(child)) {
      const block = createBlock(child, ctx)
      parent.items.push(block)
      collectFootnoteRefsFromBlock(ctx, block)
    } else {
      const block = createBlock(child, ctx)
      parent.items.push(block)
      collectFootnoteRefsFromBlock(ctx, block)
    }
  }
}

function processChildList(
  ctx: TransformContext,
  parent: Section,
  list: List,
): void {
  if (!list.children) return

  let idx = 0
  for (const item of list.children as Node[]) {
    if (!isListItem(item)) continue

    const cs = listItemToSection(
      ctx,
      item,
      { ordered: list.ordered, start: list.start, spread: list.spread },
      idx,
      parent.depth,
      parent.treeDepth + 1,
      nextListDepth(parent),
    )
    addToParent(parent, cs)
    idx++
  }
}

function nextListDepth(parent: Section): number {
  return parent.kind === 'listItem' ? (parent.listDepth ?? 0) + 1 : 1
}

function nextQuoteDepth(parent: Section): number {
  return parent.kind === 'blockquote' ? (parent.quoteDepth ?? 0) + 1 : 1
}
