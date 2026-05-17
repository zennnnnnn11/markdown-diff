<script setup lang="ts">
import MarkdownEditor from './MarkdownEditor.vue'

defineProps<{
  oldMarkdown: string
  newMarkdown: string
  isRunning: boolean
  canRun: boolean
  errorMessage: string
}>()

const emit = defineEmits<{
  'update:oldMarkdown': [value: string]
  'update:newMarkdown': [value: string]
  run: []
  clear: [side: 'old' | 'new']
}>()
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2>输入区</h2>
      <button type="button" class="primary-button" :disabled="!canRun" @click="emit('run')">
        {{ isRunning ? '比对中...' : '运行比对' }}
      </button>
    </div>

    <div class="editor-grid">
      <div class="editor-pane">
        <div class="editor-toolbar">
          <label>旧文档</label>
          <button type="button" class="secondary-button" @click="emit('clear', 'old')">清空</button>
        </div>
        <MarkdownEditor
          :model-value="oldMarkdown"
          placeholder="在此粘贴旧文档..."
          @update:model-value="emit('update:oldMarkdown', $event)"
        />
      </div>

      <div class="editor-pane">
        <div class="editor-toolbar">
          <label>新文档</label>
          <button type="button" class="secondary-button" @click="emit('clear', 'new')">清空</button>
        </div>
        <MarkdownEditor
          :model-value="newMarkdown"
          placeholder="在此粘贴新文档..."
          @update:model-value="emit('update:newMarkdown', $event)"
        />
      </div>
    </div>

    <div v-if="isRunning" class="loading-state">
      <span class="spinner" aria-hidden="true"></span>
      <p class="hint">正在解析 Markdown、构建 Section 树并执行 diff。</p>
    </div>
    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
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
  color: var(--text-secondary);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.editor-toolbar label {
  font-size: 13px;
  font-weight: 500;
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
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--bg-surface);
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 150ms;
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary-button:not(:disabled):hover {
  opacity: 0.88;
}

.secondary-button {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms;
}

.secondary-button:hover {
  background: var(--bg-muted);
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
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
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

@media (max-width: 960px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
