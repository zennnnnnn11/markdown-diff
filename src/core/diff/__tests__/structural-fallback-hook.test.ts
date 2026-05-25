import { describe, expect, it } from 'vitest'
import { resolveDiffOptions } from '../options'
import { diffMarkdown, flatten } from './test-helpers'

describe('structural fallback hook via DiffContext', () => {
  describe('dependency direction', () => {
    it('alignment.ts does not import from structural-fallback.ts', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const alignmentSource = fs.readFileSync(
        path.resolve(__dirname, '../engine/alignment.ts'),
        'utf-8',
      )
      expect(alignmentSource).not.toContain("from './structural-fallback'")
      expect(alignmentSource).not.toContain('from "./structural-fallback"')
    })

    it('structural-fallback.ts imports from alignment.ts (one-way)', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const sfSource = fs.readFileSync(
        path.resolve(__dirname, '../engine/structural-fallback.ts'),
        'utf-8',
      )
      expect(sfSource).toContain("from './alignment'")
    })

    it('structural-fallback.ts does not import buildAlignedChange', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const sfSource = fs.readFileSync(
        path.resolve(__dirname, '../engine/structural-fallback.ts'),
        'utf-8',
      )
      expect(sfSource).not.toMatch(/\bbuildAlignedChange\b/)
    })
  })

  describe('hook wiring', () => {
    it('structural fallback activates when enhancedLocalRecovery is enabled', async () => {
      const oldMd = [
        '# Section',
        '',
        'Paragraph one with some content.',
        '',
        'Paragraph two with different content.',
        '',
        '> A blockquote with text.',
      ].join('\n')

      const newMd = [
        '# Section',
        '',
        'Paragraph one rewritten entirely.',
        '',
        'A brand new paragraph here.',
        '',
        '> A blockquote modified.',
      ].join('\n')

      const resultWithRecovery = await diffMarkdown(oldMd, newMd, {
        enhancedLocalRecovery: true,
      })
      const resultWithoutRecovery = await diffMarkdown(oldMd, newMd, {
        enhancedLocalRecovery: false,
      })

      expect(resultWithRecovery.root).toBeDefined()
      expect(resultWithoutRecovery.root).toBeDefined()
    })

    it('equal documents produce equal results regardless of hook', async () => {
      const md = '# Title\n\nParagraph content.\n'

      const withHook = await diffMarkdown(md, md, { enhancedLocalRecovery: true })
      const withoutHook = await diffMarkdown(md, md, { enhancedLocalRecovery: false })

      const withFlat = flatten(withHook.root)
      const withoutFlat = flatten(withoutHook.root)

      expect(withFlat.every((c) => c.primaryOp === 'equal')).toBe(true)
      expect(withoutFlat.every((c) => c.primaryOp === 'equal')).toBe(true)
    })
  })

  describe('context.structuralFallback field', () => {
    it('enhancedLocalRecovery controls whether structural fallback runs', async () => {
      const withRecovery = await diffMarkdown('# A\n\nOld text.\n', '# A\n\nNew text.\n', {
        enhancedLocalRecovery: true,
      })
      const withoutRecovery = await diffMarkdown('# A\n\nOld text.\n', '# A\n\nNew text.\n', {
        enhancedLocalRecovery: false,
      })
      expect(withRecovery.root).toBeDefined()
      expect(withoutRecovery.root).toBeDefined()
      expect(flatten(withRecovery.root).some((c) => c.primaryOp === 'replace')).toBe(true)
      expect(flatten(withoutRecovery.root).some((c) => c.primaryOp === 'replace')).toBe(true)
    })
  })

  describe('behavioral equivalence', () => {
    it('produces same diff result as before refactoring for simple replace', async () => {
      const oldMd = '# Heading\n\nOld paragraph.\n'
      const newMd = '# Heading\n\nNew paragraph.\n'

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)

      const replaces = changes.filter((c) => c.primaryOp === 'replace')
      expect(replaces.length).toBeGreaterThan(0)
    })

    it('structural fallback still recovers matches in deeply changed sections', async () => {
      const oldMd = [
        '# Root',
        '',
        '## Sub A',
        '',
        'Content alpha.',
        '',
        '## Sub B',
        '',
        'Content beta.',
      ].join('\n')

      const newMd = [
        '# Root',
        '',
        '## Sub B',
        '',
        'Content beta modified.',
        '',
        '## Sub A',
        '',
        'Content alpha modified.',
      ].join('\n')

      const result = await diffMarkdown(oldMd, newMd, {
        enhancedLocalRecovery: true,
      })

      expect(result.root).toBeDefined()
      expect(result.stats).toBeDefined()
      const changes = flatten(result.root)
      expect(changes.some((c) => c.primaryOp === 'replace')).toBe(true)
    })

    it('insert-only diff works correctly with hook', async () => {
      const oldMd = '# Title\n\nExisting.\n'
      const newMd = '# Title\n\nExisting.\n\nNew paragraph.\n'

      const result = await diffMarkdown(oldMd, newMd, { enhancedLocalRecovery: true })
      const changes = flatten(result.root)
      const inserts = changes.filter((c) => c.primaryOp === 'insert')
      expect(inserts.length).toBeGreaterThan(0)
    })

    it('delete-only diff works correctly with hook', async () => {
      const oldMd = '# Title\n\nFirst.\n\nSecond.\n'
      const newMd = '# Title\n\nFirst.\n'

      const result = await diffMarkdown(oldMd, newMd, { enhancedLocalRecovery: true })
      const changes = flatten(result.root)
      const deletes = changes.filter((c) => c.primaryOp === 'delete')
      expect(deletes.length).toBeGreaterThan(0)
    })
  })

  describe('updated default values', () => {
    it('defaults enhancedLocalRecovery to true', () => {
      const options = resolveDiffOptions({})
      expect(options.enhancedLocalRecovery).toBe(true)
    })

    it('defaults maxAptedCost to 10_000', () => {
      const options = resolveDiffOptions({})
      expect(options.maxAptedCost).toBe(10_000)
    })

    it('defaults aptedUnpairedThreshold to 0.35', () => {
      const options = resolveDiffOptions({})
      expect(options.aptedUnpairedThreshold).toBe(0.35)
    })

    it('allows overriding new defaults', () => {
      const options = resolveDiffOptions({
        enhancedLocalRecovery: false,
        maxAptedCost: 5_000,
        aptedUnpairedThreshold: 0.6,
      })
      expect(options.enhancedLocalRecovery).toBe(false)
      expect(options.maxAptedCost).toBe(5_000)
      expect(options.aptedUnpairedThreshold).toBe(0.6)
    })

    it('recovers matches at cost 6400 (was blocked by old maxAptedCost=2500)', async () => {
      const lines = (count: number, prefix: string) =>
        Array.from({ length: count }, (_, i) => `${prefix} line ${i + 1}`)

      const oldMd = ['# Root', '', '## Section', '', ...lines(8, 'Old paragraph'), ''].join('\n')

      const newMd = ['# Root', '', '## Section', '', ...lines(8, 'New paragraph'), ''].join('\n')

      const result = await diffMarkdown(oldMd, newMd)
      const changes = flatten(result.root)
      expect(changes.some((c) => c.primaryOp !== 'equal')).toBe(true)
    })

    it('triggers fallback at 40% unpaired rate (was blocked by old threshold=0.5)', async () => {
      const oldMd = [
        '# Root',
        '',
        '## Sub A',
        '',
        'Content alpha.',
        '',
        '## Sub B',
        '',
        'Content beta.',
        '',
        '## Sub C',
        '',
        'Content gamma.',
        '',
        '## Sub D',
        '',
        'Content delta.',
        '',
        '## Sub E',
        '',
        'Content epsilon.',
      ].join('\n')

      const newMd = [
        '# Root',
        '',
        '## Sub A',
        '',
        'Content alpha rewritten.',
        '',
        '## Sub B',
        '',
        'Content beta rewritten.',
        '',
        '## Sub C',
        '',
        'Content gamma rewritten.',
        '',
        '## Sub D',
        '',
        'Content delta rewritten.',
        '',
        '## Sub E',
        '',
        'Content epsilon rewritten.',
      ].join('\n')

      const result = await diffMarkdown(oldMd, newMd)
      expect(result.root).toBeDefined()
      expect(result.stats).toBeDefined()
      const changes = flatten(result.root)
      expect(changes.some((c) => c.primaryOp === 'replace')).toBe(true)
    })
  })

  describe('threshold edge cases', () => {
    it('skips fallback when all children are equal (unresolved ratio = 0)', async () => {
      const md = '# Root\n\n## Sub\n\nContent.\n'
      const result = await diffMarkdown(md, md, { enhancedLocalRecovery: true })
      const changes = flatten(result.root)
      expect(changes.every((c) => c.primaryOp === 'equal')).toBe(true)
    })

    it('handles one-sided diff (insert-only, old has no children) without division by zero', async () => {
      const oldMd = '# Root\n'
      const newMd = '# Root\n\nNew paragraph.\n'
      const result = await diffMarkdown(oldMd, newMd, { enhancedLocalRecovery: true })
      expect(result.root).toBeDefined()
      const changes = flatten(result.root)
      expect(changes.some((c) => c.primaryOp === 'insert')).toBe(true)
    })
  })
})
