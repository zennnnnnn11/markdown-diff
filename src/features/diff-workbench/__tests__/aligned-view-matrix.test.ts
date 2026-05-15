import { describe, expect, it } from 'vitest'

import type { DiffChange, DiffResult, DiffStatus, SemanticIndex, SourceRange } from '@/core/diff'

import {
  buildMergedRows,
  buildProjectionLines,
  formatWarningLabel,
  type MergedRow,
  type Tone,
} from '../view-model'

type PairScenario = 'replace' | 'meta-update' | 'rename' | 'equal-meta'

interface PairCase {
  name: string
  scenario: PairScenario
  oldLength: number
  newLength: number
  prefixLength: number
}

interface OneSidedCase {
  name: string
  side: 'old' | 'new'
  length: number
  prefixLength: number
  suffixLength: number
}

interface MoveCase {
  name: string
  length: number
  oldInsertIndex: number
  newInsertIndex: number
}

interface OverlapCase {
  name: string
  tone: Tone
  overlapCount: number
  warning?: string
}

const pairedCases = buildPairedCases()
const deleteCases = buildOneSidedCases('old')
const insertCases = buildOneSidedCases('new')
const moveCases = buildMoveCases()
const overlapCases = buildOverlapCases()

describe('aligned diff view matrix', () => {
  it.each(pairedCases)('$name', (testCase) => {
    const fixture = buildPairedFixture(testCase)
    const rows = buildMergedRows(fixture.oldMarkdown, fixture.newMarkdown, fixture.result)
    const expectedTone = toneForScenario(testCase.scenario)
    const changedRows = rows.filter(
      (row) => row.oldLine?.baseTone === expectedTone || row.newLine?.baseTone === expectedTone,
    )

    expectValidRows(rows)
    expect(changedRows).toHaveLength(Math.max(testCase.oldLength, testCase.newLength))
    expect(changedRows[0]?.oldLine?.text).toBe(fixture.oldChangedLines[0])
    expect(changedRows[0]?.newLine?.text).toBe(fixture.newChangedLines[0])
    expect(changedRows.some((row) => row.oldLine && row.newLine)).toBe(true)
    expect(changedRows.every((row) => row.oldLine?.baseTone === expectedTone || !row.oldLine)).toBe(true)
    expect(changedRows.every((row) => row.newLine?.baseTone === expectedTone || !row.newLine)).toBe(true)
  })

  it.each(deleteCases)('$name', (testCase) => {
    const fixture = buildOneSidedFixture(testCase)
    const rows = buildMergedRows(fixture.oldMarkdown, fixture.newMarkdown, fixture.result)
    const removedRows = rows.filter((row) => row.oldLine?.text.startsWith('removed-'))

    expectValidRows(rows)
    expect(removedRows).toHaveLength(testCase.length)
    expect(removedRows.every((row) => row.oldLine?.baseTone === 'delete')).toBe(true)
    expect(removedRows.every((row) => row.newLine === null)).toBe(true)
  })

  it.each(insertCases)('$name', (testCase) => {
    const fixture = buildOneSidedFixture(testCase)
    const rows = buildMergedRows(fixture.oldMarkdown, fixture.newMarkdown, fixture.result)
    const insertedRows = rows.filter((row) => row.newLine?.text.startsWith('inserted-'))

    expectValidRows(rows)
    expect(insertedRows).toHaveLength(testCase.length)
    expect(insertedRows.every((row) => row.newLine?.baseTone === 'insert')).toBe(true)
    expect(insertedRows.every((row) => row.oldLine === null)).toBe(true)
  })

  it.each(moveCases)('$name', (testCase) => {
    const fixture = buildMoveFixture(testCase)
    const rows = buildMergedRows(fixture.oldMarkdown, fixture.newMarkdown, fixture.result)
    const movedOutRows = rows.filter((row) => row.oldLine?.text.startsWith('moved-'))
    const movedInRows = rows.filter((row) => row.newLine?.text.startsWith('moved-'))

    expectValidRows(rows)
    expect(movedOutRows).toHaveLength(testCase.length)
    expect(movedInRows).toHaveLength(testCase.length)
    expect(movedOutRows.every((row) => row.oldLine?.baseTone === 'move' && row.newLine === null)).toBe(true)
    expect(movedInRows.every((row) => row.newLine?.baseTone === 'move' && row.oldLine === null)).toBe(true)
    expect(movedOutRows[0]?.oldLine?.alignmentKey).toBe(movedInRows[0]?.newLine?.alignmentKey)
    expect(rows.some((row) => row.oldLine?.text === row.newLine?.text && row.oldLine?.text.startsWith('stable-'))).toBe(true)

    const outRowIndex = rows.indexOf(movedOutRows[0]!)
    const inRowIndex = rows.indexOf(movedInRows[0]!)
    expect(movedOutRows[0]?.oldLine?.movePeerRowIndex).toBe(inRowIndex)
    expect(movedInRows[0]?.newLine?.movePeerRowIndex).toBe(outRowIndex)
    if (outRowIndex < inRowIndex) {
      expect(movedOutRows[0]!.oldLine!.movePeerRowIndex!).toBeGreaterThan(outRowIndex)
    } else {
      expect(movedOutRows[0]!.oldLine!.movePeerRowIndex!).toBeLessThan(outRowIndex)
    }
  })

  it.each(overlapCases)('$name', (testCase) => {
    const fixture = buildOverlapFixture(testCase)
    const line = buildProjectionLines(fixture.newMarkdown, fixture.result)[0]

    expect(line?.baseTone).toBe(testCase.tone)
    expect(line?.lineMatches).toHaveLength(testCase.overlapCount)
    expect(line?.annotations.some((annotation) => annotation.label === toneLabel(testCase.tone))).toBe(true)
    expect(line?.annotations.some((annotation) => annotation.kind === 'overlap')).toBe(testCase.overlapCount > 1)
    if (testCase.warning) {
      expect(line?.annotations.some((annotation) => annotation.label === formatWarningLabel(testCase.warning!))).toBe(true)
    }
  })
})

