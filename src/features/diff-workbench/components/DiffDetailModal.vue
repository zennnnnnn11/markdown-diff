<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

import type { DetailPanelModel, Tone } from '../view-model'

const props = defineProps<{
  detail?: DetailPanelModel
}>()

const emit = defineEmits<{
  close: []
}>()

watch(
  () => props.detail,
  (detail) => {
    cleanupModalEffects()
    if (typeof document === 'undefined') return
    if (detail) {
      document.addEventListener('keydown', handleKeydown)
      document.body.style.overflow = 'hidden'
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  cleanupModalEffects()
})

function cleanupModalEffects(): void {
  if (typeof document === 'undefined') return
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

function lineClassName(baseTone: Tone): string {
  return `tone-${baseTone}`
}
</script>

<template>
  <Teleport to="body">
    <div v-if="detail" class="modal-backdrop" data-testid="detail-modal-backdrop" @click.self="emit('close')">
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
        <div class="modal-header">
          <h2 id="detail-modal-title">{{ detail.heading }}</h2>
          <button type="button" class="secondary-button" @click="emit('close')">关闭</button>
        </div>

        <p v-if="detail.pairKind" class="pair-info">
          配对方式：<strong>{{ detail.pairKind === 'match' ? '确认匹配（实线）' : '对齐匹配（虚线）' }}</strong>
          <template v-if="detail.matchKindLabel"> · 证据：<strong>{{ detail.matchKindLabel }}</strong></template>
          <template v-if="detail.score !== undefined"> · 相似度：<strong>{{ (detail.score * 100).toFixed(0) }}%</strong></template>
        </p>

        <p v-if="detail.moveInfo" class="move-info">
          <template v-if="detail.moveInfo.role === 'source'">
            已移出 →
            目标：第 {{ detail.moveInfo.peerLineNumber ?? '?' }} 行
            <template v-if="detail.moveInfo.peerHeading">（{{ detail.moveInfo.peerHeading }}）</template>
          </template>
          <template v-else>
            移入自
            <template v-if="detail.moveInfo.peerHeading">{{ detail.moveInfo.peerHeading }}</template>
          </template>
        </p>

        <div v-if="detail.oldTitle !== undefined && detail.newTitle !== undefined" class="title-compare">
          <div class="title-compare-row">
            <span class="title-compare-label">旧标题</span>
            <span class="title-compare-value old-title">{{ detail.oldTitle }}</span>
          </div>
          <div class="title-compare-row">
            <span class="title-compare-label">新标题</span>
            <span class="title-compare-value new-title">
              <template v-if="detail.newTitleSegments?.length">
                <span
                  v-for="(segment, segmentIndex) in detail.newTitleSegments"
                  :key="`title:segment:${segmentIndex}`"
                  class="segment"
                  :class="lineClassName(segment.tone)"
                >{{ segment.text }}</span>
              </template>
              <template v-else>{{ detail.newTitle }}</template>
            </span>
          </div>
        </div>

        <div class="detail-columns">
          <section class="content-card">
            <h3>旧</h3>
            <pre>{{ detail.oldContent ?? '无对应旧内容' }}</pre>
          </section>

          <section class="content-card">
            <h3>新</h3>

            <p v-if="detail.newInlineSegments?.length" class="inline-preview">
              <span
                v-for="(segment, segmentIndex) in detail.newInlineSegments"
                :key="`detail:new-inline:${segmentIndex}`"
                class="segment"
                :class="lineClassName(segment.tone)"
              >
                {{ segment.text }}
              </span>
            </p>

            <div v-else-if="detail.codeLines?.length" class="code-lines">
              <pre
                v-for="line in detail.codeLines"
                :key="line.key"
                class="code-line"
                :class="lineClassName(line.op === 'equal' ? 'plain' : detail.highlightTone)"
              >
<template v-if="line.segments?.length"><span
                  v-for="(segment, segmentIndex) in line.segments"
                  :key="`${line.key}:segment:${segmentIndex}`"
                  class="segment"
                  :class="lineClassName(segment.tone)"
                >{{ segment.text }}</span></template><template v-else>{{ line.newLine ?? '' }}</template></pre>
            </div>

            <div v-else-if="detail.newTableRows?.length" class="table-preview">
              <table>
                <tbody>
                  <tr v-for="row in detail.newTableRows" :key="row.key">
                    <td v-for="cell in row.cells" :key="cell.key" :class="lineClassName(cell.tone)">
                      <template v-if="cell.segments?.length">
                        <span
                          v-for="(segment, segmentIndex) in cell.segments"
                          :key="`${cell.key}:segment:${segmentIndex}`"
                          class="segment"
                          :class="lineClassName(segment.tone)"
                        >
                          {{ segment.text }}
                        </span>
                      </template>
                      <template v-else>{{ cell.text }}</template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else-if="detail.newHighlightedLines?.length" class="line-preview">
              <pre
                v-for="line in detail.newHighlightedLines"
                :key="line.key"
                class="detail-line"
                :class="lineClassName(line.tone)"
              ><template v-if="line.segments?.length"><span
                    v-for="(segment, segmentIndex) in line.segments"
                    :key="`${line.key}:segment:${segmentIndex}`"
                    class="segment"
                    :class="lineClassName(segment.tone)"
                  >{{ segment.text }}</span></template><template v-else>{{ line.text }}</template></pre>
            </div>

            <pre v-else :class="lineClassName(detail.highlightTone)">{{ detail.newContent ?? '无对应新内容' }}</pre>
          </section>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(15 23 42 / 45%);
  z-index: 1000;
}

.modal-card {
  width: min(960px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #d0d7de;
  box-shadow: 0 18px 40px rgb(15 23 42 / 18%);
  padding: 20px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.title-compare {
  border: 1px solid #fffde0;
  background: #fffef5;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.title-compare-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 6px 0;
}

.title-compare-row + .title-compare-row {
  border-top: 1px solid #f0ecd8;
}

.title-compare-label {
  min-width: 56px;
  color: #57606a;
  font-size: 13px;
  font-weight: 600;
}

.title-compare-value {
  font-family: ui-monospace, monospace;
  font-size: 14px;
  white-space: pre-wrap;
}

.title-compare-value.old-title {
  color: #cf222e;
  text-decoration: line-through;
}

.detail-columns {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.pair-info {
  margin: 0 0 4px 0;
  color: #57606a;
  font-size: 13px;
}

.move-info {
  margin: 0 0 8px 0;
  padding: 8px 12px;
  background: #e5edff;
  border-radius: 6px;
  font-size: 14px;
  color: #1f2328;
}

.content-card {
  border: 1px solid #d0d7de;
  border-radius: 10px;
  padding: 12px;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
}

.inline-preview {
  display: flex;
  flex-wrap: wrap;
}

.code-lines {
  display: grid;
  gap: 6px;
}

.line-preview {
  display: grid;
  gap: 6px;
}

.code-line {
  display: block;
  padding: 2px 4px;
  border-radius: 6px;
}

.detail-line {
  display: block;
  padding: 2px 4px;
  border-radius: 6px;
}

.table-preview {
  overflow-x: auto;
}

.table-preview table {
  width: 100%;
  border-collapse: collapse;
}

.table-preview td {
  border: 1px solid #d0d7de;
  padding: 8px;
  vertical-align: top;
}

.segment {
  white-space: pre-wrap;
}

.secondary-button {
  border: 1px solid #c4cbd3;
  border-radius: 6px;
  background: #f6f8fa;
  padding: 8px 12px;
  cursor: pointer;
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

@media (max-width: 960px) {
  .detail-columns {
    grid-template-columns: 1fr;
  }
}
</style>
