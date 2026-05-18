import { describe, expect, it } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import DiffInputPanel from '../DiffInputPanel.vue'

function defaultProps() {
  return {
    oldMarkdown: 'old content',
    newMarkdown: 'new content',
    isRunning: false,
    canRun: true,
    errorMessage: '',
    collapsed: false,
  }
}

describe('DiffInputPanel', () => {
  it('renders heading and run button', () => {
    const wrapper = shallowMount(DiffInputPanel, { props: defaultProps() })
    expect(wrapper.find('h2').text()).toBe('输入区')
    expect(wrapper.find('.primary-button').exists()).toBe(true)
  })

  it('emits "run" on run button click', async () => {
    const wrapper = shallowMount(DiffInputPanel, { props: defaultProps() })
    await wrapper.find('.primary-button').trigger('click')
    expect(wrapper.emitted('run')).toHaveLength(1)
  })

  it('disables run button when canRun is false', () => {
    const wrapper = shallowMount(DiffInputPanel, {
      props: { ...defaultProps(), canRun: false },
    })
    const button = wrapper.find('.primary-button')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('shows "比对中..." when isRunning is true', () => {
    const wrapper = shallowMount(DiffInputPanel, {
      props: { ...defaultProps(), isRunning: true },
    })
    expect(wrapper.find('.primary-button').text()).toBe('比对中...')
  })

  it('shows "运行比对" when isRunning is false', () => {
    const wrapper = shallowMount(DiffInputPanel, { props: defaultProps() })
    expect(wrapper.find('.primary-button').text()).toBe('运行比对')
  })

  it('emits "clear" with "old" on old clear button click', async () => {
    const wrapper = shallowMount(DiffInputPanel, { props: defaultProps() })
    const clearButtons = wrapper.findAll('.editor-toolbar .secondary-button')
    await clearButtons[1]!.trigger('click')
    expect(wrapper.emitted('clear')).toEqual([['old']])
  })

  it('emits "clear" with "new" on new clear button click', async () => {
    const wrapper = shallowMount(DiffInputPanel, { props: defaultProps() })
    const clearButtons = wrapper.findAll('.editor-toolbar .secondary-button')
    await clearButtons[3]!.trigger('click')
    expect(wrapper.emitted('clear')).toEqual([['new']])
  })

  it('shows loading state when isRunning is true', () => {
    const wrapper = shallowMount(DiffInputPanel, {
      props: { ...defaultProps(), isRunning: true },
    })
    expect(wrapper.find('.loading-state').exists()).toBe(true)
    expect(wrapper.find('.spinner').exists()).toBe(true)
  })

  it('hides loading state when isRunning is false', () => {
    const wrapper = shallowMount(DiffInputPanel, { props: defaultProps() })
    expect(wrapper.find('.loading-state').exists()).toBe(false)
  })

  it('shows error message when errorMessage is non-empty', () => {
    const wrapper = shallowMount(DiffInputPanel, {
      props: { ...defaultProps(), errorMessage: '出错了' },
    })
    const errorEl = wrapper.find('.error-text')
    expect(errorEl.exists()).toBe(true)
    expect(errorEl.text()).toBe('出错了')
  })

  it('hides error message when errorMessage is empty', () => {
    const wrapper = shallowMount(DiffInputPanel, { props: defaultProps() })
    expect(wrapper.find('.error-text').exists()).toBe(false)
  })

  it('renders two MarkdownEditor stubs', () => {
    const wrapper = shallowMount(DiffInputPanel, { props: defaultProps() })
    const editors = wrapper.findAllComponents({ name: 'MarkdownEditor' })
    expect(editors).toHaveLength(2)
  })
})
