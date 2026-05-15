<script setup lang="ts">
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
      <button type="button" :disabled="!canRun" @click="emit('run')">
        {{ isRunning ? '比对中...' : '运行比对' }}
      </button>
    </div>

    <div class="editor-grid">
      <div class="editor-pane">
        <div class="editor-toolbar">
          <label for="old-markdown">旧文档</label>
          <button type="button" class="secondary-button" @click="emit('clear', 'old')">清空</button>
        </div>
        <textarea
          id="old-markdown"
          :value="oldMarkdown"
          spellcheck="false"
          @input="emit('update:oldMarkdown', ($event.target as HTMLTextAreaElement).value)"
        />
      </div>

      <div class="editor-pane">
        <div class="editor-toolbar">
          <label for="new-markdown">新文档</label>
          <button type="button" class="secondary-button" @click="emit('clear', 'new')">清空</button>
        </div>
        <textarea
          id="new-markdown"
          :value="newMarkdown"
          spellcheck="false"
          @input="emit('update:newMarkdown', ($event.target as HTMLTextAreaElement).value)"
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

.editor-pane textarea {
  width: 100%;
  min-height: 280px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-primary);
  padding: 10px 12px;
  outline: none;
  transition: border-color 150ms, box-shadow 150ms;
  margin-top: 6px;
}

.editor-pane textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgb(217 119 87 / 12%);
  background: var(--bg-surface);
}

button {
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #fff;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 150ms;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button:not(:disabled):hover {
  opacity: 0.88;
}

.secondary-button {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  color: var(--text-secondary);
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
