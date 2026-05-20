<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import DiffChangeNav from './components/DiffChangeNav.vue'
import DiffDebugPanel from './components/DiffDebugPanel.vue'
import DiffDetailModal from './components/DiffDetailModal.vue'
import DiffInputPanel from './components/DiffInputPanel.vue'
import DiffStatsBar from './components/DiffStatsBar.vue'
import UnifiedDiffTable from './components/UnifiedDiffTable.vue'
import { useDiffWorkbench } from './use-diff-workbench'
import { buildMergedRows, formatWarningLabel } from './view-model'
import type { HighlightFilter } from './view-model'

interface ScrollableExposed {
  scrollToIndex?: (index: number) => void
}

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
const inputCollapsed = computed(() => workbench.inputCollapsed.value)
const currentChangeIndex = computed(() => workbench.currentChangeIndex.value)
const totalChangeCount = computed(() => workbench.totalChangeCount.value)
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

watch(
  [peerHighlightKey, peerSide],
  async ([nextKey, nextSide]) => {
    if (!nextKey || !nextSide) return
    await nextTick()
    if (workbench.viewMode.value === 'unified') {
      const targetIndex = mergedRows.value.findIndex((row) =>
        (nextSide === 'old' && row.oldLine?.changeKey === nextKey) ||
        (nextSide === 'new' && row.newLine?.changeKey === nextKey),
      )
      if (targetIndex >= 0) {
        const exposed = unifiedTableRef.value as unknown as ScrollableExposed | null
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

    const rowIndex = mergedRows.value.findIndex((row) => {
      const line = target.side === 'old' ? row.oldLine : row.newLine
      return line?.changeKey === target.changeKey
    })
    if (rowIndex >= 0) {
      const exposed = unifiedTableRef.value as unknown as ScrollableExposed | null
      exposed?.scrollToIndex?.(rowIndex)
    }
  },
  { flush: 'post' },
)

const isDarkMode = ref(true)

function toggleTheme(): void {
  isDarkMode.value = !isDarkMode.value
  updateThemeClass()
}

function updateThemeClass(): void {
  if (typeof document === 'undefined') return
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKeyDown)
  updateThemeClass()
  await workbench.executeDiff()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown)
  unifiedTableRef.value = null
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

function selectLine(changeKey?: string, _side?: 'old' | 'new'): void { // eslint-disable-line @typescript-eslint/no-unused-vars
  workbench.selectLine(changeKey)
}

function setViewMode(mode: 'unified' | 'debug'): void {
  workbench.viewMode.value = mode
}

function toggleCollapse(): void {
  workbench.inputCollapsed.value = !workbench.inputCollapsed.value
}

function onKeyDown(e: KeyboardEvent): void {
  if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
  if ((e.target as HTMLElement)?.closest('.cm-editor')) return
  e.preventDefault()
  workbench.navigateChange(e.key === 'ArrowUp' ? -1 : 1)
}
</script>

<template>
  <main class="app-shell">
    <div class="top-gradient-glow" aria-hidden="true"></div>

    <header class="page-header">
      <div class="brand-breadcrumbs">
        <span class="brand-owner">zennnnnnn11</span>
        <span class="brand-separator">/</span>
        <h1 class="brand-repo">Markdown Diff</h1>
        <span class="brand-badge">v0.1.0</span>
      </div>

      <div class="header-controls">
        <button
          type="button"
          class="theme-toggle-btn"
          aria-label="切换主题"
          title="切换主题"
          @click="toggleTheme"
        >
          <transition name="icon-pop" mode="out-in">
            <!-- Moon Icon (shows in light mode) -->
            <svg v-if="!isDarkMode" key="moon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            <!-- Sun Icon (shows in dark mode) -->
            <svg v-else key="sun" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          </transition>
        </button>

        <div class="view-tabs" role="tablist" aria-label="视图切换">
          <button type="button" class="secondary-button" :class="{ active: viewMode === 'unified' }" @click="setViewMode('unified')">左右对齐</button>
          <button type="button" class="secondary-button" :class="{ active: viewMode === 'debug' }" @click="setViewMode('debug')">调试视图</button>
        </div>
      </div>
    </header>

    <DiffInputPanel
      :old-markdown="oldMarkdown"
      :new-markdown="newMarkdown"
      :is-running="isRunning"
      :can-run="canRun"
      :error-message="errorMessage"
      :collapsed="inputCollapsed"
      @update:old-markdown="updateOldMarkdown"
      @update:new-markdown="updateNewMarkdown"
      @run="workbench.executeDiff"
      @clear="workbench.clearEditor"
      @toggle-collapse="toggleCollapse"
    />

    <DiffStatsBar
      :visible="resultVisible"
      :stats-cards="statsCards"
      :active-filter="activeFilter"
      @highlight="setHighlight"
    />

    <div v-if="isDiffStale" class="stale-banner">
      <span>内容已修改，结果可能不准确</span>
      <button type="button" class="primary-button locate-button" @click="workbench.executeDiff">重新比对</button>
    </div>

    <details v-if="resultVisible && displayWarnings.length > 0" class="warnings-banner">
      <summary>
        <span>⚠ {{ displayWarnings.length }} 个提示</span>
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

    <DiffChangeNav
      v-if="resultVisible && totalChangeCount > 0"
      :current="currentChangeIndex"
      :total="totalChangeCount"
      @prev="workbench.navigateChange(-1)"
      @next="workbench.navigateChange(1)"
    />

    <UnifiedDiffTable
      v-if="resultVisible && viewMode === 'unified'"
      ref="unifiedTableRef"
      :merged-rows="mergedRows"
      :active-filter="activeFilter"
      :peer-highlight-key="peerHighlightKey"
      @select="selectLine"
    />

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
  gap: 20px;
  padding: 32px 24px 120px; /* Leave space for bottom floating nav */
  max-width: 1400px;
  margin: 0 auto;
  position: relative;
  min-height: 100vh;
}

