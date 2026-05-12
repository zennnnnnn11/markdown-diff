import { describe, expect, it } from 'vitest'
import { diffFrontmatter, parseFrontmatter } from '../frontmatter'

describe('frontmatter diff', () => {
  it('returns undefined when the type or raw value is missing', () => {
    expect(parseFrontmatter(undefined, 'title: Test')).toBeUndefined()
    expect(parseFrontmatter('yaml', undefined)).toBeUndefined()
  })

  it('parses yaml and toml frontmatter payloads', () => {
    expect(
      parseFrontmatter(
        'yaml',
        ['title: Test', 'tags:', '  - diff', 'enabled: true'].join('\n'),
      ),
    ).toEqual({
      title: 'Test',
      tags: ['diff'],
      enabled: true,
    })

    expect(
      parseFrontmatter(
        'toml',
        ['title = "Test"', 'enabled = true', 'count = 2'].join('\n'),
      ),
    ).toEqual({
      title: 'Test',
      enabled: true,
      count: 2,
    })
  })

  it('parses nested tables and arrays from toml frontmatter payloads', () => {
    expect(
      parseFrontmatter(
        'toml',
        ['title = "Test"', 'features = ["diff", "render"]', '[limits]', 'max_nodes = 16000'].join('\n'),
      ),
    ).toEqual({
      title: 'Test',
      features: ['diff', 'render'],
      limits: {
        max_nodes: 16000,
      },
    })
  })

  it('builds stable path-level metadata changes for parsed frontmatter', () => {
    const changes = diffFrontmatter(
      'yaml',
      ['title: Old', 'meta:', '  owner: alice'].join('\n'),
      'yaml',
      ['title: New', 'meta:', '  owner: bob', '  tags:', '    - diff'].join('\n'),
    )

    expect(changes).toEqual([
      { path: '$.meta.owner', oldValue: 'alice', newValue: 'bob', op: 'replace' },
      { path: '$.meta.tags', newValue: ['diff'], op: 'insert' },
      { path: '$.title', oldValue: 'Old', newValue: 'New', op: 'replace' },
    ])
  })

  it('treats semantically equal yaml and toml frontmatter as unchanged', () => {
    const changes = diffFrontmatter(
      'yaml',
      ['title: Test', 'enabled: true', 'count: 2'].join('\n'),
      'toml',
      ['title = "Test"', 'enabled = true', 'count = 2'].join('\n'),
    )

    expect(changes).toEqual([])
  })

  it('falls back to whole-value metadata diff when only one side parses successfully', () => {
    const changes = diffFrontmatter(
      'yaml',
      'title: Old',
      'toml',
      'title = ',
    )

    expect(changes).toEqual([
      {
        path: '$',
        oldValue: 'title: Old',
        newValue: 'title = ',
        op: 'replace',
      },
    ])
  })

  it('falls back to whole-value metadata diff when parsing fails', () => {
    const changes = diffFrontmatter(
      'yaml',
      'title: [unterminated',
      'yaml',
      'title: fixed',
    )

    expect(changes).toEqual([
      {
        path: '$',
        oldValue: 'title: [unterminated',
        newValue: 'title: fixed',
        op: 'replace',
      },
    ])
  })

  it('handles deletes and scalar root replacements through metadata diff fallback', () => {
    expect(
      diffFrontmatter(
        'yaml',
        ['title: Old', 'owner: alice'].join('\n'),
        'yaml',
        'title: Old',
      ),
    ).toEqual([{ path: '$.owner', oldValue: 'alice', op: 'delete' }])

    expect(diffFrontmatter('yaml', '42', 'yaml', '43')).toEqual([
      { path: '$', oldValue: 42, newValue: 43, op: 'replace' },
    ])
  })

  it('returns no changes when both frontmatter payloads are missing and treats array edits as path-level replacements', () => {
    expect(diffFrontmatter(undefined, undefined, undefined, undefined)).toEqual([])

    expect(
      diffFrontmatter(
        'yaml',
        ['features:', '  - parser', '  - diff'].join('\n'),
        'yaml',
        ['features:', '  - parser', '  - renderer'].join('\n'),
      ),
    ).toEqual([
      { path: '$.features', oldValue: ['parser', 'diff'], newValue: ['parser', 'renderer'], op: 'replace' },
    ])
  })
})
