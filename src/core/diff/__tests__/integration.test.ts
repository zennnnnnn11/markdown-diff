import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../parser'
import { transformMarkdown } from '../../transformer'
import { diffMarkdownTrees } from '../index'
import type { DiffChange } from '../types'

function flatten(change: DiffChange): DiffChange[] {
  return [change, ...change.children.flatMap(flatten)]
}

async function diffMarkdown(oldMarkdown: string, newMarkdown = oldMarkdown) {
  const oldTree = transformMarkdown(await parseMarkdown(oldMarkdown))
  const newTree = transformMarkdown(await parseMarkdown(newMarkdown))
  return diffMarkdownTrees(oldTree, newTree)
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
})
