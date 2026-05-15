import type { Section, TransformContext } from './types'
import { createBlock } from './block-factory'
import { createRootSection } from './section-factory'

export function generateId(ctx: TransformContext): string {
  return `s${++ctx.idCounter}`
}

export function createContext(): TransformContext {
  const root = createRootSection()
  root.id = 'root'

  return {
    root,
    headingStack: [root],
    footnotes: [],
    footnoteMap: new Map(),
    definitions: [],
    definitionMap: new Map(),
    footnoteRefs: [],
    idCounter: 0,
  }
}

export function currentSection(ctx: TransformContext): Section {
  return ctx.headingStack[ctx.headingStack.length - 1]!
}

export function popToDepth(ctx: TransformContext, depth: number): void {
  while (
    ctx.headingStack.length > 1 &&
    ctx.headingStack[ctx.headingStack.length - 1]!.depth >= depth
  ) {
    ctx.headingStack.pop()
  }
}

export function pushHeading(ctx: TransformContext, section: Section): void {
  ctx.headingStack.push(section)
}

export function addToCurrent(
  ctx: TransformContext,
  blockOrSection: Section['items'][number],
): void {
  addToParent(currentSection(ctx), blockOrSection)
}

export function addToParent(parent: Section, blockOrSection: Section['items'][number]): void {
  parent.items.push(blockOrSection)
  if (isSection(blockOrSection)) {
    parent.children.push(blockOrSection)
  }
}

export function isSection(item: Section['items'][number]): item is Section {
  return 'kind' in item && 'depth' in item
}

export function finalize(ctx: TransformContext): Section {
  ctx.root.definitions = ctx.definitions.map((d) => createBlock(d, ctx))
  ctx.root.footnotes = ctx.footnotes
  for (const ref of ctx.footnoteRefs) {
    const fs = ctx.footnoteMap.get(ref.identifier)
    if (fs) ref.sectionId = fs.id
  }
  ctx.root.footnoteRefs = ctx.footnoteRefs
  return ctx.root
}
