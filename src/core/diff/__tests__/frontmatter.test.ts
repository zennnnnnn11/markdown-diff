import { describe, expect, it } from 'vitest'
import { diffFrontmatter, parseFrontmatter } from '../frontmatter'

describe('frontmatter diff', () => {
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
})
