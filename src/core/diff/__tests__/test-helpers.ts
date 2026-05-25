import { parseMarkdown } from '../../parser'
import { transformMarkdown } from '../../transformer'
import { diffMarkdownTrees } from '../index'
import type { DiffChange, DiffOptions, DiffStatus } from '../types'

export function flatten(change: DiffChange): DiffChange[] {
  return [change, ...change.children.flatMap(flatten)]
}

export async function diffMarkdown(
  oldMarkdown: string,
  newMarkdown = oldMarkdown,
  options?: Partial<DiffOptions>,
) {
  const oldTree = transformMarkdown(await parseMarkdown(oldMarkdown))
  const newTree = transformMarkdown(await parseMarkdown(newMarkdown))
  return diffMarkdownTrees(oldTree, newTree, options)
}

export function makeStatus(overrides: Partial<DiffStatus> = {}): DiffStatus {
  return {
    isMatchPair: false,
    isAlignedPair: false,
    moved: false,
    movedWithinParent: false,
    renamed: false,
    selfChanged: false,
    descendantChanged: false,
    metaChanged: false,
    inlineStructureChanged: false,
    ...overrides,
  }
}

export function makeChange(
  overrides: Partial<DiffChange> & Pick<DiffChange, 'primaryOp' | 'summary' | 'status'>,
): DiffChange {
  return {
    entity: 'section',
    children: [],
    warnings: [],
    ...overrides,
  }
}
