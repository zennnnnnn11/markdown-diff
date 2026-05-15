<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HighlightFilter, ProjectionAnnotation, ProjectionLine, ProjectionSegment, Tone } from '../view-model'
import { lineMatchesFilter } from '../view-model'

const scrollBody = ref<HTMLElement | null>(null)

defineExpose({ scrollBody })

const props = defineProps<{
  projectionLines: ProjectionLine[]
  activeFilter: HighlightFilter | null
  peerHighlightKey?: string
  side: 'old' | 'new'
}>()

const emit = defineEmits<{
  (e: 'select', changeKey: string | undefined, side: 'old' | 'new'): void
}>()

const label = computed(() => (props.side === 'old' ? '旧文档源码投射' : '新文档源码投射'))
const description = computed(() =>
  props.side === 'old'
    ? '按旧文档逐行投射变更，删除/移出/修改的行在此可见。'
    : '按新文档逐行投射变更，并在可行时展示 inline 级别高亮。',
)

function lineClassName(baseTone: Tone): string {
  return `tone-${baseTone}`
}

function rowId(line: ProjectionLine): string {
  return `${props.side}:${line.key}`
}

function annotationClass(annotation: ProjectionAnnotation): string {
  if (annotation.kind === 'warning') return 'annotation-warning'
  if (annotation.kind === 'overlap') return 'annotation-overlap'
  return annotation.tone ? `annotation-${annotation.tone}` : 'annotation-tone'
}

function segmentClass(segment: ProjectionSegment): string {
  return lineClassName(segment.tone)
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2>{{ label }}</h2>
      <p>{{ description }}</p>
    </div>

    <div ref="scrollBody" class="projection-table" role="table" :aria-label="label">
      <component
        :is="line.changeKey ? 'button' : 'div'"
        v-for="line in projectionLines"
        :id="rowId(line)"
        :key="line.key"
        :data-change-key="line.changeKey"
        :data-side="side"
        :title="line.changeTooltip"
        class="projection-row"
        :class="[
          lineClassName(line.baseTone),
          {
            interactive: !!line.changeKey,
            active: lineMatchesFilter(line, activeFilter),
            'pair-match': line.pairKind === 'match',
            'pair-align': line.pairKind === 'align',
            'peer-highlight': !!peerHighlightKey && line.changeKey === peerHighlightKey,
          },
        ]"
        :type="line.changeKey ? 'button' : undefined"
        role="row"
        @click="emit('select', line.changeKey, side)"
      >
        <div class="gutter" role="cell">
          <span class="line-number">{{ line.lineNumber }}</span>
          <span class="gutter-badges">
            <span v-if="line.hasDescendantChange && line.baseTone === 'plain'" class="descendant-flag" title="子内容有变更">▸</span>
            <span v-if="line.changeKeys.length > 1" class="overlap-flag" :title="`该行命中 ${line.changeKeys.length} 个变更`">
              +{{ line.changeKeys.length - 1 }}
            </span>
            <span v-if="line.warnings.length" class="warning-flag" title="存在告警">⚠</span>
            <span
              v-if="line.baseTone === 'move' && line.movePeerLineNumber"
              class="move-peer-flag"
              :title="side === 'old' ? `移动目标：第 ${line.movePeerLineNumber} 行` : `移动来源：第 ${line.movePeerLineNumber} 行`"
            >{{ line.movePeerLineNumber > line.lineNumber ? '↓' : '↑' }}{{ line.movePeerLineNumber }}</span>
          </span>
        </div>

        <div class="code-cell" role="cell">
          <span class="line-content">
            <template v-if="line.segments?.length">
              <span
                v-for="(segment, segmentIndex) in line.segments"
                :key="`${line.key}:segment:${segmentIndex}`"
                class="segment"
                :class="segmentClass(segment)"
              >{{ segment.text || ' ' }}</span>
            </template>
            <template v-else>{{ line.text || ' ' }}</template>
          </span>
          <span class="line-meta">
            <span
              v-for="(annotation, annotationIndex) in line.annotations"
              :key="`${line.key}:annotation:${annotationIndex}`"
              class="annotation-chip"
              :class="annotationClass(annotation)"
              :title="annotation.label"
            >
              {{ annotation.label }}
            </span>
            <span v-if="line.changeKey" class="line-hint">点击查看具体变更</span>
          </span>
        </div>
      </component>
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
}

.projection-table {
  border: 1px solid #d0d7de;
  border-radius: 6px;
  overflow-y: auto;
  max-height: 70vh;
  font-family: ui-monospace, monospace;
}

.projection-row {
  display: grid;
  width: 100%;
  grid-template-columns: 72px minmax(0, 1fr);
  border: 0;
  border-top: 1px solid #eef2f6;
  text-align: left;
  padding: 0;
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

.code-cell {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.gutter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-right: 1px solid #eef2f6;
}

.gutter-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

.descendant-flag {
  color: #656d76;
  font-size: 12px;
}

.warning-flag {
  color: #9a6700;
}

.move-peer-flag {
  color: #1f3f8f;
  font-size: 10px;
  font-weight: 600;
}

.overlap-flag {
  color: #57606a;
  font-size: 12px;
}

.segment {
  white-space: pre-wrap;
}

.line-content {
  min-width: 0;
  flex: 1;
}

.line-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

.line-hint {
  color: #57606a;
  font-size: 12px;
  white-space: nowrap;
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

.tone-reorder {
  background: #f0f4f8;
}

.projection-row.pair-match {
  border-left: 2px solid #1f2328;
}

.projection-row.pair-align {
  border-left: 2px dashed #8b949e;
}

.projection-row.peer-highlight {
  outline: 2px solid #0969da;
  outline-offset: -2px;
}
</style>
