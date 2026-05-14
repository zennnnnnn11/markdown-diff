<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HighlightFilter, ProjectionLine, Tone } from '../view-model'
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
          </span>
        </div>

        <div class="code-cell" role="cell">
          <span class="line-text">{{ line.text || ' ' }}</span>
          <span v-if="line.changeKey" class="line-hint">点击查看具体变更</span>
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
  align-items: baseline;
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

.overlap-flag {
  color: #57606a;
  font-size: 12px;
}

.segment {
  white-space: pre-wrap;
}

.line-text {
  min-width: 0;
  flex: 1;
}

.line-hint {
  color: #57606a;
  font-size: 12px;
  white-space: nowrap;
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
