import { describe, expect, it } from 'vitest'
import { diffMarkdown, flatten } from './test-helpers'

describe('matching layer — diverse examples', () => {
  describe('inline diff quality', () => {
    it('produces replace spans with correct oldText/newText for formatting changes', async () => {
      const oldMd = [
        '# Doc',
        '',
        'This is **bold text** and *italic text* with a [link](http://old.com).',
      ].join('\n')
      const newMd = [
        '# Doc',
        '',
        'This is **stronger text** and *emphasized text* with a [link](http://new.com).',
      ].join('\n')
      const result = await diffMarkdown(oldMd, newMd)
      const paragraph = flatten(result.root).find((c) => c.blockType === 'paragraph')

      expect(paragraph?.primaryOp).toBe('replace')
      expect(paragraph?.oldId && paragraph?.newId).toBeTruthy()

      const replaceSpans = paragraph?.inlineSpans?.filter((s) => s.op === 'replace') ?? []
      expect(replaceSpans.length).toBeGreaterThanOrEqual(1)

      const allOldTexts = replaceSpans.map((s) => s.oldText ?? '').join('')
      const allNewTexts = replaceSpans.map((s) => s.newText ?? '').join('')
      expect(allOldTexts).toContain('bold text')
      expect(allNewTexts).toContain('stronger text')
    })
  })

  describe('paragraph disambiguation', () => {
    it('pairs each paragraph with its closest match among multiple candidates', async () => {
      const oldMd = [
        '# Doc',
        '',
        'The quick brown fox jumps over the lazy dog.',
        '',
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        '',
        'Pack my box with five dozen liquor jugs.',
      ].join('\n')
      const newMd = [
        '# Doc',
        '',
        'The quick red fox leaps over the lazy dog.',
        '',
        'Lorem ipsum dolor sit amet, consectetuer adipiscing elit.',
        '',
        'Pack my box with five dozen liquor jugs.',
      ].join('\n')
      const result = await diffMarkdown(oldMd, newMd)
      const paragraphs = flatten(result.root).filter((c) => c.blockType === 'paragraph')

      const replaced = paragraphs.filter((p) => p.primaryOp === 'replace')
      const equal = paragraphs.filter((p) => p.primaryOp === 'equal')

      expect(replaced).toHaveLength(2)
      expect(equal).toHaveLength(1)
      expect(result.stats.inserts).toBe(0)
      expect(result.stats.deletes).toBe(0)
    })

    it('distinguishes partial edit from complete rewrite', async () => {
      const oldMd = [
        '# Page',
        '',
        'Alpha paragraph with specific content about algorithms.',
        '',
        'Beta paragraph discussing data structures and trees.',
      ].join('\n')
      const newMd = [
        '# Page',
        '',
        'Alpha paragraph with specific content about sorting algorithms.',
        '',
        'Completely unrelated text about cooking recipes and ingredients.',
      ].join('\n')
      const result = await diffMarkdown(oldMd, newMd)
      const paragraphs = flatten(result.root).filter((c) => c.blockType === 'paragraph')

      const replaced = paragraphs.filter((p) => p.primaryOp === 'replace')
      expect(replaced).toHaveLength(2)

      const alphaChange = replaced.find((p) =>
        p.inlineSpans?.some(
          (s) => s.oldText?.includes('algorithms') || s.newText?.includes('sorting'),
        ),
      )
      expect(alphaChange).toBeDefined()
      expect(alphaChange!.score).toBeGreaterThan(0.5)

      const betaChange = replaced.find((p) => p !== alphaChange)
      expect(betaChange).toBeDefined()
      expect(betaChange!.score!).toBeLessThan(alphaChange!.score!)
    })
  })

  describe('list matching', () => {
    it('matches modified list items as replace with exact stats', async () => {
      const oldMd = [
        '# Lists',
        '',
        '- Level 1 item A',
        '  - Level 2 item A',
        '    - Level 3 item A',
        '  - Level 2 item B',
        '- Level 1 item B',
      ].join('\n')
      const newMd = [
        '# Lists',
        '',
        '- Level 1 item A',
        '  - Level 2 item A modified',
        '    - Level 3 item A',
        '  - Level 2 item B',
        '- Level 1 item B changed',
      ].join('\n')
      const result = await diffMarkdown(oldMd, newMd)

      expect(result.stats.replaces).toBeGreaterThanOrEqual(1)
      expect(result.stats.inserts).toBe(0)
      expect(result.stats.deletes).toBe(0)
      expect(result.stats.moves).toBe(0)
    })

    it('detects exactly one inserted list item', async () => {
      const oldMd = ['# Lists', '', '- Item A', '- Item C'].join('\n')
      const newMd = ['# Lists', '', '- Item A', '- Item B (new)', '- Item C'].join('\n')
      const result = await diffMarkdown(oldMd, newMd)

      expect(result.stats.inserts).toBeGreaterThanOrEqual(1)
      expect(result.stats.deletes).toBe(0)
      expect(result.stats.moves).toBe(0)
    })
  })

  describe('section reorder with content edits', () => {
    it('detects heading reorder and Beta content edit independently', async () => {
      const oldMd = [
        '# Doc',
        '',
        '## Alpha',
        '',
        'Alpha content stays same.',
        '',
        '## Beta',
        '',
        'Beta original content.',
        '',
        '## Gamma',
        '',
        'Gamma content stays same.',
      ].join('\n')
      const newMd = [
        '# Doc',
        '',
        '## Gamma',
        '',
        'Gamma content stays same.',
        '',
        '## Alpha',
        '',
        'Alpha content stays same.',
        '',
        '## Beta',
        '',
        'Beta updated content.',
      ].join('\n')
      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)

      const betaPara = changes.find((c) => c.blockType === 'paragraph' && c.primaryOp === 'replace')
      expect(betaPara).toBeDefined()
      expect(betaPara!.oldId && betaPara!.newId).toBeTruthy()

      const betaSpans = betaPara!.inlineSpans?.filter((s) => s.op === 'replace') ?? []
      expect(betaSpans.length).toBeGreaterThanOrEqual(1)
      const allOldText = betaSpans.map((s) => s.oldText ?? '').join('')
      expect(allOldText).toContain('original')
    })
  })

  describe('code block changes', () => {
    it('language-only change is meta-update with specific metadata diff', async () => {
      const oldMd = '# Code\n\n```javascript\nconsole.log("hello")\n```'
      const newMd = '# Code\n\n```typescript\nconsole.log("hello")\n```'
      const result = await diffMarkdown(oldMd, newMd)
      const code = flatten(result.root).find((c) => c.blockType === 'code')

      expect(code?.primaryOp).toBe('meta-update')
      expect(code?.status.metaChanged).toBe(true)
      expect(code?.status.selfChanged).toBe(false)
      expect(code?.pairKind).toBe('match')
    })

    it('language+content change is replace with meta flag set', async () => {
      const oldMd = '# Code\n\n```javascript\nconst x = 1\n```'
      const newMd = '# Code\n\n```typescript\nconst x: number = 1\n```'
      const result = await diffMarkdown(oldMd, newMd)
      const code = flatten(result.root).find((c) => c.blockType === 'code')

      expect(code?.primaryOp).toBe('replace')
      expect(code?.status.selfChanged).toBe(true)
      expect(code?.oldId && code?.newId).toBeTruthy()
    })
  })

  describe('table diff quality', () => {
    it('identifies exact changed cell position and content', async () => {
      const oldMd = [
        '# Data',
        '',
        '| Name | Age |',
        '|------|-----|',
        '| Alice | 30 |',
        '| Bob | 25 |',
      ].join('\n')
      const newMd = [
        '# Data',
        '',
        '| Name | Age |',
        '|------|-----|',
        '| Alice | 31 |',
        '| Bob | 25 |',
      ].join('\n')
      const result = await diffMarkdown(oldMd, newMd)
      const table = flatten(result.root).find((c) => c.blockType === 'table')

      expect(table?.primaryOp).toBe('replace')
      expect(table?.tableDiff).toBeDefined()
      expect(table?.tableDiff?.structureChanged).toBe(false)

      const cellDiffs = table!.tableDiff!.cellDiffs
      expect(cellDiffs).toHaveLength(1)
      expect(cellDiffs[0]!.row).toBe(1)
      expect(cellDiffs[0]!.column).toBe(1)

      const replaceSpan = cellDiffs[0]!.spans.find((s) => s.op === 'replace')
      expect(replaceSpan).toBeDefined()
      expect(replaceSpan!.oldText).toContain('30')
      expect(replaceSpan!.newText).toContain('31')
    })

    it('detects row insertion as structural change', async () => {
      const oldMd = ['# Data', '', '| Name | Age |', '|------|-----|', '| Alice | 30 |'].join('\n')
      const newMd = [
        '# Data',
        '',
        '| Name | Age |',
        '|------|-----|',
        '| Alice | 30 |',
        '| Bob | 25 |',
      ].join('\n')
      const result = await diffMarkdown(oldMd, newMd)
      const table = flatten(result.root).find((c) => c.blockType === 'table')

      expect(table?.primaryOp).toBe('replace')
      expect(table?.tableDiff?.structureChanged).toBe(true)

      const insertedRows = table?.tableDiff?.rowEdits?.filter((r) => r.op === 'insert') ?? []
      expect(insertedRows).toHaveLength(1)
    })
  })

  describe('footnote matching', () => {
    it('matches footnote by identifier, not as delete+insert', async () => {
      const oldMd = ['# Article', '', 'Some text[^1].', '', '[^1]: Old footnote content.'].join(
        '\n',
      )
      const newMd = ['# Article', '', 'Some text[^1].', '', '[^1]: Updated footnote content.'].join(
        '\n',
      )
      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const footnote = changes.find((c) => c.kind === 'footnote')

      expect(footnote).toBeDefined()
      expect(footnote!.primaryOp).not.toBe('delete')
      expect(footnote!.primaryOp).not.toBe('insert')
      expect(footnote!.oldId && footnote!.newId).toBeTruthy()
      expect(footnote!.pairKind).toBe('match')
      expect(result.stats.deletes).toBe(0)
      expect(result.stats.inserts).toBe(0)
    })
  })

  describe('similarity scoring', () => {
    it('scores one-word change in long paragraph above 0.8 with precise inline span', async () => {
      const longText =
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
        'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
        'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. ' +
        'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.'
      const oldMd = `# Essay\n\n${longText}`
      const newMd = `# Essay\n\n${longText.replace('consectetur', 'consectetuer')}`
      const result = await diffMarkdown(oldMd, newMd)
      const paragraph = flatten(result.root).find((c) => c.blockType === 'paragraph')

      expect(paragraph?.primaryOp).toBe('replace')
      expect(paragraph?.score).toBeGreaterThan(0.8)
      expect(paragraph?.oldId && paragraph?.newId).toBeTruthy()

      const replaceSpans = paragraph?.inlineSpans?.filter((s) => s.op === 'replace') ?? []
      expect(replaceSpans.length).toBeGreaterThanOrEqual(1)
      const wordChange = replaceSpans.find(
        (s) => s.oldText?.includes('consectetur') && s.newText?.includes('consectetuer'),
      )
      expect(wordChange).toBeDefined()
    })
  })

  describe('blockquote matching', () => {
    it('matches blockquote content change as replace, not delete+insert', async () => {
      const oldMd = '# Quotes\n\n> This is the old quote.\n> With two lines.'
      const newMd = '# Quotes\n\n> This is the new quote.\n> With two lines.'
      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const bq = changes.find((c) => c.kind === 'blockquote')

      expect(bq).toBeDefined()
      expect(bq!.oldId && bq!.newId).toBeTruthy()
      expect(result.stats.inserts).toBe(0)
      expect(result.stats.deletes).toBe(0)
    })

    it('detects blockquote insertion with exact insert count', async () => {
      const oldMd = '# Notes\n\nSome text.'
      const newMd = '# Notes\n\nSome text.\n\n> A new quote added.'
      const result = await diffMarkdown(oldMd, newMd)

      expect(result.stats.inserts).toBeGreaterThanOrEqual(1)
      expect(result.stats.deletes).toBe(0)
    })
  })

  describe('combined frontmatter + heading + footnote', () => {
    it('each element type uses its appropriate match strategy', async () => {
      const oldMd = [
        '---',
        'title: Old Title',
        'date: 2025-01-01',
        '---',
        '',
        '# Old Heading',
        '',
        'Paragraph with reference[^note].',
        '',
        '[^note]: Old note content.',
      ].join('\n')
      const newMd = [
        '---',
        'title: New Title',
        'date: 2025-01-01',
        '---',
        '',
        '# New Heading',
        '',
        'Paragraph with reference[^note].',
        '',
        '[^note]: Updated note content.',
      ].join('\n')
      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)

      const fm = changes.find((c) => c.kind === 'frontmatter')
      expect(fm?.primaryOp).toBe('meta-update')
      expect(fm?.matchKind).toBe('frontmatter-anchor')
      const titleChange = fm?.metadataChanges?.find((m) => m.path === '$.title')
      expect(titleChange).toBeDefined()
      expect(titleChange!.oldValue).toBe('Old Title')
      expect(titleChange!.newValue).toBe('New Title')

      const heading = changes.find((c) => c.kind === 'heading')
      expect(heading?.status.renamed).toBe(true)
      expect(heading?.pairKind).toBe('match')

      const footnote = changes.find((c) => c.kind === 'footnote')
      expect(footnote?.oldId && footnote?.newId).toBeTruthy()
      expect(footnote?.pairKind).toBe('match')
      expect(result.stats.deletes).toBe(0)
      expect(result.stats.inserts).toBe(0)
    })
  })

  describe('heading move detection', () => {
    it('detects section moved to different parent with moveRole', async () => {
      const oldMd = [
        '# Root',
        '',
        '## Chapter One',
        '',
        '### Subsection Moved',
        '',
        'Subsection content here.',
        '',
        '## Chapter Two',
        '',
        'Chapter two body.',
      ].join('\n')
      const newMd = [
        '# Root',
        '',
        '## Chapter One',
        '',
        'Chapter one now empty of subsections.',
        '',
        '## Chapter Two',
        '',
        'Chapter two body.',
        '',
        '### Subsection Moved',
        '',
        'Subsection content here.',
      ].join('\n')
      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)

      const movedHeadings = changes.filter((c) => c.kind === 'heading' && c.status.moved)
      expect(movedHeadings.length).toBeGreaterThanOrEqual(1)

      const subsectionMove = movedHeadings.find(
        (c) => c.moveRole === 'source' || c.moveRole === 'target',
      )
      expect(subsectionMove).toBeDefined()
      expect(result.stats.moves).toBeGreaterThanOrEqual(1)
    })
  })
})
