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

function sectionTitle(node: unknown): string | undefined {
  return node && typeof node === 'object' && 'title' in node ? String((node as { title?: unknown }).title ?? '') : undefined
}

function nodeText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  if ('value' in node) return String((node as { value?: unknown }).value ?? '')
  if ('children' in node && Array.isArray((node as { children?: unknown[] }).children)) {
    return ((node as { children: unknown[] }).children)
      .map((child) => nodeText(child))
      .filter(Boolean)
      .join(' ')
      .trim()
  }
  return ''
}

function nestedList(depth: number, leaf: string): string {
  return Array.from({ length: depth }, (_, index) => {
    const indent = '  '.repeat(index)
    const text = index === depth - 1 ? leaf : `item ${index}`
    return `${indent}- ${text}`
  }).join('\n')
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
    const source = moveChanges.find((change) => change.moveRole === 'source')
    const target = moveChanges.find((change) => change.moveRole === 'target')

    expect(source?.oldId).toBeDefined()
    expect(target?.newId).toBeDefined()
    expect(source?.oldId ? result.changeIndex.byOldId.get(source.oldId) : undefined).toBe(source)
    expect(target?.newId ? result.changeIndex.byNewId.get(target.newId) : undefined).toBe(target)
  })

  it('recovers footnote rename from identity match', async () => {
    const result = await diffMarkdown('Text[^1]\n\n[^1]: same body', 'Text[^note]\n\n[^note]: same body')
    const footnote = flatten(result.root).find((change) => change.kind === 'footnote')

    expect(footnote?.status.renamed).toBe(true)
    expect(footnote?.pairKind).toBe('match')
  })

  it('does not upgrade definition rename with changed identity into a match pair', async () => {
    const result = await diffMarkdown(
      '[docs]: https://example.com/guide "Docs"',
      '[guide]: https://example.com/guide "Doc Guide"',
      { minSimilarity: 0.5 },
    )
    const definition = flatten(result.root).find((change) => change.blockType === 'definition')

    expect(definition?.pairKind).toBe('align')
    expect(definition?.status.renamed).toBe(true)
    expect(definition?.status.metaChanged).toBe(true)
  })

  it('recovers a pure definition rename as a clean match', async () => {
    const result = await diffMarkdown(
      '[repo]: https://example.com/guide "Docs"',
      '[source]: https://example.com/guide "Docs"',
    )
    const definitions = flatten(result.root).filter((change) => change.blockType === 'definition')
    const definition = definitions.find((change) => change.oldId && change.newId)

    expect(definitions.some((change) => change.primaryOp === 'delete' || change.primaryOp === 'insert')).toBe(false)
    expect(definition?.pairKind).toBe('match')
    expect(definition?.primaryOp).toBe('equal')
    expect(definition?.status.renamed).toBe(true)
    expect(definition?.status.selfChanged).toBe(false)
  })

  it('recovers definition metadata updates when the identifier stays stable', async () => {
    const result = await diffMarkdown(
      '[docs]: https://example.com/docs/v1 "Documentation v1"',
      '[docs]: https://example.com/docs/v2 "Documentation v2"',
    )
    const definitions = flatten(result.root).filter((change) => change.blockType === 'definition')
    const definition = definitions.find((change) => change.oldId && change.newId)

    expect(definitions.some((change) => change.primaryOp === 'delete' || change.primaryOp === 'insert')).toBe(false)
    expect(definition?.pairKind).toBe('match')
    expect(definition?.primaryOp).toBe('meta-update')
    expect(definition?.status.metaChanged).toBe(true)
    expect(definition?.status.renamed).toBe(false)
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
    const metadataChildren = frontmatter?.children.filter((change) => change.entity === 'metadata') ?? []

    expect(frontmatter?.primaryOp).toBe('meta-update')
    expect(frontmatter?.metadataChanges?.map((entry) => entry.path)).toEqual(['$.meta.b', '$.title'])
    expect(metadataChildren.map((change) => change.metadataChanges?.[0]?.path)).toEqual(['$.meta.b', '$.title'])
    expect(metadataChildren.every((change) => change.status.metaChanged)).toBe(true)
    expect(result.stats.metaUpdates).toBe(1)
    expect(result.warnings.filter((warning) => warning.startsWith('invalid-meta-pair:'))).toEqual([])
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

  it('marks deferred inline diffs without inventing inline structure changes', async () => {
    const result = await diffMarkdown('# Intro\n\nplain old text', '# Intro\n\nplain new text', {
      maxInlineDiffMatrixCost: 0,
    })
    const paragraph = flatten(result.root).find((change) => change.blockType === 'paragraph')

    expect(paragraph?.warnings).toContain('inline-deferred')
    expect(paragraph?.status.inlineStructureChanged).toBe(false)
    expect(paragraph?.inlineSpans).toEqual([
      {
        op: 'replace',
        oldText: 'plain old text',
        newText: 'plain new text',
      },
    ])
  })

  it('counts change-level deferred warnings in the quality summary', async () => {
    const result = await diffMarkdown('# Intro\n\nplain old text', '# Intro\n\nplain new text', {
      maxInlineDiffMatrixCost: 0,
    })

    expect(result.quality.inlineDeferredCount).toBe(1)
    expect(result.quality.warningCount).toBeGreaterThanOrEqual(1)
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

  it('tracks degraded aligned sections in quality summary', async () => {
    const result = await diffMarkdown('# Alpha\n\nBody text', '# Beta\n\nBody text', {
      maxLocalAlignmentCost: 0,
      minSimilarity: 0.4,
    })
    const degradedChange = flatten(result.root).find((change) => change.degraded)

    expect(degradedChange?.warnings).toContain('local-window-exceeded')
    expect(result.quality.degradedCount).toBeGreaterThanOrEqual(1)
    expect(result.quality.warningCount).toBeGreaterThanOrEqual(1)
  })

  it('uses cost budgets instead of raw subtree size for deep low-fanout list hierarchies', async () => {
    const oldMarkdown = `# Alpha\n\n${nestedList(60, 'old leaf')}`
    const newMarkdown = `# Alpha\n\n${nestedList(60, 'new leaf')}`
    const result = await diffMarkdown(oldMarkdown, newMarkdown, {
      maxLocalWindowSize: 1,
      maxLocalAlignmentCost: 200,
      maxRecursiveSubtreeSize: 1,
      maxRecursiveAlignmentCost: 200,
      minSimilarity: 0.4,
    })
    const replacedParagraph = flatten(result.root).find(
      (change) => change.blockType === 'paragraph' && change.primaryOp === 'replace',
    )
    const replacedLeafItem = flatten(result.root).find(
      (change) =>
        change.kind === 'listItem' &&
        sectionTitle(change.oldNode) === 'old leaf' &&
        sectionTitle(change.newNode) === 'new leaf',
    )
    const deepMatchedItem = flatten(result.root).find(
      (change) =>
        change.kind === 'listItem' &&
        sectionTitle(change.oldNode) === 'item 57' &&
        sectionTitle(change.newNode) === 'item 57' &&
        !!change.pairKind,
    )
    expect(replacedParagraph ?? replacedLeafItem ?? deepMatchedItem).toBeDefined()
    expect(flatten(result.root).some((change) => change.warnings.includes('local-window-exceeded'))).toBe(false)
    expect(flatten(result.root).some((change) => change.warnings.includes('subtree-budget-exceeded'))).toBe(false)
  })

  it('bounds local similarity recall to the anchored sibling interval', async () => {
    const result = await diffMarkdown(
      '# Old Parent\n\nintro stable\n\nsetup alpha beta old\n\nmiddle stable',
      '# New Parent\n\nintro stable\n\nsetup alpha beta new\n\nmiddle stable\n\nsetup alpha beta alternative',
      { minSimilarity: 0.55 },
    )
    const targetParagraph = flatten(result.root).find(
      (change) =>
        change.blockType === 'paragraph' &&
        nodeText(change.oldNode) === 'setup alpha beta old' &&
        !!change.newNode,
    )

    expect(targetParagraph?.pairKind).toBe('match')
    expect(nodeText(targetParagraph?.newNode)).toBe('setup alpha beta new')
  })

  it('still recovers exact moves after large insertions near the original location', async () => {
    const result = await diffMarkdown(
      '# A\n\n## Stable\n\nkeep\n\n## Moved\n\ncontent\n\n# B',
      '# A\n\n## Stable\n\nkeep\n\n## Insert 1\n\na\n\n## Insert 2\n\nb\n\n## Insert 3\n\nc\n\n## Insert 4\n\nd\n\n## Insert 5\n\ne\n\n# B\n\n## Moved\n\ncontent',
    )
    const moveChanges = flatten(result.root).filter(
      (change) => change.kind === 'heading' && sectionTitle(change.oldNode ?? change.newNode) === 'Moved',
    )

    expect(moveChanges.map((change) => change.primaryOp).sort()).toEqual(['move', 'move'])
    expect(result.stats.moves).toBe(1)
  })

  it('recovers a heading move when additional ancestor headings extend the path beyond the legacy depth gate', async () => {
    const result = await diffMarkdown(
      '# Notes\n\n## Moved\n\ncontent\n\n# Other\n\nstable',
      '# Wrapper\n\n## Layer Two\n\n### Layer Three\n\n#### Notes\n\n##### Moved\n\ncontent\n\n# Other\n\nstable',
    )
    const moveChanges = flatten(result.root).filter(
      (change) => change.kind === 'heading' && sectionTitle(change.oldNode ?? change.newNode) === 'Notes',
    )

    expect(moveChanges.map((change) => change.primaryOp).sort()).toEqual(['move', 'move'])
    expect(result.stats.moves).toBe(1)
  })
})
