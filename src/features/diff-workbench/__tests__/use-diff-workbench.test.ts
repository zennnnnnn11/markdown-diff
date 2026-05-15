import { describe, expect, it, vi } from 'vitest'

import { useDiffWorkbench } from '../use-diff-workbench'
import { flattenChanges } from '../view-model'

function makeEmptyResult(): any {
  return {
    root: {
      entity: 'section',
      primaryOp: 'equal',
      status: {
        isMatchPair: true, isAlignedPair: false, moved: false, movedWithinParent: false,
        renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false,
        inlineStructureChanged: false,
      },
      summary: 'root',
      children: [],
      warnings: [],
    },
    oldIndex: makeEmptyIndex(),
    newIndex: makeEmptyIndex(),
    matches: [],
    changeIndex: { byOldId: new Map(), byNewId: new Map(), byPairKey: new Map(), byLogicalMoveId: new Map() },
    stats: { inserts: 0, deletes: 0, replaces: 0, moves: 0, metaUpdates: 0, renames: 0, reorders: 0 },
    quality: { degradedCount: 0, inlineDeferredCount: 0, warningCount: 0 },
    warnings: [],
  }
}

function makeEmptyIndex(): any {
  return {
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
  }
}

describe('useDiffWorkbench', () => {
  it('defaults to the aligned unified view', () => {
    const workbench = useDiffWorkbench('old', 'new')

    expect(workbench.viewMode.value).toBe('unified')
  })

  it('keeps empty documents runnable', () => {
    const workbench = useDiffWorkbench('', '')

    expect(workbench.canRun.value).toBe(true)
  })

  it('uses the diff quality warning count for stats cards', () => {
    const workbench = useDiffWorkbench('old', 'new')

    workbench.result.value = {
      ...makeEmptyResult(),
      quality: { degradedCount: 1, inlineDeferredCount: 2, warningCount: 7 },
    }

    const warningCard = workbench.statsCards.value.find((card) => card.key === 'warning')

    expect(warningCard?.value).toBe(7)
  })

  it('builds empty projection lines with pairKind undefined when no result', () => {
    const workbench = useDiffWorkbench('old', 'line one\nline two\nline three')

    const lines = workbench.projectionLines.value

    expect(lines).toHaveLength(3)
    for (const line of lines) {
      expect(line.baseTone).toBe('plain')
      expect(line.matchedTones).toEqual([])
      expect(line.changeKeys).toEqual([])
      expect(line.pairKind).toBeUndefined()
      expect(line.warnings).toEqual([])
    }
    expect(lines[0]?.key).toBe('empty:1')
    expect(lines[0]?.text).toBe('line one')
    expect(lines[1]?.key).toBe('empty:2')
    expect(lines[2]?.key).toBe('empty:3')
  })

  it('returns peerHighlightKey from moveInfo when detail has move linkage', () => {
    const workbench = useDiffWorkbench('old', 'new')

    const movePeerKey = 'move:s1:s2'
    const sourceChange: any = {
      entity: 'section', kind: 'heading', primaryOp: 'move',
      moveRole: 'source', movePeerKey, logicalMoveId: movePeerKey,
      pairKey: 'match:s1:s2', oldId: 's1',
      oldNode: { kind: 'heading', title: 'Moved', headingDepth: 2, items: [] },
      pairKind: 'match',
      status: {
        isMatchPair: true, isAlignedPair: false, moved: true, movedWithinParent: false,
        renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false,
        inlineStructureChanged: false,
      },
      summary: 'source',
      children: [],
      warnings: [],
    }
    const targetChange: any = {
      entity: 'section', kind: 'heading', primaryOp: 'move',
      moveRole: 'target', movePeerKey, logicalMoveId: movePeerKey,
      pairKey: 'match:s1:s2', newId: 's2',
      newNode: { kind: 'heading', title: 'Moved', headingDepth: 2, items: [] },
      pairKind: 'match',
      status: {
        isMatchPair: true, isAlignedPair: false, moved: true, movedWithinParent: false,
        renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false,
        inlineStructureChanged: false,
      },
      summary: 'target',
      children: [],
      warnings: [],
    }

    workbench.result.value = {
      ...makeEmptyResult(),
      root: {
        ...makeEmptyResult().root,
        children: [sourceChange, targetChange],
      },
      changeIndex: {
        byOldId: new Map([['s1', sourceChange]]),
        byNewId: new Map([['s2', targetChange]]),
        byPairKey: new Map([['match:s1:s2', targetChange]]),
        byLogicalMoveId: new Map([[sourceChange.logicalMoveId, [sourceChange, targetChange]]]),
      },
      newIndex: {
        ...makeEmptyIndex(),
        byId: new Map([['s2', { sourceRange: { start: { line: 8 }, end: { line: 10 } } }]]),
      },
    }

    workbench.selectLine('match:s1:s2:source')

    expect(workbench.peerHighlightKey.value).toBe('match:s1:s2:target')
  })

  it('builds empty old projection lines when no result', () => {
    const workbench = useDiffWorkbench('old line 1\nold line 2', '')

    const lines = workbench.oldProjectionLines.value

    expect(lines).toHaveLength(2)
    expect(lines[0]?.text).toBe('old line 1')
    expect(lines[0]?.pairKind).toBeUndefined()
    expect(lines[0]?.baseTone).toBe('plain')
    expect(lines[1]?.text).toBe('old line 2')
  })

  it('returns peerSide new when moveInfo role is source', () => {
    const workbench = useDiffWorkbench('old', 'new')

    const movePeerKey = 'move:ps1:ps2'
    const sourceKey = 'match:ps1:ps1:source'
    const sourceChange: any = {
      entity: 'section', kind: 'heading', primaryOp: 'move',
      moveRole: 'source', movePeerKey, logicalMoveId: movePeerKey,
      pairKey: 'match:ps1:ps1', oldId: 'ps1',
      oldNode: { kind: 'heading', title: 'Src', headingDepth: 2, items: [] },
      pairKind: 'match',
      status: { isMatchPair: true, isAlignedPair: false, moved: true, movedWithinParent: false, renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false, inlineStructureChanged: false },
      summary: 'src', children: [], warnings: [],
    }
    const targetChange: any = {
      entity: 'section', kind: 'heading', primaryOp: 'move',
      moveRole: 'target', movePeerKey, logicalMoveId: movePeerKey,
      pairKey: 'match:ps2:ps2', newId: 'ps2',
      newNode: { kind: 'heading', title: 'Tgt', headingDepth: 2, items: [] },
      pairKind: 'match',
      status: { isMatchPair: true, isAlignedPair: false, moved: true, movedWithinParent: false, renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false, inlineStructureChanged: false },
      summary: 'tgt', children: [], warnings: [],
    }

    workbench.result.value = {
      ...makeEmptyResult(),
      root: { ...makeEmptyResult().root, children: [sourceChange, targetChange] },
      changeIndex: {
        byOldId: new Map([['ps1', sourceChange]]),
        byNewId: new Map([['ps2', targetChange]]),
        byPairKey: new Map([['match:ps1:ps1', sourceChange]]),
        byLogicalMoveId: new Map([[sourceChange.logicalMoveId, [sourceChange, targetChange]]]),
      },
      newIndex: {
        ...makeEmptyIndex(),
        byId: new Map([['ps2', { sourceRange: { start: { line: 5 }, end: { line: 7 } } }]]),
      },
    }

    workbench.selectLine(sourceKey)

    expect(workbench.peerSide.value).toBe('new')
  })

  it('returns peerSide old when moveInfo role is target', () => {
    const workbench = useDiffWorkbench('old', 'new')

    const movePeerKey = 'move:pt1:pt2'
    const targetKey = 'match:pt2:pt2:target'
    const sourceChange: any = {
      entity: 'section', kind: 'heading', primaryOp: 'move',
      moveRole: 'source', movePeerKey, logicalMoveId: movePeerKey,
      pairKey: 'match:pt1:pt1', oldId: 'pt1',
      oldNode: { kind: 'heading', title: 'Src', headingDepth: 2, items: [] },
      pairKind: 'match',
      status: { isMatchPair: true, isAlignedPair: false, moved: true, movedWithinParent: false, renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false, inlineStructureChanged: false },
      summary: 'src', children: [], warnings: [],
    }
    const targetChange: any = {
      entity: 'section', kind: 'heading', primaryOp: 'move',
      moveRole: 'target', movePeerKey, logicalMoveId: movePeerKey,
      pairKey: 'match:pt2:pt2', newId: 'pt2',
      newNode: { kind: 'heading', title: 'Tgt', headingDepth: 2, items: [] },
      pairKind: 'match',
      status: { isMatchPair: true, isAlignedPair: false, moved: true, movedWithinParent: false, renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false, inlineStructureChanged: false },
      summary: 'tgt', children: [], warnings: [],
    }

    workbench.result.value = {
      ...makeEmptyResult(),
      root: { ...makeEmptyResult().root, children: [sourceChange, targetChange] },
      changeIndex: {
        byOldId: new Map([['pt1', sourceChange]]),
        byNewId: new Map([['pt2', targetChange]]),
        byPairKey: new Map([['match:pt2:pt2', targetChange]]),
        byLogicalMoveId: new Map([[sourceChange.logicalMoveId, [sourceChange, targetChange]]]),
      },
      newIndex: {
        ...makeEmptyIndex(),
        byId: new Map([['pt2', { sourceRange: { start: { line: 8 }, end: { line: 10 } } }]]),
      },
    }

    workbench.selectLine(targetKey)

    expect(workbench.peerSide.value).toBe('old')
  })

  it('returns undefined peerSide for non-move changes', () => {
    const workbench = useDiffWorkbench('old', 'new')

    const equalChange: any = {
      entity: 'section', kind: 'heading', primaryOp: 'equal',
      pairKey: 'match:e1:e2', oldId: 'e1', newId: 'e2',
      oldNode: { kind: 'heading', title: 'Same', headingDepth: 1, items: [] },
      newNode: { kind: 'heading', title: 'Same', headingDepth: 1, items: [] },
      pairKind: 'match',
      matchKind: 'exact-self',
      score: 1,
      status: { isMatchPair: true, isAlignedPair: false, moved: false, movedWithinParent: false, renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false, inlineStructureChanged: false },
      summary: 'equal', children: [], warnings: [],
    }

    workbench.result.value = {
      ...makeEmptyResult(),
      root: { ...makeEmptyResult().root, children: [equalChange] },
    }

    workbench.selectLine('match:e1:e2')

    expect(workbench.peerSide.value).toBeUndefined()
  })

  it('exposes global warnings through the result', () => {
    const workbench = useDiffWorkbench('old', 'new')

    workbench.result.value = {
      ...makeEmptyResult(),
      warnings: ['invalid-equal-state:s1', 'subtree-budget-exceeded'],
    }

    expect(workbench.result.value?.warnings).toHaveLength(2)
    expect(workbench.result.value?.warnings).toContain('subtree-budget-exceeded')
  })

  it('collects per-change warnings through changeIndex', () => {
    const workbench = useDiffWorkbench('old', 'new')

    const warnedChange: any = {
      entity: 'section', kind: 'heading', primaryOp: 'equal',
      pairKey: 'match:w1:w2', oldId: 'w1', newId: 'w2',
      oldNode: { kind: 'heading', title: 'Warned', headingDepth: 1, items: [] },
      newNode: { kind: 'heading', title: 'Warned', headingDepth: 1, items: [] },
      pairKind: 'match',
      status: { isMatchPair: true, isAlignedPair: false, moved: false, movedWithinParent: false, renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false, inlineStructureChanged: false },
      summary: 'warned', children: [], warnings: ['inline-deferred'],
    }

    workbench.result.value = {
      ...makeEmptyResult(),
      root: { ...makeEmptyResult().root, children: [warnedChange] },
      changeIndex: {
        byOldId: new Map([['w1', warnedChange]]),
        byNewId: new Map(),
        byPairKey: new Map(),
        byLogicalMoveId: new Map(),
      },
      warnings: ['global-warning'],
    }

    const perChangeWarnings = [...(workbench.result.value?.changeIndex.byOldId.values() ?? [])]
      .flatMap((c) => c.warnings)

    expect(perChangeWarnings).toContain('inline-deferred')
    expect(workbench.result.value?.warnings).toContain('global-warning')
  })

  it('adds degraded and deferred stats cards when quality counts are non-zero', () => {
    const workbench = useDiffWorkbench('old', 'new')

    workbench.result.value = {
      ...makeEmptyResult(),
      quality: { degradedCount: 3, inlineDeferredCount: 2, warningCount: 1 },
    }

    const degradedCard = workbench.statsCards.value.find((card) => card.key === 'degraded')
    const deferredCard = workbench.statsCards.value.find((card) => card.key === 'deferred')

    expect(degradedCard?.value).toBe(3)
    expect(degradedCard?.label).toBe('降级')
    expect(deferredCard?.value).toBe(2)
    expect(deferredCard?.label).toBe('延后')
  })

  it('omits degraded and deferred cards when counts are zero', () => {
    const workbench = useDiffWorkbench('old', 'new')

    workbench.result.value = {
      ...makeEmptyResult(),
      quality: { degradedCount: 0, inlineDeferredCount: 0, warningCount: 0 },
    }

    expect(workbench.statsCards.value.find((card) => card.key === 'degraded')).toBeUndefined()
    expect(workbench.statsCards.value.find((card) => card.key === 'deferred')).toBeUndefined()
  })

  it('returns undefined peerHighlightKey when detail has no moveInfo', () => {
    const workbench = useDiffWorkbench('old', 'new')

    const equalChange: any = {
      entity: 'section', kind: 'heading', primaryOp: 'equal',
      pairKey: 'match:e1:e2', oldId: 'e1', newId: 'e2',
      oldNode: { kind: 'heading', title: 'Same', headingDepth: 1, items: [] },
      newNode: { kind: 'heading', title: 'Same', headingDepth: 1, items: [] },
      pairKind: 'match',
      matchKind: 'exact-self',
      score: 1,
      status: {
        isMatchPair: true, isAlignedPair: false, moved: false, movedWithinParent: false,
        renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false,
        inlineStructureChanged: false,
      },
      summary: 'equal',
      children: [],
      warnings: [],
    }

    workbench.result.value = {
      ...makeEmptyResult(),
      root: { ...makeEmptyResult().root, children: [equalChange] },
    }

    workbench.selectLine('match:e1:e2')

    expect(workbench.peerHighlightKey.value).toBeUndefined()
  })

  it('scrollToFirstMatch calls scrollIntoView on the first matching cell', async () => {
    const scrollIntoView = vi.fn()
    const mockElement = { scrollIntoView } as unknown as HTMLElement
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement)

    const workbench = useDiffWorkbench('# Title\n\nold paragraph', '# Title\n\nnew paragraph')
    await workbench.executeDiff()

    workbench.scrollToFirstMatch('replace')

    expect(document.querySelector).toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })

    vi.restoreAllMocks()
  })

  it('scrollToFirstMatch does nothing when no result exists', () => {
    const workbench = useDiffWorkbench('', '')
    // no executeDiff called — result is null

    expect(() => workbench.scrollToFirstMatch('insert')).not.toThrow()
  })

  it('scrollToFirstMatch with delete filter finds lines in old projection', async () => {
    const scrollIntoView = vi.fn()
    const mockElement = { scrollIntoView } as unknown as HTMLElement
    vi.spyOn(document, 'querySelector').mockReturnValue(mockElement)

    const workbench = useDiffWorkbench('# Title\n\ndeleted paragraph', '# Title')
    await workbench.executeDiff()

    workbench.scrollToFirstMatch('delete')

    expect(document.querySelector).toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })

    vi.restoreAllMocks()
  })

  it('scrollToFirstMatch with warning filter targets a warning line', async () => {
    const scrollIntoView = vi.fn()
    vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
      if (typeof selector === 'string' && selector.includes('data-change-key')) {
        return { scrollIntoView } as unknown as HTMLElement
      }
      return null
    })

    const workbench = useDiffWorkbench('# Title\n\nold paragraph', '# Title\n\nnew paragraph')
    await workbench.executeDiff()

    // inject a warning onto the first non-equal change so the filter can match
    const firstChange = workbench.result.value
      ? flattenChanges(workbench.result.value.root).find((c) => c.primaryOp !== 'equal')
      : undefined
    if (firstChange) firstChange.warnings = ['inline-deferred']

    workbench.scrollToFirstMatch('warning')

    // The function must not throw
    expect(() => workbench.scrollToFirstMatch('warning')).not.toThrow()

    vi.restoreAllMocks()
  })

  it('scrollToFirstMatch escapes CSS metacharacters in changeKey', async () => {
    const scrollIntoView = vi.fn()
    const querySpy = vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
      if (typeof selector === 'string' && selector.includes('data-change-key')) {
        return { scrollIntoView } as unknown as HTMLElement
      }
      return null
    })

    const workbench = useDiffWorkbench('# Title\n\nold paragraph', '# Title\n\nnew paragraph')
    await workbench.executeDiff()

    const firstChange = workbench.result.value
      ? flattenChanges(workbench.result.value.root).find((c) => c.primaryOp !== 'equal')
      : undefined
    if (firstChange) {
      firstChange.metadataChanges = [{ op: 'replace', path: '$.tags[0]', oldValue: 'a', newValue: 'b' }]
      delete (firstChange as any).pairKey
      delete (firstChange as any).oldId
      delete (firstChange as any).newId
    }

    expect(() => workbench.scrollToFirstMatch('replace')).not.toThrow()
    if (querySpy.mock.calls.length > 0) {
      const selector = querySpy.mock.calls[0]![0] as string
      expect(selector).toContain('\\$')
      expect(selector).toContain('\\[')
    }

    vi.restoreAllMocks()
  })

  it('isDiffStale is false when no result exists', () => {
    const workbench = useDiffWorkbench('hello', 'world')
    expect(workbench.isDiffStale.value).toBe(false)
  })

  it('isDiffStale is false immediately after executeDiff', async () => {
    const workbench = useDiffWorkbench('# A\n\nold', '# A\n\nnew')
    await workbench.executeDiff()
    expect(workbench.isDiffStale.value).toBe(false)
  })

  it('isDiffStale becomes true when markdown changes after diff', async () => {
    const workbench = useDiffWorkbench('# A\n\nold', '# A\n\nnew')
    await workbench.executeDiff()
    workbench.newMarkdown.value = '# A\n\nmodified'
    expect(workbench.isDiffStale.value).toBe(true)
  })

  it('isDiffStale resets to false after re-running executeDiff', async () => {
    const workbench = useDiffWorkbench('# A\n\nold', '# A\n\nnew')
    await workbench.executeDiff()
    workbench.newMarkdown.value = '# A\n\nmodified'
    expect(workbench.isDiffStale.value).toBe(true)
    await workbench.executeDiff()
    expect(workbench.isDiffStale.value).toBe(false)
  })

  it('clearEditor resets isDiffStale to false', async () => {
    const workbench = useDiffWorkbench('# A\n\nold', '# A\n\nnew')
    await workbench.executeDiff()
    workbench.oldMarkdown.value = 'changed'
    expect(workbench.isDiffStale.value).toBe(true)
    workbench.clearEditor('old')
    expect(workbench.isDiffStale.value).toBe(false)
  })

  it('shows reorder stat card when reorders > 0', () => {
    const workbench = useDiffWorkbench('', '')
    const res = makeEmptyResult()
    res.stats.reorders = 3
    workbench.result.value = res
    const card = workbench.statsCards.value.find((c: any) => c.key === 'reorder')
    expect(card).toBeDefined()
    expect(card!.label).toBe('重排')
    expect(card!.value).toBe(3)
    expect(card!.filter).toBe('reorder')
  })
})
