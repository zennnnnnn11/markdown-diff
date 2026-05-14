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
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 16px;
}

.panel-header,
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.editor-pane textarea {
  width: 100%;
  min-height: 280px;
  resize: vertical;
  font-family: ui-monospace, monospace;
}

button,
.secondary-button {
  border: 1px solid #c4cbd3;
  border-radius: 6px;
  background: #fff;
  padding: 8px 12px;
  cursor: pointer;
}

.secondary-button {
  background: #f6f8fa;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #d0d7de;
  border-top-color: #1f2328;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.hint {
  color: #57606a;
}

.error-text {
  color: #cf222e;
}

@media (max-width: 960px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
