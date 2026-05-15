<script setup lang="ts">
import { ref } from 'vue'
import type {
  HighlightFilter,
  MergedRow,
  ProjectionAnnotation,
  ProjectionLine,
  ProjectionSegment,
  Tone,
} from '../view-model'
import { lineMatchesFilter } from '../view-model'

const scrollBody = ref<HTMLElement | null>(null)

defineExpose({ scrollBody })

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

function annotationClass(annotation: ProjectionAnnotation): string {
  if (annotation.kind === 'warning') return 'annotation-warning'
  if (annotation.kind === 'overlap') return 'annotation-overlap'
  return annotation.tone ? `annotation-${annotation.tone}` : 'annotation-tone'
}

function segmentClass(segment: ProjectionSegment): string {
  return `tone-${segment.tone}`
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2>左右对齐视图</h2>
      <p>旧文档和新文档按同一行号并排呈现，缺失侧保留灰度空白。</p>
    </div>

    <div ref="scrollBody" class="unified-table" role="table" aria-label="左右对齐视图">
      <div class="unified-header-row" role="row">
        <div class="row-index row-index-header" role="columnheader">行</div>
        <div class="side-heading side-heading-old" role="columnheader">旧文档</div>
        <div class="center-gap center-gap-header" aria-hidden="true"></div>
        <div class="side-heading side-heading-new" role="columnheader">新文档</div>
      </div>
      <div
        v-for="(row, index) in mergedRows"
        :key="row.key"
        class="unified-row"
      >
        <div class="row-index" role="cell">{{ index + 1 }}</div>

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
              <span
                v-if="row.oldLine.baseTone === 'move' && row.oldLine.movePeerLineNumber"
                class="move-peer-flag"
                :title="`移动目标：第 ${row.oldLine.movePeerLineNumber} 行`"
              >{{ (row.oldLine.movePeerRowIndex ?? index) > index ? '↓' : '↑' }}{{ row.oldLine.movePeerLineNumber }}</span>
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
          :data-change-key="row.oldLine?.changeKey"
          :title="row.oldLine?.changeTooltip"
          data-side="old"
          role="cell"
          @click="onClick(row.oldLine, 'old')"
        >
          <template v-if="row.oldLine">
            <span class="line-text">
              <template v-if="row.oldLine.segments?.length">
                <span
                  v-for="(segment, segmentIndex) in row.oldLine.segments"
                  :key="`${row.oldLine.key}:segment:${segmentIndex}`"
                  class="segment"
                  :class="segmentClass(segment)"
                >{{ segment.text || ' ' }}</span>
              </template>
              <template v-else>{{ row.oldLine.text || ' ' }}</template>
            </span>
            <span v-if="row.oldLine.annotations.length" class="cell-annotations">
              <span
                v-for="(annotation, annotationIndex) in row.oldLine.annotations"
                :key="`${row.oldLine.key}:annotation:${annotationIndex}`"
                class="annotation-chip"
                :class="annotationClass(annotation)"
              >
                {{ annotation.label }}
              </span>
            </span>
          </template>
          <span v-else class="placeholder-text" aria-hidden="true">{{ row.newLine?.text || ' ' }}</span>
        </div>

        <div class="center-gap" aria-hidden="true"></div>

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
              <span
                v-if="row.newLine.baseTone === 'move' && row.newLine.movePeerLineNumber"
                class="move-peer-flag"
                :title="`移动来源：第 ${row.newLine.movePeerLineNumber} 行`"
              >{{ (row.newLine.movePeerRowIndex ?? index) > index ? '↓' : '↑' }}{{ row.newLine.movePeerLineNumber }}</span>
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
          :data-change-key="row.newLine?.changeKey"
          :title="row.newLine?.changeTooltip"
          data-side="new"
          role="cell"
          @click="onClick(row.newLine, 'new')"
        >
          <template v-if="row.newLine">
            <span class="line-text">
              <template v-if="row.newLine.segments?.length">
                <span
                  v-for="(segment, segmentIndex) in row.newLine.segments"
                  :key="`${row.newLine.key}:segment:${segmentIndex}`"
                  class="segment"
                  :class="segmentClass(segment)"
                >{{ segment.text || ' ' }}</span>
              </template>
              <template v-else>{{ row.newLine.text || ' ' }}</template>
            </span>
            <span v-if="row.newLine.annotations.length" class="cell-annotations">
              <span
                v-for="(annotation, annotationIndex) in row.newLine.annotations"
                :key="`${row.newLine.key}:annotation:${annotationIndex}`"
                class="annotation-chip"
                :class="annotationClass(annotation)"
              >
                {{ annotation.label }}
              </span>
            </span>
          </template>
          <span v-else class="placeholder-text" aria-hidden="true">{{ row.oldLine?.text || ' ' }}</span>
        </div>
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
  margin-bottom: 8px;
}

.panel-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.unified-table {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow-y: auto;
  max-height: 70vh;
  font-family: var(--font-mono);
  font-size: 13px;
}

.unified-header-row,
.unified-row {
  display: grid;
  grid-template-columns: 52px 64px minmax(0, 1fr) 20px 64px minmax(0, 1fr);
}

.unified-header-row {
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.unified-header-row > * {
  padding: 7px 10px;
}

.side-heading-old {
  grid-column: 2 / 4;
  border-right: 1px solid var(--border-subtle);
}

.side-heading-new {
  grid-column: 5 / 7;
}

.row-index {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 8px;
  border-right: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--text-muted);
  font-size: 11px;
  user-select: none;
}

.row-index-header {
  justify-content: center;
}

.center-gap {
  background:
    linear-gradient(90deg, var(--border-subtle) 0 1px, transparent 1px),
    linear-gradient(90deg, transparent calc(100% - 1px), var(--border) calc(100% - 1px));
}

.center-gap-header {
  padding: 0;
}

.unified-row {
  border-top: 1px solid var(--border-subtle);
  min-height: 28px;
}

.unified-row:first-child {
  border-top: 0;
}

.gutter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-muted);
  user-select: none;
}

.gutter-old {
  border-right: 1px solid var(--border-subtle);
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
  color: var(--text-muted);
  font-size: 11px;
}

.overlap-flag {
  color: var(--text-secondary);
  font-size: 10px;
}

.warning-flag {
  color: var(--warning-text);
  font-size: 12px;
}

.move-peer-flag {
  color: var(--tone-move-text);
  font-size: 10px;
  font-weight: 600;
}

.cell {
  padding: 4px 10px;
  white-space: pre-wrap;
  word-break: break-word;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.cell-old {
  border-right: 1px solid var(--border-subtle);
}

.cell.interactive {
  cursor: pointer;
}

.cell.active {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.cell.peer-highlight {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  opacity: 0.85;
}

.cell.pair-match {
  border-left: 2px solid var(--text-primary);
}

.cell.pair-align {
  border-left: 2px dashed var(--text-muted);
}

.placeholder-text {
  visibility: hidden;
}

.line-text {
  min-width: 0;
  flex: 1;
}

.segment {
  white-space: pre-wrap;
}

.cell-annotations {
  display: inline-flex;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

@media (max-width: 960px) {
  .unified-header-row,
  .unified-row {
    grid-template-columns: 44px 48px minmax(0, 1fr) 12px 48px minmax(0, 1fr);
  }
}
</style>
