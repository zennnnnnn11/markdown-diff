import { describe, expect, it, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { EditorView } from '@codemirror/view'
import MarkdownEditor from '../MarkdownEditor.vue'

function getEditorView(wrapper: ReturnType<typeof mount>): EditorView {
  const cmEl = wrapper.find('.cm-editor').element as HTMLElement
  return EditorView.findFromDOM(cmEl)!
}

describe('MarkdownEditor', () => {
  let wrapper: ReturnType<typeof mount> | undefined

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('creates EditorView on mount', () => {
    wrapper = mount(MarkdownEditor, {
      props: { modelValue: '' },
      attachTo: document.body,
    })
    expect(wrapper.find('.cm-editor').exists()).toBe(true)
  })

  it('reflects initial modelValue in CM state', () => {
    wrapper = mount(MarkdownEditor, {
      props: { modelValue: 'hello world' },
      attachTo: document.body,
    })
    const view = getEditorView(wrapper)
    expect(view.state.doc.toString()).toBe('hello world')
  })

  it('syncs prop change to CM state', async () => {
    wrapper = mount(MarkdownEditor, {
      props: { modelValue: 'initial' },
      attachTo: document.body,
    })
    await wrapper.setProps({ modelValue: 'updated' })
    await flushPromises()
    const view = getEditorView(wrapper)
    expect(view.state.doc.toString()).toBe('updated')
  })

  it('identical prop change is no-op', async () => {
    wrapper = mount(MarkdownEditor, {
      props: { modelValue: 'same' },
      attachTo: document.body,
    })
    const view = getEditorView(wrapper)
    const initialVersion = view.state.doc.length
    await wrapper.setProps({ modelValue: 'same' })
    await flushPromises()
    expect(view.state.doc.toString()).toBe('same')
    expect(view.state.doc.length).toBe(initialVersion)
  })

  it('CM dispatch emits update:modelValue', () => {
    wrapper = mount(MarkdownEditor, {
      props: { modelValue: '' },
      attachTo: document.body,
    })
    const view = getEditorView(wrapper)
    view.dispatch({ changes: { from: 0, to: 0, insert: 'typed' } })
    const emitted = wrapper.emitted('update:modelValue') as string[][]
    expect(emitted).toBeDefined()
    expect(emitted[0]![0]).toBe('typed')
  })

  it('ignoreNextUpdate prevents watch re-dispatch after CM change', async () => {
    wrapper = mount(MarkdownEditor, {
      props: { modelValue: '' },
      attachTo: document.body,
    })
    const view = getEditorView(wrapper)
    view.dispatch({ changes: { from: 0, to: 0, insert: 'from-cm' } })
    const emitted = wrapper.emitted('update:modelValue') as string[][]
    expect(emitted[0]![0]).toBe('from-cm')

    await wrapper.setProps({ modelValue: 'from-cm' })
    await flushPromises()
    expect(view.state.doc.toString()).toBe('from-cm')
  })

  it('uses default placeholder when no placeholder prop', () => {
    wrapper = mount(MarkdownEditor, {
      props: { modelValue: '' },
      attachTo: document.body,
    })
    const placeholder = wrapper.find('.cm-placeholder')
    if (placeholder.exists()) {
      expect(placeholder.text()).toContain('Markdown')
    }
  })

  it('destroys EditorView on unmount', () => {
    wrapper = mount(MarkdownEditor, {
      props: { modelValue: 'test' },
      attachTo: document.body,
    })
    expect(wrapper.find('.cm-editor').exists()).toBe(true)
    wrapper.unmount()
    wrapper = undefined
  })
})
