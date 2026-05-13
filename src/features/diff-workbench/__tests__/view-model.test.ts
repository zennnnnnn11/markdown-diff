import { describe, expect, it } from 'vitest'

import { buildDetailPanel, buildProjectionLines, flattenChanges, runMarkdownDiff } from '../view-model'

describe('diff workbench view-model', () => {
  it('projects paragraph replacements into line tones and inline segments', async () => {
    const result = await runMarkdownDiff('# Intro\n\nhello old world', '# Intro\n\nhello new world')
    const lines = buildProjectionLines('# Intro\n\nhello new world', result)
    const paragraphLine = lines[2]
    const paragraphChange = flattenChanges(result.root).find((change) => change.blockType === 'paragraph')
    const detail = buildDetailPanel(paragraphChange)

    expect(paragraphLine).toBeDefined()
    expect(paragraphLine?.baseTone).toBe('replace')
    expect(detail?.inlineSegments?.some((segment) => segment.tone === 'replace')).toBe(true)
    expect(detail?.inlineSegments?.map((segment) => segment.text).join('')).toContain('hello')
  })

  it('projects heading renames as rename tone and exposes detail metadata', async () => {
    const result = await runMarkdownDiff('# Old Name\n\nBody', '# New Name\n\nBody')
    const lines = buildProjectionLines('# New Name\n\nBody', result)
    const headingChange = flattenChanges(result.root).find((change) => change.kind === 'heading' && change.status.renamed)
    const detail = buildDetailPanel(headingChange)

    expect(lines[0]?.baseTone).toBe('rename')
    expect(lines[0]?.matchedTones).toContain('rename')
    expect(detail?.pairing).toBe('稳定匹配')
    expect(detail?.inlineSegments?.some((segment) => segment.tone === 'rename')).toBe(true)
  })

  it('projects frontmatter metadata updates back to source lines', async () => {
    const result = await runMarkdownDiff(
      '---\nversion: 2.0.0\nstatus: draft\n---',
      '---\nversion: 2.1.0\nstatus: draft\n---',
    )
    const lines = buildProjectionLines('---\nversion: 2.1.0\nstatus: draft\n---', result)

    expect(lines[1]?.text).toBe('version: 2.1.0')
    expect(lines[1]?.baseTone).toBe('meta')
  })
})
