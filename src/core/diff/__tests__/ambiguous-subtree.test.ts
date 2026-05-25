import { describe, expect, it } from 'vitest'
import { ambiguousSharedHashes } from '../engine/helpers'
import { diffMarkdown, flatten } from './test-helpers'

describe('ambiguous subtree resolution', () => {
  describe('ambiguousSharedHashes', () => {
    it('returns symmetric N:N collisions', () => {
      const oldMap = new Map([
        ['hash-a', ['o1', 'o2']],
        ['hash-b', ['o3']],
      ])
      const newMap = new Map([
        ['hash-a', ['n1', 'n2']],
        ['hash-b', ['n3']],
      ])
      const result = ambiguousSharedHashes(oldMap, newMap)
      expect(result).toHaveLength(1)
      expect(result[0]!.hash).toBe('hash-a')
      expect(result[0]!.oldIds).toEqual(['o1', 'o2'])
      expect(result[0]!.newIds).toEqual(['n1', 'n2'])
    })

    it('skips asymmetric collisions (2:3)', () => {
      const oldMap = new Map([['hash-a', ['o1', 'o2']]])
      const newMap = new Map([['hash-a', ['n1', 'n2', 'n3']]])
      expect(ambiguousSharedHashes(oldMap, newMap)).toHaveLength(0)
    })

    it('skips unique 1:1 pairs (handled by uniqueSharedHashes)', () => {
      const oldMap = new Map([['hash-a', ['o1']]])
      const newMap = new Map([['hash-a', ['n1']]])
      expect(ambiguousSharedHashes(oldMap, newMap)).toHaveLength(0)
    })

    it('returns 3:3 collisions', () => {
      const oldMap = new Map([['hash-a', ['o1', 'o2', 'o3']]])
      const newMap = new Map([['hash-a', ['n1', 'n2', 'n3']]])
      const result = ambiguousSharedHashes(oldMap, newMap)
      expect(result).toHaveLength(1)
      expect(result[0]!.oldIds).toHaveLength(3)
    })
  })

  describe('integration: resolves ambiguous list items by child content', () => {
    it('disambiguates 2:2 identical list items with different sub-content', async () => {
      const oldMd = ['# Root', '', '- Item', '  - Alpha child', '- Item', '  - Beta child'].join(
        '\n',
      )

      const newMd = [
        '# Root',
        '',
        '- Item',
        '  - Beta child modified',
        '- Item',
        '  - Alpha child modified',
      ].join('\n')

      const result = await diffMarkdown(oldMd, newMd)
      expect(result.root).toBeDefined()
      const changes = flatten(result.root)
      const nonEqual = changes.filter((c) => c.primaryOp !== 'equal')
      expect(nonEqual.length).toBeGreaterThan(0)
      const listItems = changes.filter((c) => c.kind === 'listItem')
      expect(listItems.some((c) => c.primaryOp === 'replace')).toBe(true)
    })

    it('handles sections with identical headings but different body', async () => {
      const oldMd = [
        '# Root',
        '',
        '## Details',
        '',
        'First body content.',
        '',
        '## Details',
        '',
        'Second body content.',
      ].join('\n')

      const newMd = [
        '# Root',
        '',
        '## Details',
        '',
        'Second body content modified.',
        '',
        '## Details',
        '',
        'First body content modified.',
      ].join('\n')

      const result = await diffMarkdown(oldMd, newMd)
      expect(result.root).toBeDefined()
      const changes = flatten(result.root)
      expect(changes.some((c) => c.primaryOp !== 'equal')).toBe(true)
    })
  })
})
