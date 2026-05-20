<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { HighlightFilter, MergedRow } from '../view-model'
import { computeAllRowHeights } from '../view-model/row-height'
import UnifiedDiffRow from './UnifiedDiffRow.vue'

const scrollBody = ref<HTMLElement | null>(null)
const tableWidth = ref(0)
let resizeObserver: ResizeObserver | undefined

const props = defineProps<{
  mergedRows: MergedRow[]
  activeFilter: HighlightFilter | null
  peerHighlightKey?: string
}>()

const rowHeights = computed(() =>
  tableWidth.value > 0
    ? computeAllRowHeights(props.mergedRows, tableWidth.value)
    : [],
)

const rowVirtualizer = useVirtualizer(computed(() => ({
  count: props.mergedRows.length,
  getScrollElement: () => scrollBody.value,
  estimateSize: (index: number) => rowHeights.value[index] ?? 44,
  overscan: 8,
})))

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

onMounted(() => {
  if (!scrollBody.value) return
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry) tableWidth.value = entry.contentRect.width
  })
  resizeObserver.observe(scrollBody.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

defineExpose({ scrollBody, scrollToIndex: (index: number) => rowVirtualizer.value.scrollToIndex(index, { align: 'center' }) })

const emit = defineEmits<{
  (e: 'select', changeKey: string | undefined, side: 'old' | 'new'): void
}>()

function onSelect(changeKey: string | undefined, side: 'old' | 'new'): void {
  emit('select', changeKey, side)
}

watch(() => props.peerHighlightKey, (newKey, oldKey) => {
  if (!scrollBody.value) return
  if (oldKey) {
    scrollBody.value.querySelectorAll('.cell.peer-highlight').forEach((el) => el.classList.remove('peer-highlight'))
  }
  if (newKey) {
    scrollBody.value.querySelectorAll(`.cell[data-change-key="${CSS.escape(newKey)}"]`).forEach((el) => el.classList.add('peer-highlight'))
  }
})
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2>左右对齐视图</h2>
      <p>旧文档和新文档按同一行号并排呈现，缺失侧保留灰度空白。</p>
    </div>

    <div
      ref="scrollBody"
      class="unified-table"
      role="table"
      aria-label="左右对齐视图"
      :data-active-filter="activeFilter ?? undefined"
    >
      <div class="unified-header-row" role="row">
        <div class="row-index row-index-header" role="columnheader">行</div>
        <div class="side-heading side-heading-old" role="columnheader">旧文档</div>
        <div class="center-gap center-gap-header" aria-hidden="true"></div>
        <div class="side-heading side-heading-new" role="columnheader">新文档</div>
      </div>
      <div :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
        <div
          v-for="vRow in virtualRows"
          :key="mergedRows[vRow.index]?.key ?? vRow.index"
          :data-index="vRow.index"
          class="unified-row"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${vRow.start}px)`,
          }"
        >
          <UnifiedDiffRow
            :row="mergedRows[vRow.index]!"
            :row-index="vRow.index"
            @select="onSelect"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel {
  padding: 20px;
  transition: all var(--transition-normal);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-header h2 {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

.panel-header p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 2px 0 0;
}

.unified-table {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow-y: auto;
  max-height: 70vh;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--transition-normal);
}

.unified-header-row,
:deep(.unified-row) {
  display: grid;
  grid-template-columns: 48px 84px minmax(0, 1fr) 20px 84px minmax(0, 1fr);
  transition: background-color var(--transition-fast);
}

.unified-header-row {
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid var(--border);
  background: var(--bg-page);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.unified-header-row > * {
  padding: 10px 12px;
  display: flex;
  align-items: center;
}

.side-heading-old {
  grid-column: 2 / 4;
  border-right: 1px solid var(--border);
}

.side-heading-new {
  grid-column: 5 / 7;
}

.unified-row {
  border-top: 1px solid var(--border-subtle);
  min-height: 28px;
}

.unified-row:hover {
  background: var(--bg-subtle);
}

:deep(.row-index) {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 10px;
  border-right: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 500;
  user-select: none;
  font-variant-numeric: tabular-nums;
  transition: background-color var(--transition-normal);
}

.row-index-header {
  justify-content: center;
}

:deep(.center-gap) {
  background:
    linear-gradient(90deg, var(--border) 0 1px, transparent 1px),
    linear-gradient(90deg, transparent calc(100% - 1px), var(--border) calc(100% - 1px));
}

.center-gap-header {
  padding: 0;
}

:deep(.gutter) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 4px 6px;
  font-size: 11px;
  color: var(--text-muted);
  user-select: none;
  font-variant-numeric: tabular-nums;
}

:deep(.gutter-old) {
  border-right: 1px solid var(--border-subtle);
}

:deep(.gutter.interactive) {
  cursor: pointer;
}

:deep(.gutter-badges) {
  display: flex;
  align-items: center;
  gap: 4px;
}

:deep(.line-number) {
  min-width: 24px;
  text-align: right;
  font-weight: 500;
}

:deep(.descendant-flag) {
  color: var(--text-muted);
  font-size: 11px;
}

:deep(.overlap-flag) {
  color: var(--text-secondary);
  background: var(--bg-muted);
  border: 1px solid var(--border);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  font-size: 9px;
  font-weight: 500;
}

:deep(.warning-flag) {
  color: var(--warning-text);
  font-size: 11px;
}

:deep(.move-peer-flag) {
  color: var(--tone-move-text);
  background: var(--tone-move-bg);
  border: 1px solid var(--tone-move-border);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  font-size: 9px;
  font-weight: 600;
  transition: color var(--transition-fast), background-color var(--transition-fast);
}

:deep(.move-peer-flag:hover) {
  background: var(--tone-move-border);
  color: var(--text-primary);
}

:deep(.cell) {
  padding: 6px 12px;
  white-space: pre-wrap;
  word-break: break-word;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  line-height: 1.5;
  transition: background-color var(--transition-fast), box-shadow var(--transition-fast);
}

:deep(.cell-old) {
  border-right: 1px solid var(--border-subtle);
}

:deep(.cell.interactive) {
  cursor: pointer;
}

:deep(.cell.interactive:hover) {
  background: rgba(0, 0, 0, 0.02);
}

:deep(.dark .cell.interactive:hover) {
  background: rgba(255, 255, 255, 0.02);
}

:deep(.cell.peer-highlight) {
  box-shadow: inset 0 0 0 2px var(--accent-blue);
  background: var(--accent-blue-subtle);
  animation: pulse-glow 2.5s infinite alternate ease-in-out;
}

@keyframes pulse-glow {
  0% {
    box-shadow: inset 0 0 0 2px var(--accent-blue), 0 0 4px rgba(0, 112, 243, 0.2);
  }
  100% {
    box-shadow: inset 0 0 0 2.5px var(--accent-blue), 0 0 12px rgba(0, 112, 243, 0.45);
    background: rgba(0, 112, 243, 0.15);
  }
}

:deep(.cell.pair-match) {
  border-left: 3px solid var(--text-primary);
}

:deep(.cell.pair-align) {
  border-left: 3px dashed var(--text-muted);
}

:deep(.placeholder-text) {
  visibility: hidden;
}

:deep(.line-text) {
  min-width: 0;
  flex: 1;
}

:deep(.segment) {
  white-space: pre-wrap;
}

:deep(.cell-annotations) {
  display: inline-flex;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

/* CSS-driven activeFilter highlighting */
.unified-table[data-active-filter="insert"] :deep(.cell[data-base-tone="insert"]),
.unified-table[data-active-filter="insert"] :deep(.cell[data-matched-tones~="insert"]) { box-shadow: inset 0 0 0 2px var(--accent-blue); }
.unified-table[data-active-filter="delete"] :deep(.cell[data-base-tone="delete"]),
.unified-table[data-active-filter="delete"] :deep(.cell[data-matched-tones~="delete"]) { box-shadow: inset 0 0 0 2px var(--accent-blue); }
.unified-table[data-active-filter="replace"] :deep(.cell[data-base-tone="replace"]),
.unified-table[data-active-filter="replace"] :deep(.cell[data-matched-tones~="replace"]) { box-shadow: inset 0 0 0 2px var(--accent-blue); }
.unified-table[data-active-filter="move"] :deep(.cell[data-base-tone="move"]),
.unified-table[data-active-filter="move"] :deep(.cell[data-matched-tones~="move"]) { box-shadow: inset 0 0 0 2px var(--accent-blue); }
.unified-table[data-active-filter="meta"] :deep(.cell[data-base-tone="meta"]),
.unified-table[data-active-filter="meta"] :deep(.cell[data-matched-tones~="meta"]) { box-shadow: inset 0 0 0 2px var(--accent-blue); }
.unified-table[data-active-filter="rename"] :deep(.cell[data-base-tone="rename"]),
.unified-table[data-active-filter="rename"] :deep(.cell[data-matched-tones~="rename"]) { box-shadow: inset 0 0 0 2px var(--accent-blue); }
.unified-table[data-active-filter="reorder"] :deep(.cell[data-base-tone="reorder"]),
.unified-table[data-active-filter="reorder"] :deep(.cell[data-matched-tones~="reorder"]) { box-shadow: inset 0 0 0 2px var(--accent-blue); }
.unified-table[data-active-filter="warning"] :deep(.cell[data-has-warning]) { box-shadow: inset 0 0 0 2px var(--accent-blue); }

@media (max-width: 960px) {
  .unified-header-row,
  :deep(.unified-row) {
    grid-template-columns: 40px 68px minmax(0, 1fr) 12px 68px minmax(0, 1fr);
  }
}
</style>
