import { describe, expect, it } from 'vitest'
import { readTextFile } from '../read-text-file'

describe('readTextFile', () => {
  it('reads normal file content', async () => {
    const file = new File(['# Hello\n\nWorld'], 'test.md', { type: 'text/markdown' })
    const result = await readTextFile(file)
    expect(result).toBe('# Hello\n\nWorld')
  })

  it('returns empty string for empty file', async () => {
    const file = new File([], 'empty.md', { type: 'text/markdown' })
    const result = await readTextFile(file)
    expect(result).toBe('')
  })

  it('rejects file exceeding 5 MB', async () => {
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1)
    const file = new File([oversized], 'big.md')
    await expect(readTextFile(file)).rejects.toThrow('文件过大')
    await expect(readTextFile(file)).rejects.toThrow('上限 5 MB')
  })

  it('accepts file exactly at 5 MB boundary', async () => {
    const exact = new Uint8Array(5 * 1024 * 1024)
    exact.fill(0x41) // 'A'
    const file = new File([exact], 'boundary.md')
    const result = await readTextFile(file)
    expect(result).toHaveLength(5 * 1024 * 1024)
  })
})
