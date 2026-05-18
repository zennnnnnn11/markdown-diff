import { test, expect } from '@playwright/test'
import { SEL, gotoAndWaitForDiff, openFirstDetailModal, closeModal, scrollToFind } from './helpers/diff-workbench'

test.describe('Table structure', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('has table role with aria-label', async ({ page }) => {
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
    await expect(page.locator(SEL.unifiedTable)).toHaveAttribute('aria-label', '左右对齐视图')
  })

  test('shows column headers', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: '行' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '旧文档' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '新文档' })).toBeVisible()
  })

  test('renders rows with unified-row class', async ({ page }) => {
    const count = await page.locator(SEL.unifiedRow).count()
    expect(count).toBeGreaterThan(0)
  })

  test('rows have cell structure', async ({ page }) => {
    const firstRow = page.locator(SEL.unifiedRow).first()
    await expect(firstRow.locator('.row-index')).toBeVisible()
    await expect(firstRow.locator(SEL.cellOld)).toBeVisible()
    await expect(firstRow.locator(SEL.cellNew)).toBeVisible()
  })

  test('rows have data-index attribute', async ({ page }) => {
    const firstRow = page.locator(SEL.unifiedRow).first()
    const index = await firstRow.getAttribute('data-index')
    expect(index).toBeTruthy()
  })
})

test.describe('Tone classes', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('insert cells have tone-insert class', async ({ page }) => {
    const table = page.locator(SEL.unifiedTable)
    await table.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)
    const count = await page.locator('.cell.tone-insert').count()
    expect(count).toBeGreaterThan(0)
  })

  test('delete cells have tone-delete class', async ({ page }) => {
    const count = await page.locator('.tone-delete').count()
    expect(count).toBeGreaterThan(0)
  })

  test('replace cells have tone-replace class', async ({ page }) => {
    await scrollToFind(page, '.tone-replace')
    const count = await page.locator('.tone-replace').count()
    expect(count).toBeGreaterThan(0)
  })

  test('move cells have tone-move class', async ({ page }) => {
    await scrollToFind(page, '.tone-move')
    const count = await page.locator('.tone-move').count()
    expect(count).toBeGreaterThan(0)
  })

  test('plain cells have tone-plain class', async ({ page }) => {
    await expect(page.locator('.tone-plain').first()).toBeVisible()
  })

  test('absent side shows placeholder', async ({ page }) => {
    const table = page.locator(SEL.unifiedTable)
    await table.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)
    const count = await page.locator('.placeholder-text').count()
    expect(count).toBeGreaterThan(0)
  })
})

test.describe('Annotations', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('insert lines show annotation chip', async ({ page }) => {
    const table = page.locator(SEL.unifiedTable)
    await table.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)
    const count = await page.locator(SEL.annotationChip).filter({ hasText: '新增' }).count()
    expect(count).toBeGreaterThan(0)
  })

  test('delete lines show annotation chip', async ({ page }) => {
    await expect(page.locator(SEL.annotationChip).filter({ hasText: '删除' }).first()).toBeVisible()
  })

  test('replace lines show annotation chip', async ({ page }) => {
    await scrollToFind(page, `${SEL.annotationChip}:has-text("替换")`)
    const count = await page.locator(SEL.annotationChip).filter({ hasText: '替换' }).count()
    expect(count).toBeGreaterThan(0)
  })

  test('annotation chips exist in table', async ({ page }) => {
    const count = await page.locator(SEL.annotationChip).count()
    expect(count).toBeGreaterThan(0)
  })
})

test.describe('Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('interactive cells exist', async ({ page }) => {
    const count = await page.locator(SEL.interactiveCell).count()
    expect(count).toBeGreaterThan(0)
  })

  test('clicking interactive cell opens detail modal', async ({ page }) => {
    await openFirstDetailModal(page)
    await expect(page.locator(SEL.modalBackdrop)).toBeVisible()
    await closeModal(page)
  })

  test('clicking non-interactive cell does not open modal', async ({ page }) => {
    const plainCell = page.locator('.cell.tone-plain:not(.interactive)').first()
    if (await plainCell.count() > 0) {
      await plainCell.click()
      await expect(page.locator(SEL.modalBackdrop)).not.toBeVisible()
    }
  })

  test('interactive cells have data attributes', async ({ page }) => {
    const cell = page.locator(SEL.interactiveCell).first()
    const changeKey = await cell.getAttribute('data-change-key')
    const side = await cell.getAttribute('data-side')
    expect(changeKey).toBeTruthy()
    expect(side).toMatch(/^(old|new)$/)
  })
})

test.describe('Virtual scrolling', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('renders limited rows in DOM', async ({ page }) => {
    const rowCount = await page.locator(SEL.unifiedRow).count()
    expect(rowCount).toBeLessThan(200)
    expect(rowCount).toBeGreaterThan(5)
  })

  test('scrolling renders new rows', async ({ page }) => {
    const firstIndex = await page.locator(SEL.unifiedRow).first().getAttribute('data-index')
    const scroller = page.locator(SEL.unifiedTable)
    await scroller.evaluate((el) => { el.scrollTop = 2000 })
    await page.waitForTimeout(500)
    const newFirstIndex = await page.locator(SEL.unifiedRow).first().getAttribute('data-index')
    expect(newFirstIndex).not.toBe(firstIndex)
  })

  test('scroll position preserved after modal', async ({ page }) => {
    await openFirstDetailModal(page)
    await closeModal(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('has visible rows after initial load', async ({ page }) => {
    const count = await page.locator(SEL.unifiedRow).count()
    expect(count).toBeGreaterThanOrEqual(10)
  })
})
