import { describe, expect, it } from 'vitest'
import { diffMarkdown, flatten } from './test-helpers'

describe('edge cases and degradation paths', () => {
  describe('malformed Markdown', () => {
    it('unclosed table does not crash', async () => {
      const oldMd = '| A | B |\n| --- | --- |\n| 1 | 2 |'
      const newMd = '| A | B |\n| --- | --- |'
      const result = await diffMarkdown(oldMd, newMd)
      expect(result.root).toBeDefined()
    })

    it('broken frontmatter is handled gracefully', async () => {
      const oldMd = '---\ntitle: hello\n---\n\nContent'
      const newMd = '---\ntitle: hello\n\nContent without closing'
      const result = await diffMarkdown(oldMd, newMd)
      expect(result.root).toBeDefined()
    })

    it('markdown with only whitespace produces valid diff', async () => {
      const result = await diffMarkdown('   \n\n  ', '  \n  ')
      expect(result.root).toBeDefined()
    })

    it('empty string inputs produce valid root', async () => {
      const result = await diffMarkdown('', '')
      expect(result.root).toBeDefined()
      expect(result.root.primaryOp).toBe('equal')
    })
  })

  describe('empty and minimal inputs', () => {
    it('diffing empty string against content (pure insert)', async () => {
      const result = await diffMarkdown('', '# New heading\n\nParagraph text.')
      expect(result.root).toBeDefined()
      const changes = flatten(result.root)
      const inserts = changes.filter((c) => c.primaryOp === 'insert')
      expect(inserts.length).toBeGreaterThan(0)
    })

    it('diffing content against empty string (pure delete)', async () => {
      const result = await diffMarkdown('# Old heading\n\nParagraph text.', '')
      expect(result.root).toBeDefined()
      const changes = flatten(result.root)
      const deletes = changes.filter((c) => c.primaryOp === 'delete')
      expect(deletes.length).toBeGreaterThan(0)
    })

    it('single heading with no body', async () => {
      const result = await diffMarkdown('# Title', '# Changed Title')
      expect(result.root).toBeDefined()
      const changes = flatten(result.root)
      expect(changes.length).toBeGreaterThan(0)
    })

    it('deeply nested list does not stack overflow', async () => {
      let md = ''
      for (let i = 0; i < 10; i++) {
        md += '  '.repeat(i) + `- level ${i}\n`
      }
      const result = await diffMarkdown(md, md + '  '.repeat(10) + '- level 10\n')
      expect(result.root).toBeDefined()
    })
  })

  describe('performance guards', () => {
    it('large section exceeding maxLocalAlignmentCost sets degraded or warning', async () => {
      const items = (count: number) =>
        Array.from({ length: count }, (_, i) => `- item ${i}`).join('\n')
      const oldMd = `# Section A\n\n${items(30)}\n\n# Section B\n\n${items(30)}`
      const newMd = `# Section C\n\n${items(30)}\n\n# Section D\n\n${items(30)}`
      const result = await diffMarkdown(oldMd, newMd, { maxLocalAlignmentCost: 1 })
      const changes = flatten(result.root)
      const degraded = changes.filter((c) => c.degraded)
      const warned = changes.filter((c) => c.warnings.includes('local-window-exceeded'))
      expect(degraded.length + warned.length).toBeGreaterThan(0)
    })

    it('large section exceeding maxRecursiveAlignmentCost sets degraded', async () => {
      const items = (count: number) =>
        Array.from({ length: count }, (_, i) => `- item ${i} with some content here`).join('\n')
      const oldMd = `# Root\n\n${items(50)}`
      const newMd = `# Root\n\n${items(50).replace(/item 25/g, 'changed 25')}`
      const result = await diffMarkdown(oldMd, newMd, { maxRecursiveAlignmentCost: 1 })
      const changes = flatten(result.root)
      const degraded = changes.filter((c) => c.degraded)
      const warned = changes.filter((c) => c.warnings.includes('subtree-budget-exceeded'))
      expect(degraded.length + warned.length).toBeGreaterThan(0)
    })

    it('inline diff exceeding maxInlineDiffMatrixCost shows inline-deferred warning', async () => {
      const makeInlineHeavy = (prefix: string) =>
        Array.from(
          { length: 30 },
          (_, i) => `**${prefix}${i}** _${prefix}${i}_ [${prefix}${i}](url${i})`,
        ).join(' ')
      const oldMd = `# Title\n\n${makeInlineHeavy('old')}`
      const newMd = `# Title\n\n${makeInlineHeavy('new')}`
      const result = await diffMarkdown(oldMd, newMd, { maxInlineDiffMatrixCost: 1 })
      const changes = flatten(result.root)
      const deferred = changes.filter((c) => c.warnings.includes('inline-deferred'))
      expect(deferred.length).toBeGreaterThan(0)
    })
  })

  describe('edge case structures', () => {
    it('table with single column', async () => {
      const oldMd = '| A |\n| --- |\n| 1 |'
      const newMd = '| A |\n| --- |\n| 2 |'
      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const tableChange = changes.find((c) => c.blockType === 'table')
      expect(tableChange?.tableDiff).toBeDefined()
    })

    it('code block with no language tag', async () => {
      const oldMd = '```\ncode here\n```'
      const newMd = '```\ncode changed\n```'
      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      const codeChange = changes.find((c) => c.blockType === 'code')
      expect(codeChange).toBeDefined()
    })

    it('footnote with special characters in identifier', async () => {
      const oldMd = 'Text[^note-1]\n\n[^note-1]: Footnote content'
      const newMd = 'Text[^note-1]\n\n[^note-1]: Changed footnote'
      const result = await diffMarkdown(oldMd, newMd)
      expect(result.root).toBeDefined()
    })

    it('blockquote inside list item', async () => {
      const oldMd = '- item\n  > quote inside'
      const newMd = '- item\n  > changed quote'
      const result = await diffMarkdown(oldMd, newMd)
      expect(result.root).toBeDefined()
    })
  })
})
