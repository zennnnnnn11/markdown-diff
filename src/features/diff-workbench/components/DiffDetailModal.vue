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
            已移出到第 {{ detail.moveInfo.peerLineNumber ?? '?' }} 行
            <template v-if="detail.moveInfo.peerHeading">（{{ detail.moveInfo.peerHeading }}）</template>
          </template>
          <template v-else>
            移入自第 {{ detail.moveInfo.peerLineNumber ?? '?' }} 行
            <template v-if="detail.moveInfo.peerHeading">（{{ detail.moveInfo.peerHeading }}）</template>
          </template>
        </p>

        <p v-if="detail.backlinkInfo" class="backlink-info">
          <template v-if="detail.backlinkInfo.oldIdentifier && detail.backlinkInfo.newIdentifier && detail.backlinkInfo.oldIdentifier !== detail.backlinkInfo.newIdentifier">
            标识符 {{ detail.backlinkInfo.oldIdentifier }} → {{ detail.backlinkInfo.newIdentifier }}
          </template>
          <template v-if="detail.backlinkInfo.affectedLines.length > 0">
            · 引用位置：第
            <span v-for="(line, index) in detail.backlinkInfo.affectedLines" :key="line">
              <template v-if="index > 0">、</template>{{ line }}
            </span> 行
          </template>
          <template v-if="detail.backlinkInfo.affectedLines.length === 0">
            · 无引用
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

            <p v-if="detail.oldInlineSegments?.length" class="inline-preview">
              <span
                v-for="(segment, segmentIndex) in detail.oldInlineSegments"
                :key="`detail:old-inline:${segmentIndex}`"
                class="segment"
                :class="lineClassName(segment.tone)"
              >
                {{ segment.text }}
              </span>
            </p>

            <div v-else-if="detail.oldCodeLines?.length" class="code-lines">
              <pre
                v-for="line in detail.oldCodeLines"
                :key="line.key"
                class="code-line"
                :class="lineClassName(line.op === 'equal' ? 'plain' : 'delete')"
              >
<template v-if="line.segments?.length"><span
                  v-for="(segment, segmentIndex) in line.segments"
                  :key="`${line.key}:old-segment:${segmentIndex}`"
                  class="segment"
                  :class="lineClassName(segment.tone)"
                >{{ segment.text }}</span></template><template v-else>{{ line.oldLine ?? '' }}</template></pre>
            </div>

            <div v-else-if="detail.oldTableRows?.length" class="table-preview">
              <table>
                <tbody>
                  <tr v-for="row in detail.oldTableRows" :key="row.key">
                    <td v-for="cell in row.cells" :key="cell.key" :class="lineClassName(cell.tone)">
                      <template v-if="cell.segments?.length">
                        <span
                          v-for="(segment, segmentIndex) in cell.segments"
                          :key="`${cell.key}:old-segment:${segmentIndex}`"
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

            <div v-else-if="detail.oldHighlightedLines?.length" class="line-preview">
              <pre
                v-for="line in detail.oldHighlightedLines"
                :key="line.key"
                class="detail-line"
                :class="lineClassName(line.tone)"
              ><template v-if="line.segments?.length"><span
                    v-for="(segment, segmentIndex) in line.segments"
                    :key="`${line.key}:old-segment:${segmentIndex}`"
                    class="segment"
                    :class="lineClassName(segment.tone)"
                  >{{ segment.text }}</span></template><template v-else>{{ line.text }}</template></pre>
            </div>

            <pre v-else>{{ detail.oldContent ?? '无对应旧内容' }}</pre>
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

        <section v-if="detail.metadataChanges?.length" class="content-card metadata-card">
          <h3>元数据变更</h3>
          <table class="metadata-table">
            <thead>
              <tr>
                <th>路径</th>
                <th>操作</th>
                <th>旧值</th>
                <th>新值</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in detail.metadataChanges" :key="item.path">
                <td><code>{{ item.path }}</code></td>
                <td>{{ item.op }}</td>
                <td><pre>{{ item.oldValueText ?? '—' }}</pre></td>
                <td><pre>{{ item.newValueText ?? '—' }}</pre></td>
              </tr>
            </tbody>
          </table>
        </section>
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
  background: rgb(15 18 25 / 50%);
  z-index: 1000;
}

.modal-card {
  width: min(960px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  padding: 24px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.modal-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.pair-info {
  margin: 0 0 4px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.move-info {
  margin: 0 0 8px 0;
  padding: 8px 12px;
  background: var(--tone-move-bg);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text-primary);
  border: 1px solid var(--tone-move-border);
}

.backlink-info {
  margin: 0 0 8px 0;
  padding: 8px 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text-primary);
}

.title-compare {
  border: 1px solid var(--tone-rename-border);
  background: var(--tone-rename-bg);
  border-radius: var(--radius-md);
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
  border-top: 1px solid var(--border-subtle);
}

.title-compare-label {
  min-width: 56px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.title-compare-value {
  font-family: var(--font-mono);
  font-size: 14px;
  white-space: pre-wrap;
}

.title-compare-value.old-title {
  color: var(--tone-delete-text);
  text-decoration: line-through;
}

.detail-columns {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.content-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--bg-surface);
}

.content-card h3 {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin: 0 0 8px;
}

.metadata-card {
  margin-top: 16px;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: 13px;
}

.inline-preview {
  display: flex;
  flex-wrap: wrap;
}

.code-lines,
.line-preview {
  display: grid;
  gap: 6px;
}

.code-line,
.detail-line {
  display: block;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
}

.table-preview {
  overflow-x: auto;
}

.table-preview table {
  width: 100%;
  border-collapse: collapse;
}

.table-preview td {
  border: 1px solid var(--border);
  padding: 8px;
  vertical-align: top;
}

.metadata-table {
  width: 100%;
  border-collapse: collapse;
}

.metadata-table th,
.metadata-table td {
  border: 1px solid var(--border);
  padding: 8px;
  text-align: left;
  vertical-align: top;
  font-size: 13px;
}

.metadata-table th {
  background: var(--bg-subtle);
  font-weight: 600;
  color: var(--text-secondary);
}

.segment {
  white-space: pre-wrap;
}

.secondary-button {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms;
}

.secondary-button:hover {
  background: var(--bg-muted);
}

@media (max-width: 960px) {
  .detail-columns {
    grid-template-columns: 1fr;
  }
}
</style>
