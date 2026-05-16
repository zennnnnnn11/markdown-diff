import type { Section } from '../transformer'
import { buildSemanticIndex } from './indexer'
import { resolveDiffOptions } from './options'
import { summarizeChanges } from './summary'
import type { DiffOptions, DiffResult } from './types'
import type { DiffContext } from './engine/context'
import { addMatch, buildChangeIndex, validateTree } from './engine/helpers'
import { runDeterministicMatching } from './engine/deterministic'
import { buildMatchedChange } from './engine/alignment'
import { recoverMoves } from './engine/moves'
import { recoverDefinitionIdentifierPairs, recoverRenamesAndMeta } from './engine/renames'
import { computePresentationDiffs } from './engine/presentation'
import { maybeApplyStructuralFallback } from './engine/structural-fallback'

export async function diffMarkdownTrees(
  oldRoot: Section,
  newRoot: Section,
  options?: Partial<DiffOptions>,
): Promise<DiffResult> {
  const resolved = resolveDiffOptions(options)
  const [oldIndex, newIndex] = await Promise.all([
    buildSemanticIndex(oldRoot, 'old'),
    buildSemanticIndex(newRoot, 'new'),
  ])

  const context: DiffContext = {
    options: resolved,
    oldIndex,
    newIndex,
    matchesByOld: new Map(),
    matchesByNew: new Map(),
    warnings: [],
    structuralFallback: resolved.enhancedLocalRecovery ? maybeApplyStructuralFallback : undefined,
  }

  addMatch(context, oldRoot.id, newRoot.id, 'forced-root')
  await runDeterministicMatching(context)

  const rootPair = context.matchesByOld.get(oldRoot.id)
  if (!rootPair) throw new Error('Root pair missing after deterministic matching')

  const root = await buildMatchedChange(context, rootPair, 'global')
  await recoverMoves(context, root)
  await recoverDefinitionIdentifierPairs(context, root)
  await recoverRenamesAndMeta(context, root)
  await computePresentationDiffs(context, root)
  validateTree(root, context.warnings)
  const changeIndex = buildChangeIndex(root)
  const { stats, quality } = summarizeChanges(root, context.warnings)

  return {
    root,
    oldIndex,
    newIndex,
    matches: [...context.matchesByOld.values()],
    changeIndex,
    stats,
    quality,
    warnings: context.warnings,
  }
}
