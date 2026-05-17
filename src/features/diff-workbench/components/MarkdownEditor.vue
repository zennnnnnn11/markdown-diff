<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { EditorView, drawSelection, placeholder as cmPlaceholder, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { history, historyKeymap } from '@codemirror/commands'
import { tags } from '@lezer/highlight'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const container = ref<HTMLDivElement>()
let view: EditorView | undefined
let ignoreNextUpdate = false

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: 'bold', color: '#1A1918', fontSize: '1.2em' },
  { tag: tags.heading2, fontWeight: 'bold', color: '#1A1918', fontSize: '1.1em' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: 'bold', color: '#1A1918' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, color: '#D97757', backgroundColor: '#F5F3F0' },
  { tag: tags.link, color: '#2B4A8D', textDecoration: 'underline' },
  { tag: tags.url, color: '#9E9892' },
  { tag: tags.quote, color: '#5B3A9B' },
  { tag: tags.contentSeparator, color: '#9E9892' },
  { tag: tags.processingInstruction, color: '#6B6560' },
  { tag: tags.list, color: '#D97757' },
])

const editorTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    backgroundColor: 'var(--bg-subtle)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    minHeight: '280px',
    marginTop: '6px',
  },
  '&.cm-focused': {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 3px rgb(217 119 87 / 12%)',
    outline: 'none',
    backgroundColor: 'var(--bg-surface)',
  },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    padding: '10px 12px',
    caretColor: 'var(--accent)',
    minHeight: '260px',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgb(217 119 87 / 15%) !important',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-placeholder': { color: 'var(--text-muted)' },
  '.cm-scroller': { overflow: 'auto' },
})

onMounted(() => {
  if (!container.value) return
  view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        editorTheme,
        syntaxHighlighting(highlightStyle),
        markdown({ codeLanguages: languages }),
        EditorView.lineWrapping,
        drawSelection(),
        history(),
        keymap.of(historyKeymap),
        cmPlaceholder(props.placeholder ?? '在此粘贴 Markdown...'),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            ignoreNextUpdate = true
            emit('update:modelValue', update.state.doc.toString())
          }
        }),
      ],
    }),
    parent: container.value,
  })
})

watch(() => props.modelValue, (newVal) => {
  if (ignoreNextUpdate) {
    ignoreNextUpdate = false
    return
  }
  if (!view) return
  const current = view.state.doc.toString()
  if (current === newVal) return
  view.dispatch({
    changes: { from: 0, to: current.length, insert: newVal },
  })
})

onBeforeUnmount(() => {
  view?.destroy()
  view = undefined
})
</script>

<template>
  <div ref="container" class="markdown-editor" />
</template>

<style scoped>
.markdown-editor {
  width: 100%;
}
</style>
