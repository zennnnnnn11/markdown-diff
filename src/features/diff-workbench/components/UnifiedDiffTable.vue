<script setup lang="ts">
import type { HighlightFilter, MergedRow, ProjectionLine, Tone } from '../view-model'
import { lineMatchesFilter } from '../view-model'

defineProps<{
  mergedRows: MergedRow[]
  activeFilter: HighlightFilter | null
  peerHighlightKey?: string
}>()

const emit = defineEmits<{
  (e: 'select', changeKey: string | undefined, side: 'old' | 'new'): void
}>()

function toneClass(line: ProjectionLine | null): string {
  return line ? `tone-${line.baseTone}` : 'tone-blank'
}

function pairClass(line: ProjectionLine | null): string | undefined {
  if (!line?.pairKind) return undefined
  return line.pairKind === 'match' ? 'pair-match' : 'pair-align'
}

function peerClass(line: ProjectionLine | null, peerHighlightKey?: string): boolean {
  return !!(peerHighlightKey && line?.changeKey === peerHighlightKey)
}

function filterClass(line: ProjectionLine | null, activeFilter: HighlightFilter | null): boolean {
  return !!(activeFilter && line && lineMatchesFilter(line, activeFilter))
}

function isInteractive(line: ProjectionLine | null): boolean {
  return !!line?.changeKey
}

function onClick(line: ProjectionLine | null, side: 'old' | 'new'): void {
  if (line?.changeKey) emit('select', line.changeKey, side)
}

function gutterTone(line: ProjectionLine | null): string {
  if (!line) return ''
  if (line.hasDescendantChange && line.baseTone === 'plain') return 'descendant-flag'
  return ''
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2>统一对比视图</h2>
      <p>旧文档（左）· 新文档（右）——完全对齐滚动</p>
    </div>

    <div class="unified-table" role="table" aria-label="统一对比视图">
      <div
        v-for="(row, index) in mergedRows"
        :key="index"
        class="unified-row"
      >
        <!-- Old gutter -->
        <div
          class="gutter gutter-old"
          :class="{ interactive: isInteractive(row.oldLine) }"
          role="cell"
          @click="onClick(row.oldLine, 'old')"
        >
          <template v-if="row.oldLine">
            <span class="line-number">{{ row.oldLine.lineNumber }}</span>
            <span class="gutter-badges">
              <span v-if="row.oldLine.hasDescendantChange && row.oldLine.baseTone === 'plain'" class="descendant-flag" title="子内容有变更">▸</span>
              <span v-if="row.oldLine.changeKeys.length > 1" class="overlap-flag" :title="`旧侧命中 ${row.oldLine.changeKeys.length} 个变更`">+{{ row.oldLine.changeKeys.length - 1 }}</span>
              <span v-if="row.oldLine.warnings.length" class="warning-flag" title="存在告警">⚠</span>
            </span>
          </template>
        </div>

        <!-- Old content -->
        <div
          class="cell cell-old"
          :class="[
            toneClass(row.oldLine),
            pairClass(row.oldLine),
            {
              active: filterClass(row.oldLine, activeFilter),
              'peer-highlight': peerClass(row.oldLine, peerHighlightKey),
              interactive: isInteractive(row.oldLine),
            },
          ]"
          role="cell"
          @click="onClick(row.oldLine, 'old')"
        >
          <template v-if="row.oldLine">
            <span class="line-text">{{ row.oldLine.text || ' ' }}</span>
          </template>
          <span v-else class="placeholder-text" aria-hidden="true">{{ row.newLine?.text || ' ' }}</span>
        </div>

        <!-- New gutter -->
        <div
          class="gutter gutter-new"
          :class="{ interactive: isInteractive(row.newLine) }"
          role="cell"
          @click="onClick(row.newLine, 'new')"
        >
          <template v-if="row.newLine">
            <span class="line-number">{{ row.newLine.lineNumber }}</span>
            <span class="gutter-badges">
              <span v-if="row.newLine.hasDescendantChange && row.newLine.baseTone === 'plain'" class="descendant-flag" title="子内容有变更">▸</span>
              <span v-if="row.newLine.changeKeys.length > 1" class="overlap-flag" :title="`新侧命中 ${row.newLine.changeKeys.length} 个变更`">+{{ row.newLine.changeKeys.length - 1 }}</span>
              <span v-if="row.newLine.warnings.length" class="warning-flag" title="存在告警">⚠</span>
            </span>
          </template>
        </div>

        <!-- New content -->
        <div
          class="cell cell-new"
          :class="[
            toneClass(row.newLine),
            pairClass(row.newLine),
            {
              active: filterClass(row.newLine, activeFilter),
              'peer-highlight': peerClass(row.newLine, peerHighlightKey),
              interactive: isInteractive(row.newLine),
            },
          ]"
          role="cell"
          @click="onClick(row.newLine, 'new')"
        >
          <template v-if="row.newLine">
            <span class="line-text">{{ row.newLine.text || ' ' }}</span>
          </template>
          <span v-else class="placeholder-text" aria-hidden="true">{{ row.oldLine?.text || ' ' }}</span>
        </div>
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
  margin-bottom: 8px;
}

.unified-table {
  border: 1px solid #d0d7de;
  border-radius: 6px;
  overflow-y: auto;
  max-height: 70vh;
  font-family: ui-monospace, monospace;
}

.unified-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 64px minmax(0, 1fr);
  border-top: 1px solid #eef2f6;
  min-height: 28px;
}

.unified-row:first-child {
  border-top: 0;
}

/* Gutters */
.gutter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 4px 8px;
  font-size: 12px;
  color: #656d76;
  user-select: none;
}

.gutter-old {
  border-right: 1px solid #eef2f6;
}

.gutter-new {
  border-left: 1px solid #d0d7de;
}

.gutter.interactive {
  cursor: pointer;
}

.gutter-badges {
  display: flex;
  align-items: center;
  gap: 4px;
}

.line-number {
  min-width: 24px;
  text-align: right;
}

.descendant-flag {
  color: #656d76;
  font-size: 11px;
}

.overlap-flag {
  color: #57606a;
  font-size: 10px;
}

.warning-flag {
  color: #9a6700;
  font-size: 12px;
}

/* Cells */
.cell {
  padding: 4px 10px;
  white-space: pre-wrap;
  word-break: break-word;
  display: flex;
  align-items: baseline;
}

.cell-old {
  border-right: 1px solid #eef2f6;
}

.cell.interactive {
  cursor: pointer;
}

.cell.active {
  outline: 2px solid #1f2328;
  outline-offset: -2px;
}

.cell.peer-highlight {
  outline: 2px solid #0969da;
  outline-offset: -2px;
}

/* Pair borders */
.cell.pair-match {
  border-left: 2px solid #1f2328;
}

.cell.pair-align {
  border-left: 2px dashed #8b949e;
}

/* Tone backgrounds */
.tone-plain { background: transparent; }
.tone-insert { background: #def7e8; }
.tone-delete { background: #ffe4ea; }
.tone-replace { background: #fff0d8; }
.tone-move { background: #e5edff; }
.tone-meta { background: #f3e8ff; }
.tone-rename { background: #fffde0; }
.tone-reorder { background: #f0f4f8; }
.tone-blank { background: #f6f8fa; }

/* Placeholder for height matching */
.placeholder-text {
  visibility: hidden;
}

.line-text {
  min-width: 0;
}

@media (max-width: 960px) {
  .unified-row {
    grid-template-columns: 48px minmax(0, 1fr) 48px minmax(0, 1fr);
  }
}
</style>
