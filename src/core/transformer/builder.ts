import type { Heading, List, Root } from 'mdast'
import type { Literal, Node } from 'unist'
import type { Section, TransformContext } from './types'
import {
  isHeading,
  isList,
  isListItem,
  isBlockquote,
  isDefinition,
  isFootnoteDefinition,
  isFrontmatter,
} from './guards'
import {
  createContext,
  generateId,
  popToDepth,
  pushHeading,
  addToCurrent,
  addToParent,
  finalize,
} from './context'
import { createBlock } from './block-factory'
import { createHeadingSection, createFrontmatterSection } from './section-factory'
import { collectDefinition, collectFootnoteRefsFromBlock } from './collector'
import { listItemToSection, blockquoteToSection, transformFootnoteDefinition } from './recursion'
import { extractHeadingText } from './text'

export function buildSections(root: Root): Section {
  const ctx = createContext()

  // first pass: collect definitions and footnote definitions
  for (const child of root.children as Node[]) {
    if (isDefinition(child)) {
      collectDefinition(ctx, child)
    } else if (isFootnoteDefinition(child)) {
      transformFootnoteDefinition(ctx, child)
    }
  }

  // second pass: build content tree
  for (const child of root.children as Node[]) {
    if (isDefinition(child) || isFootnoteDefinition(child)) {
      continue
    } else if (isFrontmatter(child)) {
      const fm = child as Literal
      const section = createFrontmatterSection(child.type as 'yaml' | 'toml', fm.value as string, 1, fm.position)
      section.id = generateId(ctx)
      addToParent(ctx.root, section)
    } else if (isHeading(child)) {
      processHeading(ctx, child)
    } else if (isList(child)) {
      processTopLevelList(ctx, child)
    } else if (isBlockquote(child)) {
      const section = blockquoteToSection(
        ctx,
        child,
        currentHeadingDepth(ctx),
        currentTreeDepth(ctx) + 1,
        1,
      )
      addToCurrent(ctx, section)
    } else {
      const block = createBlock(child, ctx)
      addToCurrent(ctx, block)
      collectFootnoteRefsFromBlock(ctx, block)
    }
  }

  return finalize(ctx)
}

function processHeading(ctx: TransformContext, node: Heading): void {
  const depth = node.depth
  const title = extractHeadingText(node)

  popToDepth(ctx, depth)

  const headingBlock = createBlock(node, ctx)
  const section = createHeadingSection(headingBlock, depth, currentTreeDepth(ctx) + 1, title)
  section.id = generateId(ctx)
  addToCurrent(ctx, section)
  pushHeading(ctx, section)
}

function processTopLevelList(ctx: TransformContext, list: List): void {
  if (!list.children) return

  let idx = 0
  const depth = currentHeadingDepth(ctx)
  const treeDepth = currentTreeDepth(ctx) + 1
  for (const item of list.children as Node[]) {
    if (!isListItem(item)) continue

    const section = listItemToSection(
      ctx,
      item,
      { ordered: list.ordered, start: list.start, spread: list.spread },
      idx,
      depth,
      treeDepth,
      1,
    )
    addToCurrent(ctx, section)
    idx++
  }
}

function currentHeadingDepth(ctx: TransformContext): number {
  return ctx.headingStack[ctx.headingStack.length - 1]!.depth
}

function currentTreeDepth(ctx: TransformContext): number {
  return ctx.headingStack[ctx.headingStack.length - 1]!.treeDepth
}