function buildPairedCases(): PairCase[] {
  const cases: PairCase[] = []
  for (const scenario of ['replace', 'meta-update', 'rename', 'equal-meta'] as const) {
    for (let oldLength = 1; oldLength <= 5; oldLength += 1) {
      for (let newLength = 1; newLength <= 5; newLength += 1) {
        for (let prefixLength = 0; prefixLength < 3; prefixLength += 1) {
          cases.push({
            name: `pairs ${scenario} old:${oldLength} new:${newLength} prefix:${prefixLength}`,
            scenario,
            oldLength,
            newLength,
            prefixLength,
          })
        }
      }
    }
  }
  return cases
}

function buildOneSidedCases(side: 'old' | 'new'): OneSidedCase[] {
  const cases: OneSidedCase[] = []
  for (let length = 1; length <= 5; length += 1) {
    for (let prefixLength = 0; prefixLength < 5; prefixLength += 1) {
      for (let suffixLength = 0; suffixLength < 4; suffixLength += 1) {
        cases.push({
          name: `${side === 'old' ? 'deletes' : 'inserts'} length:${length} prefix:${prefixLength} suffix:${suffixLength}`,
          side,
          length,
          prefixLength,
          suffixLength,
        })
      }
    }
  }
  return cases
}

function buildMoveCases(): MoveCase[] {
  const cases: MoveCase[] = []
  for (let length = 1; length <= 4; length += 1) {
    for (let oldInsertIndex = 0; oldInsertIndex < 5; oldInsertIndex += 1) {
      for (let rawNewInsertIndex = 0; rawNewInsertIndex < 5; rawNewInsertIndex += 1) {
        const newInsertIndex = rawNewInsertIndex === oldInsertIndex
          ? (rawNewInsertIndex + 1) % 5
          : rawNewInsertIndex
        cases.push({
          name: `moves length:${length} oldAt:${oldInsertIndex} newAt:${newInsertIndex} raw:${rawNewInsertIndex}`,
          length,
          oldInsertIndex,
          newInsertIndex,
        })
      }
    }
  }
  return cases
}

function buildOverlapCases(): OverlapCase[] {
  const tones: Tone[] = ['replace', 'meta', 'rename', 'insert', 'delete', 'move']
  const warnings = [undefined, 'inline-deferred', 'subtree-budget-exceeded', 'unknown-warning']
  const cases: OverlapCase[] = []
  for (const tone of tones) {
    for (let overlapCount = 1; overlapCount <= 5; overlapCount += 1) {
      for (const warning of warnings) {
        cases.push({
          name: `projects ${tone} overlap:${overlapCount} warning:${warning ?? 'none'}`,
          tone,
          overlapCount,
          warning,
        })
      }
    }
  }
  return cases
}

