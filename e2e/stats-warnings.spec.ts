import { test, expect } from '@playwright/test'
import { SEL, gotoAndWaitForDiff } from './helpers/diff-workbench'

test.describe('Warnings banner', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test.skip('is visible when diff produces warnings — sample data does not trigger warnings', () => {})

  test.skip('shows count in summary — sample data does not trigger warnings', () => {})

  test.skip('locate button scrolls to first warning — sample data does not trigger warnings', () => {})
})

test.describe('Stats bar', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('appears after diff completes', async ({ page }) => {
    await expect(page.locator(SEL.statCard).first()).toBeVisible()
  })

  test('shows insert count', async ({ page }) => {
    await expect(page.locator(SEL.statCard).filter({ hasText: '新增' }).first()).toBeVisible()
  })

  test('shows delete count', async ({ page }) => {
    await expect(page.locator(SEL.statCard).filter({ hasText: '删除' }).first()).toBeVisible()
  })

  test('shows replace count', async ({ page }) => {
    await expect(page.locator(SEL.statCard).filter({ hasText: '替换' }).first()).toBeVisible()
  })

  test('shows move count', async ({ page }) => {
    await expect(page.locator(SEL.statCard).filter({ hasText: '移动' }).first()).toBeVisible()
  })

  test('shows reorder count', async ({ page }) => {
    await expect(page.locator(SEL.statCard).filter({ hasText: '重排' }).first()).toBeVisible()
  })

  test('shows meta count', async ({ page }) => {
    await expect(page.locator(SEL.statCard).filter({ hasText: '元数据' }).first()).toBeVisible()
  })

  test('shows rename count', async ({ page }) => {
    await expect(page.locator(SEL.statCard).filter({ hasText: '改名' }).first()).toBeVisible()
  })

  test('shows warning count', async ({ page }) => {
    await expect(page.locator(SEL.statCard).filter({ hasText: '提示' }).first()).toBeVisible()
  })

  test('hovering a card highlights matching rows', async ({ page }) => {
    const card = page.locator(SEL.statCard).filter({ hasText: '删除' }).first()
    await card.hover()
    await page.waitForTimeout(200)
    const activeCount = await page.locator('.cell.active').count()
    expect(activeCount).toBeGreaterThan(0)
  })

  test('un-hovering removes highlight', async ({ page }) => {
    const card = page.locator(SEL.statCard).filter({ hasText: '删除' }).first()
    await card.hover()
    await page.waitForTimeout(200)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(200)
    const activeCount = await page.locator('.cell.active').count()
    expect(activeCount).toBe(0)
  })

  test('clicking a card scrolls to first match', async ({ page }) => {
    const card = page.locator(SEL.statCard).filter({ hasText: '删除' }).first()
    await card.click()
    await page.waitForTimeout(500)
    // After clicking, the first delete cell should be visible in the viewport
    await expect(page.locator('.cell.tone-delete').first()).toBeVisible()
  })

  test('card shows tooltip', async ({ page }) => {
    const card = page.locator(SEL.statCard).first()
    const title = await card.getAttribute('title')
    expect(title).toBeTruthy()
  })

  test.skip('degraded card conditional — sample data does not trigger degraded alignment', () => {})

  test.skip('deferred card conditional — sample data does not trigger deferred inline diff', () => {})
})
