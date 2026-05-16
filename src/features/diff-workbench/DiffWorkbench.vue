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
const isDiffStale = computed(() => workbench.isDiffStale.value)
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
      const lines = nextSide === 'old' ? workbench.oldProjectionLines.value : workbench.projectionLines.value
      const targetIndex = lines.findIndex((line) => line.changeKey === nextKey)
      if (targetIndex >= 0) {
        const tableRef = nextSide === 'old' ? leftProjectionRef.value : rightProjectionRef.value
        const exposed = tableRef as any
        exposed?.scrollToIndex?.(targetIndex)
      }
      return
    }
    if (workbench.viewMode.value === 'unified') {
      const targetIndex = mergedRows.value.findIndex((row) =>
        (nextSide === 'old' && row.oldLine?.changeKey === nextKey) ||
        (nextSide === 'new' && row.newLine?.changeKey === nextKey),
      )
      if (targetIndex >= 0) {
        const exposed = unifiedTableRef.value as any
        exposed?.scrollToIndex?.(targetIndex)
      }
    }
  },
  { flush: 'post' },
)

watch(
  () => workbench.pendingScrollTarget.value,
  async (target) => {
    if (!target) return
    workbench.pendingScrollTarget.value = null
    await nextTick()

    if (workbench.viewMode.value === 'source') {
      const tableRef = target.side === 'old' ? leftProjectionRef.value : rightProjectionRef.value
      const exposed = tableRef as any
      exposed?.scrollToIndex?.(target.index)
    } else if (workbench.viewMode.value === 'unified') {
      const rowIndex = mergedRows.value.findIndex((row) => {
        const line = target.side === 'old' ? row.oldLine : row.newLine
        return line?.changeKey === target.changeKey
      })
      if (rowIndex >= 0) {
        const exposed = unifiedTableRef.value as any
        exposed?.scrollToIndex?.(rowIndex)
      }
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

    <div v-if="isDiffStale" class="stale-banner">
      内容已修改，结果可能不准确
      <button type="button" class="secondary-button locate-button" @click="workbench.executeDiff">重新比对</button>
    </div>

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
.app-shell {
  display: grid;
  gap: 16px;
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.page-header h1 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.page-header p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 2px 0 0;
}

.view-tabs {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.secondary-button {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms, border-color 120ms, color 120ms;
}

.secondary-button:hover {
  background: var(--bg-subtle);
  border-color: var(--border);
}

.secondary-button.active {
  border-color: var(--accent);
  background: var(--accent-subtle);
  color: var(--accent);
}

.projection-layout {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.warnings-banner {
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-md);
  background: var(--warning-bg);
  padding: 10px 14px;
  font-size: 14px;
}

.stale-banner {
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-md);
  background: var(--warning-bg);
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--warning-text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.warnings-banner summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--warning-text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.warnings-list {
  margin: 8px 0 0 0;
  padding-left: 20px;
  color: var(--text-secondary);
}

.warnings-list li {
  font-family: var(--font-mono);
  font-size: 13px;
  word-break: break-all;
}

.locate-button {
  margin-left: 4px;
  font-size: 12px;
  padding: 2px 8px;
}

@media (max-width: 960px) {
  .projection-layout {
    grid-template-columns: 1fr;
  }
}
</style>
