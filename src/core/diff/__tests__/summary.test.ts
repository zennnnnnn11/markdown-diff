import { describe, expect, it } from 'vitest'
import { collectQuality, collectStats } from '../summary'
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
})
