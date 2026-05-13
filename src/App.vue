<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'

import type { DiffResult } from '@/core/diff'
import type { DiffChange } from '@/core/diff'
import type { HighlightFilter, ProjectionLine, Tone } from '@/features/diff-workbench/view-model'
import {
  buildDebugSnapshot,
  buildDetailPanel,
  buildProjectionLines,
  flattenChanges,
  getChangeReference,
  lineMatchesFilter,
  runMarkdownDiff,
  toneLabels,
} from '@/features/diff-workbench/view-model'

import sampleNewMarkdown from '../new.md?raw'
import sampleOldMarkdown from '../old.md?raw'

const oldMarkdown = ref(sampleOldMarkdown)
const newMarkdown = ref(sampleNewMarkdown)
const isRunning = ref(false)
const errorMessage = ref('')
const showDebug = ref(false)
const activeFilter = ref<HighlightFilter | null>(null)
const selectedChangeKey = ref<string | null>(null)
const result = shallowRef<DiffResult | null>(null)

const flatChanges = computed(() => (result.value ? flattenChanges(result.value.root) : []))
const changeByKey = computed(() => {
  const pairs = flatChanges.value.map((change) => [getChangeReference(change), change] as const)
  return new Map<string, DiffChange>(pairs)
})
const projectionLines = computed(() =>
  result.value ? buildProjectionLines(newMarkdown.value, result.value) : buildEmptyLines(newMarkdown.value),
)
const selectedChange = computed(() =>
  selectedChangeKey.value ? changeByKey.value.get(selectedChangeKey.value) : undefined,
)
const detail = computed(() => buildDetailPanel(selectedChange.value))
const debugSnapshot = computed(() => (result.value ? buildDebugSnapshot(result.value) : undefined))
const warningCount = computed(() => {
  if (!result.value) return 0
  return result.value.quality.degradedCount + result.value.quality.inlineDeferredCount
})
const canRun = computed(
  () => oldMarkdown.value.trim().length > 0 && newMarkdown.value.trim().length > 0 && !isRunning.value,
)
const statsCards = computed(() => {
  if (!result.value) return []
  return [
    { key: 'insert', label: '新增', value: result.value.stats.inserts, filter: 'insert' as HighlightFilter },
    { key: 'delete', label: '删除', value: result.value.stats.deletes, filter: 'delete' as HighlightFilter },
    { key: 'replace', label: '替换', value: result.value.stats.replaces, filter: 'replace' as HighlightFilter },
    { key: 'move', label: '移动', value: result.value.stats.moves, filter: 'move' as HighlightFilter },
    { key: 'meta', label: '元数据', value: result.value.stats.metaUpdates, filter: 'meta' as HighlightFilter },
    { key: 'rename', label: '改名', value: result.value.stats.renames, filter: 'rename' as HighlightFilter },
    { key: 'warning', label: '警告', value: warningCount.value, filter: 'warning' as HighlightFilter },
  ]
})

onMounted(async () => {
  await executeDiff()
})

async function executeDiff(): Promise<void> {
  if (!canRun.value) return

  isRunning.value = true
  errorMessage.value = ''
  selectedChangeKey.value = null
  activeFilter.value = null

  try {
    result.value = await runMarkdownDiff(oldMarkdown.value, newMarkdown.value)
  } catch (error) {
    result.value = null
    errorMessage.value = error instanceof Error ? error.message : '比对失败'
  } finally {
    isRunning.value = false
  }
}

function buildEmptyLines(markdown: string): ProjectionLine[] {
  return markdown.split(/\r?\n/).map((text, index) => ({
    key: `empty:${index + 1}`,
    lineNumber: index + 1,
    text,
    baseTone: 'plain' as Tone,
    matchedTones: [],
    warnings: [],
  }))
}

function clearEditor(side: 'old' | 'new'): void {
  if (side === 'old') oldMarkdown.value = ''
  else newMarkdown.value = ''

  result.value = null
  selectedChangeKey.value = null
  errorMessage.value = ''
}

function selectLine(changeKey?: string): void {
  if (!changeKey) return
  selectedChangeKey.value = changeKey
}

function lineClassName(baseTone: Tone): string {
  return `tone-${baseTone}`
}
</script>

