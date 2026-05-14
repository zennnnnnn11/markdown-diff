<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import DiffDebugPanel from './components/DiffDebugPanel.vue'
import DiffDetailModal from './components/DiffDetailModal.vue'
import DiffInputPanel from './components/DiffInputPanel.vue'
import DiffProjectionTable from './components/DiffProjectionTable.vue'
import DiffStatsBar from './components/DiffStatsBar.vue'
import { useDiffWorkbench } from './use-diff-workbench'
import type { HighlightFilter } from './view-model'

const props = defineProps<{
  initialOldMarkdown: string
  initialNewMarkdown: string
}>()

const workbench = useDiffWorkbench(props.initialOldMarkdown, props.initialNewMarkdown)
const oldMarkdown = computed(() => workbench.oldMarkdown.value)
const newMarkdown = computed(() => workbench.newMarkdown.value)
const isRunning = computed(() => workbench.isRunning.value)
const canRun = computed(() => workbench.canRun.value)
const errorMessage = computed(() => workbench.errorMessage.value)
const showDebug = computed(() => workbench.showDebug.value)
const resultVisible = computed(() => !!workbench.result.value)
const statsCards = computed(() => workbench.statsCards.value)
const projectionLines = computed(() => workbench.projectionLines.value)
const oldProjectionLines = computed(() => workbench.oldProjectionLines.value)
const activeFilter = computed(() => workbench.activeFilter.value)
const detail = computed(() => workbench.detail.value)
const peerHighlightKey = computed(() => workbench.peerHighlightKey.value)
const debugVisible = computed(() => !!workbench.result.value && workbench.showDebug.value)
const debugSnapshot = computed(() => workbench.debugSnapshot.value)
const showWarnings = ref(false)
const allWarnings = computed(() => {
  if (!workbench.result.value) return []
  const globalWarnings = workbench.result.value.warnings
  const perChangeWarnings = workbench.result.value.changeIndex
    ? [...workbench.result.value.changeIndex.byOldId.values()]
        .flatMap((c) => c.warnings)
        .filter((w) => w)
    : []
  return [...new Set([...globalWarnings, ...perChangeWarnings])]
})

onMounted(async () => {
  await workbench.executeDiff()
})

function updateOldMarkdown(value: string): void {
  workbench.oldMarkdown.value = value
}

function updateNewMarkdown(value: string): void {
  workbench.newMarkdown.value = value
}

function toggleDebug(): void {
  workbench.showDebug.value = !workbench.showDebug.value
}

function setHighlight(filter: HighlightFilter | null): void {
  workbench.activeFilter.value = filter
}

function selectLine(changeKey?: string, side?: 'old' | 'new'): void {
  workbench.selectLine(changeKey)
}
</script>

<template>
  <main class="app-shell">
    <header class="page-header">
      <div>
        <h1>Markdown Diff</h1>
        <p>parser → transformer → diff engine → projection</p>
      </div>
      <button type="button" class="secondary-button" @click="toggleDebug">
        {{ showDebug ? '关闭调试视图' : '调试视图' }}
      </button>
    </header>

    <DiffInputPanel
      :old-markdown="oldMarkdown"
      :new-markdown="newMarkdown"
      :is-running="isRunning"
      :can-run="canRun"
      :error-message="errorMessage"
      @update:old-markdown="updateOldMarkdown"
      @update:new-markdown="updateNewMarkdown"
      @run="workbench.executeDiff"
      @clear="workbench.clearEditor"
    />

    <DiffStatsBar
      :visible="resultVisible"
      :stats-cards="statsCards"
      @highlight="setHighlight"
    />

    <details v-if="resultVisible && allWarnings.length > 0" class="warnings-banner" @toggle="showWarnings = ($event.target as HTMLDetailsElement).open">
      <summary>
        ⚠ {{ allWarnings.length }} 个警告
      </summary>
      <ul class="warnings-list">
        <li v-for="(warning, index) in allWarnings" :key="index">{{ warning }}</li>
      </ul>
    </details>

    <div v-if="resultVisible" class="projection-grid">
      <DiffProjectionTable
        :projection-lines="oldProjectionLines"
        :active-filter="activeFilter"
        :peer-highlight-key="peerHighlightKey"
        side="old"
        @select="selectLine"
      />
      <DiffProjectionTable
        :projection-lines="projectionLines"
        :active-filter="activeFilter"
        :peer-highlight-key="peerHighlightKey"
        side="new"
        @select="selectLine"
      />
    </div>

    <DiffDetailModal :detail="detail" @close="workbench.closeDetail" />

    <DiffDebugPanel
      :visible="debugVisible"
      :debug-snapshot="debugSnapshot"
    />
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

:global(*) {
  box-sizing: border-box;
}

.app-shell {
  display: grid;
  gap: 16px;
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.warnings-banner {
  border: 1px solid #d0a44d;
  border-radius: 8px;
  background: #fffcf0;
  padding: 10px 14px;
  font-size: 14px;
}

.warnings-banner summary {
  cursor: pointer;
  font-weight: 600;
  color: #9a6700;
}

.warnings-list {
  margin: 8px 0 0 0;
  padding-left: 20px;
  color: #57606a;
}

.warnings-list li {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  word-break: break-all;
}

.projection-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.secondary-button {
  border: 1px solid #c4cbd3;
  border-radius: 6px;
  background: #f6f8fa;
  padding: 8px 12px;
  cursor: pointer;
}

@media (max-width: 1200px) {
  .projection-grid {
    grid-template-columns: 1fr;
  }
}
</style>
