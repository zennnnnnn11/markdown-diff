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
  it('mounts the diff workspace, runs an initial diff, and opens detail from projection rows', async () => {
    const wrapper = mount(App)

    await waitFor(() => wrapper.text().includes('统计条') && !wrapper.text().includes('比对中...'))

    expect(wrapper.text()).toContain('Markdown Diff')
    expect(wrapper.find('#old-markdown').element).toBeTruthy()
    expect(wrapper.find('#new-markdown').element).toBeTruthy()
    expect(wrapper.text()).toContain('统计条')

    const interactiveRow = wrapper.find('.projection-row.interactive')
    expect(interactiveRow.exists()).toBe(true)

    await interactiveRow.trigger('click')

    expect(wrapper.text()).toContain('Detail 面板')
  })
})
