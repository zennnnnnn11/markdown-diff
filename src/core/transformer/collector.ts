import type { Node } from 'unist'
import type { Block, Section, TransformContext } from './types'
import { isDefinition } from './guards'

export function collectDefinition(ctx: TransformContext, node: Node): void {
  if (isDefinition(node)) {
    ctx.definitions.push(node)
    ctx.definitionMap.set(node.identifier, node)
  }
}

export function collectFootnoteDefinition(
  ctx: TransformContext,
  identifier: string | undefined,
  section: Section,
): void {
  ctx.footnotes.push(section)
  if (identifier) {
    ctx.footnoteMap.set(identifier, section)
  }
}

export function collectFootnoteRefsFromBlock(ctx: TransformContext, block: Block): void {
  scanForRefs(ctx, block, block.id)
}

function scanForRefs(ctx: TransformContext, block: Block, parentBlockId: string): void {
  if (block.type === 'footnoteReference' && block.identifier) {
    ctx.footnoteRefs.push({
      identifier: block.identifier,
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
