import type { Root } from 'mdast'
import type { Section } from './types'
import { buildSections } from './builder'

export function transformMarkdown(root: Root): Section {
  return buildSections(root)
}

export type { Section, Block, InlineContent, TransformContext, FootnoteRef } from './types'
