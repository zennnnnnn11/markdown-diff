import { describe, expect, it } from 'vitest'
import { diffMarkdown, flatten } from './test-helpers'

function definitionChanges(result: Awaited<ReturnType<typeof diffMarkdown>>) {
  return flatten(result.root).filter((change) => change.blockType === 'definition')
}

describe('definition edge cases', () => {
  it('keeps a same-identifier definition paired even when surrounding context paragraphs change completely', async () => {
    const result = await diffMarkdown(
      'API docs reference [docs].\n\n[docs]: https://example.com/api/v1 "API Reference"',
      'Migration guide reference [docs].\n\n[docs]: https://example.com/migrate "Migration Guide"',
    )
    const definition = definitionChanges(result).find((change) => change.oldId && change.newId)

    expect(definition?.pairKind).toBe('match')
    expect(definition?.matchKind).toBe('definition-identifier')
    expect(definition?.primaryOp).toBe('meta-update')
    expect(definition?.status.metaChanged).toBe(true)
    expect(definitionChanges(result).some((change) => change.primaryOp === 'delete' || change.primaryOp === 'insert')).toBe(false)
    expect(result.matches.some((pair) => pair.matchKind === 'definition-identifier')).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('keeps same-identifier definitions paired across root-level reordering and metadata changes', async () => {
    const result = await diffMarkdown(
      'Before.\n\n[docs]: https://example.com/docs/v1 "Docs v1"\n\n# Heading\n\nbody',
      '# Heading\n\nbody\n\nAfter.\n\n[docs]: https://example.com/docs/v2 "Docs v2"',
    )
    const definitions = definitionChanges(result)
    const definition = definitions.find((change) => change.oldId && change.newId)

    expect(definitions.some((change) => change.primaryOp === 'delete' || change.primaryOp === 'insert')).toBe(false)
    expect(definition?.pairKind).toBe('match')
    expect(definition?.primaryOp).toBe('meta-update')
  })

  it('consumes a preexisting definition match from a root gap without swallowing unrelated inserts', async () => {
    const result = await diffMarkdown(
      [
        'Before.',
        '',
        '[docs]: https://example.com/docs/v1 "Docs v1"',
        '',
        '# Heading',
        '',
        'body',
      ].join('\n'),
      [
        '# Heading',
        '',
        'body',
        '',
        'After.',
        '',
        '[docs]: https://example.com/docs/v2 "Docs v2"',
        '',
        '[extra]: https://example.com/extra "Extra"',
      ].join('\n'),
    )
    const definitions = definitionChanges(result)
    const docsDefinition = definitions.find(
      (change) => change.oldId && change.newId && String((change.newNode as { identifier?: string } | undefined)?.identifier) === 'docs',
    )
    const extraDefinition = definitions.find(
      (change) => change.primaryOp === 'insert' && String((change.newNode as { identifier?: string } | undefined)?.identifier) === 'extra',
    )

    expect(docsDefinition?.pairKind).toBe('match')
    expect(docsDefinition?.primaryOp).toBe('meta-update')
    expect(extraDefinition?.primaryOp).toBe('insert')
    expect(definitions.some((change) => change.primaryOp === 'delete')).toBe(false)
  })

  it('pairs same-identifier definitions even when the set of referencing paragraphs changes', async () => {
    const result = await diffMarkdown(
      'Read [docs] for the API.\n\n[docs]: https://example.com/api/v1 "API Docs"',
      'Use [docs] for the migration path.\n\n[docs]: https://example.com/migrate/v2 "Migration Docs"',
    )
    const definition = definitionChanges(result).find((change) => change.oldId && change.newId)

    expect(definition?.pairKind).toBe('match')
    expect(definition?.primaryOp).toBe('meta-update')
    expect(result.stats.metaUpdates).toBeGreaterThanOrEqual(1)
  })

  it('classifies a same-identifier semantic replacement as a meta-update rather than delete plus insert', async () => {
    const result = await diffMarkdown(
      '[docs]: https://example.com/docs "Official Documentation"',
      '[docs]: https://vendor.example.net/spec "External Specification"',
    )
    const definitions = definitionChanges(result)
    const definition = definitions.find((change) => change.oldId && change.newId)

    expect(definitions.some((change) => change.primaryOp === 'delete' || change.primaryOp === 'insert')).toBe(false)
    expect(definition?.primaryOp).toBe('meta-update')
    expect(result.stats).toMatchObject({
      inserts: 0,
      deletes: 0,
      metaUpdates: 1,
    })
  })

  it('falls back to delete plus insert when a definition changes identifier and destination together', async () => {
    const result = await diffMarkdown(
      '[spec]: https://example.com/spec "Spec"',
      '[guide]: https://example.com/guide "Guide"',
      { minSimilarity: 0.5 },
    )
    const definitions = definitionChanges(result)

    expect(definitions.some((change) => change.oldId && change.newId)).toBe(false)
    expect(definitions.filter((change) => change.primaryOp === 'delete')).toHaveLength(1)
    expect(definitions.filter((change) => change.primaryOp === 'insert')).toHaveLength(1)
  })

  it('does not create identifier-based matches when only one side has duplicate identifiers', async () => {
    const result = await diffMarkdown(
      '[docs]: https://example.com/one "One"',
      ['[docs]: https://example.com/two "Two"', '[docs]: https://example.com/three "Three"'].join('\n\n'),
    )
    const definitions = definitionChanges(result)

    expect(result.matches.some((pair) => pair.matchKind === 'definition-identifier')).toBe(false)
    expect(definitions.some((change) => change.oldId && change.newId)).toBe(false)
  })

  it('does not create identifier-based matches when both sides have duplicate identifiers', async () => {
    const result = await diffMarkdown(
      ['[docs]: https://example.com/one "One"', '[docs]: https://example.com/two "Two"'].join('\n\n'),
      ['[docs]: https://example.com/three "Three"', '[docs]: https://example.com/four "Four"'].join('\n\n'),
    )
    const definitions = definitionChanges(result)

    expect(result.matches.some((pair) => pair.matchKind === 'definition-identifier')).toBe(false)
    expect(definitions.some((change) => change.oldId && change.newId)).toBe(false)
    expect(definitions.filter((change) => change.primaryOp === 'delete')).toHaveLength(2)
    expect(definitions.filter((change) => change.primaryOp === 'insert')).toHaveLength(2)
  })

  it('prefers definition-identity over identifier matching for pure renames', async () => {
    const result = await diffMarkdown(
      '[repo]: https://example.com/docs "Documentation"',
      '[source]: https://example.com/docs "Documentation"',
    )
    const definition = result.matches.find((pair) => pair.matchKind === 'definition-identity')

    expect(definition).toBeDefined()
    expect(result.matches.some((pair) => pair.matchKind === 'definition-identifier')).toBe(false)
  })

  it('keeps summary stats smooth for same-identifier replacements that overhaul the destination', async () => {
    const result = await diffMarkdown(
      '[docs]: https://example.com/start "Quick Start Guide"',
      '[docs]: https://reference.example.org/full "Protocol Reference"',
    )

    expect(result.stats.metaUpdates).toBe(1)
    expect(result.stats.inserts).toBe(0)
    expect(result.stats.deletes).toBe(0)
    expect(result.warnings).toEqual([])
  })

  it('does not let identifier-based recovery swallow unrelated deletions alongside a same-identifier meta-update', async () => {
    const result = await diffMarkdown(
      [
        '[docs]: https://example.com/start "Quick Start Guide"',
        '',
        '[legacy]: https://example.com/legacy "Legacy Guide"',
      ].join('\n'),
      '[docs]: https://reference.example.org/full "Protocol Reference"',
    )
    const definitions = definitionChanges(result)
    const docsDefinition = definitions.find(
      (change) => change.oldId && change.newId && String((change.oldNode as { identifier?: string } | undefined)?.identifier) === 'docs',
    )
    const legacyDefinition = definitions.find(
      (change) => change.primaryOp === 'delete' && String((change.oldNode as { identifier?: string } | undefined)?.identifier) === 'legacy',
    )

    expect(docsDefinition?.pairKind).toBe('match')
    expect(docsDefinition?.primaryOp).toBe('meta-update')
    expect(legacyDefinition?.primaryOp).toBe('delete')
    expect(definitions.filter((change) => change.primaryOp === 'delete')).toHaveLength(1)
  })

  it('still cleanly renames a unique definition in a document that also reorders sections and changes frontmatter', async () => {
    const result = await diffMarkdown(
      [
        '---',
        'title: Old',
        '---',
        '',
        '# A',
        '',
        'See [repo].',
        '',
        '[repo]: https://example.com/docs "Documentation"',
        '',
        '## Later',
        '',
        'tail',
      ].join('\n'),
      [
        '---',
        'title: New',
        '---',
        '',
        '## Later',
        '',
        'tail',
        '',
        '# A',
        '',
        'See [source].',
        '',
        '[source]: https://example.com/docs "Documentation"',
      ].join('\n'),
    )
    const definition = definitionChanges(result).find((change) => change.oldId && change.newId)

    expect(definition?.pairKind).toBe('match')
    expect(definition?.primaryOp).toBe('equal')
    expect(definition?.status.renamed).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('keeps the same-identifier match alive in a complex mixed document without degrading quality', async () => {
    const result = await diffMarkdown(
      [
        '# Intro',
        '',
        'Paragraph about [docs].',
        '',
        '## Details',
        '',
        'More about [docs].',
        '',
        '[docs]: https://example.com/v1 "Docs v1"',
        '',
        '[repo]: https://example.com/repo "Repository"',
      ].join('\n'),
      [
        '# Intro',
        '',
        'Paragraph about [docs].',
        '',
        '## Extra',
        '',
        'Another paragraph.',
        '',
        '## Details',
        '',
        'More about [docs] and [source].',
        '',
        '[docs]: https://example.com/v2 "Docs v2"',
        '',
        '[source]: https://example.com/repo "Repository"',
      ].join('\n'),
    )
    const docsDefinition = definitionChanges(result).find(
      (change) => change.oldId && change.newId && String((change.oldNode as { identifier?: string } | undefined)?.identifier) === 'docs',
    )
    const renamedDefinition = definitionChanges(result).find(
      (change) => change.status.renamed && String((change.newNode as { identifier?: string } | undefined)?.identifier) === 'source',
    )

    expect(docsDefinition?.pairKind).toBe('match')
    expect(docsDefinition?.primaryOp).toBe('meta-update')
    expect(renamedDefinition?.pairKind).toBe('match')
    expect(renamedDefinition?.primaryOp).toBe('equal')
    expect(result.quality.degradedCount).toBe(0)
    expect(result.warnings).toEqual([])
  })
})
