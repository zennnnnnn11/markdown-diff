<script setup lang="ts">
import type { DebugSnapshot } from '../view-model'

defineProps<{
  visible: boolean
  debugSnapshot?: DebugSnapshot
}>()
</script>

<template>
  <section v-if="visible && debugSnapshot" class="panel">
    <div class="panel-header">
      <h2>调试视图</h2>
      <p>索引规模、质量摘要、全局告警与平铺后的 DiffChange 全量可查。</p>
    </div>

    <div class="debug-grid">
      <div>
        <h3>Quality Summary</h3>
        <pre>{{ JSON.stringify(debugSnapshot.quality, null, 2) }}</pre>
      </div>
      <div>
        <h3>Global Warnings</h3>
        <pre>{{ JSON.stringify(debugSnapshot.warnings, null, 2) }}</pre>
      </div>
      <div>
        <h3>Old SemanticIndex</h3>
        <pre>{{ JSON.stringify(debugSnapshot.oldIndexSummary, null, 2) }}</pre>
      </div>
      <div>
        <h3>New SemanticIndex</h3>
        <pre>{{ JSON.stringify(debugSnapshot.newIndexSummary, null, 2) }}</pre>
      </div>
      <div>
        <h3>MatchPair 列表</h3>
        <pre>{{ JSON.stringify(debugSnapshot.matches, null, 2) }}</pre>
      </div>
      <div>
        <h3>DiffChange 平铺列表</h3>
        <pre>{{ JSON.stringify(debugSnapshot.changes, null, 2) }}</pre>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  background: var(--bg-surface);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.panel-header p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.debug-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.debug-grid h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  color: var(--text-primary);
  overflow-x: auto;
}

@media (max-width: 960px) {
  .debug-grid {
    grid-template-columns: 1fr;
  }
}
</style>
