<script setup lang="ts">
import { computed, ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { HighlightFilter, ProjectionAnnotation, ProjectionLine, ProjectionSegment, Tone } from '../view-model'
import { lineMatchesFilter } from '../view-model'

const scrollBody = ref<HTMLElement | null>(null)

const props = defineProps<{
  projectionLines: ProjectionLine[]
  activeFilter: HighlightFilter | null
  peerHighlightKey?: string
  side: 'old' | 'new'
}>()

const rowVirtualizer = useVirtualizer(computed(() => ({
  count: props.projectionLines.length,
  getScrollElement: () => scrollBody.value,
  estimateSize: () => 28,
  overscan: 20,
})))

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

defineExpose({ scrollBody, scrollToIndex: (index: number) => rowVirtualizer.value.scrollToIndex(index, { align: 'center' }) })

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
      <div :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
        <component
          :is="projectionLines[vRow.index]?.changeKey ? 'button' : 'div'"
          v-for="vRow in virtualRows"
          :key="projectionLines[vRow.index]?.key ?? vRow.index"
          :ref="(el: any) => { const node = el?.$el ?? el; if (node?.getBoundingClientRect?.().height) rowVirtualizer.measureElement(node) }"
          :data-index="vRow.index"
          :id="projectionLines[vRow.index] ? rowId(projectionLines[vRow.index]!) : undefined"
          :data-change-key="projectionLines[vRow.index]?.changeKey"
          :data-side="side"
          :title="projectionLines[vRow.index]?.changeTooltip"
          class="projection-row"
          :class="[
            lineClassName(projectionLines[vRow.index]?.baseTone ?? 'plain'),
            {
              interactive: !!projectionLines[vRow.index]?.changeKey,
              active: lineMatchesFilter(projectionLines[vRow.index]!, activeFilter),
              'pair-match': projectionLines[vRow.index]?.pairKind === 'match',
              'pair-align': projectionLines[vRow.index]?.pairKind === 'align',
              'peer-highlight': !!peerHighlightKey && projectionLines[vRow.index]?.changeKey === peerHighlightKey,
            },
          ]"
          :type="projectionLines[vRow.index]?.changeKey ? 'button' : undefined"
          role="row"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${vRow.start}px)`,
          }"
          @click="emit('select', projectionLines[vRow.index]?.changeKey, side)"
        >
          <div class="gutter" role="cell">
            <span class="line-number">{{ projectionLines[vRow.index]?.lineNumber }}</span>
            <span class="gutter-badges">
              <span v-if="projectionLines[vRow.index]?.hasDescendantChange && projectionLines[vRow.index]?.baseTone === 'plain'" class="descendant-flag" title="子内容有变更">▸</span>
              <span v-if="(projectionLines[vRow.index]?.changeKeys.length ?? 0) > 1" class="overlap-flag" :title="`该行命中 ${projectionLines[vRow.index]?.changeKeys.length} 个变更`">
                +{{ (projectionLines[vRow.index]?.changeKeys.length ?? 1) - 1 }}
              </span>
              <span v-if="projectionLines[vRow.index]?.warnings.length" class="warning-flag" title="存在告警">⚠</span>
              <span
                v-if="projectionLines[vRow.index]?.baseTone === 'move' && projectionLines[vRow.index]?.movePeerLineNumber"
                class="move-peer-flag"
                :title="side === 'old' ? `移动目标：第 ${projectionLines[vRow.index]?.movePeerLineNumber} 行` : `移动来源：第 ${projectionLines[vRow.index]?.movePeerLineNumber} 行`"
              >{{ (projectionLines[vRow.index]?.movePeerLineNumber ?? 0) > (projectionLines[vRow.index]?.lineNumber ?? 0) ? '↓' : '↑' }}{{ projectionLines[vRow.index]?.movePeerLineNumber }}</span>
            </span>
          </div>

          <div class="code-cell" role="cell">
            <span class="line-content">
              <template v-if="projectionLines[vRow.index]?.segments?.length">
                <span
                  v-for="(segment, segmentIndex) in projectionLines[vRow.index]!.segments"
                  :key="`${projectionLines[vRow.index]!.key}:segment:${segmentIndex}`"
                  class="segment"
                  :class="segmentClass(segment)"
                >{{ segment.text || ' ' }}</span>
              </template>
              <template v-else>{{ projectionLines[vRow.index]?.text || ' ' }}</template>
            </span>
            <span class="line-meta">
              <span
                v-for="(annotation, annotationIndex) in projectionLines[vRow.index]?.annotations"
                :key="`${projectionLines[vRow.index]!.key}:annotation:${annotationIndex}`"
                class="annotation-chip"
                :class="annotationClass(annotation)"
                :title="annotation.label"
              >
                {{ annotation.label }}
              </span>
              <span v-if="projectionLines[vRow.index]?.changeKey" class="line-hint">点击查看具体变更</span>
            </span>
          </div>
        </component>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  box-shadow: var(--glass-shadow);
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
  letter-spacing: var(--letter-spacing-wide);
}

.panel-header p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.projection-table {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow-y: auto;
  max-height: 70vh;
  font-family: var(--font-mono);
  font-size: 13px;
}

.projection-row {
  display: grid;
  width: 100%;
  grid-template-columns: 72px minmax(0, 1fr);
  border: 0;
  border-top: 1px solid var(--border-subtle);
  text-align: left;
  padding: 0;
  box-sizing: border-box;
}

.projection-row.interactive {
  cursor: pointer;
  transition: filter var(--transition-fast);
}

.projection-row.interactive:hover {
  filter: brightness(0.97);
}

.projection-row.active {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.projection-row.pair-match {
  border-left: 2px solid var(--text-primary);
}

.projection-row.pair-align {
  border-left: 2px dashed var(--text-muted);
}

.projection-row.peer-highlight {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  opacity: 0.85;
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
  border-right: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 11px;
  user-select: none;
}

.gutter-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

.descendant-flag {
  color: var(--text-muted);
  font-size: 12px;
}

.warning-flag {
  color: var(--warning-text);
}

.move-peer-flag {
  color: var(--tone-move-text);
  font-size: 10px;
  font-weight: 600;
}

.overlap-flag {
  color: var(--text-secondary);
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
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}
</style>
