import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../parser'
import { transformMarkdown } from '../../transformer'
import { diffMarkdownTrees } from '../index'
import type { DiffChange, DiffOptions } from '../types'

function flatten(change: DiffChange): DiffChange[] {
  return [change, ...change.children.flatMap(flatten)]
}

async function diffMarkdown(
  oldMarkdown: string,
  newMarkdown = oldMarkdown,
  options?: Partial<DiffOptions>,
) {
  const oldTree = transformMarkdown(await parseMarkdown(oldMarkdown))
  const newTree = transformMarkdown(await parseMarkdown(newMarkdown))
  return diffMarkdownTrees(oldTree, newTree, options)
}

describe('diff integration', () => {
  it('diffs identical documents without edits', async () => {
    const result = await diffMarkdown('# Intro\n\nParagraph')
    const changes = flatten(result.root)

    expect(result.stats).toEqual({
      inserts: 0,
      deletes: 0,
      replaces: 0,
      moves: 0,
      metaUpdates: 0,
      renames: 0,
    })
    expect(changes.some((change) => change.primaryOp !== 'equal')).toBe(false)
  })

  it('captures paragraph replacement and inline spans', async () => {
    const result = await diffMarkdown('# Intro\n\nhello old world', '# Intro\n\nhello new world')
    const paragraph = flatten(result.root).find((change) => change.blockType === 'paragraph')

    expect(paragraph?.primaryOp).toBe('replace')
    expect(paragraph?.inlineSpans?.some((span) => span.op === 'replace')).toBe(true)
    expect(result.stats.replaces).toBeGreaterThanOrEqual(1)
  })

  it('keeps exact-subtree matches at the maximal covered level only', async () => {
    const result = await diffMarkdown('# Stable\n\nBody')
    const exactSubtrees = result.matches.filter((pair) => pair.matchKind === 'exact-subtree')
    const exactParagraph = flatten(result.root).find(
      (change) => change.blockType === 'paragraph' && change.matchKind === 'exact-subtree',
    )

    expect(exactSubtrees).toHaveLength(1)
    expect(exactParagraph).toBeUndefined()
  })

  it('recovers heading rename when body is unchanged', async () => {
    const result = await diffMarkdown('# Old Name\n\nBody text', '# New Name\n\nBody text')
    const heading = flatten(result.root).find((change) => change.kind === 'heading')

    expect(heading?.status.renamed).toBe(true)
    expect(heading?.primaryOp).toBe('equal')
    expect(heading?.pairKind).toBe('match')
    expect(heading?.titleInlineSpans?.length).toBeGreaterThan(0)
  })

  it('recovers exact section move as move source and target', async () => {
    const oldMarkdown = `# A

## Moved

content

# B`
    const newMarkdown = `# A

# B

## Moved

content`
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    const moveChanges = flatten(result.root).filter((change) => change.primaryOp === 'move')

    expect(moveChanges).toHaveLength(2)
    expect(moveChanges.map((change) => change.moveRole).sort()).toEqual(['source', 'target'])
    expect(result.stats.moves).toBe(1)
  })

  it('recovers footnote rename from identity match', async () => {
    const result = await diffMarkdown('Text[^1]\n\n[^1]: same body', 'Text[^note]\n\n[^note]: same body')
    const footnote = flatten(result.root).find((change) => change.kind === 'footnote')

    expect(footnote?.status.renamed).toBe(true)
    expect(footnote?.pairKind).toBe('match')
  })

  it('detects code metadata update when content stays equal', async () => {
    const oldMarkdown = '```js\nconst x = 1\n```'
    const newMarkdown = '```ts\nconst x = 1\n```'
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    const code = flatten(result.root).find((change) => change.blockType === 'code')

    expect(code?.primaryOp).toBe('meta-update')
    expect(code?.status.metaChanged).toBe(true)
    expect(code?.status.selfChanged).toBe(false)
  })

  it('builds path-level frontmatter metadata changes', async () => {
    const oldMarkdown = `---
title: Old
meta:
  a: 1
---`
    const newMarkdown = `---
title: New
meta:
  a: 1
  b: 2
---`
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    const frontmatter = flatten(result.root).find((change) => change.kind === 'frontmatter')

    expect(frontmatter?.primaryOp).toBe('meta-update')
    expect(frontmatter?.metadataChanges?.map((entry) => entry.path)).toEqual(['$.meta.b', '$.title'])
  })

  it('computes table diff for cell edits', async () => {
    const oldMarkdown = `| a | b |
| - | - |
| 1 | 2 |`
    const newMarkdown = `| a | b |
| - | - |
| 1 | 3 |`
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    const table = flatten(result.root).find((change) => change.blockType === 'table')

    expect(table?.tableDiff?.cellDiffs).toHaveLength(1)
    expect(table?.tableDiff?.cellDiffs[0]).toMatchObject({ row: 1, column: 1 })
  })

  it('computes table cell inline structure diffs', async () => {
    const oldMarkdown = `| **bold** |
| - |
| body |`
    const newMarkdown = `| *bold* |
| - |
| body |`
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    const table = flatten(result.root).find((change) => change.blockType === 'table')
    const headerCell = table?.tableDiff?.cellDiffs.find((cell) => cell.row === 0 && cell.column === 0)

    expect(headerCell?.spans.some((span) => span.oldTokens?.[0]?.type === 'strong')).toBe(true)
    expect(headerCell?.spans.some((span) => span.newTokens?.[0]?.type === 'emphasis')).toBe(true)
  })

  it('computes code replace spans with char-level detail', async () => {
    const oldMarkdown = '```ts\nconst x = 1\n```'
    const newMarkdown = '```ts\nconst x = 2\n```'
    const result = await diffMarkdown(oldMarkdown, newMarkdown)
    const code = flatten(result.root).find((change) => change.blockType === 'code')

    expect(code?.primaryOp).toBe('replace')
    expect(code?.codeSpans?.some((span) => span.op === 'replace' && span.charSpans?.length)).toBe(true)
  })

  it('uses enhanced local recovery to align unresolved structural children', async () => {
    const oldMarkdown = `# Alpha Project Notes

> old quote

- first`
    const newMarkdown = `# Beta Project Notes

> new quote

- second`
    const withoutFallback = await diffMarkdown(oldMarkdown, newMarkdown, { minSimilarity: 0.55 })
    const withFallback = await diffMarkdown(oldMarkdown, newMarkdown, {
      enhancedLocalRecovery: true,
      minSimilarity: 0.55,
    })
    const oldHeading = flatten(withoutFallback.root).find((change) => change.kind === 'heading' && change.oldId && change.newId)
    const newHeading = flatten(withFallback.root).find((change) => change.kind === 'heading' && change.oldId && change.newId)

    expect(oldHeading?.children.some((child) => child.kind === 'blockquote' && child.primaryOp === 'replace')).toBe(false)
    expect(newHeading?.children.some((child) => child.kind === 'blockquote' && child.primaryOp === 'replace')).toBe(true)
    expect(newHeading?.warnings).not.toContain('enhanced-local-recovery-no-candidates')
  })
})
