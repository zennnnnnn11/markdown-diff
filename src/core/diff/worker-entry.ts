import { parseMarkdown } from '@/core/parser'
import { transformMarkdown } from '@/core/transformer'
import { diffMarkdownTrees } from './engine'
import type { DiffResult } from './types'

export async function runMarkdownDiffInWorker(
  oldMarkdown: string,
  newMarkdown: string,
): Promise<DiffResult> {
  const [oldAst, newAst] = await Promise.all([
    parseMarkdown(oldMarkdown),
    parseMarkdown(newMarkdown),
  ])
  const oldTree = transformMarkdown(oldAst)
  const newTree = transformMarkdown(newAst)
  return diffMarkdownTrees(oldTree, newTree)
}
