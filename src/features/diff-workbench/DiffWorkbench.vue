<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import DiffDebugPanel from './components/DiffDebugPanel.vue'
import DiffDetailModal from './components/DiffDetailModal.vue'
import DiffInputPanel from './components/DiffInputPanel.vue'
import DiffProjectionTable from './components/DiffProjectionTable.vue'
import DiffStatsBar from './components/DiffStatsBar.vue'
import UnifiedDiffTable from './components/UnifiedDiffTable.vue'
import { useDiffWorkbench } from './use-diff-workbench'
import { buildMergedRows, formatWarningLabel } from './view-model'
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
const viewMode = computed(() => workbench.viewMode.value)
const resultVisible = computed(() => !!workbench.result.value)
const statsCards = computed(() => workbench.statsCards.value)
const activeFilter = computed(() => workbench.activeFilter.value)
const detail = computed(() => workbench.detail.value)
const peerHighlightKey = computed(() => workbench.peerHighlightKey.value)
const peerSide = computed(() => workbench.peerSide.value)
const debugVisible = computed(() => !!workbench.result.value && workbench.viewMode.value === 'debug')
const debugSnapshot = computed(() => workbench.debugSnapshot.value)
const mergedRows = computed(() =>
  workbench.result.value
    ? buildMergedRows(workbench.oldMarkdown.value, workbench.newMarkdown.value, workbench.result.value)
    : [],
)
const displayWarnings = computed(() => {
  if (!workbench.result.value) return []
  const globalWarnings = workbench.result.value.warnings
  const idx = workbench.result.value.changeIndex
  const perChangeWarnings = idx
    ? [...idx.byOldId.values(), ...idx.byNewId.values()]
        .flatMap((c) => c.warnings)
        .filter((w) => w)
    : []
  return [...new Set([...globalWarnings, ...perChangeWarnings].map((warning) => formatWarningLabel(warning)))]
})
const unifiedTableRef = ref<InstanceType<typeof UnifiedDiffTable> | null>(null)
const leftProjectionRef = ref<InstanceType<typeof DiffProjectionTable> | null>(null)
const rightProjectionRef = ref<InstanceType<typeof DiffProjectionTable> | null>(null)

watch(
  [() => leftProjectionRef.value, () => rightProjectionRef.value],
  ([leftRef, rightRef], _previous, onCleanup) => {
    const left = getScrollBody(leftRef)
    const right = getScrollBody(rightRef)
    if (!left || !right) return

    let frame = 0
    let syncingFrom: 'left' | 'right' | null = null
    const sync = (source: HTMLElement, target: HTMLElement, side: 'left' | 'right') => () => {
      if (syncingFrom && syncingFrom !== side) return
      syncingFrom = side
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        target.scrollTop = source.scrollTop
        syncingFrom = null
      })
    }

    const onLeftScroll = sync(left, right, 'left')
    const onRightScroll = sync(right, left, 'right')
    left.addEventListener('scroll', onLeftScroll, { passive: true })
    right.addEventListener('scroll', onRightScroll, { passive: true })

    onCleanup(() => {
      cancelAnimationFrame(frame)
      left.removeEventListener('scroll', onLeftScroll)
      right.removeEventListener('scroll', onRightScroll)
    })
  },
  { flush: 'post' },
)

watch(
  [peerHighlightKey, peerSide],
  async ([nextKey, nextSide]) => {
    if (!nextKey || !nextSide) return
    await nextTick()
    if (workbench.viewMode.value === 'source') {
      const row = document.querySelector<HTMLElement>(
        `.projection-row[data-side="${nextSide}"][data-change-key="${nextKey}"]`,
      )
      row?.scrollIntoView({ block: 'center' })
      return
    }
    if (workbench.viewMode.value === 'unified') {
      const cell = document.querySelector<HTMLElement>(
        `.cell[data-side="${nextSide}"][data-change-key="${nextKey}"]`,
      )
      cell?.scrollIntoView({ block: 'center' })
    }
  },
  { flush: 'post' },
)

