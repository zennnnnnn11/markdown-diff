import type { DiffChange, DiffQualitySummary, DiffStats } from './types'

export function forEachChange(root: DiffChange, visitor: (change: DiffChange) => void): void {
  visit(root)

  function visit(change: DiffChange): void {
    visitor(change)
    for (const child of change.children) visit(child)
  }
}

export async function forEachChangeAsync(
  root: DiffChange,
  visitor: (change: DiffChange) => Promise<void>,
): Promise<void> {
  await visit(root)

  async function visit(change: DiffChange): Promise<void> {
    await visitor(change)
    for (const child of change.children) await visit(child)
  }
}

export function summarizeChanges(
  root: DiffChange,
  warnings: string[],
): { stats: DiffStats; quality: DiffQualitySummary } {
  const logicalMoves = new Set<string>()
  const stats: DiffStats = {
    inserts: 0,
    deletes: 0,
    replaces: 0,
    moves: 0,
    metaUpdates: 0,
    renames: 0,
    reorders: 0,
  }
  let degradedCount = 0
  let inlineDeferredCount = 0
  let changeWarningCount = 0

  forEachChange(root, (change) => {
    if (change.primaryOp === 'insert') stats.inserts++
    if (change.primaryOp === 'delete') stats.deletes++
    if (change.primaryOp === 'replace') stats.replaces++
    if (shouldCountMetaUpdate(change)) stats.metaUpdates++
    if (change.status.renamed) stats.renames++
    if (change.reordered || change.status.movedWithinParent) stats.reorders++
    if (change.logicalMoveId) logicalMoves.add(change.logicalMoveId)
    if (change.degraded) degradedCount++
    if (change.warnings.includes('inline-deferred')) inlineDeferredCount++
    changeWarningCount += change.warnings.length
  })

  stats.moves = logicalMoves.size

  return {
    stats,
    quality: {
      degradedCount,
      inlineDeferredCount,
      warningCount: warnings.length + changeWarningCount,
    },
  }
}

export function collectStats(root: DiffChange): DiffStats {
  return summarizeChanges(root, []).stats
}

export function collectQuality(root: DiffChange, warnings: string[]): DiffQualitySummary {
  return summarizeChanges(root, warnings).quality
}

function shouldCountMetaUpdate(change: DiffChange): boolean {
  return change.primaryOp === 'meta-update' && change.entity !== 'metadata'
}
