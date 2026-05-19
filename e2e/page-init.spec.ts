import { test, expect } from '@playwright/test'
import { SEL, gotoAndWaitForDiff, viewUnified, viewDebug, switchView } from './helpers/diff-workbench'

test.describe('Page initialization', () => {
  test('displays the app heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Markdown Diff')
  })

  test('auto-runs diff on mount and shows unified table', async ({ page }) => {
    await gotoAndWaitForDiff(page)
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })
})

test.describe('View switching', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('starts in unified view with active button', async ({ page }) => {
    await expect(viewUnified(page)).toHaveClass(/active/)
  })

  test('switches to debug view showing debug panel', async ({ page }) => {
    await switchView(page, 'debug')
    await expect(page.locator('.debug-grid')).toBeVisible()
  })

  test('returns to unified view from debug', async ({ page }) => {
    await switchView(page, 'debug')
    await switchView(page, 'unified')
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })

  test('preserves diff results when cycling through views', async ({ page }) => {
    const initialRowCount = await page.locator(SEL.unifiedRow).count()
    await switchView(page, 'debug')
    await switchView(page, 'unified')
    const finalRowCount = await page.locator(SEL.unifiedRow).count()
    expect(finalRowCount).toBe(initialRowCount)
  })
})