function buildPairedFixture(testCase: PairCase) {
  const prefixLines = makeLines('stable-prefix', testCase.prefixLength)
  const suffixLines = makeLines('stable-suffix', 2)
  const oldChangedLines = makeLines(`old-${testCase.scenario}`, testCase.oldLength)
  const newChangedLines = makeLines(`new-${testCase.scenario}`, testCase.newLength)
  const oldLines = [...prefixLines, ...oldChangedLines, ...suffixLines]
  const newLines = [...prefixLines, ...newChangedLines, ...suffixLines]
  const oldRanges = new Map<string, SourceRange>()
  const newRanges = new Map<string, SourceRange>()
  const changes: DiffChange[] = []

  addEqualLineChanges(changes, oldRanges, newRanges, prefixLines, 1, 1, 'prefix')
  const oldStart = prefixLines.length + 1
  const newStart = prefixLines.length + 1
  oldRanges.set('old-pair', makeRange(oldStart, testCase.oldLength))
  newRanges.set('new-pair', makeRange(newStart, testCase.newLength))
  changes.push(makePairedChange(testCase.scenario, 'old-pair', 'new-pair', 'pair:matrix'))

  const oldSuffixStart = prefixLines.length + oldChangedLines.length + 1
  const newSuffixStart = prefixLines.length + newChangedLines.length + 1
  addEqualLineChanges(changes, oldRanges, newRanges, suffixLines, oldSuffixStart, newSuffixStart, 'suffix')

  return {
    oldMarkdown: oldLines.join('\n'),
    newMarkdown: newLines.join('\n'),
    oldChangedLines,
    newChangedLines,
    result: makeResult(changes, oldRanges, newRanges),
  }
}

function buildOneSidedFixture(testCase: OneSidedCase) {
  const prefixLines = makeLines('stable-prefix', testCase.prefixLength)
  const suffixLines = makeLines('stable-suffix', testCase.suffixLength)
  const changedLines = makeLines(testCase.side === 'old' ? 'removed' : 'inserted', testCase.length)
  const oldLines = testCase.side === 'old'
    ? [...prefixLines, ...changedLines, ...suffixLines]
    : [...prefixLines, ...suffixLines]
  const newLines = testCase.side === 'new'
    ? [...prefixLines, ...changedLines, ...suffixLines]
    : [...prefixLines, ...suffixLines]
  const oldRanges = new Map<string, SourceRange>()
  const newRanges = new Map<string, SourceRange>()
  const changes: DiffChange[] = []

  addEqualLineChanges(changes, oldRanges, newRanges, prefixLines, 1, 1, 'prefix')
  if (testCase.side === 'old') {
    oldRanges.set('old-side-only', makeRange(prefixLines.length + 1, testCase.length))
    changes.push(makeChange({
      primaryOp: 'delete',
      oldId: 'old-side-only',
      summary: 'deleted side-only block',
      status: makeStatus({ selfChanged: true }),
    }))
  } else {
    newRanges.set('new-side-only', makeRange(prefixLines.length + 1, testCase.length))
    changes.push(makeChange({
      primaryOp: 'insert',
      newId: 'new-side-only',
      summary: 'inserted side-only block',
      status: makeStatus({ selfChanged: true }),
    }))
  }

  const oldSuffixStart = prefixLines.length + (testCase.side === 'old' ? changedLines.length : 0) + 1
  const newSuffixStart = prefixLines.length + (testCase.side === 'new' ? changedLines.length : 0) + 1
  addEqualLineChanges(changes, oldRanges, newRanges, suffixLines, oldSuffixStart, newSuffixStart, 'suffix')

  return {
    oldMarkdown: oldLines.join('\n'),
    newMarkdown: newLines.join('\n'),
    result: makeResult(changes, oldRanges, newRanges),
  }
}

