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
    <transition name="modal-fade">
      <div v-if="detail" class="modal-backdrop" data-testid="detail-modal-backdrop" @click.self="emit('close')">
        <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
        <!-- Decoration light effects (Vercel style gradients) -->
        <div class="glow-effect glow-top-left"></div>
        <div class="glow-effect glow-bottom-right"></div>

        <div class="modal-header">
          <div class="title-area">
            <h2 id="detail-modal-title">{{ detail.heading }}</h2>
          </div>
          <button type="button" class="close-button" @click="emit('close')" aria-label="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="badges-row" v-if="detail.pairKind || detail.matchKindLabel || detail.score !== undefined">
          <span v-if="detail.pairKind" class="badge" :class="detail.pairKind === 'match' ? 'badge-success' : 'badge-warning'">
            <span class="dot-indicator"></span>
            {{ detail.pairKind === 'match' ? '确认匹配（实线）' : '对齐匹配（虚线）' }}
          </span>
          <span v-if="detail.matchKindLabel" class="badge badge-info">
            证据: {{ detail.matchKindLabel }}
          </span>
          <span v-if="detail.score !== undefined" class="badge badge-score">
            相似度: {{ (detail.score * 100).toFixed(0) }}%
          </span>
        </div>

        <p v-if="detail.moveInfo" class="move-info">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-.7-2.7-1.4-4.5C14.3 4.7 13.5 4 12.5 4H9c-.6 0-1 .4-1 1v3"></path>
            <polyline points="4 9 14 9 14 18 4 18"></polyline>
            <path d="M4 9c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V9z"></path>
          </svg>
          <template v-if="detail.moveInfo.role === 'source'">
            已移出到第 <strong class="line-number-ref">{{ detail.moveInfo.peerLineNumber ?? '?' }}</strong> 行
            <template v-if="detail.moveInfo.peerHeading">
              <span class="peer-heading">（{{ detail.moveInfo.peerHeading }}）</span>
            </template>
          </template>
          <template v-else>
            移入自第 <strong class="line-number-ref">{{ detail.moveInfo.peerLineNumber ?? '?' }}</strong> 行
            <template v-if="detail.moveInfo.peerHeading">
              <span class="peer-heading">（{{ detail.moveInfo.peerHeading }}）</span>
            </template>
          </template>
        </p>

        <p v-if="detail.backlinkInfo" class="backlink-info">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          <template v-if="detail.backlinkInfo.oldIdentifier && detail.backlinkInfo.newIdentifier && detail.backlinkInfo.oldIdentifier !== detail.backlinkInfo.newIdentifier">
            标识符变更：<code>{{ detail.backlinkInfo.oldIdentifier }}</code> → <code>{{ detail.backlinkInfo.newIdentifier }}</code>
          </template>
          <template v-if="detail.backlinkInfo.affectedLines.length > 0">
            <span class="separator-dot">·</span> 引用位置：第
            <span class="affected-lines">
              <span v-for="(line, index) in detail.backlinkInfo.affectedLines" :key="line" class="affected-line-tag">
                <template v-if="index > 0">、</template>{{ line }}
              </span>
            </span> 行
          </template>
          <template v-if="detail.backlinkInfo.affectedLines.length === 0">
            <span class="separator-dot">·</span> 无引用
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
          <section class="content-card terminal-style">
            <div class="card-top-bar">
              <div class="terminal-dots">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
              </div>
              <span class="panel-label">旧内容</span>
            </div>

            <div class="code-container">
              <p v-if="detail.oldInlineSegments?.length" class="inline-preview">
                <span
                  v-for="(segment, segmentIndex) in detail.oldInlineSegments"
                  :key="`detail:old-inline:${segmentIndex}`"
                  class="segment"
                  :class="lineClassName(segment.tone)"
                >{{ segment.text }}</span>
              </p>

              <div v-else-if="detail.oldCodeLines?.length" class="code-lines">
                <pre
                  v-for="line in detail.oldCodeLines"
                  :key="line.key"
                  class="code-line"
                  :class="lineClassName(line.op === 'equal' ? 'plain' : 'delete')"
                ><template v-if="line.segments?.length"><span
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
                          >{{ segment.text }}</span>
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

              <pre v-else class="fallback-pre">{{ detail.oldContent ?? '无对应旧内容' }}</pre>
            </div>
          </section>

          <section class="content-card terminal-style">
            <div class="card-top-bar">
              <div class="terminal-dots">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
              </div>
              <span class="panel-label">新内容</span>
            </div>

            <div class="code-container">
              <p v-if="detail.newInlineSegments?.length" class="inline-preview">
                <span
                  v-for="(segment, segmentIndex) in detail.newInlineSegments"
                  :key="`detail:new-inline:${segmentIndex}`"
                  class="segment"
                  :class="lineClassName(segment.tone)"
                >{{ segment.text }}</span>
              </p>

              <div v-else-if="detail.codeLines?.length" class="code-lines">
                <pre
                  v-for="line in detail.codeLines"
                  :key="line.key"
                  class="code-line"
                  :class="lineClassName(line.op === 'equal' ? 'plain' : detail.highlightTone)"
                ><template v-if="line.segments?.length"><span
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
                          >{{ segment.text }}</span>
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

              <pre v-else :class="[lineClassName(detail.highlightTone), 'fallback-pre']">{{ detail.newContent ?? '无对应新内容' }}</pre>
            </div>
          </section>
        </div>

        <section v-if="detail.metadataChanges?.length" class="content-card metadata-card">
          <div class="card-top-bar">
            <span class="panel-label">元数据变更</span>
          </div>
          <div class="table-container">
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
                  <td>
                    <span class="op-badge" :class="`op-${item.op.toLowerCase()}`">{{ item.op }}</span>
                  </td>
                  <td><pre>{{ item.oldValueText ?? '—' }}</pre></td>
                  <td><pre>{{ item.newValueText ?? '—' }}</pre></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 40px 24px;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(20px) saturate(190%);
  -webkit-backdrop-filter: blur(20px) saturate(190%);
  z-index: 9999;
  overflow-y: auto;
}

