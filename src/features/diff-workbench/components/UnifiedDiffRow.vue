<script setup lang="ts">
import type {
  MergedRow,
  ProjectionAnnotation,
  ProjectionLine,
  ProjectionSegment,
} from '../view-model'

const props = defineProps<{
  row: MergedRow
  rowIndex: number
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

function isPeerHighlight(line: ProjectionLine | null): boolean {
  return !!props.peerHighlightKey && !!line?.changeKey && line.changeKey === props.peerHighlightKey
}

function matchedTonesAttr(line: ProjectionLine | null): string | undefined {
  if (!line?.matchedTones.length) return undefined
  return line.matchedTones.join(' ')
}
</script>

<template>
  <div class="row-index" role="cell">{{ rowIndex + 1 }}</div>

  <!-- Old gutter -->
  <div
    class="gutter gutter-old"
    :class="{ interactive: !!props.row.oldLine?.changeKey }"
    role="cell"
    @click="onClick(props.row.oldLine ?? null, 'old')"
  >
    <template v-if="props.row.oldLine">
      <span class="line-number">{{ props.row.oldLine.lineNumber }}</span>
      <span class="gutter-badges">
        <span
          v-if="props.row.oldLine.hasDescendantChange && props.row.oldLine.baseTone === 'plain'"
          class="descendant-flag"
          title="子内容有变更"
          >▸</span
        >
        <span
          v-if="props.row.oldLine.changeKeys.length > 1"
          class="overlap-flag"
          :title="`旧侧命中 ${props.row.oldLine.changeKeys.length} 个变更`"
          >+{{ props.row.oldLine.changeKeys.length - 1 }}</span
        >
        <span v-if="props.row.oldLine.warnings.length" class="warning-flag" title="存在告警"
          >⚠</span
        >
        <span
          v-if="props.row.oldLine.baseTone === 'move' && props.row.oldLine.movePeerLineNumber"
          class="move-peer-flag"
          :title="`移动目标：第 ${props.row.oldLine.movePeerLineNumber} 行`"
          >{{ (props.row.oldLine.movePeerRowIndex ?? rowIndex) > rowIndex ? '↓' : '↑'
          }}{{ props.row.oldLine.movePeerLineNumber }}</span
        >
      </span>
    </template>
  </div>

  <!-- Old content -->
  <div
    class="cell cell-old"
    :class="[
      toneClass(props.row.oldLine ?? null),
      pairClass(props.row.oldLine ?? null),
      {
        interactive: !!props.row.oldLine?.changeKey,
        'peer-highlight': isPeerHighlight(props.row.oldLine ?? null),
      },
    ]"
    :data-change-key="props.row.oldLine?.changeKey"
    :data-base-tone="props.row.oldLine?.baseTone"
    :data-matched-tones="matchedTonesAttr(props.row.oldLine ?? null)"
    :data-has-warning="props.row.oldLine?.warnings?.length ? '' : undefined"
    :title="props.row.oldLine?.changeTooltip"
    data-side="old"
    role="cell"
    @click="onClick(props.row.oldLine ?? null, 'old')"
  >
    <template v-if="props.row.oldLine">
      <span class="line-text">
        <template v-if="props.row.oldLine.segments?.length">
          <span
            v-for="(segment, si) in props.row.oldLine.segments"
            :key="`${props.row.oldLine.key}:s:${si}`"
            class="segment"
            :class="segmentClass(segment)"
            >{{ segment.text || ' ' }}</span
          >
        </template>
        <template v-else>{{ props.row.oldLine.text || ' ' }}</template>
      </span>
      <span v-if="props.row.oldLine.annotations.length" class="cell-annotations">
        <span
          v-for="(ann, ai) in props.row.oldLine.annotations"
          :key="`${props.row.oldLine.key}:a:${ai}`"
          class="annotation-chip"
          :class="annotationClass(ann)"
          >{{ ann.label }}</span
        >
      </span>
    </template>
    <span v-else class="placeholder-text" aria-hidden="true">{{
      props.row.newLine?.text || ' '
    }}</span>
  </div>

  <div class="center-gap" aria-hidden="true"></div>

  <!-- New gutter -->
  <div
    class="gutter gutter-new"
    :class="{ interactive: !!props.row.newLine?.changeKey }"
    role="cell"
    @click="onClick(props.row.newLine ?? null, 'new')"
  >
    <template v-if="props.row.newLine">
      <span class="line-number">{{ props.row.newLine.lineNumber }}</span>
      <span class="gutter-badges">
        <span
          v-if="props.row.newLine.hasDescendantChange && props.row.newLine.baseTone === 'plain'"
          class="descendant-flag"
          title="子内容有变更"
          >▸</span
        >
        <span
          v-if="props.row.newLine.changeKeys.length > 1"
          class="overlap-flag"
          :title="`新侧命中 ${props.row.newLine.changeKeys.length} 个变更`"
          >+{{ props.row.newLine.changeKeys.length - 1 }}</span
        >
        <span v-if="props.row.newLine.warnings.length" class="warning-flag" title="存在告警"
          >⚠</span
        >
        <span
          v-if="props.row.newLine.baseTone === 'move' && props.row.newLine.movePeerLineNumber"
          class="move-peer-flag"
          :title="`移动来源：第 ${props.row.newLine.movePeerLineNumber} 行`"
          >{{ (props.row.newLine.movePeerRowIndex ?? rowIndex) > rowIndex ? '↓' : '↑'
          }}{{ props.row.newLine.movePeerLineNumber }}</span
        >
      </span>
    </template>
  </div>

  <!-- New content -->
  <div
    class="cell cell-new"
    :class="[
      toneClass(props.row.newLine ?? null),
      pairClass(props.row.newLine ?? null),
      {
        interactive: !!props.row.newLine?.changeKey,
        'peer-highlight': isPeerHighlight(props.row.newLine ?? null),
      },
    ]"
    :data-change-key="props.row.newLine?.changeKey"
    :data-base-tone="props.row.newLine?.baseTone"
    :data-matched-tones="matchedTonesAttr(props.row.newLine ?? null)"
    :data-has-warning="props.row.newLine?.warnings?.length ? '' : undefined"
    :title="props.row.newLine?.changeTooltip"
    data-side="new"
    role="cell"
    @click="onClick(props.row.newLine ?? null, 'new')"
  >
    <template v-if="props.row.newLine">
      <span class="line-text">
        <template v-if="props.row.newLine.segments?.length">
          <span
            v-for="(segment, si) in props.row.newLine.segments"
            :key="`${props.row.newLine.key}:s:${si}`"
            class="segment"
            :class="segmentClass(segment)"
            >{{ segment.text || ' ' }}</span
          >
        </template>
        <template v-else>{{ props.row.newLine.text || ' ' }}</template>
      </span>
      <span v-if="props.row.newLine.annotations.length" class="cell-annotations">
        <span
          v-for="(ann, ai) in props.row.newLine.annotations"
          :key="`${props.row.newLine.key}:a:${ai}`"
          class="annotation-chip"
          :class="annotationClass(ann)"
          >{{ ann.label }}</span
        >
      </span>
    </template>
    <span v-else class="placeholder-text" aria-hidden="true">{{
      props.row.oldLine?.text || ' '
    }}</span>
  </div>
</template>
