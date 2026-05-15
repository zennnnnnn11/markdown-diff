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
        :key="index"
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

.unified-header-row,
.unified-row {
  display: grid;
  grid-template-columns: 52px 64px minmax(0, 1fr) 20px 64px minmax(0, 1fr);
}

.unified-header-row {
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid #d0d7de;
  background: #f6f8fa;
  color: #57606a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.unified-header-row > * {
  padding: 7px 10px;
}

.side-heading-old {
  grid-column: 2 / 4;
  border-right: 1px solid #eef2f6;
}

.side-heading-new {
  grid-column: 5 / 7;
}

.row-index {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 8px;
  border-right: 1px solid #d0d7de;
  background: #f6f8fa;
  color: #656d76;
  font-size: 12px;
  user-select: none;
}

.row-index-header {
  justify-content: center;
}

.center-gap {
  background:
    linear-gradient(90deg, #eef2f6 0 1px, transparent 1px),
    linear-gradient(90deg, transparent calc(100% - 1px), #d0d7de calc(100% - 1px));
}

.center-gap-header {
  padding: 0;
}

.unified-row {
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
  border-left: 0;
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
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

.annotation-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid #c4cbd3;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
  background: #fff;
}

.annotation-insert {
  border-color: #6fba82;
  color: #0f5132;
}

.annotation-delete {
  border-color: #e58ca1;
  color: #842029;
}

.annotation-replace {
  border-color: #d8a354;
  color: #7c4d12;
}

.annotation-move,
.annotation-reorder {
  border-color: #90a8e7;
  color: #1f3f8f;
}

.annotation-meta,
.annotation-rename {
  border-color: #b7a0e5;
  color: #5a3e9c;
}

.annotation-warning {
  border-color: #d0a44d;
  background: #fffcf0;
  color: #9a6700;
}

.annotation-overlap {
  border-color: #c4cbd3;
  background: #f6f8fa;
  color: #57606a;
}

@media (max-width: 960px) {
  .unified-header-row,
  .unified-row {
    grid-template-columns: 44px 48px minmax(0, 1fr) 12px 48px minmax(0, 1fr);
  }
}
</style>
