import { describe, expect, it } from 'vitest'
import { diffMarkdown, flatten } from './test-helpers'

describe('testing philosophy operations batch', () => {
  function hasAnySemanticChange(result: Awaited<ReturnType<typeof diffMarkdown>>): boolean {
    return flatten(result.root).some(
      (change) =>
        change.primaryOp !== 'equal' ||
        change.status.renamed ||
        change.status.movedWithinParent ||
        change.reordered,
    )
  }

  describe('equal smoke coverage', () => {
    it.each([
      ['EQ-002', 'hello'],
      ['EQ-003', '# A\n\ntext'],
      ['EQ-007', '- a\n  1. b\n  2. c\n- d'],
      ['EQ-011', '[^1]: note'],
      ['EQ-016', '# A\n\npara\n\n```js\nconst a=1\n```\n\n|a|b|\n|---|---|\n|1|2|\n\n- x'],
      ['EQ-017', '# 标题 ©™✓'],
      ['EQ-018', '# 你好世界 🌍'],
      ['EQ-019', 'x'.repeat(10000)],
      ['EQ-020', Array.from({ length: 100 }, (_, index) => `## H${index}\n\nbody ${index}`).join('\n\n')],
    ])('%s stays fully equal', async (_id, markdown) => {
      const result = await diffMarkdown(markdown)
      expect(result.stats).toEqual({
        inserts: 0,
        deletes: 0,
        replaces: 0,
        moves: 0,
        metaUpdates: 0,
        renames: 0,
        reorders: 0,
      })
      expect(flatten(result.root).some((change) => change.primaryOp !== 'equal')).toBe(false)
    })
  })

  describe('insert coverage', () => {
    it.each([
      ['IN-001', '', '# New', 'insert'],
      ['IN-002', '# A', '# A\n\nnew paragraph', 'insert'],
      ['IN-004', '# A', '# A\n## B\n### C', 'insert'],
      ['IN-006', '- a', '- a\n  - b', 'insert'],
      ['IN-007', 'para', 'para\n\n```js\ncode\n```', 'insert'],
      ['IN-008', 'para', 'para\n\n| a | b |\n| --- | --- |', 'insert'],
      ['IN-009', 'para', 'para\n\n> quote', 'insert'],
      ['IN-010', '[^1]: a', '[^1]: a\n[^2]: b', 'insert'],
      ['IN-011', '[a]: https://example.com/a', '[a]: https://example.com/a\n[b]: https://example.com/b', 'insert'],
      ['IN-012', '---\na: 1\n---', '---\na: 1\nb: 2\n---', 'meta-update'],
      ['IN-013', '---\na:\n  x: 1\n---', '---\na:\n  x: 1\n  y: 2\n---', 'meta-update'],
      ['IN-014', '---\ntags: [a]\n---', '---\ntags: [a, b]\n---', 'meta-update'],
      ['IN-015', '', '---\na: 1\n---', 'insert'],
      ['IN-017', '# A', '# A\n\np1\n\np2\n\np3', 'insert'],
      ['IN-018', '', '\n\n# A', 'insert'],
    ])('%s surfaces an insertion-oriented change', async (_id, oldMarkdown, newMarkdown, expectedPrimary) => {
      const result = await diffMarkdown(oldMarkdown, newMarkdown)
      expect(flatten(result.root).some((change) => change.primaryOp === expectedPrimary)).toBe(true)
    })

    it('IN-016: trailing blank lines do not materialize an empty paragraph insertion', async () => {
      const result = await diffMarkdown('# A', '# A\n\n\n')

      expect(hasAnySemanticChange(result)).toBe(false)
    })
  })

  describe('delete coverage', () => {
    it.each([
      ['DL-001', '# A', ''],
      ['DL-002', '# A\n\npara', '# A'],
      ['DL-004', '# A\n## B', '# A'],
      ['DL-005', '- a\n- b\n- c', '- a\n- c'],
      ['DL-006', '- a\n  - b', '- a'],
      ['DL-007', 'para\n\n```\ncode\n```', 'para'],
      ['DL-008', 'para\n\n| a | b |\n| --- | --- |', 'para'],
      ['DL-010', '[^1]: a\n[^2]: b', '[^1]: a'],
      ['DL-011', '[a]: u1\n[b]: u2', '[a]: u1'],
      ['DL-013', '---\na: 1\nb: 2\n---', '---\na: 1\n---'],
      ['DL-014', '---\ntags: [a, b]\n---', '---\ntags: [a]\n---'],
      ['DL-015', '# A', ''],
      ['DL-016', '# A\n\np1\n\np2\n\np3', '# A'],
      ['DL-017', '---\na: 1\n---', ''],
    ])('%s surfaces a delete-oriented change', async (_id, oldMarkdown, newMarkdown) => {
      const result = await diffMarkdown(oldMarkdown, newMarkdown)
      expect(flatten(result.root).some((change) => change.primaryOp === 'delete' || change.primaryOp === 'meta-update')).toBe(true)
    })

    it('DL-009: deleting content inside a blockquote keeps the quote paired instead of deleting the whole section', async () => {
      const result = await diffMarkdown('> a\n> b', '> a')

      expect(hasAnySemanticChange(result)).toBe(true)
      expect(
        flatten(result.root).some(
          (change) => change.kind === 'blockquote' && change.primaryOp !== 'delete' && change.primaryOp !== 'insert',
        ),
      ).toBe(true)
    })
  })

  describe('replace coverage', () => {
    it.each([
      ['RP-001', 'old text', 'new text', 'replace-or-meta'],
      ['RP-002', 'hello world', 'hello there', 'replace-or-meta'],
      ['RP-003', '# Old Title', '# New Title', 'rename'],
      ['RP-005', '| a | b |\n| --- | --- |\n| 1 | 2 |', '| a | b |\n| --- | --- |\n| 1 | 3 |', 'replace-or-meta'],
      ['RP-006', '- old', '- new', 'replace-or-meta'],
      ['RP-007', '> old', '> new', 'replace-or-meta'],
      ['RP-008', '# A', 'paragraph', 'any-change'],
      ['RP-009', 'text', '```\ncode\n```', 'any-change'],
      ['RP-010', '```\ncode\n```', '| a | b |\n| --- | --- |', 'any-change'],
      ['RP-011', '- a', 'paragraph', 'any-change'],
      ['RP-013', '---\na: 1\n---', '---\na: 2\n---', 'replace-or-meta'],
      ['RP-014', '---\na:\n  x: 1\n---', '---\na:\n  x: 2\n---', 'replace-or-meta'],
    ])('%s surfaces the expected replacement-oriented semantics', async (_id, oldMarkdown, newMarkdown, expectation) => {
      const result = await diffMarkdown(oldMarkdown, newMarkdown)

      if (expectation === 'rename') {
        expect(flatten(result.root).some((change) => change.kind === 'heading' && change.status.renamed)).toBe(true)
        return
      }

      if (expectation === 'any-change') {
        expect(hasAnySemanticChange(result)).toBe(true)
        return
      }

      expect(
        flatten(result.root).some((change) => change.primaryOp === 'replace' || change.primaryOp === 'meta-update'),
      ).toBe(true)
    })
  })

  describe('meta-update coverage', () => {
    it.each([
      ['MU-001', '- [ ] task', '- [x] task'],
      ['MU-002', '- [x] task', '- [ ] task'],
      ['MU-003', '```js\ncode\n```', '```ts\ncode\n```'],
      ['MU-006', '[text](old)', '[text](new)'],
      ['MU-007', '![alt](old)', '![alt](new)'],
      ['MU-008', '---\ndate: 2024\n---', '---\ndate: 2025\n---'],
    ])('%s surfaces metadata-oriented or inline change semantics', async (_id, oldMarkdown, newMarkdown) => {
      const result = await diffMarkdown(oldMarkdown, newMarkdown)
      expect(
        flatten(result.root).some(
          (change) =>
            change.primaryOp === 'meta-update' ||
            change.primaryOp === 'replace' ||
            (change.inlineSpans?.length ?? 0) > 0,
        ),
      ).toBe(true)
    })
  })

  describe('html/math/yaml/toml block coverage', () => {
    it.each([
      ['HM-001', '<div>x</div>', '<div>x</div>'],
      ['HM-002', '<div>x</div>', '<div>y</div>'],
      ['HM-003', '$$x=1$$', '$$x=1$$'],
      ['HM-004', '$$x=1$$', '$$y=2$$'],
      ['HM-005', '```yaml\na: 1\n```', '```yaml\na: 2\n```'],
      ['HM-006', '```toml\na = 1\n```', '```toml\na = 1\n```'],
      ['HM-007', '<div>x</div>', '$$x=1$$'],
    ])('%s parses and diffs specialized block content without crashing', async (_id, oldMarkdown, newMarkdown) => {
      const result = await diffMarkdown(oldMarkdown, newMarkdown)
      expect(result.root).toBeDefined()
      expect(result.stats).toBeDefined()
    })
  })
})
