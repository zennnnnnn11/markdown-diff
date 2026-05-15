import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import App from '../App.vue'

async function waitFor(assertion: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  while (!assertion()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for UI state')
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe('App', () => {
  it('mounts the diff workspace, defaults to the aligned split view, and opens detail modal for exact highlights', async () => {
    const wrapper = mount(App, { attachTo: document.body })

    try {
      await waitFor(() => wrapper.text().includes('统计条') && !wrapper.text().includes('比对中...'))

      expect(wrapper.text()).toContain('Markdown Diff')
      expect(wrapper.find('#old-markdown').element).toBeTruthy()
      expect(wrapper.find('#new-markdown').element).toBeTruthy()
      expect(wrapper.text()).toContain('统计条')
      expect(wrapper.text()).toContain('左右对齐视图')
      expect(wrapper.text()).toContain('旧文档')
      expect(wrapper.text()).toContain('新文档')

      const targetRow = wrapper
        .findAll('.cell.interactive')
        .find((row) => row.text().includes('Install the package with pnpm.'))

      expect(targetRow?.exists()).toBe(true)

      await targetRow!.trigger('click')
      await flushPromises()

      expect(document.body.textContent).toContain('旧')
      expect(document.body.textContent).toContain('新')
      expect(document.body.querySelector('[data-testid="detail-modal-backdrop"]')).not.toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('closes the detail modal on backdrop click and Escape, and highlights rows from focused stats', async () => {
    const wrapper = mount(App, { attachTo: document.body })

    try {
      await waitFor(() => wrapper.text().includes('统计条') && !wrapper.text().includes('比对中...'))

      const statButton = wrapper.find('.stat-card')
      expect(wrapper.findAll('.cell.active')).toHaveLength(0)

      await statButton.trigger('focus')
      expect(wrapper.findAll('.cell.active').length).toBeGreaterThan(0)
      await statButton.trigger('blur')
      expect(wrapper.findAll('.cell.active')).toHaveLength(0)

      const interactiveRow = wrapper.find('.cell.interactive')
      await interactiveRow.trigger('click')
      await flushPromises()

      const backdrop = document.body.querySelector('[data-testid="detail-modal-backdrop"]')
      expect(backdrop).not.toBeNull()
      ;(backdrop as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
      expect(document.body.querySelector('[data-testid="detail-modal-backdrop"]')).toBeNull()

      await interactiveRow.trigger('click')
      await flushPromises()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()
      expect(document.body.querySelector('[data-testid="detail-modal-backdrop"]')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })
})
