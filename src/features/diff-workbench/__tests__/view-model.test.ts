import { describe, expect, it } from 'vitest'

import {
  buildDebugSnapshot,
  buildDetailPanel,
  buildProjectionLines,
  flattenChanges,
  lineMatchesFilter,
  runMarkdownDiff,
} from '../view-model'

describe('diff workbench view-model', () => {
  it('projects paragraph replacements into line tones and inline segments', async () => {
    const result = await runMarkdownDiff('# Intro\n\nhello old world', '# Intro\n\nhello new world')
    const lines = buildProjectionLines('# Intro\n\nhello new world', result)
    const paragraphLine = lines[2]
    const paragraphChange = flattenChanges(result.root).find((change) => change.blockType === 'paragraph')
    const detail = buildDetailPanel(paragraphChange)

    expect(paragraphLine).toBeDefined()
    expect(paragraphLine?.baseTone).toBe('replace')
    expect(detail?.newInlineSegments?.some((segment) => segment.tone === 'replace')).toBe(true)
    expect(detail?.newInlineSegments?.map((segment) => segment.text).join('')).toContain('new')
  })

  it('preserves original spacing and casing when rendering new-side inline highlights', async () => {
    const result = await runMarkdownDiff(
      'The default configuration favors conservative matching.',
      'The default configuration favors balanced matching.',
    )
    const paragraphChange = flattenChanges(result.root).find((change) => change.blockType === 'paragraph')
    const detail = buildDetailPanel(paragraphChange)

    expect(detail?.newInlineSegments?.map((segment) => segment.text).join('')).toBe(
      'The default configuration favors balanced matching.',
    )
    expect(detail?.newInlineSegments?.some((segment) => segment.text === ' balanced' || segment.text === 'balanced')).toBe(true)
  })

  it('projects heading renames as rename tone and exposes detail metadata', async () => {
    const result = await runMarkdownDiff('# Old Name\n\nBody', '# New Name\n\nBody')
    const lines = buildProjectionLines('# New Name\n\nBody', result)
    const headingChange = flattenChanges(result.root).find((change) => change.kind === 'heading' && change.status.renamed)
    const detail = buildDetailPanel(headingChange)

    expect(lines[0]?.baseTone).toBe('rename')
    expect(lines[0]?.matchedTones).toContain('rename')
    expect(detail?.newInlineSegments?.[0]).toEqual({ text: '# ', tone: 'plain' })
    expect(detail?.newInlineSegments?.some((segment) => segment.tone === 'rename')).toBe(true)
  })

  it('projects frontmatter metadata updates back to source lines', async () => {
    const result = await runMarkdownDiff(
      '---\nversion: 2.0.0\nstatus: draft\n---',
      '---\nversion: 2.1.0\nstatus: draft\n---',
    )
    const lines = buildProjectionLines('---\nversion: 2.1.0\nstatus: draft\n---', result)

    expect(lines[1]?.text).toBe('version: 2.1.0')
    expect(lines[1]?.baseTone).toBe('meta')
    expect(lines[1]?.changeKeys.length).toBeGreaterThan(0)
  })

  it('formats metadata values for nested frontmatter detail views', async () => {
    const result = await runMarkdownDiff(
      '---\nreview:\n  required: true\n  reviewer: bob\n---',
      '---\nreview:\n  required: true\n  reviewer: dana\n---',
    )
    const frontmatterChange = flattenChanges(result.root).find((change) => change.kind === 'frontmatter')
    const detail = buildDetailPanel(frontmatterChange)

    expect(detail?.metadataChanges?.[0]?.path).toBe('$.review.reviewer')
    expect(detail?.metadataChanges?.[0]?.oldValueText).toBe('bob')
    expect(detail?.metadataChanges?.[0]?.newValueText).toBe('dana')
    expect(detail?.newHighlightedLines?.[3]?.segments?.some((segment) => segment.tone === 'meta')).toBe(true)
    expect(detail?.newHighlightedLines?.[3]?.segments?.map((segment) => segment.text).join('')).toBe(
      '  reviewer: dana',
    )
  })

  it('falls back to highlighting the full frontmatter block for list metadata changes', async () => {
    const result = await runMarkdownDiff(
      [
        '---',
        'features:',
        '  - parser',
        '  - transformer',
        '  - diff',
        '---',
      ].join('\n'),
      [
        '---',
        'features:',
        '  - parser',
        '  - transformer',
        '  - diff',
        '  - renderer',
        '---',
      ].join('\n'),
    )
    const frontmatterChange = flattenChanges(result.root).find((change) => change.kind === 'frontmatter')
    const detail = buildDetailPanel(frontmatterChange)
    const featureBlock = detail?.newHighlightedLines?.slice(1, 6) ?? []

    expect(featureBlock).toHaveLength(5)
    expect(featureBlock.every((line) => line.tone === 'meta')).toBe(true)
    expect(featureBlock.map((line) => line.text)).toEqual([
      'features:',
      '  - parser',
      '  - transformer',
      '  - diff',
      '  - renderer',
    ])
  })

  it('renders code diffs on the new side without leaking deleted characters', async () => {
    const result = await runMarkdownDiff(
      '```ts\nconst value = oldName\n```',
      '```ts\nconst value = name\n```',
    )
    const codeChange = flattenChanges(result.root).find((change) => change.blockType === 'code')
    const detail = buildDetailPanel(codeChange)
    const changedLine = detail?.codeLines?.find((line) => line.newLine?.includes('const value'))

    expect(changedLine?.segments?.map((segment) => segment.text).join('')).toBe('const value = name')
    expect(changedLine?.segments?.some((segment) => segment.tone === 'replace')).toBe(true)
    expect(changedLine?.segments?.map((segment) => segment.text).join('')).not.toContain('oldName')
  })

  it('highlights code fence metadata updates when code content stays the same', async () => {
    const result = await runMarkdownDiff(
      '```ts title=\"old\"\nconst value = 1\n```',
      '```tsx title=\"new\"\nconst value = 1\n```',
    )
    const codeChange = flattenChanges(result.root).find((change) => change.blockType === 'code' && change.primaryOp === 'meta-update')
    const detail = buildDetailPanel(codeChange)

    expect(detail?.codeLines).toBeUndefined()
    expect(detail?.newHighlightedLines?.[0]?.segments?.some((segment) => segment.text.includes('tsx'))).toBe(true)
    expect(detail?.newHighlightedLines?.[0]?.segments?.some((segment) => segment.text.includes('title=\"new\"'))).toBe(true)
    expect(detail?.newContent).toContain('```tsx title="new"')
  })

  it('builds table cell highlights from table diff spans', async () => {
    const result = await runMarkdownDiff(
      '| name | age |\n| --- | --- |\n| Alice | 20 |',
      '| name | age |\n| --- | --- |\n| Alice | 21 |',
    )
    const tableChange = flattenChanges(result.root).find((change) => change.blockType === 'table')
    const detail = buildDetailPanel(tableChange)
    const changedCell = detail?.newTableRows?.[1]?.cells[1]

    expect(changedCell?.text).toBe('21')
    expect(changedCell?.tone).toBe('replace')
    expect(changedCell?.segments?.map((segment) => segment.text).join('')).toBe('21')
  })

  it('highlights changed definition metadata fields on the new side', async () => {
    const result = await runMarkdownDiff(
      '[ref]: https://old.example.com \"Old\"\n\nbody',
      '[ref]: https://new.example.com \"New\"\n\nbody',
    )
    const definitionChange = flattenChanges(result.root).find((change) => change.blockType === 'definition' && change.oldId && change.newId)
    const detail = buildDetailPanel(definitionChange)
    const line = detail?.newHighlightedLines?.[0]

    expect(line?.segments?.some((segment) => segment.text.includes('https://new.example.com'))).toBe(true)
    expect(line?.segments?.some((segment) => segment.text.includes('New'))).toBe(true)
  })

  it('highlights pure definition renames on the new side', async () => {
    const result = await runMarkdownDiff(
      '[ref]: https://example.com/docs \"Docs\"\n\nbody',
      '[ref-new]: https://example.com/docs \"Docs\"\n\nbody',
    )
    const definitionChange = flattenChanges(result.root).find((change) => change.blockType === 'definition' && change.oldId && change.newId)
    const detail = buildDetailPanel(definitionChange)
    const line = detail?.newHighlightedLines?.[0]

    expect(line?.segments?.some((segment) => segment.text.includes('ref-new'))).toBe(true)
  })

  it('matches warning and tone filters against projected lines', () => {
    const warningLine = {
      key: 'line:1',
      lineNumber: 1,
      text: 'warn',
      baseTone: 'meta' as const,
      matchedTones: ['meta' as const],
      changeKeys: ['change:1'],
      pairKind: undefined as 'match' | 'align' | undefined,
      warnings: ['inline-deferred'],
    }

    expect(lineMatchesFilter(warningLine, 'meta')).toBe(true)
    expect(lineMatchesFilter(warningLine, 'warning')).toBe(true)
    expect(lineMatchesFilter(warningLine, 'replace')).toBe(false)
  })

  it('propagates pairKind from dominant change to projected line', async () => {
    const result = await runMarkdownDiff('# Title\n\nParagraph text', '# Title\n\nParagraph text')
    const lines = buildProjectionLines('# Title\n\nParagraph text', result)
    const matchLine = lines.find((line) => line.pairKind === 'match')

    expect(matchLine?.pairKind).toBe('match')
  })

  it('exposes pairKind in detail panel for matched changes', async () => {
    const result = await runMarkdownDiff('# Title\n\nParagraph text', '# Title\n\nParagraph text')
    const headingChange = flattenChanges(result.root).find((change) => change.kind === 'heading' && change.pairKind === 'match')
    const detail = buildDetailPanel(headingChange)

    expect(detail?.pairKind).toBe('match')
  })

  it('exposes pairKind in detail panel for aligned (replace) changes', async () => {
    const result = await runMarkdownDiff('# Old Title\n\nold paragraph', '# New Title\n\nnew paragraph')
    const headingChange = flattenChanges(result.root).find(
      (change) => change.kind === 'heading' && change.pairKind === 'align',
    )
    const detail = buildDetailPanel(headingChange)

    expect(detail?.pairKind).toBe('align')
  })

  it('populates moveInfo in detail panel when changeIndex is provided', () => {
    const expectedPeerKey = 'match:b1:b3'
    const movePeerKey = 'move:b1:b3'
    const sourceChange: any = {
      entity: 'section',
      kind: 'heading',
      primaryOp: 'move',
      moveRole: 'source',
      movePeerKey,
      logicalMoveId: movePeerKey,
      pairKey: 'match:b1:b3',
      oldId: 'b1',
      oldNode: { kind: 'heading', title: 'Moved Heading', headingDepth: 2, items: [] },
      pairKind: 'match',
      status: {
        isMatchPair: true, isAlignedPair: false, moved: true, movedWithinParent: false,
        renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false,
        inlineStructureChanged: false,
      },
      summary: 'Move source',
      children: [],
      warnings: [],
    }

    const targetChange: any = {
      entity: 'section',
      kind: 'heading',
      primaryOp: 'move',
      moveRole: 'target',
      movePeerKey,
      logicalMoveId: movePeerKey,
      pairKey: 'match:b1:b3',
      newId: 'b3',
      newNode: { kind: 'heading', title: 'Moved Heading', headingDepth: 2, items: [] },
      pairKind: 'match',
      status: {
        isMatchPair: true, isAlignedPair: false, moved: true, movedWithinParent: false,
        renamed: false, selfChanged: false, descendantChanged: false, metaChanged: false,
        inlineStructureChanged: false,
      },
      summary: 'Move target',
      children: [],
      warnings: [],
    }

    const changeIndex = {
      byOldId: new Map([['b1', sourceChange]]),
      byNewId: new Map([['b3', targetChange]]),
      byPairKey: new Map([['match:b1:b3', targetChange]]),
    }

    const newIndex = {
      byId: new Map([['b3', { sourceRange: { start: { line: 5, column: 1 }, end: { line: 7, column: 1 } } }]]),
    } as any

    const detail = buildDetailPanel(sourceChange, changeIndex as any, newIndex)

    expect(detail?.moveInfo).toBeDefined()
    expect(detail?.moveInfo?.role).toBe('source')
    expect(detail?.moveInfo?.peerChangeKey).toBe(expectedPeerKey)
    expect(detail?.moveInfo?.peerLineNumber).toBe(5)
    expect(detail?.moveInfo?.peerHeading).toBe('Moved Heading')
  })

  it('provides no moveInfo for non-move changes', async () => {
    const result = await runMarkdownDiff('# Title\n\nparagraph', '# Title\n\nparagraph')
    const headingChange = flattenChanges(result.root).find((change) => change.kind === 'heading')
    const detail = buildDetailPanel(headingChange)

    expect(detail?.moveInfo).toBeUndefined()
  })

  it('includes quality, global warnings, and fallback markers in debug snapshots', async () => {
    const result = await runMarkdownDiff('# Alpha\n\nBody text', '# Beta\n\nBody text')
    result.warnings.push('invalid-equal-state:test')
    const firstChange = flattenChanges(result.root).find((change) => change.kind === 'heading')
    if (firstChange) {
      firstChange.degraded = true
      firstChange.shortHeadingFallback = true
    }

    const snapshot = buildDebugSnapshot(result)
    const degradedEntry = snapshot.changes.find((change) => change.degraded)

    expect(snapshot.quality).toEqual(result.quality)
    expect(snapshot.warnings).toContain('invalid-equal-state:test')
    expect(degradedEntry?.degraded).toBe(true)
    expect(degradedEntry?.shortHeadingFallback).toBe(true)
  })
})
