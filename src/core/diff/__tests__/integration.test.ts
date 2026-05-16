import { describe, expect, it } from 'vitest'
import { diffMarkdown, flatten } from './test-helpers'

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
      reorders: 0,
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

  it('keeps same-shape paragraph edits paired even when the text changes completely', async () => {
    const result = await diffMarkdown('# Intro\n\nhello', '# Intro\n\nworld')
    const paragraph = flatten(result.root).find((change) => change.blockType === 'paragraph')

    expect(paragraph?.primaryOp).toBe('replace')
    expect(paragraph?.oldId && paragraph?.newId).toBeTruthy()
  })

  it('keeps punctuation-only paragraph edits paired with character-level word spans', async () => {
    const result = await diffMarkdown('# Intro\n\n...', '# Intro\n\n!!!')
    const paragraph = flatten(result.root).find((change) => change.blockType === 'paragraph')
    const replaceSpan = paragraph?.inlineSpans?.find((span) => span.op === 'replace')

    expect(paragraph?.primaryOp).toBe('replace')
    expect(paragraph?.score).toBeLessThan(1)
    expect(replaceSpan?.wordSpans?.length).toBeGreaterThan(0)
    expect(replaceSpan?.wordSpans?.every((span) => (span.oldText ?? span.newText ?? '').length <= 3)).toBe(true)
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

  it('does not recover a punctuation-only leaf heading as a rename', async () => {
    const result = await diffMarkdown('# ...', '# !!!')
    const heading = flatten(result.root).find((change) => change.kind === 'heading')

    expect(heading?.status.renamed).toBe(false)
    expect(heading?.primaryOp).toBe('replace')
  })

  it('recovers a top-level heading rename even when descendants also change', async () => {
    const result = await diffMarkdown(
      [
        '# Semantic Markdown Diff',
        '',
        '## Overview',
        '',
        'The engine compares Markdown by structure instead of raw lines.',
        '',
        'It prefers conservative matches when a semantic operation is uncertain.',
        '',
        '## Installation',
        '',
        'Install dependencies with npm.',
        '',
        '## CLI',
        '',
        'Run the command with two Markdown files.',
        '',
        '## Configuration',
        '',
        'The engine accepts a small set of options.',
        '',
        '## Matching Rules',
        '',
        'The matcher first finds deterministic anchors.',
        '',
        '## Rendering',
        '',
        'Inline changes are shown inside paragraphs.',
      ].join('\n'),
      [
        '# Semantic Markdown Diff Engine',
        '',
        '## Summary',
        '',
        'The engine compares Markdown by structure instead of raw lines.',
        '',
        'It prefers conservative matches when a semantic operation is uncertain.',
        '',
        '## Installation',
        '',
        'Install dependencies with npm.',
        '',
        '## Configuration',
        '',
        'The engine accepts a focused set of options.',
        '',
        '## CLI',
        '',
        'Run the command with two Markdown files.',
        '',
        '## Rendering',
        '',
        'Inline changes are highlighted inside paragraphs.',
        '',
        '## Matching Rules',
        '',
        'The matcher first finds deterministic anchors.',
      ].join('\n'),
    )
    const topHeading = flatten(result.root).find(
      (change) => change.kind === 'heading' && sectionTitle(change.oldNode) === 'Semantic Markdown Diff',
    )

    expect(topHeading?.pairKind).toBe('match')
    expect(topHeading?.primaryOp).toBe('equal')
    expect(topHeading?.status.renamed).toBe(true)
    expect(topHeading?.titleInlineSpans?.length).toBeGreaterThan(0)
  })

  it('recovers a local heading rename from stable body content even when title tokens diverge', async () => {
    const result = await diffMarkdown(
      [
        '# Parent',
        '',
        '## Overview',
        '',
        'The engine compares Markdown by structure instead of raw lines.',
        '',
        'It prefers conservative matches when a semantic operation is uncertain.',
      ].join('\n'),
      [
        '# Parent',
        '',
        '## Summary',
        '',
        'The engine compares Markdown by structure instead of raw lines.',
        '',
        'It prefers conservative matches when a semantic operation is uncertain.',
      ].join('\n'),
    )
    const localHeading = flatten(result.root).find(
      (change) => change.kind === 'heading' && sectionTitle(change.newNode) === 'Summary',
    )

    expect(localHeading?.pairKind).toBe('match')
    expect(localHeading?.primaryOp).toBe('equal')
    expect(localHeading?.status.renamed).toBe(true)
  })

  it('recovers parallel sibling heading renames with identical body content without crossing pairs', async () => {
    const result = await diffMarkdown(
      [
        '# Parent',
        '',
        '## Overview',
        '',
        'Shared explanation.',
        '',
        '## Background',
        '',
        'Shared explanation.',
      ].join('\n'),
      [
        '# Parent',
        '',
        '## Summary',
        '',
        'Shared explanation.',
        '',
        '## Context',
        '',
        'Shared explanation.',
      ].join('\n'),
    )
    const headings = flatten(result.root).filter((change) => change.kind === 'heading')
    const summary = headings.find((change) => sectionTitle(change.newNode) === 'Summary')
    const context = headings.find((change) => sectionTitle(change.newNode) === 'Context')

    expect(result.matches.some((pair) => pair.matchKind === 'local-heading-body')).toBe(false)
    expect(summary?.oldNode ? sectionTitle(summary.oldNode) : undefined).toBe('Overview')
    expect(summary?.pairKind).toBe('match')
    expect(summary?.primaryOp).toBe('equal')
    expect(summary?.status.renamed).toBe(true)
    expect(context?.oldNode ? sectionTitle(context.oldNode) : undefined).toBe('Background')
    expect(context?.pairKind).toBe('match')
    expect(context?.primaryOp).toBe('equal')
    expect(context?.status.renamed).toBe(true)
    expect(headings.some((change) => change.primaryOp === 'insert' || change.primaryOp === 'delete')).toBe(false)
  })

  it('keeps a top-level heading rename while still leaving weak descendants unmatched', async () => {
    const result = await diffMarkdown(
      [
        '# Alpha Manual',
        '',
        '## Shared One',
        '',
        'stable one',
        '',
        '## Shared Two',
        '',
        'stable two',
        '',
        '## Old Only',
        '',
        'legacy body',
      ].join('\n'),
      [
        '# Beta Manual',
        '',
        '## Shared One',
        '',
        'stable one',
        '',
        '## New Only',
        '',
        'replacement body',
      ].join('\n'),
    )
    const topHeading = flatten(result.root).find(
      (change) => change.kind === 'heading' && sectionTitle(change.oldNode) === 'Alpha Manual',
    )
    const newOnlyHeading = flatten(result.root).find(
      (change) => change.kind === 'heading' && sectionTitle(change.newNode) === 'New Only',
    )

    expect(topHeading?.pairKind).toBe('match')
    expect(topHeading?.status.renamed).toBe(true)
    expect(flatten(result.root).some((change) => change.kind === 'heading' && sectionTitle(change.oldNode) === 'Shared Two' && change.primaryOp === 'delete')).toBe(true)
    expect(newOnlyHeading?.primaryOp).toBe('replace')
  })

  it('keeps exact-self heading matches alive when crossed anchors collapse the global preorder interval', async () => {
    const result = await diffMarkdown(
      [
        '# Semantic Markdown Diff Handbook',
        '',
        'Intro paragraph.',
        '',
        '## Overview',
        '',
        'Overview body.',
        '',
        '## Quick Start',
        '',
        'Install the package.',
        '',
        '## Architecture',
        '',
        'The pipeline has four stages.',
        '',
        '## Configuration',
        '',
        'The default configuration is designed for conservative matching.',
        '',
        '## Matching Rules',
        '',
        'The matcher first searches for deterministic anchors.',
        '',
        'Then it aligns child nodes inside matched parents.',
        '',
        'Finally it recovers moves, renames, and metadata updates.',
        '',
        '## Rendering',
        '',
        'The renderer consumes a diff tree and produces visual spans.',
        '',
        'Inline changes are shown inside paragraphs.',
        '',
        '> Rendering should not decide whether two nodes are the same entity.',
        '',
        '## CLI Usage',
        '',
        'The CLI accepts two Markdown files and writes a structured report.',
        '',
        '## API Reference',
        '',
        'The public API exposes a single high-level function.',
      ].join('\n'),
      [
        '# Semantic Markdown Diff Handbook',
        '',
        'Intro paragraph.',
        '',
        '## Summary',
        '',
        'Overview body.',
        '',
        '## Quick Start',
        '',
        'Install the package.',
        '',
        '## Configuration',
        '',
        'The default configuration is designed for balanced matching.',
        '',
        '## CLI Usage',
        '',
        'The CLI accepts two Markdown files and writes a structured report.',
        '',
        '## Architecture',
        '',
        'The pipeline has four stages.',
        '',
        '## Rendering',
        '',
        'The renderer consumes a diff tree and produces visual spans.',
        '',
        'Inline changes are highlighted inside paragraphs.',
        '',
        '> Rendering should not decide whether two nodes are the same entity.',
        '> It should only present decisions made by the diff engine.',
        '',
        '## API Reference',
        '',
        'The public API exposes a single high-level function.',
        '',
        '## Matching Rules',
        '',
        'The matcher first searches for deterministic anchors.',
        '',
        'Then it aligns child nodes inside matched parents.',
        '',
        'Finally it recovers moves, renames, and metadata updates.',
      ].join('\n'),
    )
    const headings = flatten(result.root).filter((change) => change.kind === 'heading')
    const rendering = headings.find(
      (change) => sectionTitle(change.oldNode) === 'Rendering' || sectionTitle(change.newNode) === 'Rendering',
    )
    const matchingRules = headings.find(
      (change) => sectionTitle(change.oldNode) === 'Matching Rules' || sectionTitle(change.newNode) === 'Matching Rules',
    )

    expect(rendering?.pairKind).toBe('match')
    expect(rendering?.primaryOp).toBe('equal')
    expect(rendering?.status.selfChanged).toBe(false)
    expect(rendering?.status.descendantChanged).toBe(true)
    expect(matchingRules?.pairKind).toBe('match')
    expect(matchingRules?.primaryOp).toBe('equal')
    expect(
      headings.some(
        (change) =>
          (sectionTitle(change.oldNode) === 'Rendering' || sectionTitle(change.newNode) === 'Rendering') &&
          (change.primaryOp === 'delete' || change.primaryOp === 'insert'),
      ),
    ).toBe(false)
    expect(
      headings.some(
        (change) =>
          (sectionTitle(change.oldNode) === 'Matching Rules' || sectionTitle(change.newNode) === 'Matching Rules') &&
          (change.primaryOp === 'delete' || change.primaryOp === 'insert'),
      ),
    ).toBe(false)
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

  it('keeps same-identifier footnotes paired when the footnote body changes', async () => {
    const result = await diffMarkdown('Text[^1]\n\n[^1]: old body', 'Text[^1]\n\n[^1]: new body')
    const footnote = flatten(result.root).find((change) => change.kind === 'footnote')
    const paragraph = flatten(result.root).find(
      (change) =>
        change.blockType === 'paragraph' &&
        nodeText(change.oldNode).includes('old body') &&
        nodeText(change.newNode).includes('new body'),
    )

    expect(footnote?.oldId && footnote?.newId).toBeTruthy()
    expect(footnote?.primaryOp).not.toBe('insert')
    expect(footnote?.primaryOp).not.toBe('delete')
    expect(paragraph?.primaryOp).toBe('replace')
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

  it('treats fenced code language changes with stable title and content as a code metadata update', async () => {
    const result = await diffMarkdown(
      '```js title=\"diff.config\"\nexport default {}\n```',
      '```ts title=\"diff.config\"\nexport default {}\n```',
    )
    const code = flatten(result.root).find((change) => change.blockType === 'code')

    expect(code?.primaryOp).toBe('meta-update')
    expect(code?.status.metaChanged).toBe(true)
    expect(code?.primaryOp).not.toBe('replace')
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

  it('captures nested frontmatter meta-updates without flagging unchanged nested fields', async () => {
    const result = await diffMarkdown(
      `---
version: 1.0.0
status: draft
owner: alice
review:
  required: true
  reviewer: bob
features:
  - parser
  - transformer
  - diff
limits:
  maxNodes: 12000
  timeoutMs: 3000
---`,
      `---
version: 1.1.0
status: reviewed
owner: chen
review:
  required: true
  reviewer: dana
features:
  - parser
  - transformer
  - diff
  - renderer
limits:
  maxNodes: 16000
  timeoutMs: 3000
---`,
    )
    const frontmatter = flatten(result.root).find((change) => change.kind === 'frontmatter')

    expect(frontmatter?.primaryOp).toBe('meta-update')
    expect(frontmatter?.metadataChanges?.map((entry) => entry.path)).toEqual([
      '$.features',
      '$.limits.maxNodes',
      '$.owner',
      '$.review.reviewer',
      '$.status',
      '$.version',
    ])
    expect(frontmatter?.metadataChanges?.some((entry) => entry.path === '$.limits.timeoutMs')).toBe(false)
    expect(result.quality.warningCount).toBe(0)
  })

  it('treats checkbox toggles as list-item metadata updates rather than text replaces', async () => {
    const result = await diffMarkdown('- [ ] Render visual diff', '- [x] Render visual diff')
    const listItem = flatten(result.root).find((change) => change.kind === 'listItem')
    const paragraphReplace = flatten(result.root).find(
      (change) => change.blockType === 'paragraph' && change.primaryOp === 'replace',
    )

    expect(listItem?.primaryOp).toBe('meta-update')
    expect(listItem?.status.metaChanged).toBe(true)
    expect(paragraphReplace).toBeUndefined()
  })

  it('keeps list item text edits paired when the item structure stays the same', async () => {
    const result = await diffMarkdown('- old', '- new')
    const listItem = flatten(result.root).find((change) => change.kind === 'listItem')
    const paragraph = flatten(result.root).find((change) => change.blockType === 'paragraph')

    expect(listItem?.oldId && listItem?.newId).toBeTruthy()
    expect(listItem?.primaryOp).toBe('replace')
    expect(paragraph?.primaryOp).toBe('replace')
  })

  it('keeps blockquote content edits paired inside the quote subtree', async () => {
    const result = await diffMarkdown('> old', '> new')
    const blockquote = flatten(result.root).find((change) => change.kind === 'blockquote')
    const paragraph = flatten(result.root).find((change) => change.blockType === 'paragraph')

    expect(blockquote?.oldId && blockquote?.newId).toBeTruthy()
    expect(blockquote?.primaryOp).toBe('replace')
    expect(paragraph?.primaryOp).toBe('replace')
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

  it('keeps blockquote children aligned with and without enhanced local recovery', async () => {
    const oldMarkdown = `# Alpha Project Notes

> old quote

- first`
    const newMarkdown = `# Beta Project Notes

> new quote

- second`
    const withoutFallback = await diffMarkdown(oldMarkdown, newMarkdown, { enhancedLocalRecovery: false, minSimilarity: 0.55 })
    const withFallback = await diffMarkdown(oldMarkdown, newMarkdown, {
      enhancedLocalRecovery: true,
      minSimilarity: 0.55,
    })
    const oldHeading = flatten(withoutFallback.root).find((change) => change.kind === 'heading' && change.oldId && change.newId)
    const newHeading = flatten(withFallback.root).find((change) => change.kind === 'heading' && change.oldId && change.newId)

    expect(oldHeading?.children.some((child) => child.kind === 'blockquote' && child.primaryOp === 'replace')).toBe(true)
    expect(newHeading?.children.some((child) => child.kind === 'blockquote' && child.primaryOp === 'replace')).toBe(true)
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
      maxLocalAlignmentCost: 200,
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

describe('hungarian gap matching integration', () => {
  it('matches gap nodes optimally across similar paragraphs', async () => {
    const result = await diffMarkdown(
      [
        '# Section',
        '',
        'alpha one',
        '',
        'beta two',
        '',
        'gamma three',
      ].join('\n'),
      [
        '# Section',
        '',
        'alpha ONE',
        '',
        'gamma THREE',
        '',
        'beta TWO',
      ].join('\n'),
    )
    const changes = flatten(result.root).filter(
      (change) => change.blockType === 'paragraph' && change.primaryOp === 'replace',
    )

    // Each old paragraph should pair with its matching new paragraph
    const alphaChange = changes.find(
      (change) => nodeText(change.oldNode).includes('alpha one'),
    )
    const betaChange = changes.find(
      (change) => nodeText(change.oldNode).includes('beta two'),
    )
    const gammaChange = changes.find(
      (change) => nodeText(change.oldNode).includes('gamma three'),
    )

    expect(alphaChange).toBeDefined()
    expect(nodeText(alphaChange!.newNode)).toContain('alpha')
    expect(betaChange).toBeDefined()
    expect(nodeText(betaChange!.newNode)).toContain('beta')
    expect(gammaChange).toBeDefined()
    expect(nodeText(gammaChange!.newNode)).toContain('gamma')
  })

  it('single candidate per node produces same result as greedy (regression)', async () => {
    const result = await diffMarkdown(
      [
        '# Section',
        '',
        'A unique paragraph here',
        '',
        '```js',
        'const x = 1',
        '```',
      ].join('\n'),
      [
        '# Section',
        '',
        'A unique paragraph here modified',
        '',
        '```js',
        'const x = 2',
        '```',
      ].join('\n'),
    )
    const paragraph = flatten(result.root).find(
      (change) => change.blockType === 'paragraph' && change.primaryOp === 'replace',
    )
    const code = flatten(result.root).find(
      (change) => change.blockType === 'code' && change.primaryOp === 'replace',
    )

    expect(paragraph?.oldId).toBeDefined()
    expect(paragraph?.newId).toBeDefined()
    expect(code?.oldId).toBeDefined()
    expect(code?.newId).toBeDefined()
  })

  it('preserves definition identifier matching through gap', async () => {
    const result = await diffMarkdown(
      '[foo]: https://example.com "Foo"',
      '[foo]: https://example.com/updated "Foo Updated"',
    )
    const definition = flatten(result.root).find(
      (change) => change.blockType === 'definition',
    )

    expect(definition?.oldId).toBeDefined()
    expect(definition?.newId).toBeDefined()
    expect(definition?.primaryOp).not.toBe('insert')
    expect(definition?.primaryOp).not.toBe('delete')
  })

  it('preserves short heading fallback', async () => {
    const result = await diffMarkdown(
      [
        '# Parent',
        '',
        '## AB',
        '',
        'stable body content for matching',
      ].join('\n'),
      [
        '# Parent',
        '',
        '## XY',
        '',
        'stable body content for matching',
      ].join('\n'),
    )
    const heading = flatten(result.root).find(
      (change) => change.kind === 'heading' && sectionTitle(change.newNode) === 'XY',
    )

    // The heading should be paired (match or align), not split into insert+delete
    expect(heading?.oldId).toBeDefined()
    expect(heading?.newId).toBeDefined()
    expect(heading?.primaryOp).not.toBe('insert')
    expect(heading?.primaryOp).not.toBe('delete')
  })

  it('rejects pairs below minSimilarity threshold', async () => {
    // Use two paragraphs on each side so gap matching applies,
    // with one pair being dissimilar content and a high threshold
    const result = await diffMarkdown(
      [
        '# Section',
        '',
        'stable paragraph that stays the same',
        '',
        'The quick brown fox jumps over the lazy dog on a sunny day',
      ].join('\n'),
      [
        '# Section',
        '',
        'stable paragraph that stays the same',
        '',
        '!@#$%^&*()_+',
      ].join('\n'),
      { minSimilarity: 0.9 },
    )
    const changes = flatten(result.root)
    const dissimilarChanges = changes.filter(
      (change) =>
        change.blockType === 'paragraph' &&
        (change.primaryOp === 'insert' || change.primaryOp === 'delete'),
    )

    // The dissimilar paragraphs should produce insert+delete, not a replace pair
    expect(dissimilarChanges.length).toBeGreaterThanOrEqual(1)
  })

  it('handles empty gap gracefully', async () => {
    const result = await diffMarkdown(
      '# Title\n\nBody text here',
      '# Title\n\nBody text here',
    )
    const changes = flatten(result.root)

    // All nodes are equal — no aligns needed
    expect(changes.every((change) => change.primaryOp === 'equal')).toBe(true)
    expect(result.stats.inserts).toBe(0)
    expect(result.stats.deletes).toBe(0)
    expect(result.stats.replaces).toBe(0)
  })

  it('never cross-pairs different shapes in gap', async () => {
    const result = await diffMarkdown(
      [
        '# Section',
        '',
        'old paragraph text',
        '',
        '```',
        'old code block',
        '```',
      ].join('\n'),
      [
        '# Section',
        '',
        'new paragraph text',
        '',
        '```',
        'new code block',
        '```',
      ].join('\n'),
    )
    const changes = flatten(result.root)
    const paragraph = changes.find(
      (change) => change.blockType === 'paragraph' && change.primaryOp === 'replace',
    )
    const code = changes.find(
      (change) => change.blockType === 'code' && change.primaryOp === 'replace',
    )

    // Paragraph must pair with paragraph, code with code
    expect(paragraph?.oldId).toBeDefined()
    expect(paragraph?.newId).toBeDefined()
    expect(code?.oldId).toBeDefined()
    expect(code?.newId).toBeDefined()

    // No node should have a cross-shape pairing
    const crossPaired = changes.find(
      (change) =>
        change.oldId &&
        change.newId &&
        change.primaryOp === 'replace' &&
        // Check if a paragraph paired with code or vice versa
        ((nodeText(change.oldNode).includes('paragraph') &&
          nodeText(change.newNode).includes('code block')) ||
          (nodeText(change.oldNode).includes('code block') &&
            nodeText(change.newNode).includes('paragraph'))),
    )
    expect(crossPaired).toBeUndefined()
  })
})