.dark .modal-backdrop {
  background: rgba(0, 0, 0, 0.65);
}

.modal-card {
  width: min(960px, 100%);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--border);
  padding: 32px;
  box-shadow: 
    0 30px 60px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  overflow: hidden;
}

.dark .modal-card {
  background: rgba(10, 10, 10, 0.85);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 
    0 30px 60px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

/* Background glowing accent dots for high-end feel */
.glow-effect {
  position: absolute;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  filter: blur(40px);
  pointer-events: none;
  display: none;
  z-index: 0;
}

.dark .glow-effect {
  display: block;
  opacity: 0.12;
}

.glow-top-left {
  top: -100px;
  left: -100px;
  background: radial-gradient(circle, var(--accent-blue) 0%, transparent 70%);
}

.glow-bottom-right {
  bottom: -100px;
  right: -100px;
  background: radial-gradient(circle, var(--tone-insert-text) 0%, transparent 70%);
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  position: relative;
  z-index: 1;
}

.title-area {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.3;
}

.close-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-fast);
}

.dark .close-button {
  background: #111;
  border-color: rgba(255, 255, 255, 0.1);
}

.close-button:hover {
  color: var(--text-primary);
  border-color: var(--text-primary);
  transform: scale(1.05);
}

.close-button:active {
  transform: scale(0.95);
}

/* High-end Vercel Badges Row */
.badges-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 9999px;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-secondary);
  box-shadow: var(--shadow-sm);
}

.dark .badge {
  background: #111;
  border-color: rgba(255, 255, 255, 0.08);
}

.dot-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.badge-success {
  border-color: var(--tone-insert-border);
  background: var(--tone-insert-bg);
  color: var(--tone-insert-text);
}

.badge-warning {
  border-color: var(--tone-replace-border);
  background: var(--tone-replace-bg);
  color: var(--tone-replace-text);
}

.badge-info {
  border-color: var(--tone-move-border);
  background: var(--tone-move-bg);
  color: var(--tone-move-text);
}

.badge-score {
  border-color: var(--tone-meta-border);
  background: var(--tone-meta-bg);
  color: var(--tone-meta-text);
}

/* Info paragraphs */
.move-info,
.backlink-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.5;
  position: relative;
  z-index: 1;
}

.move-info {
  background: var(--tone-move-bg);
  border: 1px solid var(--tone-move-border);
  color: var(--tone-move-text);
}

.backlink-info {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.dark .backlink-info {
  background: rgba(255, 255, 255, 0.02);
}

.move-info svg,
.backlink-info svg {
  flex-shrink: 0;
  opacity: 0.8;
}

.line-number-ref {
  font-family: var(--font-mono);
  font-weight: 700;
  background: rgba(255, 255, 255, 0.2);
  padding: 1px 6px;
  border-radius: 4px;
}

.dark .line-number-ref {
  background: rgba(255, 255, 255, 0.1);
}

.peer-heading {
  font-weight: 500;
  opacity: 0.95;
}

.backlink-info code {
  font-family: var(--font-mono);
  font-size: 12px;
  background: rgba(255, 255, 255, 0.4);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-primary);
  font-weight: 600;
}

