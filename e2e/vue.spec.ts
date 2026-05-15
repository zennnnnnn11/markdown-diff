import { test, expect } from '@playwright/test'

test('loads the markdown diff workbench and supports aligned/source flows', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('h1')).toHaveText('Markdown Diff')
  await expect(page.getByRole('heading', { name: '左右对齐视图' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '旧文档' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '新文档' })).toBeVisible()

  await page.locator('#old-markdown').fill('')
  await page.getByRole('button', { name: '运行比对' }).click()
  await expect(page.locator('.unified-row').first()).toBeVisible()
  await expect(page.locator('.cell-new .annotation-chip').filter({ hasText: '新增' }).first()).toBeVisible()

  await page.getByRole('button', { name: '单侧源码' }).click()
  await expect(page.getByText('旧文档源码投射')).toBeVisible()
  await expect(page.getByText('新文档源码投射')).toBeVisible()

  await page.getByRole('button', { name: '左右对齐' }).click()
  const interactiveRow = page.locator('.cell.interactive').first()
  await interactiveRow.click()
  await expect(page.locator('[data-testid="detail-modal-backdrop"]')).toBeVisible()
  await expect(page.getByText('旧').first()).toBeVisible()
  await expect(page.getByText('新').first()).toBeVisible()
})
