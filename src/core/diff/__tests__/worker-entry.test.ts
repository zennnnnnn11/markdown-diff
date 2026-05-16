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
})