<template>
  <main class="app-shell">
    <header class="page-header">
      <div>
        <h1>Markdown Diff</h1>
        <p>parser → transformer → diff engine → projection</p>
      </div>
      <button type="button" class="secondary-button" @click="showDebug = !showDebug">
        {{ showDebug ? '关闭调试视图' : '调试视图' }}
      </button>
    </header>

    <section class="panel">
      <div class="panel-header">
        <h2>输入区</h2>
        <button type="button" :disabled="!canRun" @click="executeDiff">
          {{ isRunning ? '比对中...' : '运行比对' }}
        </button>
      </div>

      <div class="editor-grid">
        <div class="editor-pane">
          <div class="editor-toolbar">
            <label for="old-markdown">旧文档</label>
            <button type="button" class="secondary-button" @click="clearEditor('old')">清空</button>
          </div>
          <textarea id="old-markdown" v-model="oldMarkdown" spellcheck="false" />
        </div>

        <div class="editor-pane">
          <div class="editor-toolbar">
            <label for="new-markdown">新文档</label>
            <button type="button" class="secondary-button" @click="clearEditor('new')">清空</button>
          </div>
          <textarea id="new-markdown" v-model="newMarkdown" spellcheck="false" />
        </div>
      </div>

      <div v-if="isRunning" class="loading-state">
        <span class="spinner" aria-hidden="true"></span>
        <p class="hint">正在解析 Markdown、构建 Section 树并执行 diff。</p>
      </div>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </section>

    <section v-if="result" class="panel">
      <div class="panel-header">
        <h2>统计条</h2>
        <details class="legend">
          <summary>图例</summary>
          <ul>
            <li v-for="(label, tone) in toneLabels" :key="tone">
              {{ tone }} = {{ label }}
            </li>
          </ul>
        </details>
      </div>

      <div class="stats-grid">
        <button
          v-for="card in statsCards"
          :key="card.key"
          type="button"
          class="stat-card"
          @mouseenter="activeFilter = card.filter"
          @mouseleave="activeFilter = null"
        >
          <strong>{{ card.value }}</strong>
          <span>{{ card.label }}</span>
        </button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>源码投射</h2>
        <p>按新文档逐行投射变更，并在可行时展示 inline 级别高亮。</p>
      </div>

      <div class="projection-table" role="table" aria-label="源码投射">
        <div
          v-for="line in projectionLines"
          :key="line.key"
          class="projection-row"
          :class="[
            lineClassName(line.baseTone),
            { interactive: !!line.changeKey, active: lineMatchesFilter(line, activeFilter) },
          ]"
          role="row"
          @click="selectLine(line.changeKey)"
        >
          <div class="gutter" role="cell">
            <span class="line-number">{{ line.lineNumber }}</span>
            <span v-if="line.warnings.length" class="warning-flag" title="存在告警">⚠</span>
          </div>

          <div class="code-cell" role="cell">
            <template v-if="line.segments?.length">
              <span
                v-for="(segment, segmentIndex) in line.segments"
                :key="`${line.key}:segment:${segmentIndex}`"
                class="segment"
                :class="lineClassName(segment.tone)"
              >
                {{ segment.text }}
              </span>
            </template>
            <template v-else>{{ line.text || ' ' }}</template>
          </div>
        </div>
      </div>
    </section>

    <section v-if="detail" class="panel detail-panel">
      <div class="panel-header">
        <h2>Detail 面板</h2>
        <button type="button" class="secondary-button" @click="selectedChangeKey = null">关闭</button>
      </div>

      <article class="detail-card">
        <h3>{{ detail.heading }}</h3>
        <p>{{ detail.summary }}</p>

        <div v-if="detail.oldContent || detail.newContent" class="detail-columns">
          <div v-if="detail.oldContent">
            <h4>旧</h4>
            <pre>{{ detail.oldContent }}</pre>
          </div>
          <div v-if="detail.newContent">
            <h4>新</h4>
            <pre>{{ detail.newContent }}</pre>
          </div>
        </div>

        <div v-if="detail.inlineSegments?.length" class="detail-block">
          <h4>Inline 对比</h4>
          <p class="inline-preview">
            <span
              v-for="(segment, segmentIndex) in detail.inlineSegments"
              :key="`detail:inline:${segmentIndex}`"
              class="segment"
              :class="lineClassName(segment.tone)"
            >
              {{ segment.text }}
            </span>
          </p>
        </div>

        <div v-if="detail.codeLines?.length" class="detail-block">
          <h4>代码逐行对比</h4>
          <div v-for="line in detail.codeLines" :key="line.key" class="code-diff-row">
            <div class="code-diff-meta">{{ line.op }}</div>
            <div class="code-diff-content">
              <pre v-if="line.oldLine !== undefined">旧: {{ line.oldLine }}</pre>
              <pre v-if="line.newLine !== undefined">新: {{ line.newLine }}</pre>
              <p v-if="line.segments?.length" class="inline-preview">
                <span
                  v-for="(segment, segmentIndex) in line.segments"
                  :key="`${line.key}:segment:${segmentIndex}`"
                  class="segment"
                  :class="lineClassName(segment.tone)"
                >
                  {{ segment.text }}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div v-if="detail.tableCells?.length" class="detail-block">
          <h4>表格单元格差异</h4>
          <ul>
            <li v-for="cell in detail.tableCells" :key="cell.key">
              行 {{ cell.row }} / 列 {{ cell.column }}:
              <span
                v-for="(segment, segmentIndex) in cell.segments"
                :key="`${cell.key}:segment:${segmentIndex}`"
                class="segment"
                :class="lineClassName(segment.tone)"
              >
                {{ segment.text }}
              </span>
            </li>
          </ul>
        </div>

        <div v-if="detail.metadataChanges?.length" class="detail-block">
          <h4>元数据变更</h4>
          <ul>
            <li v-for="item in detail.metadataChanges" :key="item.path">
              {{ item.path }}: {{ item.oldValue ?? '∅' }} → {{ item.newValue ?? '∅' }}
            </li>
          </ul>
        </div>

        <div class="detail-meta">
          <p v-if="detail.pairing">配对: {{ detail.pairing }}</p>
          <p v-if="detail.evidence">证据: {{ detail.evidence }}</p>
          <p v-if="detail.score">相似度: {{ detail.score }}</p>
          <p v-if="detail.moveSummary">{{ detail.moveSummary }}</p>
          <p v-if="detail.warnings.length">告警: {{ detail.warnings.join(' / ') }}</p>
        </div>
      </article>
    </section>

    <section v-if="result && showDebug && debugSnapshot" class="panel">
      <div class="panel-header">
        <h2>调试视图</h2>
        <p>索引规模、匹配对和平铺后的 DiffChange 全量可查。</p>
      </div>

      <div class="debug-grid">
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