.dark .backlink-info code {
  background: rgba(255, 255, 255, 0.08);
}

.separator-dot {
  color: var(--text-muted);
  font-weight: bold;
}

.affected-line-tag {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-primary);
}

/* Title comparison block */
.title-compare {
  border: 1px solid var(--tone-rename-border);
  background: var(--tone-rename-bg);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  z-index: 1;
}

.title-compare-row {
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.title-compare-label {
  min-width: 64px;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.8;
}

.title-compare-value {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: var(--text-primary);
  word-break: break-all;
}

.title-compare-value.old-title {
  color: var(--tone-delete-text);
  text-decoration: line-through;
  opacity: 0.85;
}

/* Two columns code section */
.detail-columns {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  position: relative;
  z-index: 1;
}

.content-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-normal);
}

.dark .content-card {
  border-color: rgba(255, 255, 255, 0.08);
}

.content-card:hover {
  border-color: var(--text-muted);
}

.card-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  user-select: none;
}

.dark .card-top-bar {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.08);
}

.terminal-dots {
  display: flex;
  gap: 6px;
}

.terminal-dots .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}

.terminal-dots .dot.red { background: #ff5f56; }
.terminal-dots .dot.yellow { background: #ffbd2e; }
.terminal-dots .dot.green { background: #27c93f; }

.panel-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.code-container {
  padding: 16px;
  overflow-x: auto;
  flex: 1;
  background: var(--bg-surface);
}

.dark .code-container {
  background: #080808;
}

.fallback-pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
}

.inline-preview {
  display: flex;
  flex-wrap: wrap;
  line-height: 1.6;
  font-family: var(--font-mono);
  font-size: 12px;
  margin: 0;
}

.code-lines,
.line-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.code-line,
.detail-line {
  display: block;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}

/* Semantic Diff Tones adjustments in cards */
.tone-delete {
  background: var(--tone-delete-bg);
  border-left: 3px solid var(--tone-delete-text);
  color: var(--tone-delete-text);
}

.tone-insert {
  background: var(--tone-insert-bg);
  border-left: 3px solid var(--tone-insert-text);
  color: var(--tone-insert-text);
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
  padding: 8px 12px;
  vertical-align: top;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}

.dark .table-preview td {
  border-color: rgba(255, 255, 255, 0.08);
}

/* Metadata table & badges */
.table-container {
  overflow-x: auto;
  padding: 8px;
}

.metadata-table {
  width: 100%;
  border-collapse: collapse;
}

.metadata-table th,
.metadata-table td {
  border: 1px solid var(--border);
  padding: 10px 14px;
  text-align: left;
  vertical-align: top;
  font-size: 12px;
}

.dark .metadata-table th,
.dark .metadata-table td {
  border-color: rgba(255, 255, 255, 0.08);
}

.metadata-table th {
  background: var(--bg-subtle);
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.08em;
}

.dark .metadata-table th {
  background: rgba(255, 255, 255, 0.02);
}

.metadata-table code {
  font-family: var(--font-mono);
  color: var(--accent-blue);
  font-weight: 500;
}

.op-badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.op-badge.op-update,
.op-badge.op-modify {
  background: var(--tone-replace-bg);
  border-color: var(--tone-replace-border);
  color: var(--tone-replace-text);
}

.op-badge.op-add,
.op-badge.op-insert {
  background: var(--tone-insert-bg);
  border-color: var(--tone-insert-border);
  color: var(--tone-insert-text);
}

.op-badge.op-remove,
.op-badge.op-delete {
  background: var(--tone-delete-bg);
  border-color: var(--tone-delete-border);
  color: var(--tone-delete-text);
}

/* Vue Transition Effects for High-End Modal */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-enter-active .modal-card,
.modal-fade-leave-active .modal-card {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-enter-from {
  opacity: 0;
}

.modal-fade-enter-from .modal-card {
  transform: scale(0.95) translateY(15px);
  opacity: 0;
}

.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-leave-to .modal-card {
  transform: scale(0.97) translateY(8px);
  opacity: 0;
}

@media (max-width: 960px) {
  .detail-columns {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
