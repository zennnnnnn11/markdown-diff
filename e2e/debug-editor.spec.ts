import { test, expect } from '@playwright/test'
import { SEL, gotoAndWaitForDiff, switchView } from './helpers/diff-workbench'

test.describe('Debug panel', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('is not visible in unified view', async ({ page }) => {
    await expect(page.locator('.debug-panel, .debug-grid')).not.toBeVisible()
  })

  test('is visible after switching to debug view', async ({ page }) => {
    await switchView(page, 'debug')
    await expect(page.locator('.debug-grid')).toBeVisible()
  })

  test('shows Quality Summary section', async ({ page }) => {
    await switchView(page, 'debug')
    await expect(page.locator('h3').filter({ hasText: 'Quality Summary' })).toBeVisible()
  })

  test('shows Global Warnings section', async ({ page }) => {
    await switchView(page, 'debug')
    await expect(page.locator('h3').filter({ hasText: 'Global Warnings' })).toBeVisible()
  })

  test('shows Old SemanticIndex section', async ({ page }) => {
    await switchView(page, 'debug')
    await expect(page.locator('h3').filter({ hasText: 'Old SemanticIndex' })).toBeVisible()
  })

  test('shows New SemanticIndex section', async ({ page }) => {
    await switchView(page, 'debug')
    await expect(page.locator('h3').filter({ hasText: 'New SemanticIndex' })).toBeVisible()
  })

  test('shows MatchPair list', async ({ page }) => {
    await switchView(page, 'debug')
    await expect(page.locator('h3').filter({ hasText: 'MatchPair' })).toBeVisible()
  })

  test('shows DiffChange flat list', async ({ page }) => {
    await switchView(page, 'debug')
    await expect(page.locator('h3').filter({ hasText: 'DiffChange' })).toBeVisible()
  })

  test('debug sections contain JSON content', async ({ page }) => {
    await switchView(page, 'debug')
    const preTags = page.locator('.debug-grid pre')
    const count = await preTags.count()
    expect(count).toBeGreaterThanOrEqual(6)
    const firstPreText = await preTags.first().textContent()
    expect(firstPreText!.length).toBeGreaterThan(2)
  })

  test('switching back to unified hides debug', async ({ page }) => {
    await switchView(page, 'debug')
    await expect(page.locator('.debug-grid')).toBeVisible()
    await switchView(page, 'unified')
    await expect(page.locator('.debug-grid')).not.toBeVisible()
    await expect(page.locator(SEL.unifiedTable)).toBeVisible()
  })
})

test.describe('CodeMirror editor', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndWaitForDiff(page)
  })

  test('old editor has CodeMirror instance', async ({ page }) => {
    const { expandInput } = await import('./helpers/diff-workbench')
    await expandInput(page)
    await expect(page.locator(`${SEL.oldEditorPane} .cm-editor`)).toBeVisible()
  })

  test('new editor has CodeMirror instance', async ({ page }) => {
    const { expandInput } = await import('./helpers/diff-workbench')
    await expandInput(page)
    await expect(page.locator(`${SEL.newEditorPane} .cm-editor`)).toBeVisible()
  })

  test('editor shows placeholder when empty', async ({ page }) => {
    const { setEditorContent, expandInput } = await import('./helpers/diff-workbench')
    await setEditorContent(page, 'old', '')
    await expandInput(page)
    await expect(page.locator(`${SEL.oldEditorPane} .cm-placeholder`)).toBeVisible()
  })

  test('editor supports undo with Ctrl+Z', async ({ page }) => {
    const { expandInput } = await import('./helpers/diff-workbench')
    await expandInput(page)
    await page.locator(SEL.oldEditorCM).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' test-undo', { delay: 0 })
    await expect(page.locator(SEL.oldEditorCM)).toContainText('test-undo')
    await page.keyboard.press('Control+Z')
    await page.waitForTimeout(200)
    const text = await page.locator(SEL.oldEditorCM).textContent()
    expect(text).not.toContain('test-undo')
  })

  test('editor shows markdown syntax highlighting', async ({ page }) => {
    const { expandInput } = await import('./helpers/diff-workbench')
    await expandInput(page)
    // CM6 with markdown extension produces .cm-line elements with syntax spans
    const cmLines = page.locator(`${SEL.oldEditorPane} .cm-editor .cm-line`)
    const count = await cmLines.count()
    expect(count).toBeGreaterThan(0)
    // At least one line should contain child spans (syntax highlighting tokens)
    const firstLineChildren = await cmLines.first().locator('span').count()
    expect(firstLineChildren).toBeGreaterThan(0)
  })

  test('editor content preserved across view switches', async ({ page }) => {
    const { expandInput } = await import('./helpers/diff-workbench')
    await expandInput(page)
    const originalText = await page.locator(SEL.oldEditorCM).textContent()
    await switchView(page, 'debug')
    await switchView(page, 'unified')
    await expandInput(page)
    const afterText = await page.locator(SEL.oldEditorCM).textContent()
    expect(afterText).toBe(originalText)
  })
})
