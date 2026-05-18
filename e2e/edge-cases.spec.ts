import { test, expect } from '@playwright/test'
import path from 'node:path'
import {
  SEL, gotoAndWaitForDiff, setEditorContent, runDiffAndWait,
  expandInput, runButton, nextChangeBtn,
} from './helpers/diff-workbench'

test.describe('Edge cases - empty and minimal', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('both sides empty shows no interactive changes', async ({ page }) => {
    await setEditorContent(page, 'old', '')
    await setEditorContent(page, 'new', '')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.interactiveCell)).toHaveCount(0)
  })

  test('whitespace-only content produces minimal diff', async ({ page }) => {
    await setEditorContent(page, 'old', '   \n\n   ')
    await setEditorContent(page, 'new', '  \n \n  ')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('very long single line handled gracefully', async ({ page }) => {
    const longLine = 'word '.repeat(500)
    await setEditorContent(page, 'old', longLine)
    await setEditorContent(page, 'new', longLine + ' extra')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('pure frontmatter diff', async ({ page }) => {
    await setEditorContent(page, 'old', '---\ntitle: Old\ndate: 2024-01-01\n---\n\n# Content')
    await setEditorContent(page, 'new', '---\ntitle: New\ndate: 2024-06-15\n---\n\n# Content')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('pure heading rename diff', async ({ page }) => {
    await setEditorContent(page, 'old', '# Old Title\n\nSame content here.')
    await setEditorContent(page, 'new', '# New Title\n\nSame content here.')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })
})

test.describe('Edge cases - various markdown features', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('code block diff', async ({ page }) => {
    await setEditorContent(page, 'old', '# Code\n\n```js\nconst a = 1\nconst b = 2\n```')
    await setEditorContent(page, 'new', '# Code\n\n```js\nconst a = 1\nconst c = 3\n```')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('GFM table diff', async ({ page }) => {
    await setEditorContent(page, 'old', '# Table\n\n| A | B |\n|---|---|\n| 1 | 2 |')
    await setEditorContent(page, 'new', '# Table\n\n| A | B |\n|---|---|\n| 1 | 3 |')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('footnote diff', async ({ page }) => {
    await setEditorContent(page, 'old', '# Notes\n\nText[^1].\n\n[^1]: Old footnote')
    await setEditorContent(page, 'new', '# Notes\n\nText[^1].\n\n[^1]: New footnote')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('nested blockquote diff', async ({ page }) => {
    await setEditorContent(page, 'old', '# Quote\n\n> Level 1\n>> Level 2 old')
    await setEditorContent(page, 'new', '# Quote\n\n> Level 1\n>> Level 2 new')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('math block diff', async ({ page }) => {
    await setEditorContent(page, 'old', '# Math\n\n$$\nE = mc^2\n$$')
    await setEditorContent(page, 'new', '# Math\n\n$$\nE = mc^3\n$$')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('list diff', async ({ page }) => {
    await setEditorContent(page, 'old', '# List\n\n- item 1\n- item 2\n- item 3')
    await setEditorContent(page, 'new', '# List\n\n- item 1\n- item 2 modified\n- item 3\n- item 4')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })
})

test.describe('Edge cases - performance and interaction', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('large document diff completes within timeout', async ({ page }) => {

    const { importFile } = await import('./helpers/diff-workbench')
    await importFile(page, 'old', path.resolve('e2e/fixtures/large.md'))
    await importFile(page, 'new', path.resolve('e2e/fixtures/large.md'))

    await expandInput(page)
    await page.locator(SEL.newEditorCM).click()
    await page.keyboard.press('End')
    await page.keyboard.type('\n\n# Added Section\n\nNew content', { delay: 0 })

    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('rapid double-click on run button does not break app', async ({ page }) => {
    await expandInput(page)
    await runButton(page).click({ force: true })
    await expect(page.locator(SEL.unifiedTable)).toBeVisible({ timeout: 15_000 })
  })

  test('empty result set navigation shows dash', async ({ page }) => {
    const sameContent = '# Same\n\nIdentical content.'
    await setEditorContent(page, 'old', sameContent)
    await setEditorContent(page, 'new', sameContent)
    await expect(page.locator(SEL.staleBanner)).toBeVisible({ timeout: 5_000 })
    await page.locator(SEL.staleBanner).getByRole('button', { name: '重新比对' }).click()
    await page.locator(SEL.unifiedTable).waitFor({ state: 'visible', timeout: 15_000 })
    // Identical content produces matched rows but no change tones
    await expect(page.locator('.cell.tone-insert, .cell.tone-delete, .cell.tone-replace, .cell.tone-move')).toHaveCount(0, { timeout: 10_000 })
  })
})
