import type { Node } from 'unist'
import type { Block, InlineContent, TransformContext } from './types'

let blockIdCounter = 0
let inlineIdCounter = 0

export function createBlock(node: Node, ctx?: TransformContext): Block {
  const base = deepClone(node) as Record<string, unknown>
  const id = ctx ? nextBlockId(ctx) : `b${++blockIdCounter}`

  const knownTypes = new Set([
    'heading',
    'paragraph',
    'code',
    'html',
    'table',
    'tableRow',
    'tableCell',
    'list',
    'listItem',
    'blockquote',
    'definition',
    'footnoteDefinition',
    'footnoteReference',
    'yaml',
    'toml',
    'math',
    'inlineMath',
    'thematicBreak',
    'text',
    'strong',
    'emphasis',
    'delete',
    'link',
    'linkReference',
    'image',
    'imageReference',
    'inlineCode',
    'break',
  ])

  if (knownTypes.has(base.type as string)) {
    return { id, ...base } as Block
  }

  return {
    id,
    type: 'unknown',
    originalType: base.type as string,
    raw: base,
  } as Block
}

function nextBlockId(ctx: TransformContext): string {
  return `b${++ctx.idCounter}`
}

export function createInlineContent(node: Node): InlineContent {
  return {
    id: `i${++inlineIdCounter}`,
    ...(deepClone(node) as Record<string, unknown>),
  } as InlineContent
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepClone(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (Array.isArray(obj)) return obj.map(deepClone) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {}
  for (const key of Object.keys(obj)) {
    result[key] = deepClone(obj[key])
  }
  return result
}
