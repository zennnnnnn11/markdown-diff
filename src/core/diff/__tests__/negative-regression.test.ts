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
  newMarkdown: string,
  options?: Partial<DiffOptions>,
) {
  const oldTree = transformMarkdown(await parseMarkdown(oldMarkdown))
  const newTree = transformMarkdown(await parseMarkdown(newMarkdown))
  return diffMarkdownTrees(oldTree, newTree, options)
}

describe('diff negative regressions', () => {
  it('does not create local-similarity matches when sibling candidates are ambiguous', async () => {
    const result = await diffMarkdown(
      '# Alpha\n\nalpha beta gamma\n\nalpha beta delta',
      '# Beta\n\nalpha beta theta\n\nalpha beta lambda',
      { minSimilarity: 0.6 },
    )

    expect(result.matches.some((pair) => pair.matchKind === 'local-similarity')).toBe(false)
    const paragraphPairs = flatten(result.root).filter((change) => change.blockType === 'paragraph')
    expect(paragraphPairs.every((change) => change.pairKind !== 'match')).toBe(true)
  })

  it('does not create local-heading-slug matches when slug candidates are duplicated', async () => {
    const result = await diffMarkdown(
      '# Alpha\n\n## Repeat\n\nold one\n\n## Repeat\n\nold two',
      '# Beta\n\n## Repeat\n\nnew one\n\n## Repeat\n\nnew two',
      { minSimilarity: 0.55 },
    )

    expect(result.matches.some((pair) => pair.matchKind === 'local-heading-slug')).toBe(false)
  })

  it('does not mark a footnote as renamed when identifier and body both change', async () => {
    const result = await diffMarkdown(
      'Text[^1]\n\n[^1]: stable body',
      'Text[^note]\n\n[^note]: different body',
      { minSimilarity: 0.5 },
    )
    const footnote = flatten(result.root).find((change) => change.kind === 'footnote')

    expect(footnote?.status.renamed).not.toBe(true)
    expect(footnote?.pairKind).not.toBe('match')
  })

  it('does not create footnote identity matches when duplicate bodies make the pairing ambiguous', async () => {
    const result = await diffMarkdown(
      'Text[^1] and more[^2]\n\n[^1]: same body\n\n[^2]: same body',
      'Text[^a] and more[^b]\n\n[^a]: same body\n\n[^b]: same body',
      { minSimilarity: 0.5 },
    )
    const footnotes = flatten(result.root).filter((change) => change.kind === 'footnote')

    expect(result.matches.some((pair) => pair.matchKind === 'footnote-identity')).toBe(false)
    expect(result.matches.some((pair) => pair.matchKind === 'local-identity')).toBe(false)
    expect(footnotes.every((change) => change.status.renamed !== true)).toBe(true)
  })

  it('does not recover a heading move when slug matches but body similarity is weak', async () => {
    const result = await diffMarkdown(
      '# A\n\n## Moved\n\nalpha beta gamma\n\n# B',
      '# A\n\n# B\n\n## Moved\n\nquantum flux nebula',
    )

    const moved = flatten(result.root).filter((change) => change.primaryOp === 'move')
    const headingDeletes = flatten(result.root).filter(
      (change) => change.kind === 'heading' && change.primaryOp === 'delete',
    )
    const headingInserts = flatten(result.root).filter(
      (change) => change.kind === 'heading' && change.primaryOp === 'insert',
    )

    expect(moved).toHaveLength(0)
    expect(headingDeletes.length).toBeGreaterThanOrEqual(1)
    expect(headingInserts.length).toBeGreaterThanOrEqual(1)
  })

  it('does not recover a code move when the relocated block changes content', async () => {
    const result = await diffMarkdown(
      '# A\n\n```ts\nconst x = 1\n```\n\n# B',
      '# A\n\n# B\n\n```ts\nconst x = 2\n```',
    )
    const codeMoves = flatten(result.root).filter(
      (change) => change.blockType === 'code' && change.primaryOp === 'move',
    )

    expect(codeMoves).toHaveLength(0)
  })

  it('does not let enhanced local recovery force low-similarity structural matches', async () => {
    const result = await diffMarkdown(
      '# Alpha\n\n> old quote about apples\n\n- first item',
      '# Beta\n\n> quantum vacuum oscillation\n\n- zebra orbit',
      {
        enhancedLocalRecovery: true,
        minSimilarity: 0.8,
      },
    )
    const matchedBlockquote = flatten(result.root).find(
      (change) => change.kind === 'blockquote' && change.primaryOp === 'replace',
    )

    expect(matchedBlockquote).toBeUndefined()
    expect(result.matches).toHaveLength(1)
  })

  it('does not treat positional proximity alone as exact-self-with-context without neighboring witness hashes', async () => {
    const result = await diffMarkdown(
      '# Alpha\n\nbefore old\n\n## Stable\n\nBody',
      '# Beta\n\nbefore new\n\n## Stable\n\nBody',
    )

    const exactSelfWithContext = result.matches.filter((pair) => pair.matchKind === 'exact-self-with-context')
    expect(exactSelfWithContext).toHaveLength(0)
  })
})
