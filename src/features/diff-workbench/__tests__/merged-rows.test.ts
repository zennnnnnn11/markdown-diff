import { describe, expect, it } from 'vitest'
import { buildMergedRows, tokenizeForSimilarity } from '../view-model/merged-rows'
import { runMarkdownDiff } from '../view-model/utils'

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
      const rows = buildMergedRows(md, md, result)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((r) => r.key.length > 0)).toBe(true)
    })

    it('produces rows with unique keys', async () => {
      const oldMd = '# Title\n\nOld content.'
      const newMd = '# Title\n\nNew content.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = buildMergedRows(oldMd, newMd, result)
      const keys = rows.map((r) => r.key)
      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBe(keys.length)
    })

    it('aligns matching lines side by side', async () => {
      const oldMd = '# Title\n\nParagraph one.\n\nParagraph two.'
      const newMd = '# Title\n\nParagraph one.\n\nParagraph two.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = buildMergedRows(oldMd, newMd, result)
      const bothSides = rows.filter((r) => r.oldLine !== null && r.newLine !== null)
      expect(bothSides.length).toBeGreaterThan(0)
    })

    it('produces old-only rows for deleted content', async () => {
      const oldMd = '# Title\n\nKeep this.\n\nDelete this.'
      const newMd = '# Title\n\nKeep this.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = buildMergedRows(oldMd, newMd, result)
      const oldOnly = rows.filter((r) => r.oldLine !== null && r.newLine === null)
      expect(oldOnly.length).toBeGreaterThan(0)
    })

    it('produces new-only rows for inserted content', async () => {
      const oldMd = '# Title\n\nExisting.'
      const newMd = '# Title\n\nExisting.\n\nNew paragraph added.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = buildMergedRows(oldMd, newMd, result)
      const newOnly = rows.filter((r) => r.oldLine === null && r.newLine !== null)
      expect(newOnly.length).toBeGreaterThan(0)
    })

    it('handles empty old markdown', async () => {
      const oldMd = ''
      const newMd = '# Title\n\nContent.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = buildMergedRows(oldMd, newMd, result)
      expect(rows.length).toBeGreaterThan(0)
    })

    it('handles empty new markdown', async () => {
      const oldMd = '# Title\n\nContent.'
      const newMd = ''
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = buildMergedRows(oldMd, newMd, result)
      expect(rows.length).toBeGreaterThan(0)
    })

    it('handles move detection in merged rows', async () => {
      const oldMd = '# A\n\nFirst.\n\n# B\n\nSecond.\n\n# C\n\nThird.'
      const newMd = '# C\n\nThird.\n\n# A\n\nFirst.\n\n# B\n\nSecond.'
      const result = await runMarkdownDiff(oldMd, newMd)
      const rows = buildMergedRows(oldMd, newMd, result)
      expect(rows.length).toBeGreaterThan(0)
    })
  })
})
