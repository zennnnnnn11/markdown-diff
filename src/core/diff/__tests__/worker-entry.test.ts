import { describe, expect, it } from 'vitest'
import { runMarkdownDiffInWorker } from '../worker-entry'
import { runMarkdownDiff } from '@/features/diff-workbench/view-model/utils'

describe('runMarkdownDiffInWorker', () => {
  it('produces same result as main-thread runMarkdownDiff', async () => {
    const old = '# Title\n\nOld paragraph.\n\n- item one\n- item two'
    const new_ = '# Title\n\nNew paragraph.\n\n- item one\n- item three'

    const workerResult = await runMarkdownDiffInWorker(old, new_)
    const mainResult = await runMarkdownDiff(old, new_)

    expect(workerResult.root.primaryOp).toBe(mainResult.root.primaryOp)
    expect(workerResult.stats).toEqual(mainResult.stats)
    expect(workerResult.matches.length).toBe(mainResult.matches.length)
  })

  it('handles empty documents', async () => {
    const result = await runMarkdownDiffInWorker('', '')
    expect(result.root).toBeDefined()
    expect(result.stats.inserts).toBe(0)
  })

  it('handles identical documents', async () => {
    const md = '# Hello\n\nWorld'
    const result = await runMarkdownDiffInWorker(md, md)
    expect(result.stats.inserts).toBe(0)
    expect(result.stats.deletes).toBe(0)
    expect(result.stats.replaces).toBe(0)
  })

  it('handles complex document with tables, nested lists, and code blocks', async () => {
    const old = `# Document

| Col A | Col B |
|-------|-------|
| 1     | 2     |

\`\`\`javascript
const x = 1
\`\`\`

- outer
  - inner 1
  - inner 2
    - deep

> blockquote text`

    const new_ = `# Document

| Col A | Col B |
|-------|-------|
| 1     | 3     |

\`\`\`javascript
const x = 2
\`\`\`

- outer
  - inner 1
  - inner 3
    - deep

> modified blockquote`

    const result = await runMarkdownDiffInWorker(old, new_)
    expect(result.root).toBeDefined()
    expect(result.matches.length).toBeGreaterThan(0)
  })

  it('handles document with footnotes and definitions', async () => {
    const old = `# Intro

See [docs][ref] and note[^1].

[ref]: https://old.example.com "Old"

[^1]: Old footnote body`

    const new_ = `# Intro

See [docs][ref] and note[^1].

[ref]: https://new.example.com "New"

[^1]: New footnote body`

    const workerResult = await runMarkdownDiffInWorker(old, new_)
    const mainResult = await runMarkdownDiff(old, new_)

    expect(workerResult.stats).toEqual(mainResult.stats)
  })

  it('handles one empty and one non-empty document', async () => {
    const result = await runMarkdownDiffInWorker('', '# New\n\nContent')
    expect(result.root).toBeDefined()
    expect(result.stats.inserts).toBeGreaterThan(0)
  })

  it('handles document with math blocks and directives', async () => {
    const md = `# Math

$$
E = mc^2
$$

Some text after math.`

    const result = await runMarkdownDiffInWorker(md, md + '\n\nExtra paragraph.')
    expect(result.root).toBeDefined()
  })

  it('result structure matches DiffResult type shape', async () => {
    const result = await runMarkdownDiffInWorker('# A\n\nOld', '# A\n\nNew')

    expect(result).toHaveProperty('root')
    expect(result).toHaveProperty('oldIndex')
    expect(result).toHaveProperty('newIndex')
    expect(result).toHaveProperty('matches')
    expect(result).toHaveProperty('changeIndex')
    expect(result).toHaveProperty('stats')
    expect(result).toHaveProperty('quality')
    expect(result).toHaveProperty('warnings')

    expect(result.oldIndex).toHaveProperty('byId')
    expect(result.newIndex).toHaveProperty('byId')
    expect(result.changeIndex).toHaveProperty('byOldId')
    expect(result.changeIndex).toHaveProperty('byNewId')
  })
})