onMounted(async () => {
  await workbench.executeDiff()
})

onBeforeUnmount(() => {
  unifiedTableRef.value = null
  leftProjectionRef.value = null
  rightProjectionRef.value = null
})

function updateOldMarkdown(value: string): void {
  workbench.oldMarkdown.value = value
}

function updateNewMarkdown(value: string): void {
  workbench.newMarkdown.value = value
}

function setHighlight(filter: HighlightFilter | null): void {
  workbench.activeFilter.value = filter
}

function selectLine(changeKey?: string, _side?: 'old' | 'new'): void {
  workbench.selectLine(changeKey)
}

function setViewMode(mode: 'source' | 'unified' | 'debug'): void {
  workbench.viewMode.value = mode
}

function getScrollBody(
  tableRef: InstanceType<typeof DiffProjectionTable> | null,
): HTMLElement | null {
  const exposed = tableRef as { scrollBody?: HTMLElement | { value?: HTMLElement | null } | null } | null
  const body = exposed?.scrollBody
  if (body instanceof HTMLElement) return body
  return body?.value ?? null
}
</script>

<template>
  <main class="app-shell">
    <header class="page-header">
      <div>
        <h1>Markdown Diff</h1>
        <p>parser → transformer → diff engine → projection</p>
      </div>
      <div class="view-tabs" role="tablist" aria-label="视图切换">
        <button type="button" class="secondary-button" :class="{ active: viewMode === 'unified' }" @click="setViewMode('unified')">左右对齐</button>
        <button type="button" class="secondary-button" :class="{ active: viewMode === 'source' }" @click="setViewMode('source')">单侧源码</button>
        <button type="button" class="secondary-button" :class="{ active: viewMode === 'debug' }" @click="setViewMode('debug')">调试视图</button>
      </div>
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

    <details v-if="resultVisible && displayWarnings.length > 0" class="warnings-banner">
      <summary>
        ⚠ {{ displayWarnings.length }} 个提示
        <button
          type="button"
          class="secondary-button locate-button"
          @click.stop="workbench.scrollToFirstMatch('warning')"
        >定位第一处</button>
      </summary>
      <ul class="warnings-list">
        <li v-for="(warning, index) in displayWarnings" :key="index">{{ warning }}</li>
      </ul>
    </details>

    <UnifiedDiffTable
      v-if="resultVisible && viewMode === 'unified'"
      ref="unifiedTableRef"
      :merged-rows="mergedRows"
      :active-filter="activeFilter"
      :peer-highlight-key="peerHighlightKey"
      @select="selectLine"
    />

    <div v-else-if="resultVisible && viewMode === 'source'" class="projection-layout">
      <DiffProjectionTable
        ref="leftProjectionRef"
        side="old"
        :projection-lines="workbench.oldProjectionLines.value"
        :active-filter="activeFilter"
        :peer-highlight-key="peerSide === 'old' ? peerHighlightKey : undefined"
        @select="selectLine"
      />
      <DiffProjectionTable
        ref="rightProjectionRef"
        side="new"
        :projection-lines="workbench.projectionLines.value"
        :active-filter="activeFilter"
        :peer-highlight-key="peerSide === 'new' ? peerHighlightKey : undefined"
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

.view-tabs {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

.projection-layout {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.secondary-button {
  border: 1px solid #c4cbd3;
  border-radius: 6px;
  background: #f6f8fa;
  padding: 8px 12px;
  cursor: pointer;
}

.secondary-button.active {
  border-color: #0969da;
  background: #e5edff;
  color: #1f3f8f;
}

.locate-button {
  margin-left: 12px;
  font-size: 12px;
  padding: 2px 8px;
}

@media (max-width: 960px) {
  .projection-layout {
    grid-template-columns: 1fr;
  }
}
</style>
