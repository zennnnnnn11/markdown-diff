import type { DiffChange, DiffQualitySummary, DiffStats } from './types'

export function collectStats(root: DiffChange): DiffStats {
  const logicalMoves = new Set<string>()
  const stats: DiffStats = {
    inserts: 0,
    deletes: 0,
    replaces: 0,
    moves: 0,
    metaUpdates: 0,
    renames: 0,
  }

  for (const change of flattenChanges(root)) {
    if (change.primaryOp === 'insert') stats.inserts++
    if (change.primaryOp === 'delete') stats.deletes++
    if (change.primaryOp === 'replace') stats.replaces++
    if (shouldCountMetaUpdate(change)) stats.metaUpdates++
    if (change.status.renamed) stats.renames++
    if (change.logicalMoveId) logicalMoves.add(change.logicalMoveId)
  }

  stats.moves = logicalMoves.size
  return stats
}

export function collectQuality(root: DiffChange, warnings: string[]): DiffQualitySummary {
  let degradedCount = 0
  let inlineDeferredCount = 0
  let changeWarningCount = 0

  for (const change of flattenChanges(root)) {
    if (change.degraded) degradedCount++
    if (change.warnings.includes('inline-deferred')) inlineDeferredCount++
    changeWarningCount += change.warnings.length
  }

  return {
    degradedCount,
    inlineDeferredCount,
    warningCount: warnings.length + changeWarningCount,
  }
}

function shouldCountMetaUpdate(change: DiffChange): boolean {
  return change.primaryOp === 'meta-update' && change.entity !== 'metadata'
}

function flattenChanges(root: DiffChange): DiffChange[] {
  const result: DiffChange[] = []
  visit(root)
  return result

  function visit(change: DiffChange): void {
    result.push(change)
    for (const child of change.children) visit(child)
  }
}
