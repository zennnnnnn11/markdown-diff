import { describe, expect, it } from 'vitest'

import { useDiffWorkbench } from '../use-diff-workbench'

describe('useDiffWorkbench', () => {
  it('uses the diff quality warning count for stats cards', () => {
    const workbench = useDiffWorkbench('old', 'new')

    workbench.result.value = {
      root: {
        entity: 'section',
        primaryOp: 'equal',
        status: {
          isMatchPair: true,
          isAlignedPair: false,
          moved: false,
          movedWithinParent: false,
          renamed: false,
          selfChanged: false,
          descendantChanged: false,
          metaChanged: false,
          inlineStructureChanged: false,
        },
        summary: 'root',
        children: [],
        warnings: [],
      },
      oldIndex: {
        byId: new Map(),
        byKind: new Map(),
        byBlockType: new Map(),
        bySelfHash: new Map(),
        byDirectHash: new Map(),
        bySubtreeHash: new Map(),
        byIdentityHash: new Map(),
        byHeadingBodyHash: new Map(),
        byPathHash: new Map(),
        backlinks: { footnotes: new Map(), definitions: new Map() },
      },
      newIndex: {
        byId: new Map(),
        byKind: new Map(),
        byBlockType: new Map(),
        bySelfHash: new Map(),
        byDirectHash: new Map(),
        bySubtreeHash: new Map(),
        byIdentityHash: new Map(),
        byHeadingBodyHash: new Map(),
        byPathHash: new Map(),
        backlinks: { footnotes: new Map(), definitions: new Map() },
      },
      matches: [],
      changeIndex: {
        byOldId: new Map(),
        byNewId: new Map(),
        byPairKey: new Map(),
      },
      stats: {
        inserts: 1,
        deletes: 2,
        replaces: 3,
        moves: 4,
        metaUpdates: 5,
        renames: 6,
      },
      quality: {
        degradedCount: 1,
        inlineDeferredCount: 2,
        warningCount: 7,
      },
      warnings: ['invalid-equal-state:test'],
    } as any

    const warningCard = workbench.statsCards.value.find((card) => card.key === 'warning')

    expect(warningCard?.value).toBe(7)
  })
})