/* Subtle Vercel Radial glow in Dark Mode */
.top-gradient-glow {
  display: none;
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 1000px;
  height: 250px;
  background: radial-gradient(circle, rgba(0, 112, 243, 0.08) 0%, rgba(0, 0, 0, 0) 70%);
  z-index: -1;
  pointer-events: none;
}

.dark .top-gradient-glow {
  display: block;
}

/* Brand Breadcrumbs Header */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding-bottom: 18px;
  margin-bottom: 6px;
  flex-wrap: wrap;
  gap: 16px;
}

.brand-breadcrumbs {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.brand-owner {
  color: var(--text-secondary);
  transition: color var(--transition-fast);
}

.brand-owner:hover {
  color: var(--text-primary);
  cursor: pointer;
}

.brand-separator {
  color: var(--text-muted);
  font-weight: 300;
}

.brand-repo {
  font-size: inherit;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: inline;
}

.brand-badge {
  font-size: 11px;
  background: var(--bg-muted);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: 9999px;
  font-weight: 500;
  margin-left: 4px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Minimalist Circular Theme Toggle Button */
.theme-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-fast);
}

.theme-toggle-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-primary);
  background: var(--bg-subtle);
  transform: translateY(-1px);
}

.theme-toggle-btn:active {
  transform: translateY(0) scale(0.96);
}

/* Sun/Moon Icon toggle micro-transition */
.icon-pop-enter-active,
.icon-pop-leave-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.icon-pop-enter-from {
  opacity: 0;
  transform: scale(0.6) rotate(-90deg);
}

.icon-pop-leave-to {
  opacity: 0;
  transform: scale(0.6) rotate(90deg);
}

.locate-button {
  margin-left: 8px;
  font-size: 12px;
  padding: 4px 10px;
}

.warnings-banner summary span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
