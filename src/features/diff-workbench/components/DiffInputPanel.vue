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
  transition: all var(--transition-normal);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-header h2 {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
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
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  padding: 8px 14px;
  border-radius: var(--radius-md);
  width: fit-content;
}

.collapsed-summary.visible {
  display: block;
  margin: 14px 0 0;
  animation: fadeIn var(--transition-normal);
}

.editor-body {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows var(--transition-fluid-spring);
  will-change: grid-template-rows;
  contain: content; /* Isolate layout & style calculations to ensure maximum framerate (FPS) */
}

.editor-body.collapsed {
  grid-template-rows: 0fr;
}

.editor-body-inner {
  overflow: hidden;
  min-height: 0;
  opacity: 1;
  transform: translateY(0) translateZ(0);
  transition: opacity 0.35s cubic-bezier(0.25, 1, 0.2, 1),
              transform 0.38s cubic-bezier(0.25, 1, 0.2, 1);
  will-change: opacity, transform;
}

.editor-body.collapsed .editor-body-inner {
  opacity: 0;
  transform: translateY(-8px) translateZ(0);
}

.editor-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 18px;
}

.editor-pane {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  padding: 0 4px;
}

.editor-toolbar label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.toolbar-actions {
  display: flex;
  gap: 6px;
}

.toolbar-actions .secondary-button {
  padding: 4px 10px;
  font-size: 11px;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 10px 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-right-color: var(--text-primary);
  border-radius: 50%;
  flex-shrink: 0;
  animation: spin 0.6s linear infinite;
}

.hint {
  color: var(--text-secondary);
  font-size: 12px;
  margin: 0;
}

.error-text {
  color: var(--tone-delete-text);
  font-size: 12px;
  margin-top: 10px;
  padding: 8px 14px;
  background: var(--tone-delete-bg);
  border: 1px solid var(--tone-delete-border);
  border-radius: var(--radius-md);
}

.import-error {
  color: var(--warning-text);
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-md);
  font-size: 12px;
  padding: 8px 14px;
  margin-top: 10px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 960px) {
  .editor-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
