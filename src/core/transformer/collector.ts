/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Node } from 'unist'
import type { Block, Section, TransformContext } from './types'
import { isDefinition } from './guards'

export function collectDefinition(ctx: TransformContext, node: Node): void {
  if (isDefinition(node)) {
    ctx.definitions.push(node)
    const def = node as any
    ctx.definitionMap.set(def.identifier, node)
  }
}

export function collectFootnoteDefinition(
  ctx: TransformContext,
  identifier: string,
  section: Section,
): void {
  ctx.footnotes.push(section)
  ctx.footnoteMap.set(identifier, section)
}

export function collectFootnoteRefsFromBlock(
  ctx: TransformContext,
  block: Block,
): void {
  scanForRefs(ctx, block, block.id)
}

function scanForRefs(
  ctx: TransformContext,
  block: Block,
  parentBlockId: string,
): void {
  if (block.type === 'footnoteReference') {
    const identifier = block.identifier as string
    ctx.footnoteRefs.push({
      identifier,
      sectionId: '',
      blockId: parentBlockId,
    })
  }
  if (block.children) {
    for (const child of block.children) {
      scanForRefs(ctx, child, parentBlockId)
    }
  }
}