function buildMoveFixture(testCase: MoveCase) {
  const stableLines = makeLines('stable', 5)
  const movedLines = makeLines('moved', testCase.length)
  const oldLines = insertAt(stableLines, testCase.oldInsertIndex, movedLines)
  const newLines = insertAt(stableLines, testCase.newInsertIndex, movedLines)
  const oldRanges = new Map<string, SourceRange>()
  const newRanges = new Map<string, SourceRange>()
  const changes: DiffChange[] = []

  for (const stableLine of stableLines) {
    const oldLineNumber = oldLines.indexOf(stableLine) + 1
    const newLineNumber = newLines.indexOf(stableLine) + 1
    addEqualLineChanges(changes, oldRanges, newRanges, [stableLine], oldLineNumber, newLineNumber, stableLine)
  }

  const logicalMoveId = `move:${testCase.length}:${testCase.oldInsertIndex}:${testCase.newInsertIndex}`
  oldRanges.set('old-move', makeRange(testCase.oldInsertIndex + 1, testCase.length))
  newRanges.set('new-move', makeRange(testCase.newInsertIndex + 1, testCase.length))
  changes.push(makeChange({
    primaryOp: 'move',
    oldId: 'old-move',
    pairKey: 'pair:move',
    pairKind: 'match',
    logicalMoveId,
    movePeerKey: logicalMoveId,
    moveRole: 'source',
    summary: 'move source',
    status: makeStatus({ isMatchPair: true, moved: true }),
  }))
  changes.push(makeChange({
    primaryOp: 'move',
    newId: 'new-move',
    pairKey: 'pair:move',
    pairKind: 'match',
    logicalMoveId,
    movePeerKey: logicalMoveId,
    moveRole: 'target',
    summary: 'move target',
    status: makeStatus({ isMatchPair: true, moved: true }),
  }))

  return {
    oldMarkdown: oldLines.join('\n'),
    newMarkdown: newLines.join('\n'),
    result: makeResult(changes, oldRanges, newRanges),
  }
}

function buildOverlapFixture(testCase: OverlapCase) {
  const newMarkdown = 'changed line'
  const oldRanges = new Map<string, SourceRange>()
  const newRanges = new Map<string, SourceRange>()
  const changes: DiffChange[] = []

  for (let index = 0; index < testCase.overlapCount; index += 1) {
    const oldId = `old-overlap-${index}`
    const newId = `new-overlap-${index}`
    oldRanges.set(oldId, makeRange(1, 1))
    newRanges.set(newId, makeRange(1, 1))
    changes.push(makeToneChange(testCase.tone, oldId, newId, index, testCase.warning))
  }

  return {
    oldMarkdown: 'original line',
    newMarkdown,
    result: makeResult(changes, oldRanges, newRanges),
  }
}

function makeToneChange(
  tone: Tone,
  oldId: string,
  newId: string,
  index: number,
  warning?: string,
): DiffChange {
  if (tone === 'insert') {
    return makeChange({
      primaryOp: 'insert',
      newId,
      summary: `insert overlap ${index}`,
      status: makeStatus({ selfChanged: true }),
      warnings: warning ? [warning] : [],
    })
  }
  if (tone === 'delete') {
    return makeChange({
      primaryOp: 'delete',
      oldId,
      newId,
      summary: `delete overlap ${index}`,
      status: makeStatus({ selfChanged: true }),
      warnings: warning ? [warning] : [],
    })
  }
  if (tone === 'move') {
    return makeChange({
      primaryOp: 'move',
      oldId,
      newId,
      pairKey: `pair:overlap:${index}`,
      pairKind: 'match',
      logicalMoveId: `move:overlap:${index}`,
      movePeerKey: `move:overlap:${index}`,
      moveRole: 'target',
      summary: `move overlap ${index}`,
      status: makeStatus({ isMatchPair: true, moved: true }),
      warnings: warning ? [warning] : [],
    })
  }
  return makePairedChange(
    tone === 'meta' ? 'meta-update' : tone === 'rename' ? 'rename' : 'replace',
    oldId,
    newId,
    `pair:overlap:${index}`,
    warning ? [warning] : [],
  )
}

function makePairedChange(
  scenario: PairScenario,
  oldId: string,
  newId: string,
  pairKey: string,
  warnings: string[] = [],
): DiffChange {
  if (scenario === 'replace') {
    return makeChange({
      primaryOp: 'replace',
      oldId,
      newId,
      pairKey,
      pairKind: 'align',
      summary: 'replace block',
      status: makeStatus({ isAlignedPair: true, selfChanged: true }),
      warnings,
    })
  }
  if (scenario === 'meta-update') {
    return makeChange({
      primaryOp: 'meta-update',
      oldId,
      newId,
      pairKey,
      pairKind: 'match',
      summary: 'metadata block',
      status: makeStatus({ isMatchPair: true, metaChanged: true }),
      warnings,
    })
  }
  if (scenario === 'rename') {
    return makeChange({
      primaryOp: 'equal',
      oldId,
      newId,
      pairKey,
      pairKind: 'match',
      summary: 'renamed block',
      status: makeStatus({ isMatchPair: true, renamed: true, selfChanged: true }),
      warnings,
    })
  }
  return makeChange({
    primaryOp: 'equal',
    oldId,
    newId,
    pairKey,
    pairKind: 'match',
    summary: 'equal metadata block',
    status: makeStatus({ isMatchPair: true, metaChanged: true }),
    warnings,
  })
}

