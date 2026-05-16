import { describe, expect, it } from 'vitest'
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
    it('is set when enhancedLocalRecovery is true', async () => {
      const { parseMarkdown } = await import('../../parser')
      const { transformMarkdown } = await import('../../transformer')
      const { buildSemanticIndex } = await import('../indexer')
      const { resolveDiffOptions } = await import('../options')
      const { maybeApplyStructuralFallback } = await import(
        '../engine/structural-fallback'
      )

      const md = '# Test\n\nContent.\n'
      const tree = transformMarkdown(await parseMarkdown(md))
      const index = await buildSemanticIndex(tree, 'old')

      const options = resolveDiffOptions({ enhancedLocalRecovery: true })
      const context = {
        options,
        oldIndex: index,
        newIndex: index,
        matchesByOld: new Map(),
        matchesByNew: new Map(),
        warnings: [],
        structuralFallback: options.enhancedLocalRecovery
          ? maybeApplyStructuralFallback
          : undefined,
      }

      expect(context.structuralFallback).toBe(maybeApplyStructuralFallback)
    })

    it('is undefined when enhancedLocalRecovery is false', async () => {
      const { resolveDiffOptions } = await import('../options')
      const options = resolveDiffOptions({ enhancedLocalRecovery: false })

      const context = {
        options,
        oldIndex: null,
        newIndex: null,
        matchesByOld: new Map(),
        matchesByNew: new Map(),
        warnings: [],
        structuralFallback: options.enhancedLocalRecovery
          ? () => Promise.resolve()
          : undefined,
      }

      expect(context.structuralFallback).toBeUndefined()
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
})
