import { describe, expect, it } from 'vitest'
import { collectQuality, collectStats, forEachChange, summarizeChanges } from '../summary'
import type { DiffChange, DiffStatus } from '../types'

function makeStatus(overrides: Partial<DiffStatus> = {}): DiffStatus {
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

function makeChange(overrides: Partial<DiffChange> = {}): DiffChange {
  return {
    entity: 'section',
    primaryOp: 'equal',
    status: makeStatus(),
    summary: 'change',
    children: [],
    warnings: [],
    ...overrides,
  }
}

describe('diff summary', () => {
  it('counts frontmatter meta-updates once without double-counting metadata detail rows', () => {
    const root = makeChange({
      children: [
        makeChange({
          entity: 'section',
          kind: 'frontmatter',
          primaryOp: 'meta-update',
          status: makeStatus({ isMatchPair: true, metaChanged: true }),
          summary: 'frontmatter',
          children: [
            makeChange({
              entity: 'metadata',
              primaryOp: 'meta-update',
              status: makeStatus({ metaChanged: true }),
              summary: 'metadata $.title',
            }),
            makeChange({
              entity: 'metadata',
              primaryOp: 'meta-update',
              status: makeStatus({ metaChanged: true }),
              summary: 'metadata $.owner',
            }),
          ],
        }),
      ],
    })

    expect(collectStats(root)).toEqual({
      inserts: 0,
      deletes: 0,
      replaces: 0,
      moves: 0,
      metaUpdates: 1,
      renames: 0,
    })
  })

  it('counts both global and change-level warnings in quality summaries', () => {
    const root = makeChange({
      children: [
        makeChange({
          primaryOp: 'replace',
          summary: 'paragraph',
          warnings: ['inline-deferred'],
        }),
        makeChange({
          primaryOp: 'replace',
          summary: 'section',
          degraded: true,
          warnings: ['local-window-exceeded', 'subtree-budget-exceeded'],
        }),
      ],
    })

    expect(collectQuality(root, ['invalid-meta-pair:test'])).toEqual({
      degradedCount: 1,
      inlineDeferredCount: 1,
      warningCount: 4,
    })
  })

  it('summarizes stats and quality in one pass without changing public results', () => {
    const root = makeChange({
      warnings: ['root-warning'],
      children: [
        makeChange({
          primaryOp: 'insert',
          summary: 'inserted',
        }),
        makeChange({
          primaryOp: 'meta-update',
          summary: 'renamed metadata section',
          status: makeStatus({ isMatchPair: true, metaChanged: true, renamed: true }),
          logicalMoveId: 'move:a:b',
          degraded: true,
          warnings: ['inline-deferred'],
        }),
      ],
    })

    const summary = summarizeChanges(root, ['global-warning'])

    expect(summary.stats).toEqual(collectStats(root))
    expect(summary.quality).toEqual(collectQuality(root, ['global-warning']))
  })

  it('traverses changes in pre-order for streaming consumers', () => {
    const order: string[] = []
    const root = makeChange({
      summary: 'root',
      children: [
        makeChange({
          summary: 'left',
          children: [makeChange({ summary: 'left-child' })],
        }),
        makeChange({ summary: 'right' }),
      ],
    })

    forEachChange(root, (change) => {
      order.push(change.summary)
    })

    expect(order).toEqual(['root', 'left', 'left-child', 'right'])
  })
})
