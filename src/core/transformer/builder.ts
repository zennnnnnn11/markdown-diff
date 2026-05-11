/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Root } from 'mdast'
import type { Node } from 'unist'
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
import { assignContentHashes, extractHeadingText } from './text'

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
      const fm = child as any
      const section = createFrontmatterSection(child.type as 'yaml' | 'toml', fm.value, 1)
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

  const result = finalize(ctx)
  assignContentHashes(result)
  return result
}

function processHeading(ctx: TransformContext, node: Node): void {
  const h = node as any
  const depth: number = h.depth
  const title = extractHeadingText(node)

  popToDepth(ctx, depth)

  const headingBlock = createBlock(node, ctx)
  const section = createHeadingSection(headingBlock, depth, currentTreeDepth(ctx) + 1, title)
  section.id = generateId(ctx)
  addToCurrent(ctx, section)
  pushHeading(ctx, section)
}

function processTopLevelList(ctx: TransformContext, list: Node): void {
  const l = list as any
  if (!l.children) return

  let idx = 0
  const depth = currentHeadingDepth(ctx)
  const treeDepth = currentTreeDepth(ctx) + 1
  for (const item of l.children as Node[]) {
    if (!isListItem(item)) continue

    const section = listItemToSection(
      ctx,
      item,
      { ordered: l.ordered, start: l.start, spread: l.spread },
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
