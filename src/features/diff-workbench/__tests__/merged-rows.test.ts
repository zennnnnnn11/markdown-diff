import { describe, expect, it } from 'vitest'
import { buildMergedRows, removeNewIndexCrossings, tokenizeForSimilarity } from '../view-model/merged-rows'
import { runMarkdownDiff } from '../view-model/utils'
import { buildOldProjectionLines, buildProjectionLines } from '../view-model/projection'
import type { DiffResult } from '@/core/diff'

function mergedRowsFromMarkdown(oldMd: string, newMd: string, result: DiffResult) {
  return buildMergedRows(buildOldProjectionLines(oldMd, result), buildProjectionLines(newMd, result))
}

describe('merged-rows module', () => {
  describe('tokenizeForSimilarity', () => {
    it('splits Latin text by whitespace', () => {
      const tokens = tokenizeForSimilarity('hello world foo')
      expect(tokens).toEqual(['hello', 'world', 'foo'])
    })

    it('splits CJK characters individually', () => {
      const tokens = tokenizeForSimilarity('你好世界')
      expect(tokens).toEqual(['你', '好', '世', '界'])
    })

    it('handles mixed CJK and Latin', () => {
      const tokens = tokenizeForSimilarity('hello 你好 world')
      expect(tokens).toEqual(['hello', '你', '好', 'world'])
    })

    it('returns empty array for empty string', () => {
      expect(tokenizeForSimilarity('')).toEqual([])
    })

    it('returns empty array for whitespace-only string', () => {
      expect(tokenizeForSimilarity('   ')).toEqual([])
    })

    it('treats punctuation as part of adjacent word tokens', () => {
      const tokens = tokenizeForSimilarity('hello, world!')
      expect(tokens).toContain('hello,')
      expect(tokens).toContain('world!')
    })

    it('handles numbers', () => {
      const tokens = tokenizeForSimilarity('item 42 test')
      expect(tokens).toEqual(['item', '42', 'test'])
    })

    it('handles Japanese kana mixed with CJK', () => {
      const tokens = tokenizeForSimilarity('テスト中')
      expect(tokens.length).toBeGreaterThan(0)
    })
  })

  describe('buildMergedRows', () => {
    it('produces merged rows for identical content', async () => {
      const md = '# Title\n\nContent here.'
      const result = await runMarkdownDiff(md, md)
      const rows = mergedRowsFromMarkdown(md, md, result)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((r) => r.key.length > 0)).toBe(true)
    })

    it('produces rows with unique keys', async () => {
      const oldMd = '# Title\n\nOld content.'
      const newMd = '# Title\n\nNew content.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = mergedRowsFromMarkdown(oldMd, newMd, result)
      const keys = rows.map((r) => r.key)
      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBe(keys.length)
    })

    it('aligns matching lines side by side', async () => {
      const oldMd = '# Title\n\nParagraph one.\n\nParagraph two.'
      const newMd = '# Title\n\nParagraph one.\n\nParagraph two.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = mergedRowsFromMarkdown(oldMd, newMd, result)
      const bothSides = rows.filter((r) => r.oldLine !== null && r.newLine !== null)
      expect(bothSides.length).toBeGreaterThan(0)
    })

    it('produces old-only rows for deleted content', async () => {
      const oldMd = '# Title\n\nKeep this.\n\nDelete this.'
      const newMd = '# Title\n\nKeep this.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = mergedRowsFromMarkdown(oldMd, newMd, result)
      const oldOnly = rows.filter((r) => r.oldLine !== null && r.newLine === null)
      expect(oldOnly.length).toBeGreaterThan(0)
    })

    it('produces new-only rows for inserted content', async () => {
      const oldMd = '# Title\n\nExisting.'
      const newMd = '# Title\n\nExisting.\n\nNew paragraph added.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = mergedRowsFromMarkdown(oldMd, newMd, result)
      const newOnly = rows.filter((r) => r.oldLine === null && r.newLine !== null)
      expect(newOnly.length).toBeGreaterThan(0)
    })

    it('handles empty old markdown', async () => {
      const oldMd = ''
      const newMd = '# Title\n\nContent.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = mergedRowsFromMarkdown(oldMd, newMd, result)
      expect(rows.length).toBeGreaterThan(0)
    })

    it('handles empty new markdown', async () => {
      const oldMd = '# Title\n\nContent.'
      const newMd = ''
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = mergedRowsFromMarkdown(oldMd, newMd, result)
      expect(rows.length).toBeGreaterThan(0)
    })

    it('handles move detection in merged rows', async () => {
      const oldMd = '# A\n\nFirst.\n\n# B\n\nSecond.\n\n# C\n\nThird.'
      const newMd = '# C\n\nThird.\n\n# A\n\nFirst.\n\n# B\n\nSecond.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = mergedRowsFromMarkdown(oldMd, newMd, result)
      expect(rows.length).toBeGreaterThan(0)
    })
  })

  describe('removeNewIndexCrossings', () => {
    it('returns empty array for empty input', () => {
      expect(removeNewIndexCrossings([])).toEqual([])
    })

    it('returns single match unchanged', () => {
      expect(removeNewIndexCrossings([[0, 0]])).toEqual([[0, 0]])
    })

    it('keeps monotonically increasing new indices', () => {
      const input: Array<[number, number]> = [[0, 0], [1, 1], [2, 2]]
      expect(removeNewIndexCrossings(input)).toEqual([[0, 0], [1, 1], [2, 2]])
    })

    it('removes crossing matches where new index goes backward', () => {
      const input: Array<[number, number]> = [[0, 1], [1, 0]]
      expect(removeNewIndexCrossings(input)).toEqual([[0, 1]])
    })

    it('handles fully reversed new indices by keeping only the first', () => {
      const input: Array<[number, number]> = [[0, 3], [1, 2], [2, 1], [3, 0]]
      expect(removeNewIndexCrossings(input)).toEqual([[0, 3]])
    })

    it('preserves the longest non-crossing prefix in a mixed sequence', () => {
      const input: Array<[number, number]> = [[0, 0], [1, 2], [2, 1], [3, 3]]
      expect(removeNewIndexCrossings(input)).toEqual([[0, 0], [1, 2], [3, 3]])
    })

    it('handles duplicate new indices by dropping later duplicates', () => {
      const input: Array<[number, number]> = [[0, 1], [1, 1]]
      expect(removeNewIndexCrossings(input)).toEqual([[0, 1]])
    })

    it('handles large interleaved crossing pattern', () => {
      const input: Array<[number, number]> = [
        [0, 0], [1, 5], [2, 1], [3, 6], [4, 2], [5, 7],
      ]
      const result = removeNewIndexCrossings(input)
      for (let i = 1; i < result.length; i++) {
        expect(result[i]![1]).toBeGreaterThan(result[i - 1]![1])
      }
      expect(result.length).toBe(4)
    })
  })

  describe('buildMergedRows line uniqueness invariant', () => {
    it('never duplicates a projection line across merged rows', async () => {
      const oldMd = '# A\n\nParagraph one.\n\nParagraph two.\n\n# B\n\nParagraph three.'
      const newMd = '# B\n\nParagraph three.\n\n# A\n\nParagraph one.\n\nParagraph two.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = mergedRowsFromMarkdown(oldMd, newMd, result)

      const oldKeys = rows.filter((r) => r.oldLine).map((r) => r.oldLine!.key)
      const newKeys = rows.filter((r) => r.newLine).map((r) => r.newLine!.key)
      expect(new Set(oldKeys).size).toBe(oldKeys.length)
      expect(new Set(newKeys).size).toBe(newKeys.length)
    })
  })
})
