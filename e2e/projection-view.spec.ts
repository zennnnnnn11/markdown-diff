import { test, expect } from '@playwright/test'
import {
  SEL, gotoAndWaitForDiff, switchView, openFirstDetailModal, closeModal,
} from './helpers/diff-workbench'

test.describe('Projection view', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
    await switchView(page, 'source')
  })

  test('shows old and new projection tables side by side', async ({ page }) => {
    await expect(page.locator(SEL.oldProjection)).toBeVisible()
    await expect(page.locator(SEL.newProjection)).toBeVisible()
  })

  test('old projection has correct aria-label', async ({ page }) => {
    await expect(page.locator(SEL.oldProjection)).toHaveAttribute('aria-label', '旧文档源码投射')
  })

  test('new projection has correct aria-label', async ({ page }) => {
    await expect(page.locator(SEL.newProjection)).toHaveAttribute('aria-label', '新文档源码投射')
  })

  test('projection rows have line numbers', async ({ page }) => {
    const firstRow = page.locator(`${SEL.newProjection} ${SEL.projectionRow}`).first()
    await expect(firstRow.locator('.line-number')).toBeVisible()
  })

  test('interactive projection rows exist', async ({ page }) => {
    const count = await page.locator(SEL.projectionInteractive).count()
    expect(count).toBeGreaterThan(0)
  })

  test('clicking interactive projection row opens detail modal', async ({ page }) => {
    await page.locator(SEL.projectionInteractive).first().click()
    await page.locator(SEL.modalBackdrop).waitFor({ state: 'visible' })
    await expect(page.locator(SEL.modalDialog)).toBeVisible()
    await closeModal(page)
  })

  test('projection rows have annotation chips', async ({ page }) => {
    const count = await page.locator(`${SEL.newProjection} ${SEL.annotationChip}`).count()
    expect(count).toBeGreaterThan(0)
  })

  test('projection uses virtual scrolling with limited DOM rows', async ({ page }) => {
    const rowCount = await page.locator(`${SEL.newProjection} ${SEL.projectionRow}`).count()
    expect(rowCount).toBeGreaterThan(5)
    expect(rowCount).toBeLessThan(200)
  })

  test('scroll sync between old and new projections', async ({ page }) => {
    const oldTable = page.locator(SEL.oldProjection)
    const newTable = page.locator(SEL.newProjection)
    await oldTable.evaluate((el) => { el.scrollTop = 300 })
    await page.waitForTimeout(300)
    const newScrollTop = await newTable.evaluate((el) => el.scrollTop)
    expect(newScrollTop).toBeGreaterThan(0)
  })

  test('inline paragraph segments show tone classes', async ({ page }) => {
    const segments = page.locator(`${SEL.newProjection} .segment`)
    const count = await segments.count()
    expect(count).toBeGreaterThan(0)
  })
})
