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
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.debug-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
}

@media (max-width: 960px) {
  .debug-grid {
    grid-template-columns: 1fr;
  }
}
</style>
