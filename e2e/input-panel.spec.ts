import { test, expect } from '@playwright/test'
import path from 'node:path'
import {
  SEL, gotoAndWaitForDiff, expandInput, setEditorContent, runDiffAndWait,
  runButton, expandBtn, collapseBtn, importFile, clearEditor,
} from './helpers/diff-workbench'

test.describe('Input editing', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('old editor loads sample content on mount', async ({ page }) => {
    await expandInput(page)
    const text = await page.locator(SEL.oldEditorCM).textContent()
    expect(text!.length).toBeGreaterThan(100)
  })

  test('new editor loads sample content on mount', async ({ page }) => {
    await expandInput(page)
    const text = await page.locator(SEL.newEditorCM).textContent()
    expect(text!.length).toBeGreaterThan(100)
  })

  test('editing old editor updates content', async ({ page }) => {
    await expandInput(page)
    await page.locator(SEL.oldEditorCM).click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('hello world', { delay: 0 })
    await expect(page.locator(SEL.oldEditorCM)).toContainText('hello world')
  })

  test('editing new editor updates content', async ({ page }) => {
    await expandInput(page)
    await page.locator(SEL.newEditorCM).click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('new content', { delay: 0 })
    await expect(page.locator(SEL.newEditorCM)).toContainText('new content')
  })

  test('pasting multiline content works', async ({ page }) => {
    await expandInput(page)
    await page.locator(SEL.oldEditorCM).click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('line one\nline two\nline three', { delay: 0 })
    await expect(page.locator(SEL.oldEditorCM)).toContainText('line one')
    await expect(page.locator(SEL.oldEditorCM)).toContainText('line three')
  })
})

test.describe('File import', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('imports a .md file into old editor', async ({ page }) => {
    await importFile(page, 'old', path.resolve('e2e/fixtures/import-test.md'))
    await expect(page.locator(SEL.oldEditorCM)).toContainText('Import Test File')
  })

  test('imports a .txt file into new editor', async ({ page }) => {
    await importFile(page, 'new', path.resolve('e2e/fixtures/import-test.txt'))
    await expect(page.locator(SEL.newEditorCM)).toContainText('plain text')
  })

  test('shows error for oversized file', async ({ page }) => {
    await expandInput(page)
    const pane = page.locator(SEL.oldEditorPane)
    const importBtn = pane.getByRole('button', { name: '导入' })
    const fileChooserPromise = page.waitForEvent('filechooser')
    await importBtn.click()
    const fileChooser = await fileChooserPromise
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 0x41)
    await fileChooser.setFiles({ name: 'big.md', mimeType: 'text/markdown', buffer: bigBuffer })
    await expect(page.locator(SEL.importError)).toBeVisible()
    await expect(page.locator(SEL.importError)).toContainText('文件过大')
  })

  test('file input accepts only specified extensions', async ({ page }) => {
    const accept = await page.locator(SEL.fileInput).getAttribute('accept')
    expect(accept).toBe('.md,.markdown,.mdx,.txt')
  })
})

test.describe('Collapse and expand', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('input panel collapses after diff', async ({ page }) => {
    await expect(page.locator(SEL.editorBody)).toHaveClass(/collapsed/)
  })

  test('clicking expand shows editors', async ({ page }) => {
    await expandBtn(page).click()
    await page.waitForTimeout(500)
    await expect(page.locator(SEL.editorBody)).not.toHaveClass(/collapsed/)
  })

  test('clicking collapse hides editors and shows summary', async ({ page }) => {
    await expandBtn(page).click()
    await page.waitForTimeout(500)
    await collapseBtn(page).click()
    await page.waitForTimeout(500)
    await expect(page.locator(SEL.editorBody)).toHaveClass(/collapsed/)
    await expect(page.locator(SEL.collapsedSummary)).toBeVisible()
    await expect(page.locator(SEL.collapsedSummary)).toContainText('字')
  })
})

test.describe('Run diff', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('clicking run shows loading then results', async ({ page }) => {
    await expandInput(page)
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('run button is enabled when idle', async ({ page }) => {
    await expandInput(page)
    await expect(runButton(page)).toBeEnabled()
  })

  test('re-running diff after editing produces updated results', async ({ page }) => {
    await setEditorContent(page, 'old', '# Simple\n\nOld text')
    await setEditorContent(page, 'new', '# Simple\n\nNew text')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('empty old doc diff shows all inserts', async ({ page }) => {
    await setEditorContent(page, 'old', '')
    await runDiffAndWait(page)
    await expect(page.locator('.tone-insert').first()).toBeVisible()
  })

  test('empty new doc diff shows all deletes', async ({ page }) => {
    await setEditorContent(page, 'new', '')
    await runDiffAndWait(page)
    await expect(page.locator('.tone-delete').first()).toBeVisible()
  })

  test('identical documents show no interactive changes', async ({ page }) => {
    const sameContent = '# Same\n\nIdentical content here.'
    await setEditorContent(page, 'old', sameContent)
    await setEditorContent(page, 'new', sameContent)
    await expect(page.locator(SEL.staleBanner)).toBeVisible({ timeout: 5_000 })
    await page.locator(SEL.staleBanner).getByRole('button', { name: '重新比对' }).click()
    await page.locator(SEL.unifiedTable).waitFor({ state: 'visible', timeout: 15_000 })
    // Identical content produces matched rows (interactive) but no change tones
    await expect(page.locator('.cell.tone-insert, .cell.tone-delete, .cell.tone-replace, .cell.tone-move')).toHaveCount(0, { timeout: 10_000 })
  })
})

test.describe('Stale banner', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('appears after editing when results exist', async ({ page }) => {
    await expandInput(page)
    await page.locator(SEL.oldEditorCM).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' extra', { delay: 0 })
    await expect(page.locator(SEL.staleBanner)).toBeVisible()
  })

  test('re-diff button in stale banner works', async ({ page }) => {
    await expandInput(page)
    await page.locator(SEL.oldEditorCM).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' edit', { delay: 0 })
    await expect(page.locator(SEL.staleBanner)).toBeVisible()
    await page.locator(SEL.staleBanner).getByRole('button', { name: '重新比对' }).click()
    await page.locator(SEL.unifiedTable).waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator(SEL.staleBanner)).not.toBeVisible()
  })

  test('does not appear before first diff edit', async ({ page }) => {
    await expect(page.locator(SEL.staleBanner)).not.toBeVisible()
  })
})
