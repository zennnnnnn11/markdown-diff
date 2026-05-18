import { test, expect } from '@playwright/test'
import {
  SEL, gotoAndWaitForDiff, expandInput, switchView,
  openFirstDetailModal, closeModal,
} from './helpers/diff-workbench'

test.describe('ARIA attributes', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('view switcher buttons form a button group', async ({ page }) => {
    const unifiedBtn = page.getByRole('button', { name: '左右对齐' })
    const sourceBtn = page.getByRole('button', { name: '单侧源码' })
    const debugBtn = page.getByRole('button', { name: '调试视图' })
    await expect(unifiedBtn).toBeVisible()
    await expect(sourceBtn).toBeVisible()
    await expect(debugBtn).toBeVisible()
  })

  test('unified table has role="table"', async ({ page }) => {
    await expect(page.locator(SEL.unifiedTable)).toHaveAttribute('role', 'table')
  })

  test('unified table cells have role="cell"', async ({ page }) => {
    const cellCount = await page.locator(`${SEL.unifiedTable} [role="cell"]`).count()
    expect(cellCount).toBeGreaterThan(0)
  })

  test('detail modal has role="dialog" with aria-modal', async ({ page }) => {
    await openFirstDetailModal(page)
    const dialog = page.locator(SEL.modalDialog)
    await expect(dialog).toHaveAttribute('role', 'dialog')
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await closeModal(page)
  })

  test('file input is hidden from visual layout', async ({ page }) => {
    await expandInput(page)
    const fileInput = page.locator(SEL.fileInput)
    await expect(fileInput).toBeAttached()
    await expect(fileInput).not.toBeVisible()
  })

  test('disabled buttons have disabled attribute', async ({ page }) => {
    const { nextChangeBtn } = await import('./helpers/diff-workbench')
    await nextChangeBtn(page).click()
    const { prevChangeBtn } = await import('./helpers/diff-workbench')
    const isDisabled = await prevChangeBtn(page).isDisabled()
    expect(isDisabled).toBe(true)
  })

  test('projection tables have role="table"', async ({ page }) => {
    await switchView(page, 'source')
    await expect(page.locator(SEL.oldProjection)).toHaveAttribute('role', 'table')
    await expect(page.locator(SEL.newProjection)).toHaveAttribute('role', 'table')
  })
})

test.describe('Responsive layout', () => {
  test('unified table adapts at narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await gotoAndWaitForDiff(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('projection view adapts at narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await gotoAndWaitForDiff(page)
    await switchView(page, 'source')
    await expect(page.locator(SEL.oldProjection)).toBeVisible()
    await expect(page.locator(SEL.newProjection)).toBeVisible()
  })

  test('debug panel adapts at narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await gotoAndWaitForDiff(page)
    await switchView(page, 'debug')
    await expect(page.locator('.debug-grid')).toBeVisible()
  })

  test('editor panels adapt at narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await gotoAndWaitForDiff(page)
    await expandInput(page)
    await expect(page.locator(SEL.oldEditorPane)).toBeVisible()
    await expect(page.locator(SEL.newEditorPane)).toBeVisible()
  })

  test('modal adapts at narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await gotoAndWaitForDiff(page)
    await openFirstDetailModal(page)
    await expect(page.locator(SEL.modalDialog)).toBeVisible()
    await closeModal(page)
  })
})
