import { describe, expect, it, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DiffWorkbench from '../DiffWorkbench.vue'

async function waitFor(assertion: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now()
  while (!assertion()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for UI state')
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

const OLD_MD = `# Title

Old paragraph content.
`

const NEW_MD = `# Title

New paragraph content.
`

describe('DiffWorkbench', () => {
  let wrapper: ReturnType<typeof mount> | undefined

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('mounts and runs initial diff automatically', async () => {
    wrapper = mount(DiffWorkbench, {
      props: { initialOldMarkdown: OLD_MD, initialNewMarkdown: NEW_MD },
      attachTo: document.body,
    })
    await waitFor(() => wrapper!.text().includes('统计条') && !wrapper!.text().includes('比对中...'))
    expect(wrapper.text()).toContain('Markdown Diff')
  })

  it('defaults to unified view mode', async () => {
    wrapper = mount(DiffWorkbench, {
      props: { initialOldMarkdown: OLD_MD, initialNewMarkdown: NEW_MD },
      attachTo: document.body,
    })
    await waitFor(() => wrapper!.text().includes('统计条') && !wrapper!.text().includes('比对中...'))
    const tabs = wrapper.findAll('.view-tabs .secondary-button')
    const activeTab = tabs.find((tab) => tab.classes().includes('active'))
    expect(activeTab?.text()).toBe('左右对齐')
  })

  it('switches to debug view mode', async () => {
    wrapper = mount(DiffWorkbench, {
      props: { initialOldMarkdown: OLD_MD, initialNewMarkdown: NEW_MD },
      attachTo: document.body,
    })
    await waitFor(() => wrapper!.text().includes('统计条') && !wrapper!.text().includes('比对中...'))
    const tabs = wrapper.findAll('.view-tabs .secondary-button')
    const debugTab = tabs.find((tab) => tab.text() === '调试视图')!
    await debugTab.trigger('click')
    await flushPromises()
    expect(debugTab.classes()).toContain('active')
  })

  it('shows stale banner after modifying markdown post-diff', async () => {
    wrapper = mount(DiffWorkbench, {
      props: { initialOldMarkdown: OLD_MD, initialNewMarkdown: NEW_MD },
      attachTo: document.body,
    })
    await waitFor(() => wrapper!.text().includes('统计条') && !wrapper!.text().includes('比对中...'))

    const inputPanel = wrapper.findComponent({ name: 'DiffInputPanel' })
    await inputPanel.vm.$emit('update:old-markdown', 'changed content')
    await flushPromises()

    expect(wrapper.find('.stale-banner').exists()).toBe(true)
    expect(wrapper.text()).toContain('内容已修改')
  })

  it('re-run button in stale banner triggers diff', async () => {
    wrapper = mount(DiffWorkbench, {
      props: { initialOldMarkdown: OLD_MD, initialNewMarkdown: NEW_MD },
      attachTo: document.body,
    })
    await waitFor(() => wrapper!.text().includes('统计条') && !wrapper!.text().includes('比对中...'))

    const inputPanel = wrapper.findComponent({ name: 'DiffInputPanel' })
    await inputPanel.vm.$emit('update:old-markdown', 'changed content')
    await flushPromises()
    expect(wrapper.find('.stale-banner').exists()).toBe(true)

    const rerunButton = wrapper.find('.stale-banner .secondary-button')
    await rerunButton.trigger('click')
    await waitFor(() => !wrapper!.find('.stale-banner').exists(), 8000)
    expect(wrapper.find('.stale-banner').exists()).toBe(false)
  })
})
