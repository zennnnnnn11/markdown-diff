<script setup lang="ts">
import { computed, onMounted } from 'vue'

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
const activeFilter = computed(() => workbench.activeFilter.value)
const detail = computed(() => workbench.detail.value)
const peerHighlightKey = computed(() => workbench.peerHighlightKey.value)
const debugVisible = computed(() => !!workbench.result.value && workbench.showDebug.value)
const debugSnapshot = computed(() => workbench.debugSnapshot.value)

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

    <DiffProjectionTable
      :projection-lines="projectionLines"
      :active-filter="activeFilter"
      :peer-highlight-key="peerHighlightKey"
      @select="workbench.selectLine"
    />

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

.secondary-button {
  border: 1px solid #c4cbd3;
  border-radius: 6px;
  background: #f6f8fa;
  padding: 8px 12px;
  cursor: pointer;
}
</style>
