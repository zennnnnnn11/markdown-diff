import { describe, expect, it } from 'vitest'
import {
  computeTableMetadataChange,
  isStructuralOnlyTableChange,
  metadataChangeToDiff,
} from '../engine/table-diff'
import { diffMarkdown, flatten } from './test-helpers'

describe('table-diff', () => {
  describe('dependency direction', () => {
    it('renames.ts imports from table-diff.ts, not presentation.ts', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const renamesSource = fs.readFileSync(
        path.resolve(__dirname, '../engine/renames.ts'),
        'utf-8',
      )
      expect(renamesSource).toContain("from './table-diff'")
      expect(renamesSource).not.toMatch(
        /import\s*\{[^}]*(?:computeTableMetadataChange|isStructuralOnlyTableChange|metadataChangeToDiff)[^}]*\}\s*from\s*['"]\.\/presentation['"]/,
      )
    })

    it('table-diff.ts does not import from presentation.ts', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const tableDiffSource = fs.readFileSync(
        path.resolve(__dirname, '../engine/table-diff.ts'),
        'utf-8',
      )
      expect(tableDiffSource).not.toContain("from './presentation'")
    })

    it('table-diff.ts imports from inline-diff.ts', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const tableDiffSource = fs.readFileSync(
        path.resolve(__dirname, '../engine/table-diff.ts'),
        'utf-8',
      )
      expect(tableDiffSource).toContain("from './inline-diff'")
    })
  })

  describe('computeTableMetadataChange', () => {
    it('detects cell content changes in same-shape tables', async () => {
      const oldMd = '| A | B |\n| --- | --- |\n| 1 | 2 |'
      const newMd = '| A | B |\n| --- | --- |\n| 1 | 3 |'

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const tableChange = changes.find((c) => c.blockType === 'table')
      expect(tableChange).toBeDefined()
    })

    it('detects shape changes when rows differ', async () => {
      const oldMd = '| A | B |\n| --- | --- |\n| 1 | 2 |'
      const newMd = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'

      const result = await diffMarkdown(oldMd, newMd)
      expect(result.root).toBeDefined()
    })

    it('detects alignment-only changes', async () => {
      const oldMd = '| A | B |\n| :--- | :--- |\n| 1 | 2 |'
      const newMd = '| A | B |\n| ---: | ---: |\n| 1 | 2 |'

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const tableChanges = changes.filter((c) => c.blockType === 'table')
      expect(tableChanges.length).toBeGreaterThan(0)
    })
  })

  describe('isStructuralOnlyTableChange', () => {
    it('returns false when no structure changed', () => {
      const node = { block: { type: 'table', children: [] } } as any
      const tableDiff = {
        structureChanged: false,
        shapeChanged: false,
        alignmentChanged: false,
        cellDiffs: [],
      }
      expect(isStructuralOnlyTableChange(node, node, tableDiff)).toBe(false)
    })

    it('returns false when structure changed but cells also differ', () => {
      const node = { block: { type: 'table', children: [] } } as any
      const tableDiff = {
        structureChanged: true,
        shapeChanged: false,
        alignmentChanged: true,
        cellDiffs: [{ row: 0, column: 0, spans: [] }],
      }
      expect(isStructuralOnlyTableChange(node, node, tableDiff)).toBe(false)
    })
  })

  describe('metadataChangeToDiff', () => {
    it('creates a metadata DiffChange node', () => {
      const change = {
        op: 'replace' as const,
        path: 'title',
        oldValue: 'old',
        newValue: 'new',
      }
      const result = metadataChangeToDiff(change)
      expect(result.entity).toBe('metadata')
      expect(result.primaryOp).toBe('meta-update')
      expect(result.status.metaChanged).toBe(true)
      expect(result.summary).toContain('title')
      expect(result.metadataChanges).toHaveLength(1)
      expect(result.children).toHaveLength(0)
    })

    it('handles insert operations', () => {
      const change = {
        op: 'insert' as const,
        path: 'tags[0]',
        newValue: 'test',
      }
      const result = metadataChangeToDiff(change)
      expect(result.primaryOp).toBe('meta-update')
      expect(result.summary).toContain('insert')
      expect(result.summary).toContain('tags[0]')
    })

    it('handles delete operations', () => {
      const change = {
        op: 'delete' as const,
        path: 'author',
        oldValue: 'Alice',
      }
      const result = metadataChangeToDiff(change)
      expect(result.primaryOp).toBe('meta-update')
      expect(result.summary).toContain('delete')
    })
  })

  describe('re-exports from presentation.ts', () => {
    it('presentation.ts re-exports all table-diff functions', async () => {
      const presentation = await import('../engine/presentation')
      expect(presentation.computeTableMetadataChange).toBeDefined()
      expect(presentation.isStructuralOnlyTableChange).toBeDefined()
      expect(presentation.metadataChangeToDiff).toBeDefined()
    })

    it('presentation.ts re-exports all inline-diff functions', async () => {
      const presentation = await import('../engine/presentation')
      expect(presentation.diffInlineNodes).toBeDefined()
      expect(presentation.diffWordText).toBeDefined()
      expect(presentation.diffWordTextSync).toBeDefined()
      expect(presentation.buildInlineReplaceSpan).toBeDefined()
      expect(presentation.diffCharacters).toBeDefined()
      expect(presentation.coalesceTextSpans).toBeDefined()
      expect(presentation.hasMeaningfulInlineDiff).toBeDefined()
    })
  })

  describe('table shape diff (row/column alignment)', () => {
    it('produces rowEdits when a row is added', async () => {
      const oldMd = '| A | B |\n| --- | --- |\n| 1 | 2 |'
      const newMd = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const tableChange = changes.find((c) => c.blockType === 'table')
      expect(tableChange?.tableDiff?.rowEdits).toBeDefined()
      const insertRows = tableChange!.tableDiff!.rowEdits!.filter((r) => r.op === 'insert')
      expect(insertRows.length).toBe(1)
    })

    it('produces rowEdits when a row is deleted', async () => {
      const oldMd = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'
      const newMd = '| A | B |\n| --- | --- |\n| 1 | 2 |'

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const tableChange = changes.find((c) => c.blockType === 'table')
      expect(tableChange?.tableDiff?.rowEdits).toBeDefined()
      const deleteRows = tableChange!.tableDiff!.rowEdits!.filter((r) => r.op === 'delete')
      expect(deleteRows.length).toBe(1)
    })

    it('produces columnEdits when a column is added', async () => {
      const oldMd = '| A | B |\n| --- | --- |\n| 1 | 2 |'
      const newMd = '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |'

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const tableChange = changes.find((c) => c.blockType === 'table')
      expect(tableChange?.tableDiff?.columnEdits).toBeDefined()
      const insertCols = tableChange!.tableDiff!.columnEdits!.filter((c) => c.op === 'insert')
      expect(insertCols.length).toBe(1)
    })

    it('produces cell diffs for aligned rows with content changes', async () => {
      const oldMd = '| A | B |\n| --- | --- |\n| 1 | 2 |'
      const newMd = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 1 | changed |'

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const tableChange = changes.find((c) => c.blockType === 'table')
      expect(tableChange?.tableDiff?.shapeChanged).toBe(true)
      expect(tableChange?.tableDiff?.rowEdits).toBeDefined()
    })

    it('same-shape tables still use the original logic without rowEdits', async () => {
      const oldMd = '| A | B |\n| --- | --- |\n| 1 | 2 |'
      const newMd = '| A | B |\n| --- | --- |\n| 1 | 3 |'

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const tableChange = changes.find((c) => c.blockType === 'table')
      expect(tableChange?.tableDiff?.shapeChanged).toBe(false)
      expect(tableChange?.tableDiff?.rowEdits).toBeUndefined()
      expect(tableChange?.tableDiff?.cellDiffs.length).toBeGreaterThan(0)
    })
  })

  describe('behavioral equivalence', () => {
    it('table diff in integration produces same result', async () => {
      const oldMd = [
        '| Name | Age |',
        '| --- | --- |',
        '| Alice | 30 |',
        '| Bob | 25 |',
      ].join('\n')

      const newMd = [
        '| Name | Age |',
        '| --- | --- |',
        '| Alice | 31 |',
        '| Bob | 25 |',
      ].join('\n')

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const tableChange = changes.find((c) => c.blockType === 'table')
      expect(tableChange).toBeDefined()
      expect(tableChange!.tableDiff).toBeDefined()
      expect(tableChange!.tableDiff!.cellDiffs.length).toBeGreaterThan(0)
    })

    it('rename detection still works after refactoring', async () => {
      const oldMd = '# Old Title\n\nContent here.\n'
      const newMd = '# New Title\n\nContent here.\n'

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const renamed = changes.filter((c) => c.status.renamed)
      expect(renamed.length).toBeGreaterThan(0)
    })
  })
})