.page-header,
.panel-header,
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 16px;
}

.editor-grid,
.detail-columns,
.debug-grid {
  display: grid;
  gap: 16px;
}

.editor-grid,
.detail-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.debug-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.editor-pane textarea {
  width: 100%;
  min-height: 280px;
  resize: vertical;
  font-family: ui-monospace, monospace;
}

.stats-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.stat-card,
button {
  cursor: pointer;
}

.stat-card,
button,
.secondary-button {
  border: 1px solid #c4cbd3;
  border-radius: 6px;
  background: #fff;
  padding: 8px 12px;
}

.secondary-button {
  background: #f6f8fa;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.projection-table {
  border: 1px solid #d0d7de;
  border-radius: 6px;
  overflow: hidden;
  font-family: ui-monospace, monospace;
}

.projection-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  border-top: 1px solid #eef2f6;
}

.projection-row:first-child {
  border-top: 0;
}

.projection-row.interactive {
  cursor: pointer;
}

.projection-row.active {
  outline: 2px solid #1f2328;
  outline-offset: -2px;
}

.gutter,
.code-cell {
  padding: 6px 10px;
  white-space: pre-wrap;
}

.gutter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-right: 1px solid #eef2f6;
}

.warning-flag {
  color: #9a6700;
}

.detail-card pre,
.debug-grid pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
}

.detail-block {
  margin-top: 16px;
}

.detail-meta {
  margin-top: 16px;
}

.inline-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
}

.segment {
  white-space: pre-wrap;
}

.hint {
  color: #57606a;
}

.error-text {
  color: #cf222e;
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

.tone-plain {
  background: transparent;
}

.tone-insert {
  background: #def7e8;
}

.tone-delete {
  background: #ffe4ea;
}

.tone-replace {
  background: #fff0d8;
}

.tone-move {
  background: #e5edff;
}

.tone-meta {
  background: #f3e8ff;
}

.tone-rename {
  background: #fffde0;
}

@media (max-width: 960px) {
  .editor-grid,
  .detail-columns,
  .debug-grid {
    grid-template-columns: 1fr;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
