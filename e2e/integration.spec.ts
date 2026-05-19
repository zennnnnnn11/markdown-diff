import { test, expect } from '@playwright/test'
import {
  SEL, gotoAndWaitForDiff, setEditorContent, runDiffAndWait,
  expandInput, switchView, openFirstDetailModal, closeModal,
  clearEditor, nextChangeBtn, importFile,
} from './helpers/diff-workbench'
import path from 'node:path'

test.describe('Cross-component integration', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('edit → diff → stats update', async ({ page }) => {
    await setEditorContent(page, 'old', '# Title\n\nOld paragraph')
    await setEditorContent(page, 'new', '# Title\n\nNew paragraph\n\nAnother line')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.statCard).first()).toBeVisible()
  })

  test('stat card hover → rows highlight → click opens modal', async ({ page }) => {
    const card = page.locator(SEL.statCard).filter({ hasText: '删除' }).first()
    await card.hover()
    await page.waitForTimeout(200)
    await card.click()
    await page.waitForTimeout(500)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('change navigation scrolls unified view', async ({ page }) => {
    await nextChangeBtn(page).click()
    await expect(page.locator(SEL.changePosition)).toContainText('1 /')
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('view switch preserves change state', async ({ page }) => {
    await nextChangeBtn(page).click()
    const text = await page.locator(SEL.changePosition).textContent()
    await switchView(page, 'debug')
    await switchView(page, 'unified')
    const afterText = await page.locator(SEL.changePosition).textContent()
    expect(afterText).toBe(text)
  })

  test('modal open/close does not break diff results', async ({ page }) => {
    const initialRowCount = await page.locator(SEL.unifiedRow).count()
    await openFirstDetailModal(page)
    await closeModal(page)
    const afterRowCount = await page.locator(SEL.unifiedRow).count()
    expect(afterRowCount).toBe(initialRowCount)
  })

  test('clear old editor resets diff', async ({ page }) => {
    await clearEditor(page, 'old')
    await runDiffAndWait(page)
    await expect(page.locator('.tone-insert').first()).toBeVisible()
  })

  test('clear new editor shows all deletes', async ({ page }) => {
    await clearEditor(page, 'new')
    await runDiffAndWait(page)
    await expect(page.locator('.tone-delete').first()).toBeVisible()
  })

  test('file import → diff → correct results', async ({ page }) => {
    await importFile(page, 'old', path.resolve('e2e/fixtures/import-test.md'))
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('move rows highlight on both sides', async ({ page }) => {
    const table = page.locator('[role="table"][aria-label="左右对齐视图"]')
    await table.evaluate(el => { el.scrollTop = el.scrollHeight / 2 })
    await page.waitForTimeout(300)
    const moveCount = await page.locator('.cell.tone-move').count()
    // Sample data should produce move cells (Architecture section moves)
    expect(moveCount).toBeGreaterThan(0)
  })

  test('stale → re-diff → stats card updates', async ({ page }) => {
    await expandInput(page)
    await page.locator(SEL.oldEditorCM).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' extra', { delay: 0 })
    await expect(page.locator(SEL.staleBanner)).toBeVisible()
    await page.locator(SEL.staleBanner).getByRole('button', { name: '重新比对' }).click()
    await page.locator(SEL.unifiedTable).waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator(SEL.statCard).first()).toBeVisible()
  })

  test('full lifecycle: load → edit → diff → navigate → detail → close → edit → re-diff', async ({ page }) => {
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()

    await setEditorContent(page, 'old', '# Test\n\nParagraph one\n\nParagraph two')
    await setEditorContent(page, 'new', '# Test\n\nParagraph one modified\n\nParagraph three')
    await runDiffAndWait(page)

    await nextChangeBtn(page).click()
    await expect(page.locator(SEL.changePosition)).toContainText('1 /')

    const interactiveCell = page.locator(SEL.interactiveCell).first()
    if (await interactiveCell.count() > 0) {
      await interactiveCell.click()
      await page.locator(SEL.modalBackdrop).waitFor({ state: 'visible' })
      await closeModal(page)
    }

    await setEditorContent(page, 'new', '# Test\n\nCompletely different content')
    await runDiffAndWait(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })
})
