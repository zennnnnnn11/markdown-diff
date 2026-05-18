import { test, expect } from '@playwright/test'
import {
  SEL, gotoAndWaitForDiff, prevChangeBtn, nextChangeBtn,
  expandInput, setEditorContent, runDiffAndWait,
} from './helpers/diff-workbench'

test.describe('Change navigation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('nav bar is visible after diff with changes', async ({ page }) => {
    await expect(page.locator(SEL.changeNav)).toBeVisible()
  })

  test('shows initial position with dash', async ({ page }) => {
    await expect(page.locator(SEL.changePosition)).toContainText('—')
  })

  test('clicking next advances to first change', async ({ page }) => {
    await nextChangeBtn(page).click()
    await expect(page.locator(SEL.changePosition)).toContainText('1 /')
  })

  test('clicking next again advances further', async ({ page }) => {
    await nextChangeBtn(page).click()
    await nextChangeBtn(page).click()
    await expect(page.locator(SEL.changePosition)).toContainText('2 /')
  })

  test('clicking previous goes back', async ({ page }) => {
    await nextChangeBtn(page).click()
    await nextChangeBtn(page).click()
    await prevChangeBtn(page).click()
    await expect(page.locator(SEL.changePosition)).toContainText('1 /')
  })

  test('previous disabled at first change', async ({ page }) => {
    await nextChangeBtn(page).click()
    await expect(prevChangeBtn(page)).toBeDisabled()
  })

  test('next disabled at last change', async ({ page }) => {
    const total = await page.locator(SEL.changePosition).textContent()
    const max = parseInt(total!.split('/')[1]!.trim())
    for (let i = 0; i < max; i++) {
      await nextChangeBtn(page).click()
    }
    await expect(nextChangeBtn(page)).toBeDisabled()
  })

  test('position indicator format is correct', async ({ page }) => {
    await nextChangeBtn(page).click()
    const text = await page.locator(SEL.changePosition).textContent()
    expect(text).toMatch(/\d+ \/ \d+/)
  })
})

test.describe('Keyboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('Alt+ArrowDown navigates to next change', async ({ page }) => {
    await page.keyboard.press('Alt+ArrowDown')
    await expect(page.locator(SEL.changePosition)).toContainText('1 /')
  })

  test('Alt+ArrowUp navigates to previous change', async ({ page }) => {
    await page.keyboard.press('Alt+ArrowDown')
    await page.keyboard.press('Alt+ArrowDown')
    await page.keyboard.press('Alt+ArrowUp')
    await expect(page.locator(SEL.changePosition)).toContainText('1 /')
  })

  test('Alt+ArrowUp at first change does nothing', async ({ page }) => {
    await page.keyboard.press('Alt+ArrowDown')
    await page.keyboard.press('Alt+ArrowUp')
    await expect(page.locator(SEL.changePosition)).toContainText('1 /')
  })

  test('keyboard nav does not fire inside CodeMirror', async ({ page }) => {
    await expandInput(page)
    await page.locator(SEL.oldEditorCM).click()
    await page.keyboard.press('Alt+ArrowDown')
    await expect(page.locator(SEL.changePosition)).toContainText('—')
  })
})
