<script setup lang="ts">
import { ref } from 'vue'

import { readTextFile } from '@/core/io/read-text-file'

import MarkdownEditor from './MarkdownEditor.vue'

defineProps<{
  oldMarkdown: string
  newMarkdown: string
  isRunning: boolean
  canRun: boolean
  errorMessage: string
  collapsed: boolean
}>()

const emit = defineEmits<{
  'update:oldMarkdown': [value: string]
  'update:newMarkdown': [value: string]
  run: []
  clear: [side: 'old' | 'new']
  'toggle-collapse': []
}>()

const fileInput = ref<HTMLInputElement>()
const importError = ref('')
let pendingSide: 'old' | 'new' = 'old'
let errorTimer = 0

function triggerImport(side: 'old' | 'new'): void {
  pendingSide = side
  fileInput.value?.click()
}

async function onFileSelected(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  try {
    const text = await readTextFile(file)
    if (pendingSide === 'old') emit('update:oldMarkdown', text)
    else emit('update:newMarkdown', text)
    importError.value = ''
  } catch (err) {
    importError.value = err instanceof Error ? err.message : '文件读取失败'
    window.clearTimeout(errorTimer)
    errorTimer = window.setTimeout(() => { importError.value = '' }, 3000)
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2>输入区</h2>
      <div class="panel-actions">
        <button type="button" class="primary-button" :disabled="!canRun" @click="emit('run')">
          {{ isRunning ? '比对中...' : '运行比对' }}
        </button>
        <button type="button" class="secondary-button" @click="emit('toggle-collapse')">
          {{ collapsed ? '展开' : '收起' }}
        </button>
      </div>
    </div>

    <p class="collapsed-summary" :class="{ visible: collapsed }">
      旧文档 {{ oldMarkdown.length }} 字 / 新文档 {{ newMarkdown.length }} 字
    </p>

    <div class="editor-body" :class="{ collapsed }">
      <div class="editor-body-inner">
        <div class="editor-grid">
          <div class="editor-pane" data-testid="editor-pane-old">
            <div class="editor-toolbar">
              <label>旧文档</label>
              <div class="toolbar-actions">
                <button type="button" class="secondary-button" @click="triggerImport('old')">导入</button>
                <button type="button" class="secondary-button" @click="emit('clear', 'old')">清空</button>
              </div>
            </div>
            <MarkdownEditor
              :model-value="oldMarkdown"
              placeholder="在此粘贴旧文档..."
              @update:model-value="emit('update:oldMarkdown', $event)"
            />
          </div>

          <div class="editor-pane" data-testid="editor-pane-new">
            <div class="editor-toolbar">
              <label>新文档</label>
              <div class="toolbar-actions">
                <button type="button" class="secondary-button" @click="triggerImport('new')">导入</button>
                <button type="button" class="secondary-button" @click="emit('clear', 'new')">清空</button>
              </div>
            </div>
            <MarkdownEditor
              :model-value="newMarkdown"
              placeholder="在此粘贴新文档..."
              @update:model-value="emit('update:newMarkdown', $event)"
            />
          </div>
        </div>

        <div v-if="isRunning" class="loading-state" data-testid="diff-loading">
          <span class="spinner" aria-hidden="true"></span>
          <p class="hint">正在解析 Markdown、构建 Section 树并执行 diff。</p>
        </div>
        <p v-if="errorMessage" class="error-text" data-testid="diff-error">{{ errorMessage }}</p>
        <p v-if="importError" class="import-error" data-testid="import-error">{{ importError }}</p>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".md,.markdown,.mdx,.txt"
      hidden
      @change="onFileSelected"
    />
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  background: var(--bg-surface);
}

.panel-header,
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.panel-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.collapsed-summary {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  display: none;
}

.collapsed-summary.visible {
  display: block;
  margin: 10px 0 0;
}

.editor-body {
  display: grid;
  grid-template-rows: 1fr;
}

.editor-body.collapsed {
  grid-template-rows: 0fr;
}

.editor-body-inner {
  overflow: hidden;
  min-height: 0;
}

.editor-toolbar label {
  font-size: 13px;
  color: var(--text-secondary);
}

.editor-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 12px;
}

.editor-pane {
  min-width: 0;
}

.primary-button {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-primary);
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary-button:not(:disabled):hover {
  background: var(--bg-subtle);
}

.secondary-button {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-primary);
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
}

.secondary-button:hover {
  background: var(--bg-subtle);
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-right-color: var(--text-primary);
  border-radius: 50%;
  flex-shrink: 0;
}

.hint {
  color: var(--text-muted);
  font-size: 13px;
  margin: 0;
}

.error-text {
  color: var(--tone-delete-text);
  font-size: 13px;
  margin-top: 8px;
}

.import-error {
  color: var(--warning-text);
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-md);
  font-size: 13px;
  padding: 6px 12px;
  margin-top: 8px;
}

.toolbar-actions {
  display: flex;
  gap: 6px;
}

@media (max-width: 960px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }
}
</style>