function addEqualLineChanges(
  changes: DiffChange[],
  oldRanges: Map<string, SourceRange>,
  newRanges: Map<string, SourceRange>,
  lines: string[],
  oldStart: number,
  newStart: number,
  idPrefix: string,
): void {
  lines.forEach((_line, index) => {
    const oldId = `old-${idPrefix}-${index}-${oldStart}`
    const newId = `new-${idPrefix}-${index}-${newStart}`
    oldRanges.set(oldId, makeRange(oldStart + index, 1))
    newRanges.set(newId, makeRange(newStart + index, 1))
    changes.push(makeChange({
      primaryOp: 'equal',
      oldId,
      newId,
      pairKey: `pair:${idPrefix}:${index}:${oldStart}:${newStart}`,
      pairKind: 'match',
      summary: `equal ${idPrefix} ${index}`,
      status: makeStatus({ isMatchPair: true }),
    }))
  })
}

function makeChange(change: Partial<DiffChange> & Pick<DiffChange, 'primaryOp' | 'summary' | 'status'>): DiffChange {
  return {
    entity: 'block',
    blockType: 'paragraph',
    children: [],
    warnings: [],
    ...change,
  }
}

function makeResult(
  changes: DiffChange[],
  oldRanges: Map<string, SourceRange>,
  newRanges: Map<string, SourceRange>,
): DiffResult {
  return {
    root: makeChange({
      entity: 'section',
      primaryOp: 'equal',
      summary: 'root',
      status: makeStatus({ isMatchPair: true }),
      children: changes,
    }),
    oldIndex: makeIndex(oldRanges, 'old'),
    newIndex: makeIndex(newRanges, 'new'),
    matches: [],
    changeIndex: { byOldId: new Map(), byNewId: new Map(), byPairKey: new Map(), byLogicalMoveId: new Map() },
    stats: { inserts: 0, deletes: 0, replaces: 0, moves: 0, metaUpdates: 0, renames: 0, reorders: 0 },
    quality: { degradedCount: 0, inlineDeferredCount: 0, warningCount: 0 },
    warnings: [],
  }
}

function makeIndex(ranges: Map<string, SourceRange>, tree: 'old' | 'new'): SemanticIndex {
  return {
    tree,
    rootId: `${tree}:root`,
    byId: new Map([...ranges].map(([id, sourceRange]) => [id, { id, sourceRange }])),
    nodesInPreorder: [],
    childrenById: new Map(),
    byKind: new Map(),
    byBlockType: new Map(),
    byHeadingDepth: new Map(),
    bySelfHash: new Map(),
    byDirectHash: new Map(),
    bySubtreeHash: new Map(),
    byIdentityHash: new Map(),
    byHeadingBodyHash: new Map(),
    byPathHash: new Map(),
    backlinks: { footnotes: new Map(), definitions: new Map() },
  } as unknown as SemanticIndex
}

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

function makeRange(startLine: number, length: number): SourceRange {
  return {
    start: { line: startLine },
    end: { line: startLine + length - 1 },
  }
}

function makeLines(prefix: string, length: number): string[] {
  return Array.from({ length }, (_value, index) => `${prefix}-${index + 1}`)
}

function insertAt(lines: string[], index: number, inserted: string[]): string[] {
  return [...lines.slice(0, index), ...inserted, ...lines.slice(index)]
}

function toneForScenario(scenario: PairScenario): Tone {
  if (scenario === 'replace') return 'replace'
  if (scenario === 'rename') return 'rename'
  return 'meta'
}

function toneLabel(tone: Tone): string {
  const labels: Record<Tone, string> = {
    plain: '无变更',
    insert: '新增',
    delete: '删除',
    replace: '替换',
    move: '移动',
    meta: '元数据',
    rename: '改名',
    reorder: '重排',
  }
  return labels[tone]
}

function expectValidRows(rows: MergedRow[]): void {
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.every((row) => row.oldLine !== null || row.newLine !== null)).toBe(true)
  const keys = rows.map((row) => row.key)
  expect(new Set(keys).size).toBe(keys.length)
  for (const row of rows) {
    const expectedKey = `${row.oldLine?.key ?? '_'}|${row.newLine?.key ?? '_'}`
    expect(row.key).toBe(expectedKey)
  }
}
