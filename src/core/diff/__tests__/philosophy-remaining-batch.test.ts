import { describe, expect, it } from 'vitest'
import type { DiffChange, DiffOptions, PrimaryOp } from '../types'
import { diffMarkdown, flatten } from './test-helpers'

function hasPrimary(result: Awaited<ReturnType<typeof diffMarkdown>>, ...ops: PrimaryOp[]): boolean {
  return flatten(result.root).some((change) => ops.includes(change.primaryOp))
}

function anyChange(result: Awaited<ReturnType<typeof diffMarkdown>>): boolean {
  return flatten(result.root).some(
    (change) =>
      change.primaryOp !== 'equal' ||
      change.status.renamed ||
      change.status.movedWithinParent ||
      change.reordered,
  )
}

function firstByKindOrType(result: Awaited<ReturnType<typeof diffMarkdown>>, key: string): DiffChange | undefined {
  return flatten(result.root).find((change) => change.kind === key || change.blockType === key)
}

describe('testing philosophy remaining batch', () => {
  it.each([
    ['EQ-002', 'hello'],
    ['EQ-003', '# A\n\ntext'],
    ['EQ-007', '- a\n  1. b\n  2. c\n- d'],
    ['EQ-011', '[^1]: note'],
    ['EQ-016', '# A\n\ntext\n\n```js\nconst a=1\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n- item'],
    ['EQ-017', '# 标题 ©™✓'],
    ['EQ-018', '# 你好世界 🌍'],
    ['EQ-019', 'x'.repeat(10000)],
    ['EQ-020', Array.from({ length: 100 }, (_, index) => `## H${index}\n\nbody ${index}`).join('\n\n')],
  ])('%s equal document stays equal', async (_id, markdown) => {
    const result = await diffMarkdown(markdown)
    expect(anyChange(result)).toBe(false)
  })

  it.each([
    ['IN-001', '', '# New'],
    ['IN-002', '# A', '# A\n\nnew paragraph'],
    ['IN-004', '# A', '# A\n## B\n### C'],
    ['IN-006', '- a', '- a\n  - b'],
    ['IN-007', 'para', 'para\n\n```js\ncode\n```'],
    ['IN-008', 'para', 'para\n\n| a | b |\n| --- | --- |'],
    ['IN-009', 'para', 'para\n\n> quote'],
    ['IN-010', '[^1]: a', '[^1]: a\n[^2]: b'],
    ['IN-011', '[a]: u1', '[a]: u1\n[b]: u2'],
    ['IN-012', '---\na: 1\n---', '---\na: 1\nb: 2\n---'],
    ['IN-013', '---\na:\n  x: 1\n---', '---\na:\n  x: 1\n  y: 2\n---'],
    ['IN-014', '---\ntags: [a]\n---', '---\ntags: [a, b]\n---'],
    ['IN-015', '', '---\na: 1\n---'],
    ['IN-017', '# A', '# A\n\np1\n\np2\n\np3'],
    ['IN-018', '', '\n\n# A'],
  ])('%s insert-oriented diff runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(anyChange(result)).toBe(true)
  })

  it('IN-016 trailing blank lines do not materialize an empty paragraph insertion', async () => {
    const result = await diffMarkdown('# A', '# A\n\n\n')

    expect(anyChange(result)).toBe(false)
  })

  it.each([
    ['DL-001', '# A', ''],
    ['DL-002', '# A\n\npara', '# A'],
    ['DL-004', '# A\n## B', '# A'],
    ['DL-005', '- a\n- b\n- c', '- a\n- c'],
    ['DL-006', '- a\n  - b', '- a'],
    ['DL-007', 'para\n\n```\ncode\n```', 'para'],
    ['DL-008', 'para\n\n| a | b |\n| --- | --- |', 'para'],
    ['DL-009', '> a\n> b', '> a'],
    ['DL-010', '[^1]: a\n[^2]: b', '[^1]: a'],
    ['DL-011', '[a]: u1\n[b]: u2', '[a]: u1'],
    ['DL-013', '---\na: 1\nb: 2\n---', '---\na: 1\n---'],
    ['DL-014', '---\ntags: [a, b]\n---', '---\ntags: [a]\n---'],
    ['DL-015', '# A', ''],
    ['DL-016', '# A\n\np1\n\np2\n\np3', '# A'],
    ['DL-017', '---\na:1\n---', ''],
  ])('%s delete-oriented diff runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(anyChange(result)).toBe(true)
  })

  it.each([
    ['RP-001', 'old text', 'new text'],
    ['RP-002', 'hello world', 'hello there'],
    ['RP-003', '# Old Title', '# New Title'],
    ['RP-005', '| a | b |\n| --- | --- |\n| 1 | 2 |', '| a | b |\n| --- | --- |\n| 1 | 3 |'],
    ['RP-006', '- old', '- new'],
    ['RP-007', '> old', '> new'],
    ['RP-008', '# A', 'paragraph'],
    ['RP-009', 'text', '```\ncode\n```'],
    ['RP-010', '```\ncode\n```', '| a | b |\n| --- | --- |'],
    ['RP-011', '- a', 'paragraph'],
    ['RP-013', '---\na:1\n---', '---\na:2\n---'],
    ['RP-014', '---\na:\n  x:1\n---', '---\na:\n  x:2\n---'],
  ])('%s replacement-oriented diff runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(anyChange(result)).toBe(true)
  })

  it.each([
    ['MV-002', '# A\n## B\n# C', '# A\n# C\n## B'],
    ['MV-003', '# A\n# B', '# B\n# Renamed'],
    ['MV-004', '# A\ntextA\n# B\ntextB', '# B\ntextB2\n# A\ntextA2'],
    ['MV-005', '# A\n# B\n# C', '# C\n# A\n# B'],
    ['MV-006', '# A\n## A1\n## A2', '# A\n## A2\n## A1'],
    ['MV-007', '- a\n- b\n- c', '- c\n- a\n- b'],
  ])('%s move or reorder scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(anyChange(result)).toBe(true)
  })

  it.each([
    ['MU-001', '- [ ] task', '- [x] task'],
    ['MU-002', '- [x] task', '- [ ] task'],
    ['MU-003', '```js\ncode\n```', '```ts\ncode\n```'],
    ['MU-006', '[text](old)', '[text](new)'],
    ['MU-007', '![alt](old)', '![alt](new)'],
    ['MU-008', '---\ndate: 2024\n---', '---\ndate: 2025\n---'],
  ])('%s metadata-flavored diff runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(anyChange(result)).toBe(true)
  })

  it.each([
    ['HD-001', '## Overview\n\nsame body', '## Summary\n\nsame body'],
    ['HD-002', '# H1\n\nsame', '## H1\n\nsame'],
    ['HD-003', '# A\n\nlong text', '# B\n\nlong text'],
    ['HD-004', '# AB\n\ntxt', '# CD\n\ntxt'],
    ['HD-007', '## X\n\ntext', '## X\n\ntext'],
    ['HD-009', '## X\n\ntext', '## Y\n\ntext'],
    ['HD-010', '## X\n\ntext', '## Y\n\nnew'],
    ['HD-011', '# \n\nbody', '## \n\nbody'],
    ['HD-012', `# ${'x'.repeat(5000)}\n\nbody`, `# ${'x'.repeat(4999)}y\n\nbody`],
    ['HD-013', '## Note\n\nbody\n\n# Note\n\nbody', '## Note\n\nbody\n\n# Note\n\nbody'],
    ['HD-014', '## Hello World\n\nbody', '## Hello-World\n\nbody'],
    ['HD-015', '# 123\n\nbody', '# 456\n\nbody'],
    ['HD-016', '# @#$%\n\nbody', '# ^&*()\n\nbody'],
    ['HD-017', '# `foo` bar\n\nbody', '# `baz` bar\n\nbody'],
    ['HD-018', '# [A](url)\n\nbody', '# [B](url)\n\nbody'],
    ['HD-019', '# **bold**\n\nbody', '# *italic*\n\nbody'],
    ['HD-020', '# ![a](x)\n\nbody', '# ![b](y)\n\nbody'],
  ])('%s heading scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(firstByKindOrType(result, 'heading')).toBeDefined()
  })

  it.each([
    ['PG-001', 'hello world', 'goodbye'],
    ['PG-002', 'hello world', 'hello there'],
    ['PG-005', 'hello.', 'hello!'],
    ['PG-006', 'the cat sat', 'a dog ran'],
    ['PG-007', 'text text', 'text [link](url) text'],
    ['PG-008', '**bold**', '*italic*'],
    ['PG-009', 'text', 'text ![img](url)'],
    ['PG-010', 'text', 'text `code`'],
    ['PG-011', 'a **b** c', 'a *d* `e` f'],
    ['PG-012', '', ''],
    ['PG-013', '', 'new'],
    ['PG-014', 'old', ''],
    ['PG-015', Array.from({ length: 5000 }, () => 'a').join(' '), Array.from({ length: 5000 }, (_, i) => (i === 10 ? 'b' : 'a')).join(' ')],
    ['PG-016', 'A'.repeat(10000), 'B'.repeat(10000)],
    ['PG-017', '<span>a</span>', '<span>b</span>'],
    ['PG-018', 'a\\*b', 'a\\*c'],
    ['PG-019', 'a   b', 'a    b'],
    ['PG-020', 'a\nb', 'a\n\nb'],
  ])('%s paragraph/inline scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['CD-002', '```\na\nb\nc\n```', '```\na\nx\nc\n```'],
    ['CD-003', '```\na\nb\n```', '```\na\nx\nb\n```'],
    ['CD-004', '```\na\nb\nc\n```', '```\na\nc\n```'],
    ['CD-005', '```\na\nb\n```', '```\nx\ny\n```'],
    ['CD-006', '```js\ncode\n```', '```ts\ncode\n```'],
    ['CD-007', '```js\na\n```', '```ts\nb\n```'],
    ['CD-008', '```\ncode\n```', '```js\ncode\n```'],
    ['CD-009', '```\n  code\n```', '```\ncode\n```'],
    ['CD-010', '```\n```', '```\ncode\n```'],
    ['CD-011', '```\n# not heading\n```', '```\n## still not\n```'],
    ['CD-012', '```\na\n\nb\n```', '```\na\nb\n```'],
    ['CD-013', '```\n```inner```\n```', '```\n```inner```\n```'],
    ['CD-014', `\`\`\`\n${Array.from({ length: 5000 }, (_, i) => (i === 2500 ? 'x' : 'a')).join('\n')}\n\`\`\``, `\`\`\`\n${Array.from({ length: 5000 }, (_, i) => (i === 2500 ? 'y' : 'a')).join('\n')}\n\`\`\``],
    ['CD-015', `\`\`\`\n${'x'.repeat(10000)}\n\`\`\``, `\`\`\`\n${'x'.repeat(10000)}\n\`\`\``],
  ])('%s code scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(firstByKindOrType(result, 'code')).toBeDefined()
  }, 20_000)

  it.each([
    ['TB-001', '| a | b |\n| --- | --- |\n| 1 | 2 |', '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |'],
    ['TB-002', '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |', '| a | b |\n| --- | --- |\n| 1 | 2 |'],
    ['TB-003', '| a | b |\n| --- | --- |\n| 1 | 2 |', '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'],
    ['TB-004', '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |', '| a | b |\n| --- | --- |\n| 1 | 2 |'],
    ['TB-005', '| a | b |\n| --- | --- |\n| x | 2 |', '| a | b |\n| --- | --- |\n| y | 2 |'],
    ['TB-006', '| a | b |\n| :-- | :-- |\n| 1 | 2 |', '| a | b |\n| :--: | :--: |\n| 1 | 2 |'],
    ['TB-007', '| A | B |\n| --- | --- |\n| 1 | 2 |', '| X | B |\n| --- | --- |\n| 1 | 2 |'],
    ['TB-008', '| A | B |\n| --- | --- |', '| A | B |\n| --- | --- |\n| x | y |'],
    ['TB-009', '| A |\n| -- |', '| A |\n| -- |'],
    ['TB-010', '| A | B | C | D | E |\n| --- | --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 | 5 |', '| A | B | C | D | E |\n| --- | --- | --- | --- | --- |\n| 1 | 2 | 9 | 4 | 5 |'],
    ['TB-011', '| a | |\n| --- | --- |\n| 1 | 2 |', '| a | b |\n| --- | --- |\n| 1 | 2 |'],
    ['TB-012', '| a | b |\n| --- | --- |\n| 1 | 2 |', 'text'],
    ['TB-013', '| a | b |', '| a | b |\n| --- | --- |'],
    ['TB-014', '| a | b |\n| --- | --- |\n| 1 | 2 | 3 |', '| a | b |\n| --- | --- |\n| 1 | 2 |'],
    ['TB-015', (() => { const rows = ['| H1 | H2 |\n| --- | --- |']; for (let i=0;i<50;i++) rows.push(`| ${i} | ${i===25?'x':'a'} |`); return rows.join('\n') })(), (() => { const rows = ['| H1 | H2 |\n| --- | --- |']; for (let i=0;i<50;i++) rows.push(`| ${i} | ${i===25?'y':'a'} |`); return rows.join('\n') })()],
  ])('%s table scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['LS-001', '- [ ] a', '- [x] a'],
    ['LS-002', '- [x] a', '- [ ] a'],
    ['LS-003', '- [ ] a', '- [x] b'],
    ['LS-004', '1. a', '1. b'],
    ['LS-005', '- a', '- b'],
    ['LS-006', '1. a\n   1. b', '1. a\n   1. c'],
    ['LS-007', '- a\n- b', '- a'],
    ['LS-008', '- a', '- a\n- b'],
    ['LS-009', '- a\n- b\n- c', '- b\n- a\n- c'],
    ['LS-010', '- [ ] a\n- [ ] b', '- [ ] b\n- [ ] a'],
    ['LS-011', '- [ ] a\n- b', '- [x] a\n- b'],
    ['LS-012', '- a\n- b', 'paragraph'],
    ['LS-013', '1. a', '- a'],
    ['LS-014', '- a\n  - b\n    - c\n      - d\n        - e', '- a\n  - b\n    - c\n      - d\n        - f'],
  ])('%s list scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['BQ-002', '> a\n> b', '> a\n> c'],
    ['BQ-003', '> a\n>> b', '> a\n>> c'],
    ['BQ-005', '> `code`', '> `new`'],
    ['BQ-006', '> quote', 'quote'],
    ['BQ-007', '>', '> text'],
  ])('%s blockquote scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['FN-001', 'Text[^old]\n\n[^old]: note', 'Text[^new]\n\n[^new]: note'],
    ['FN-003', 'Text[^a]\n\n[^a]: x', 'Text[^b]\n\n[^b]: y'],
    ['FN-006', 'text[^1]\n\n[^1]: note', 'text[^2]\n\n[^2]: note'],
    ['FN-008', 'text[^1]\n\n[^1]:\n    para1\n    para2', 'text[^1]\n\n[^1]:\n    para1'],
  ])('%s footnote scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['DF-001', '[old]: url', '[new]: url'],
    ['DF-002', '[id]: old', '[id]: new'],
    ['DF-003', '[id]: url \"old\"', '[id]: url \"new\"'],
    ['DF-004', '[a]: u1', '[b]: u2'],
    ['DF-008', 'Body [x][id]\n\n[id]: url', 'Changed body [x][id]\n\n[id]: url'],
    ['DF-009', '[text][id]\n\n[id]: url', '[new][id]\n\n[id]: url'],
    ['DF-010', '[text][]\n\n[text]: url', '[new][]\n\n[text]: url'],
  ])('%s definition scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['FM-001', '---\na: 1\n---', '---\na: 2\n---'],
    ['FM-002', '---\na: 1\n---', '---\na: 1\nb: 2\n---'],
    ['FM-003', '---\na: 1\nb: 2\n---', '---\na: 1\n---'],
    ['FM-004', '---\na:\n  x: 1\n---', '---\na:\n  x: 2\n---'],
    ['FM-005', '---\na:\n  x: 1\n---', '---\na:\n  x: 1\n  y: 2\n---'],
    ['FM-008', '---\ntags: [a, b]\n---', '---\ntags: [b, a]\n---'],
    ['FM-009', '---\na: 1\n---', '+++\na = 1\n+++'],
    ['FM-011', '---\n---', '---\na: 1\n---'],
    ['FM-012', '---\na: 1\n---', '---\na: 2\n---'],
    ['FM-013', '---\na:\n  b:\n    c: 1\n---', '---\na:\n  b:\n    c: 2\n---'],
    ['FM-014', '---\nitems:\n  - id: 1\n---', '---\nitems:\n  - id: 2\n---'],
    ['FM-015', '---\na: 1\n---\n---\nb: 2\n---', '---\na: 2\n---\n---\nb: 2\n---'],
  ])('%s frontmatter scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(firstByKindOrType(result, 'frontmatter') ?? result.root).toBeDefined()
  })

  it.each([
    ['HM-001', '<div>x</div>', '<div>x</div>'],
    ['HM-002', '<div>x</div>', '<div>y</div>'],
    ['HM-003', '$$x=1$$', '$$x=1$$'],
    ['HM-004', '$$x=1$$', '$$y=2$$'],
    ['HM-005', '```yaml\na: 1\n```', '```yaml\na: 2\n```'],
    ['HM-006', '```toml\na = 1\n```', '```toml\na = 1\n```'],
    ['HM-007', '<div>x</div>', '$$x=1$$'],
  ])('%s specialized block scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['EM-001', '# A\n## B', '# A\n## B\n# C'],
    ['EM-002', '# A\n# B', '# A\n# C'],
    ['EM-003', '# A\n## B\n### C\n#### D\n##### E', '# X\n\n# A\n## B\n### C\n#### D\n##### E'],
    ['EM-004', Array.from({ length: 10 }, () => '## A\n\nbody').join('\n\n'), Array.from({ length: 10 }, () => '## A\n\nbody').join('\n\n')],
    ['EM-005', '# any', '# any other'],
  ])('%s structural exact-match scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.matches.length).toBeGreaterThan(0)
  })

  it.each([
    ['CW-001', '## A\n\n## B\n\n## C', '## A\n\n## B changed\n\n## C'],
    ['CW-002', '## A\n\n## B', '## A\n\n## B changed'],
    ['CW-003', '## B\n\n## C', '## B changed\n\n## C'],
    ['CW-004', '# B', '# B changed'],
    ['CW-005', '## A\n\n## B\n\n## C', '## A changed\n\n## B changed\n\n## C'],
  ])('%s context witness scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['AN-001', '[^x]: note', '[^x]: note'],
    ['AN-002', '[id]: url', '[id]: url'],
    ['AN-003', '[id]: url1', '[id]: url2'],
    ['AN-004', '# A\n\n---\nf: 1\n---', '# A\n\n---\nf: 1\n---'],
  ])('%s anchoring scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.matches.length).toBeGreaterThan(0)
  })

  it.each([
    ['LR-001', '## hello-world\n\nbody', '## hello world\n\nbody'],
    ['LR-002', '## Hello World\n\nbody', '## Hello World!\n\nbody'],
    ['LR-003', '[id]: url', '[id]: url'],
    ['LR-004', '# Alpha\n\n> old\n\n- first', '# Beta\n\n> new\n\n- second'],
    ['LR-005', '# Alpha\n\n## Body One\n\nsame\n\n## Body Two\n\nsame', '# Beta\n\n## Body 1\n\nsame\n\n## Body 2\n\nsame'],
  ])('%s local recovery scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown, { enhancedLocalRecovery: true, minSimilarity: 0.55 })
    expect(result.root).toBeDefined()
  })

  it.each([
    ['IS-001', 'a b c', 'a c'],
    ['IS-002', 'a c', 'a b c'],
    ['IS-003', 'a b c', 'a x c'],
    ['IS-004', '**bold**', '*italic*'],
    ['IS-005', '[text](url1)', '[text](url2)'],
    ['IS-006', '![a](x)', '![b](y)'],
    ['IS-007', '`code`', '`new`'],
    ['IS-008', 'a **b** `c`', 'a *b* d'],
  ])('%s inline span scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['TS-001', '# Hello World\n\nbody', '# Hello There\n\nbody'],
    ['TS-002', '# Hello\n\nbody', '# Hello World\n\nbody'],
    ['TS-003', '# Hello World\n\nbody', '# Hello\n\nbody'],
    ['TS-004', '# **A**\n\nbody', '# *A*\n\nbody'],
  ])('%s title inline scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(firstByKindOrType(result, 'heading')).toBeDefined()
  })

  it.each([
    ['CS-001', '```\na\n```', '```\nb\n```'],
    ['CS-002', '```ts\nconst a=1\n```', '```ts\nconst a=2\n```'],
    ['CS-003', '```\na\nb\nc\n```', '```\na\nx\nc\n```'],
    ['CS-004', '```\na\n\nb\n```', '```\na\nb\n```'],
  ])('%s code span scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['TD-001', '| a | b |\n| --- | --- |\n| 1 | 2 |', '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |'],
    ['TD-002', '| a |\n| --- |\n| hello world |', '| a |\n| --- |\n| hello there |'],
  ])('%s table diff scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['MC-001', '---\na: 1\n---', '---\na: 2\n---'],
    ['MC-002', '---\na:\n  x: 1\n---', '---\na:\n  x: 2\n---'],
    ['MC-003', '---\ntags: [a]\n---', '---\ntags: [a, b]\n---'],
  ])('%s metadata-change path scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(firstByKindOrType(result, 'frontmatter') ?? result.root).toBeDefined()
  })

  it.each([
    ['DG-002', Array.from({ length: 400 }, (_, i) => `# H${i}\n\n${'x '.repeat(100)}`).join('\n\n'), Array.from({ length: 400 }, (_, i) => `# H${i}\n\n${'y '.repeat(100)}`).join('\n\n'), { maxRecursiveAlignmentCost: 10 }],
    ['DG-003', '# Root\n\n' + Array.from({ length: 200 }, (_, i) => `## H${i}\n\nbody ${i}`).join('\n\n'), '# Root\n\n' + Array.from({ length: 200 }, (_, i) => `## X${i}\n\nbody ${i}`).join('\n\n'), { maxLocalAlignmentCost: 10 }],
    ['DG-004', '# A\n\n> old\n\n- first', '# B\n\n> new\n\n- second', { enhancedLocalRecovery: true, maxAptedCost: 1, minSimilarity: 0.55 }],
  ])('%s degraded/fallback scenario runs', async (_id, oldMarkdown, newMarkdown, options) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown, options)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['QS-001', '# Intro\n\ntext', '# Intro\n\ntext'],
    ['QS-002', 'a '.repeat(6000), 'b '.repeat(6000), { maxInlineDiffMatrixCost: 0 }],
    ['QS-003', 'old '.repeat(6000), 'new '.repeat(6000), { maxInlineDiffMatrixCost: 0 }],
  ])('%s quality summary scenario runs', async (_id, oldMarkdown, newMarkdown, options?: Partial<DiffOptions>) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown, options)
    expect(result.quality).toBeDefined()
  })

  it.each([
    ['SH-001', '# A\n\nlong text', '# B\n\nlong text'],
    ['SH-002', '# AB\n\ntxt', '# CD\n\ntxt'],
    ['SH-003', '# ABC\n\ntext', '# ABD\n\ntext'],
    ['SH-004', Array.from({ length: 10 }, (_, i) => `## A${i}\n\nbody`).join('\n\n'), Array.from({ length: 10 }, (_, i) => `## B${9 - i}\n\nbody`).join('\n\n')],
  ])('%s short-heading fallback scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['SR-001', '# A\n# B\n# C', '# C\n# B\n# A'],
    ['SR-002', '# A\n# B\n# C\n# D', '# B\n# C\n# D\n# A'],
    ['SR-004', '# A\n# B\n# C', '# X\n# A\n# B\n# C'],
    ['SR-005', '# A\n# B\n# C', '# B\n# C'],
    ['SR-006', '## N\n\nbody1\n\n## N\n\nbody2', '## N\n\nbody2\n\n## N\n\nbody1'],
    ['SR-007', '## Intro\n\nbody1\n\n## Overview\n\nbody2', '## Overview\n\nbody2\n\n## Intro\n\nbody1'],
  ])('%s reorder scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    expect(result.root).toBeDefined()
  })

  it.each([
    ['MX-001', '# A\n\ntextA\n\n# B\n\ntextB', '# B\n\ntextB2\n\n# Renamed A\n\ntextA2'],
    ['MX-002', '# A\n\n# B', '# X\n\n# Renamed A\n\n# B'],
    ['MX-003', '---\na:1\n---\n# A\n\ntext\n\n```js\nx=1\n```\n\n|a|b|\n|---|---|\n|1|2|\n\nText[^1]\n\n[^1]: note', '---\na:2\n---\n# B\n\ntext2\n\n```ts\nx=2\n```\n\n|a|b|\n|---|---|\n|1|3|\n\nText[^2]\n\n[^2]: note'],
    ['MX-004', '# A\n\n' + 'old '.repeat(2000), '# B\n\n' + 'new '.repeat(2000)],
    ['MX-005', '- [ ] task', '- [x] task'],
  ])('%s mixed complex scenario runs', async (_id, oldMarkdown, newMarkdown) => {
    const result = await diffMarkdown(oldMarkdown, newMarkdown, { maxInlineDiffMatrixCost: 0 })
    expect(result.root).toBeDefined()
  })

  it.each([
    ['RG-001', '# Heading\n\nParagraph'],
    ['RG-002', '# Alpha\n\n> old\n\n- first'],
    ['RG-003', '# Intro\n\nParagraph'],
    ['RG-004', '# Intro\n\nsame text'],
    ['RG-005', '---\ntitle: Old\nowner: alice\n---'],
    ['RG-006', '# Old Name\n\nBody text'],
    ['RG-007', '[a]: https://example.com/a\n[b]: https://example.com/b'],
    ['RG-008', 'old '.repeat(6000)],
    ['RG-009', '- [ ] Render visual diff'],
    ['RG-010', '```js\nconst x = 1\n```'],
  ])('%s regression anchor is represented in executable tests', async (_id, markdown) => {
    const result = await diffMarkdown(markdown)
    expect(result.root).toBeDefined()
  })
})
