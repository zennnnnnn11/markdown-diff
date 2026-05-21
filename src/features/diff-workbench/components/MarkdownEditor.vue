<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { EditorView as CodeMirrorEditorView } from '@codemirror/view'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

type MarkdownEditorRuntime = Awaited<ReturnType<typeof loadMarkdownEditorRuntime>>

const container = ref<HTMLDivElement | null>(null)
const loadError = ref('')
let view: CodeMirrorEditorView | undefined
let ignoreNextUpdate = false
let destroyed = false

let runtimePromise: Promise<{
  EditorView: typeof import('@codemirror/view').EditorView
  EditorState: typeof import('@codemirror/state').EditorState
  drawSelection: typeof import('@codemirror/view').drawSelection
  cmPlaceholder: typeof import('@codemirror/view').placeholder
  keymap: typeof import('@codemirror/view').keymap
  markdown: typeof import('@codemirror/lang-markdown').markdown
  syntaxHighlighting: typeof import('@codemirror/language').syntaxHighlighting
  HighlightStyle: typeof import('@codemirror/language').HighlightStyle
  history: typeof import('@codemirror/commands').history
  historyKeymap: typeof import('@codemirror/commands').historyKeymap
  tags: typeof import('@lezer/highlight').tags
  loadCommonCodeLanguages: typeof import('./markdown-code-languages').loadCommonCodeLanguages
}> | undefined

function loadMarkdownEditorRuntime() {
  runtimePromise ??= Promise.all([
    import('@codemirror/view'),
    import('@codemirror/state'),
    import('@codemirror/lang-markdown'),
    import('@codemirror/language'),
    import('@codemirror/commands'),
    import('@lezer/highlight'),
    import('./markdown-code-languages'),
  ]).then(([viewMod, stateMod, markdownMod, languageMod, commandsMod, highlightMod, codeLanguagesMod]) => ({
    EditorView: viewMod.EditorView,
    EditorState: stateMod.EditorState,
    drawSelection: viewMod.drawSelection,
    cmPlaceholder: viewMod.placeholder,
    keymap: viewMod.keymap,
    markdown: markdownMod.markdown,
    syntaxHighlighting: languageMod.syntaxHighlighting,
    HighlightStyle: languageMod.HighlightStyle,
    history: commandsMod.history,
    historyKeymap: commandsMod.historyKeymap,
    tags: highlightMod.tags,
    loadCommonCodeLanguages: codeLanguagesMod.loadCommonCodeLanguages,
  }))
  return runtimePromise
}

function createHighlightStyle(
  HighlightStyle: MarkdownEditorRuntime['HighlightStyle'],
  tags: MarkdownEditorRuntime['tags'],
) {
  return HighlightStyle.define([
    {
      tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6],
      fontWeight: '600',
      color: 'var(--text-primary)',
    },
    { tag: tags.strong, fontWeight: '600', color: 'var(--text-primary)' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    {
      tag: [tags.monospace, tags.processingInstruction],
      fontFamily: 'var(--font-mono)',
      color: 'var(--text-primary)',
    },
    { tag: [tags.link, tags.url], textDecoration: 'underline', color: 'var(--accent-blue)' },
    { tag: [tags.quote, tags.contentSeparator], color: 'var(--text-secondary)', fontStyle: 'italic' },
  ])
}

function createEditorTheme(EditorView: MarkdownEditorRuntime['EditorView']) {
  return EditorView.theme({
    '&': {
      fontSize: '13px',
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      minHeight: '280px',
      marginTop: '6px',
      transition: 'background-color var(--transition-elastic), border-color var(--transition-elastic)',
    },
    '&.cm-focused': {
      outline: 'none',
      borderColor: 'var(--text-primary)',
      boxShadow: '0 0 0 1px var(--text-primary)',
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono)',
      padding: '14px 16px',
      caretColor: 'var(--text-primary)',
      minHeight: '260px',
      color: 'var(--text-primary)',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text-primary)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--bg-muted) !important',
    },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-placeholder': { color: 'var(--text-muted)' },
    '.cm-scroller': { overflow: 'auto' },
  })
}

onMounted(() => {
  destroyed = false
  void mountEditor()
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
  destroyed = true
  view?.destroy()
  view = undefined
})

async function mountEditor(): Promise<void> {
  if (!container.value) return

  try {
    const runtime = await loadMarkdownEditorRuntime()
    const codeLanguages = await runtime.loadCommonCodeLanguages()
    if (destroyed || !container.value) return

    const editorTheme = createEditorTheme(runtime.EditorView)
    const highlightStyle = createHighlightStyle(runtime.HighlightStyle, runtime.tags)

    view = new runtime.EditorView({
      state: runtime.EditorState.create({
        doc: props.modelValue,
        extensions: [
          editorTheme,
          runtime.syntaxHighlighting(highlightStyle),
          runtime.markdown({ codeLanguages }),
          runtime.EditorView.lineWrapping,
          runtime.drawSelection(),
          runtime.history(),
          runtime.keymap.of(runtime.historyKeymap),
          runtime.cmPlaceholder(props.placeholder ?? '在此粘贴 Markdown...'),
          runtime.EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              ignoreNextUpdate = true
              emit('update:modelValue', update.state.doc.toString())
            }
          }),
        ],
      }),
      parent: container.value,
    })
    loadError.value = ''
  } catch (error) {
    if (destroyed) return
    loadError.value = error instanceof Error ? `编辑器加载失败：${error.message}` : '编辑器加载失败'
  }
}
</script>

<template>
  <div class="markdown-editor">
    <div ref="container" class="markdown-editor-host" />
    <p v-if="loadError" class="load-error">{{ loadError }}</p>
  </div>
</template>

<style scoped>
.markdown-editor,
.markdown-editor-host {
  width: 100%;
}

.load-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--tone-delete-text);
}
</style>
