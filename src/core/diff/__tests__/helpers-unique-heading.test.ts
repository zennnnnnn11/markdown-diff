import { describe, expect, it } from 'vitest'
import { diffMarkdown, flatten } from './test-helpers'

describe('uniqueHeadingSiblingNames moved to helpers', () => {
  it('function is exported from helpers, not from alignment', async () => {
    const helpers = await import('../engine/helpers')
    expect(typeof helpers.uniqueHeadingSiblingNames).toBe('function')
  })

  it('alignment.ts no longer defines uniqueHeadingSiblingNames', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../engine/alignment.ts'),
      'utf-8',
    )
    expect(source).not.toMatch(/^export function uniqueHeadingSiblingNames/m)
  })

  it('renames.ts imports from helpers, not alignment', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../engine/renames.ts'),
      'utf-8',
    )
    expect(source).toMatch(/uniqueHeadingSiblingNames[\s\S]*from\s+['"]\.\/helpers['"]/)
  })

  it('heading rename detection still works correctly', async () => {
    const oldMd = '# Alpha\n\nContent under alpha.\n'
    const newMd = '# Beta\n\nContent under alpha.\n'

    const result = await diffMarkdown(oldMd, newMd)
    const changes = flatten(result.root)
    const renamed = changes.filter((c) => c.status.renamed)
    expect(renamed.length).toBeGreaterThan(0)
  })

  it('short heading fallback still uses uniqueHeadingSiblingNames', async () => {
    const oldMd = [
      '# Root',
      '',
      '## Unique Heading',
      '',
      'Some content.',
    ].join('\n')

    const newMd = [
      '# Root',
      '',
      '## Different Heading',
      '',
      'Some content.',
    ].join('\n')

    const result = await diffMarkdown(oldMd, newMd)
    expect(result.root).toBeDefined()
    const changes = flatten(result.root)
    expect(changes.length).toBeGreaterThan(0)
  })

  it('duplicate heading names prevent false rename matches', async () => {
    const oldMd = [
      '# Root',
      '',
      '## Section A',
      '',
      'Content A.',
      '',
      '## Section A',
      '',
      'Content A copy.',
    ].join('\n')

    const newMd = [
      '# Root',
      '',
      '## Section B',
      '',
      'Content A.',
      '',
      '## Section A',
      '',
      'Content A copy.',
    ].join('\n')

    const result = await diffMarkdown(oldMd, newMd)
    expect(result.root).toBeDefined()
  })
})
