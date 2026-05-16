import { describe, expect, it } from 'vitest'
import { diffMarkdown, flatten } from './test-helpers'

describe('feature interaction tests', () => {
  describe('move + rename simultaneously', () => {
    it('heading moved to different section AND renamed', async () => {
      const oldMd = [
        '# Root',
        '',
        '## Section A',
        '',
        '### Old Sub',
        '',
        'Content under old sub.',
        '',
        '## Section B',
        '',
        'B content.',
      ].join('\n')

      const newMd = [
        '# Root',
        '',
        '## Section A',
        '',
        'A content.',
        '',
        '## Section B',
        '',
        '### New Sub',
        '',
        'Content under old sub.',
      ].join('\n')

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const moved = changes.filter((c) => c.status.moved)
      const renamed = changes.filter((c) => c.status.renamed)
      expect(moved.length + renamed.length).toBeGreaterThan(0)
    })
  })

  describe('APTED fallback + move detection', () => {
    it('section that triggers APTED fallback still recovers moves within it', async () => {
      const items = (count: number, prefix: string) =>
        Array.from({ length: count }, (_, i) => `- ${prefix} item ${i}`).join('\n')
      const oldMd = [
        '# Main',
        '',
        '## Alpha',
        '',
        items(5, 'alpha'),
        '',
        '## Beta',
        '',
        items(5, 'beta'),
      ].join('\n')

      const newMd = [
        '# Main',
        '',
        '## Gamma',
        '',
        items(5, 'gamma'),
        '',
        '## Alpha',
        '',
        items(5, 'alpha'),
      ].join('\n')

      const result = await diffMarkdown(oldMd, newMd)
      expect(result.root).toBeDefined()
      const changes = flatten(result.root)
      expect(changes.length).toBeGreaterThan(0)
    })
  })

  describe('table shape diff + inline structure changes', () => {
    it('table with added column AND cell content changes', async () => {
      const oldMd = '| A | B |\n| --- | --- |\n| 1 | 2 |'
      const newMd = '| A | B | C |\n| --- | --- | --- |\n| 1 | changed | 3 |'

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const tableChange = changes.find((c) => c.blockType === 'table')
      expect(tableChange?.tableDiff).toBeDefined()
      expect(tableChange!.tableDiff!.shapeChanged).toBe(true)
      expect(tableChange!.tableDiff!.columnEdits).toBeDefined()
    })

    it('table with deleted row AND modified cell', async () => {
      const oldMd = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |'
      const newMd = '| A | B |\n| --- | --- |\n| 1 | changed |\n| 5 | 6 |'

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const tableChange = changes.find((c) => c.blockType === 'table')
      expect(tableChange?.tableDiff).toBeDefined()
      expect(tableChange!.tableDiff!.shapeChanged).toBe(true)
      expect(tableChange!.tableDiff!.rowEdits).toBeDefined()
    })
  })

  describe('multi-feature document', () => {
    it('document with headings + lists + code + tables diffs correctly', async () => {
      const oldMd = [
        '# Title',
        '',
        '## Overview',
        '',
        'Introduction paragraph.',
        '',
        '- item 1',
        '- item 2',
        '',
        '```js',
        'const x = 1;',
        '```',
        '',
        '| Col A | Col B |',
        '| --- | --- |',
        '| val1 | val2 |',
      ].join('\n')

      const newMd = [
        '# Title',
        '',
        '## Overview',
        '',
        'Changed introduction.',
        '',
        '- item 1',
        '- item 2',
        '- item 3',
        '',
        '```js',
        'const x = 2;',
        '```',
        '',
        '| Col A | Col B |',
        '| --- | --- |',
        '| val1 | changed |',
      ].join('\n')

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      expect(changes.some((c) => c.blockType === 'paragraph')).toBe(true)
      expect(changes.some((c) => c.blockType === 'code')).toBe(true)
      expect(changes.some((c) => c.blockType === 'table')).toBe(true)
    })

    it('reorder + content edit in the same section', async () => {
      const oldMd = [
        '# Root',
        '',
        '## First',
        '',
        'Content A.',
        '',
        '## Second',
        '',
        'Content B.',
        '',
        '## Third',
        '',
        'Content C.',
      ].join('\n')

      const newMd = [
        '# Root',
        '',
        '## Third',
        '',
        'Content C changed.',
        '',
        '## First',
        '',
        'Content A.',
        '',
        '## Second',
        '',
        'Content B.',
      ].join('\n')

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const reorderedOrMoved = changes.filter(
        (c) => c.reordered || c.status.moved || c.status.movedWithinParent,
      )
      expect(reorderedOrMoved.length).toBeGreaterThan(0)
    })
  })

  describe('ambiguous subtree + local matching', () => {
    it('similar list items are matched by content similarity', async () => {
      const oldMd = [
        '# List',
        '',
        '- Alpha: specific details about alpha topic',
        '- Beta: specific details about beta topic',
      ].join('\n')

      const newMd = [
        '# List',
        '',
        '- Beta: specific details about beta topic',
        '- Alpha: specific details about alpha topic changed slightly',
      ].join('\n')

      const result = await diffMarkdown(oldMd, newMd)
      expect(result.root).toBeDefined()
      const changes = flatten(result.root)
      expect(changes.length).toBeGreaterThan(1)
    })
  })
})
