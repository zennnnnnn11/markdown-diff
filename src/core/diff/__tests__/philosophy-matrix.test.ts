import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../parser'
import { transformMarkdown } from '../../transformer'
import { diffMarkdownTrees } from '../index'
import type { DiffChange, DiffOptions } from '../types'

function flatten(change: DiffChange): DiffChange[] {
  return [change, ...change.children.flatMap(flatten)]
}

async function diffMarkdown(
  oldMarkdown: string,
  newMarkdown = oldMarkdown,
  options?: Partial<DiffOptions>,
) {
  const oldTree = transformMarkdown(await parseMarkdown(oldMarkdown))
  const newTree = transformMarkdown(await parseMarkdown(newMarkdown))
  return diffMarkdownTrees(oldTree, newTree, options)
}

function sectionTitle(node: unknown): string | undefined {
  return node && typeof node === 'object' && 'title' in node ? String((node as { title?: unknown }).title ?? '') : undefined
}

describe('testing philosophy matrix', () => {
  describe('equal basics', () => {
    it('EQ-001: empty documents stay fully equal with zero summary counts', async () => {
      const result = await diffMarkdown('', '')

      expect(result.root.primaryOp).toBe('equal')
      expect(result.stats).toEqual({
        inserts: 0,
        deletes: 0,
        replaces: 0,
        moves: 0,
        metaUpdates: 0,
        renames: 0,
        reorders: 0,
      })
      expect(result.quality).toEqual({
        degradedCount: 0,
        inlineDeferredCount: 0,
        warningCount: 0,
      })
    })

    it('EQ-004: nested headings remain equal without losing hierarchy', async () => {
      const result = await diffMarkdown('# A\n## B\n### C')
      const headings = flatten(result.root).filter((change) => change.kind === 'heading')

      expect(headings).toHaveLength(1)
      expect(headings.every((change) => change.primaryOp === 'equal')).toBe(true)
      expect(headings.map((change) => sectionTitle(change.newNode))).toEqual(['A'])
    })

    it('EQ-005/EQ-006: ordered and unordered list items remain equal', async () => {
      const ordered = await diffMarkdown('1. a\n2. b')
      const unordered = await diffMarkdown('- a\n- b')

      expect(flatten(ordered.root).filter((change) => change.kind === 'listItem').every((change) => change.primaryOp === 'equal')).toBe(true)
      expect(flatten(unordered.root).filter((change) => change.kind === 'listItem').every((change) => change.primaryOp === 'equal')).toBe(true)
    })

    it.each([
      ['EQ-008', '```js\nconst a=1\n```', 'code'],
      ['EQ-009', '| a | b |\n| --- | --- |', 'table'],
      ['EQ-010', '> quote', 'blockquote'],
      ['EQ-012', '[id]: https://example.com', 'definition'],
      ['EQ-013', '---\ntitle: x\n---', 'frontmatter'],
      ['EQ-014', '<div>x</div>', 'html'],
      ['EQ-015', '$$\nx=1\n$$', 'math'],
    ])('%s: equal node types stay equal (%s)', async (_id, markdown, kindOrType) => {
      const result = await diffMarkdown(markdown)
      const changes = flatten(result.root)
      const target = changes.find((change) => change.kind === kindOrType || change.blockType === kindOrType)

      expect(target).toBeDefined()
      expect(target?.primaryOp).toBe('equal')
    })
  })

  describe('insert/delete basics', () => {
    it('IN-003: inserting a middle heading preserves neighbors and marks the inserted heading', async () => {
      const result = await diffMarkdown('# A\n\n# C', '# A\n\n# B\n\n# C')
      const headings = flatten(result.root).filter((change) => change.kind === 'heading')
      const inserted = headings.find((change) => sectionTitle(change.newNode) === 'B')

      expect(inserted?.primaryOp).toBe('insert')
      expect(headings.some((change) => sectionTitle(change.oldNode) === 'A' && change.primaryOp === 'equal')).toBe(true)
      expect(headings.some((change) => sectionTitle(change.oldNode) === 'C' && change.primaryOp === 'equal')).toBe(true)
    })

    it('IN-005: inserting a list item keeps surrounding list items equal', async () => {
      const result = await diffMarkdown('- a\n- c', '- a\n- b\n- c')
      const listItems = flatten(result.root).filter((change) => change.kind === 'listItem')

      expect(listItems.filter((change) => change.primaryOp === 'insert')).toHaveLength(1)
      expect(listItems.filter((change) => change.primaryOp === 'equal')).toHaveLength(2)
    })

    it('IN-019: inserting frontmatter at the document head keeps the heading equal', async () => {
      const result = await diffMarkdown('# A', '---\nx: 1\n---\n# A')
      const frontmatter = flatten(result.root).find((change) => change.kind === 'frontmatter')
      const heading = flatten(result.root).find((change) => change.kind === 'heading')

      expect(frontmatter?.primaryOp).toBe('insert')
      expect(heading?.primaryOp).toBe('equal')
    })

    it('DL-003: deleting a middle heading preserves neighbors and marks the deleted heading', async () => {
      const result = await diffMarkdown('# A\n\n# B\n\n# C', '# A\n\n# C')
      const headings = flatten(result.root).filter((change) => change.kind === 'heading')
      const deleted = headings.find((change) => sectionTitle(change.oldNode) === 'B')

      expect(deleted?.primaryOp).toBe('delete')
      expect(headings.some((change) => sectionTitle(change.oldNode) === 'A' && change.primaryOp === 'equal')).toBe(true)
      expect(headings.some((change) => sectionTitle(change.oldNode) === 'C' && change.primaryOp === 'equal')).toBe(true)
    })

    it('DL-012: deleting frontmatter keeps the following heading equal', async () => {
      const result = await diffMarkdown('---\na: 1\n---\n# A', '# A')
      const frontmatter = flatten(result.root).find((change) => change.kind === 'frontmatter')
      const heading = flatten(result.root).find((change) => change.kind === 'heading')

      expect(frontmatter?.primaryOp).toBe('delete')
      expect(heading?.primaryOp).toBe('equal')
    })
  })

  describe('replace and meta-update specifics', () => {
    it('RP-004/CD-001: code content changes yield code replace with line-level spans', async () => {
      const result = await diffMarkdown('```js\na=1\n```', '```js\na=2\n```')
      const code = flatten(result.root).find((change) => change.blockType === 'code')

      expect(code?.primaryOp).toBe('replace')
      expect(code?.codeSpans?.length).toBeGreaterThan(0)
    })

    it('RP-012/FN-002: footnote body changes stay paired and surface a content change', async () => {
      const result = await diffMarkdown('Text[^1]\n\n[^1]: old', 'Text[^1]\n\n[^1]: new')
      const footnote = flatten(result.root).find((change) => change.kind === 'footnote')

      expect(footnote?.oldId && footnote?.newId).toBeTruthy()
      expect(footnote?.primaryOp).not.toBe('insert')
      expect(footnote?.primaryOp).not.toBe('delete')
    })

    it('MU-004: code title changes are treated as metadata updates when content is unchanged', async () => {
      const result = await diffMarkdown(
        '```js title=\"old\"\nexport default {}\n```',
        '```js title=\"new\"\nexport default {}\n```',
      )
      const code = flatten(result.root).find((change) => change.blockType === 'code')

      expect(code?.primaryOp).toBe('meta-update')
      expect(code?.status.metaChanged).toBe(true)
    })

    it('MU-005/TD-003: table alignment-only changes surface as metadata updates', async () => {
      const result = await diffMarkdown(
        '| a | b |\n| :-- | :-- |\n| 1 | 2 |',
        '| a | b |\n| :--: | :--: |\n| 1 | 2 |',
      )
      const table = flatten(result.root).find((change) => change.blockType === 'table')

      expect(table?.primaryOp).toBe('meta-update')
      expect(table?.tableDiff?.alignmentChanged).toBe(true)
    })

    it('MU-009/MU-010: definition URL and title changes stay as metadata updates', async () => {
      const urlResult = await diffMarkdown('[id]: https://example.com/v1', '[id]: https://example.com/v2')
      const titleResult = await diffMarkdown(
        '[id]: https://example.com \"old title\"',
        '[id]: https://example.com \"new title\"',
      )
      const urlDefinition = flatten(urlResult.root).find((change) => change.blockType === 'definition' && change.oldId && change.newId)
      const titleDefinition = flatten(titleResult.root).find((change) => change.blockType === 'definition' && change.oldId && change.newId)

      expect(urlDefinition?.primaryOp).toBe('meta-update')
      expect(titleDefinition?.primaryOp).toBe('meta-update')
    })

    it('FN-004/FN-005: footnote inserts and deletes preserve the unchanged footnote', async () => {
      const inserted = await diffMarkdown('[^1]: a', '[^1]: a\n[^2]: b')
      const deleted = await diffMarkdown('[^1]: a\n[^2]: b', '[^1]: a')
      const insertedFootnotes = flatten(inserted.root).filter((change) => change.kind === 'footnote')
      const deletedFootnotes = flatten(deleted.root).filter((change) => change.kind === 'footnote')

      expect(insertedFootnotes.some((change) => change.primaryOp === 'insert')).toBe(true)
      expect(insertedFootnotes.some((change) => change.oldId && change.newId && change.primaryOp === 'equal')).toBe(true)
      expect(deletedFootnotes.some((change) => change.primaryOp === 'delete')).toBe(true)
      expect(deletedFootnotes.some((change) => change.oldId && change.newId && change.primaryOp === 'equal')).toBe(true)
    })

    it('DF-005/DF-006: definition inserts and deletes preserve the unchanged definition', async () => {
      const inserted = await diffMarkdown('[a]: https://example.com/a', '[a]: https://example.com/a\n[b]: https://example.com/b')
      const deleted = await diffMarkdown('[a]: https://example.com/a\n[b]: https://example.com/b', '[a]: https://example.com/a')
      const insertedDefinitions = flatten(inserted.root).filter((change) => change.blockType === 'definition')
      const deletedDefinitions = flatten(deleted.root).filter((change) => change.blockType === 'definition')

      expect(insertedDefinitions.some((change) => change.primaryOp === 'insert')).toBe(true)
      expect(insertedDefinitions.some((change) => change.oldId && change.newId && change.primaryOp === 'equal')).toBe(true)
      expect(deletedDefinitions.some((change) => change.primaryOp === 'delete')).toBe(true)
      expect(deletedDefinitions.some((change) => change.oldId && change.newId && change.primaryOp === 'equal')).toBe(true)
    })
  })

  describe('heading, paragraph, and inline matrix', () => {
    it('HD-005/HD-006: case-only and whitespace-only heading normalization does not break matching', async () => {
      const caseOnly = await diffMarkdown('# Title', '# title')
      const whitespaceOnly = await diffMarkdown('#  Title', '# Title')
      const caseHeading = flatten(caseOnly.root).find((change) => change.kind === 'heading')
      const whitespaceHeading = flatten(whitespaceOnly.root).find((change) => change.kind === 'heading')

      expect(caseHeading?.primaryOp).not.toBe('insert')
      expect(caseHeading?.primaryOp).not.toBe('delete')
      expect(whitespaceHeading?.primaryOp).not.toBe('insert')
      expect(whitespaceHeading?.primaryOp).not.toBe('delete')
    })

    it('HD-008: stable heading title with changed body keeps the heading paired and changes only descendants', async () => {
      const result = await diffMarkdown('## X\n\ntext', '## X\n\nnew')
      const heading = flatten(result.root).find((change) => change.kind === 'heading')
      const paragraph = flatten(result.root).find((change) => change.blockType === 'paragraph')

      expect(heading?.primaryOp).toBe('equal')
      expect(heading?.status.descendantChanged).toBe(true)
      expect(paragraph?.primaryOp).toBe('replace')
    })

    it('PG-003/PG-004: paragraph word insertions and deletions produce inline insert/delete spans', async () => {
      const inserted = await diffMarkdown('hello', 'hello world')
      const deleted = await diffMarkdown('hello world', 'hello')
      const insertedParagraph = flatten(inserted.root).find((change) => change.blockType === 'paragraph')
      const deletedParagraph = flatten(deleted.root).find((change) => change.blockType === 'paragraph')

      expect(insertedParagraph?.inlineSpans?.some((span) => span.wordSpans?.some((word) => word.op === 'insert'))).toBe(true)
      expect(deletedParagraph?.inlineSpans?.some((span) => span.wordSpans?.some((word) => word.op === 'delete'))).toBe(true)
    })

    it('IS-009/DG-001: very large paragraph changes defer inline spans instead of faking a replace-only answer', async () => {
      const repeatedOld = Array.from({ length: 400 }, (_, index) => `old${index}`).join(' ')
      const repeatedNew = Array.from({ length: 400 }, (_, index) => `new${index}`).join(' ')
      const result = await diffMarkdown(repeatedOld, repeatedNew, { maxInlineDiffMatrixCost: 0 })
      const paragraph = flatten(result.root).find((change) => change.blockType === 'paragraph')

      expect(paragraph?.warnings).toContain('inline-deferred')
      expect(result.quality.inlineDeferredCount).toBeGreaterThan(0)
    })
  })

  describe('move, reorder, and anchor stability', () => {
    it('MV-001/SR-003: sibling heading reorder does not degrade into delete plus insert', async () => {
      const result = await diffMarkdown('# A\n\n# B\n\n# C', '# B\n\n# A\n\n# C')
      const headings = flatten(result.root).filter((change) => change.kind === 'heading')

      expect(
        headings.filter(
          (change) =>
            ['A', 'B'].includes(sectionTitle(change.oldNode) ?? '') &&
            (change.primaryOp === 'delete' || change.primaryOp === 'insert'),
        ),
      ).toHaveLength(0)
      expect(headings.some((change) => change.status.movedWithinParent || change.primaryOp === 'move')).toBe(true)
    })

    it('MV-008/FN-007: footnote order changes preserve both footnotes as paired nodes', async () => {
      const result = await diffMarkdown('[^1]: a\n[^2]: b', '[^2]: b\n[^1]: a')
      const footnotes = flatten(result.root).filter((change) => change.kind === 'footnote')

      expect(footnotes.filter((change) => change.oldId && change.newId)).toHaveLength(2)
      expect(footnotes.some((change) => change.primaryOp === 'delete' || change.primaryOp === 'insert')).toBe(false)
    })

    it('DF-007/AN-005: definition reordering keeps both definitions matched', async () => {
      const result = await diffMarkdown(
        '[a]: https://example.com/a\n[b]: https://example.com/b',
        '[b]: https://example.com/b\n[a]: https://example.com/a',
      )
      const definitions = flatten(result.root).filter((change) => change.blockType === 'definition')

      expect(definitions.filter((change) => change.oldId && change.newId)).toHaveLength(2)
      expect(definitions.some((change) => change.primaryOp === 'delete' || change.primaryOp === 'insert')).toBe(false)
    })

    it('BQ-001/BQ-004: blockquote content changes and nested list removals stay localized to the quote subtree', async () => {
      const contentChanged = await diffMarkdown('> old', '> new')
      const nestedListChanged = await diffMarkdown('> - a\n> - b', '> - a')
      const contentQuote = flatten(contentChanged.root).find((change) => change.kind === 'blockquote')
      const nestedQuote = flatten(nestedListChanged.root).find((change) => change.kind === 'blockquote')

      expect(contentQuote?.primaryOp).not.toBe('insert')
      expect(contentQuote?.primaryOp).not.toBe('delete')
      expect(nestedQuote?.primaryOp).not.toBe('insert')
      expect(nestedQuote?.primaryOp).not.toBe('delete')
      expect(nestedQuote?.oldId && nestedQuote?.newId).toBeTruthy()
    })
  })

  describe('frontmatter and quality edges', () => {
    it('FM-006/FM-007: frontmatter array append and shrink are represented as metadata changes', async () => {
      const appended = await diffMarkdown('---\ntags: [a]\n---', '---\ntags: [a, b]\n---')
      const shrunk = await diffMarkdown('---\ntags: [a, b]\n---', '---\ntags: [a]\n---')
      const appendedFrontmatter = flatten(appended.root).find((change) => change.kind === 'frontmatter')
      const shrunkFrontmatter = flatten(shrunk.root).find((change) => change.kind === 'frontmatter')

      expect(appendedFrontmatter?.primaryOp).toBe('meta-update')
      expect(shrunkFrontmatter?.primaryOp).toBe('meta-update')
    })

    it('QS-005: empty diff quality summary stays all zero', async () => {
      const result = await diffMarkdown('', '')

      expect(result.quality).toEqual({
        degradedCount: 0,
        inlineDeferredCount: 0,
        warningCount: 0,
      })
    })

    it('FM-010/QS-004: invalid frontmatter falls back cleanly and surfaces no validator warnings', async () => {
      const result = await diffMarkdown('---\na: [1,\n---', '---\na: 1\n---')
      const frontmatter = flatten(result.root).find((change) => change.kind === 'frontmatter')

      expect(frontmatter).toBeDefined()
      expect(result.warnings.filter((warning) => warning.startsWith('invalid-meta-pair:'))).toEqual([])
    })
  })
})
