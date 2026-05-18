import type { Page } from '@playwright/test'

export const SEL = {
  unifiedTable: '[role="table"][aria-label="左右对齐视图"]',
  oldProjection: '[role="table"][aria-label="旧文档源码投射"]',
  newProjection: '[role="table"][aria-label="新文档源码投射"]',
  modalBackdrop: '[data-testid="detail-modal-backdrop"]',
  modalDialog: 'section[role="dialog"]',
  staleBanner: '.stale-banner',
  warningsBanner: '.warnings-banner',
  changeNav: '[data-testid="change-nav"]',
  changePosition: '.change-position',
  statCard: '.stat-card',
  oldEditorPane: '[data-testid="editor-pane-old"]',
  newEditorPane: '[data-testid="editor-pane-new"]',
  oldEditorCM: '[data-testid="editor-pane-old"] .cm-content',
  newEditorCM: '[data-testid="editor-pane-new"] .cm-content',
  unifiedRow: '.unified-row',
  cellOld: '.cell-old',
  cellNew: '.cell-new',
  interactiveCell: '.cell.interactive',
  annotationChip: '.annotation-chip',
  projectionRow: '.projection-row',
  projectionInteractive: '.projection-row.interactive',
  fileInput: 'input[type="file"][accept]',
  diffLoading: '[data-testid="diff-loading"]',
  diffError: '[data-testid="diff-error"]',
  importError: '[data-testid="import-error"]',
  editorBody: '.editor-body',
  collapsedSummary: '.collapsed-summary.visible',
} as const

export function runButton(page: Page) {
  return page.getByRole('button', { name: '运行比对' })
}
export function expandBtn(page: Page) {
  return page.getByRole('button', { name: '展开' })
}
export function collapseBtn(page: Page) {
  return page.getByRole('button', { name: '收起' })
}
export function closeModalBtn(page: Page) {
  return page.getByRole('button', { name: '关闭' })
}
export function viewUnified(page: Page) {
  return page.getByRole('button', { name: '左右对齐' })
}
export function viewSource(page: Page) {
  return page.getByRole('button', { name: '单侧源码' })
}
export function viewDebug(page: Page) {
  return page.getByRole('button', { name: '调试视图' })
}
export function prevChangeBtn(page: Page) {
  return page.getByRole('button', { name: /上一个/ })
}
export function nextChangeBtn(page: Page) {
  return page.getByRole('button', { name: /下一个/ })
}

export async function gotoAndWaitForDiff(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator(SEL.unifiedTable).waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator(SEL.diffLoading).waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
}

export async function expandInput(page: Page): Promise<void> {
  const body = page.locator(SEL.editorBody)
  if (await body.evaluate((el) => el.classList.contains('collapsed'))) {
    await expandBtn(page).click()
    await body.evaluate((el) => el.classList.remove('collapsed')).catch(() => {})
    await page.waitForTimeout(500)
  }
}

export async function collapseInput(page: Page): Promise<void> {
  const body = page.locator(SEL.editorBody)
  if (!(await body.evaluate((el) => el.classList.contains('collapsed')))) {
    await collapseBtn(page).click()
    await page.waitForTimeout(500)
  }
}

export async function setEditorContent(page: Page, side: 'old' | 'new', text: string): Promise<void> {
  await expandInput(page)
  const cm = page.locator(side === 'old' ? SEL.oldEditorCM : SEL.newEditorCM)
  await cm.click()
  await page.keyboard.press('Control+A')
  if (text === '') {
    await page.keyboard.press('Backspace')
  } else if (text.length > 500) {
    const sel = side === 'old' ? SEL.oldEditorPane : SEL.newEditorPane
    await page.locator(sel).locator('.cm-editor').evaluate((el, content) => {
      const cmView = (el as any).cmView?.view
      if (cmView) {
        cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: content } })
      }
    }, text)
  } else {
    await page.keyboard.type(text, { delay: 0 })
  }
}

export async function runDiffAndWait(page: Page): Promise<void> {
  await runButton(page).click()
  await page.waitForTimeout(100)
  await page.locator(SEL.unifiedTable).waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
  await page.locator(SEL.unifiedTable).waitFor({ state: 'visible', timeout: 15_000 })
}

export async function switchView(page: Page, mode: 'unified' | 'source' | 'debug'): Promise<void> {
  if (mode === 'unified') await viewUnified(page).click()
  else if (mode === 'source') await viewSource(page).click()
  else await viewDebug(page).click()
}

export async function openFirstDetailModal(page: Page): Promise<void> {
  await page.locator(SEL.interactiveCell).first().click()
  await page.locator(SEL.modalBackdrop).waitFor({ state: 'visible' })
}

export async function closeModal(page: Page): Promise<void> {
  const backdrop = page.locator(SEL.modalBackdrop)
  if (await backdrop.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape')
    await backdrop.waitFor({ state: 'detached' })
  }
}

export async function importFile(page: Page, side: 'old' | 'new', filePath: string): Promise<void> {
  await expandInput(page)
  const pane = page.locator(side === 'old' ? SEL.oldEditorPane : SEL.newEditorPane)
  const importBtn = pane.getByRole('button', { name: '导入' })

  const fileChooserPromise = page.waitForEvent('filechooser')
  await importBtn.click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(filePath)
}

export async function clearEditor(page: Page, side: 'old' | 'new'): Promise<void> {
  await expandInput(page)
  const pane = page.locator(side === 'old' ? SEL.oldEditorPane : SEL.newEditorPane)
  await pane.getByRole('button', { name: '清空' }).click()
}

export async function scrollToFind(page: Page, selector: string, maxSteps = 10): Promise<void> {
  const table = page.locator(SEL.unifiedTable)
  const scrollHeight = await table.evaluate(el => el.scrollHeight)
  const step = scrollHeight / maxSteps
  for (let i = 0; i <= maxSteps; i++) {
    await table.evaluate((el, pos) => { el.scrollTop = pos }, step * i)
    await page.waitForTimeout(200)
    if (await page.locator(selector).count() > 0) return
  }
}
