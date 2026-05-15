import { computed, ref, shallowRef } from 'vue'

import type { DiffChange, DiffResult } from '@/core/diff'

import type { StatCardModel } from './types'
import type { HighlightFilter, ProjectionLine } from './view-model'
import {
  buildDebugSnapshot,
  buildDetailPanel,
  buildOldProjectionLines,
  buildProjectionLines,
  flattenChanges,
  getChangeReference,
  lineMatchesFilter,
  runMarkdownDiff,
} from './view-model'

export function useDiffWorkbench(initialOldMarkdown: string, initialNewMarkdown: string) {
  const oldMarkdown = ref(initialOldMarkdown)
  const newMarkdown = ref(initialNewMarkdown)
  const isRunning = ref(false)
  const errorMessage = ref('')
  const viewMode = ref<'unified' | 'source' | 'debug'>('unified')
  const activeFilter = ref<HighlightFilter | null>(null)
  const selectedChangeKey = ref<string | null>(null)
  const result = shallowRef<DiffResult | null>(null)
  const lastDiffedOld = ref('')
  const lastDiffedNew = ref('')

  const flatChanges = computed(() => (result.value ? flattenChanges(result.value.root) : []))
  const changeByKey = computed(() => {
    const pairs = flatChanges.value.map((change) => [getChangeReference(change), change] as const)
    return new Map<string, DiffChange>(pairs)
  })
  const projectionLines = computed<ProjectionLine[]>(() =>
    result.value ? buildProjectionLines(newMarkdown.value, result.value) : buildEmptyLines(newMarkdown.value),
  )
  const oldProjectionLines = computed<ProjectionLine[]>(() =>
    result.value ? buildOldProjectionLines(oldMarkdown.value, result.value) : buildEmptyLines(oldMarkdown.value),
  )
  const peerSide = computed<'old' | 'new' | undefined>(() => {
    const role = detail.value?.moveInfo?.role
    if (role === 'source') return 'new'
    if (role === 'target') return 'old'
    return undefined
  })
  const selectedChange = computed(() =>
    selectedChangeKey.value ? changeByKey.value.get(selectedChangeKey.value) : undefined,
  )
  const detail = computed(() =>
    buildDetailPanel(
      selectedChange.value,
      result.value?.changeIndex,
      result.value?.newIndex,
      result.value?.oldIndex,
    ),
  )
  const peerHighlightKey = computed(() => detail.value?.moveInfo?.peerChangeKey)
  const debugSnapshot = computed(() => (result.value ? buildDebugSnapshot(result.value) : undefined))
  const warningCount = computed(() => {
    if (!result.value) return 0
    return result.value.quality.warningCount
  })
  const canRun = computed(() => !isRunning.value)
  const isDiffStale = computed(() =>
    result.value !== null && (oldMarkdown.value !== lastDiffedOld.value || newMarkdown.value !== lastDiffedNew.value),
  )
  const statsCards = computed<StatCardModel[]>(() => {
    if (!result.value) return []
    const q = result.value.quality
    const cards: StatCardModel[] = [
      { key: 'insert', label: '新增', value: result.value.stats.inserts, filter: 'insert', description: '仅新文档存在的内容。', onClick: () => scrollToFirstMatch('insert') },
      { key: 'delete', label: '删除', value: result.value.stats.deletes, filter: 'delete', description: '仅旧文档存在的内容。', onClick: () => scrollToFirstMatch('delete') },
      { key: 'replace', label: '替换', value: result.value.stats.replaces, filter: 'replace', description: '已配对但内容发生变化的区域。', onClick: () => scrollToFirstMatch('replace') },
      { key: 'move', label: '移动', value: result.value.stats.moves, filter: 'move', description: '内容被识别为移动，而不是删后新增。', onClick: () => scrollToFirstMatch('move') },
      { key: 'reorder', label: '重排', value: result.value.stats.reorders, filter: 'reorder', description: '兄弟节点顺序发生变化。', onClick: () => scrollToFirstMatch('reorder') },
      { key: 'meta', label: '元数据', value: result.value.stats.metaUpdates, filter: 'meta', description: '结构、frontmatter 或代码围栏元数据变化。', onClick: () => scrollToFirstMatch('meta') },
      { key: 'rename', label: '改名', value: result.value.stats.renames, filter: 'rename', description: '标题或引用标识符发生重命名。', onClick: () => scrollToFirstMatch('rename') },
      { key: 'warning', label: '提示', value: warningCount.value, filter: 'warning', description: '存在降级、预算或一致性提示。', onClick: () => scrollToFirstMatch('warning') },
    ]
    if (q.degradedCount > 0) cards.push({ key: 'degraded', label: '降级', value: q.degradedCount, filter: 'warning', description: '部分区域使用了简化对齐。', onClick: () => scrollToFirstMatch('warning') })
    if (q.inlineDeferredCount > 0) cards.push({ key: 'deferred', label: '延后', value: q.inlineDeferredCount, filter: 'warning', description: '片段级高亮因内容过长而退化。', onClick: () => scrollToFirstMatch('warning') })
    return cards
  })

  async function executeDiff(): Promise<void> {
    if (!canRun.value) return

    isRunning.value = true
    errorMessage.value = ''
    selectedChangeKey.value = null
    activeFilter.value = null

    try {
      lastDiffedOld.value = oldMarkdown.value
      lastDiffedNew.value = newMarkdown.value
      result.value = await runMarkdownDiff(oldMarkdown.value, newMarkdown.value)
    } catch (error) {
      result.value = null
      errorMessage.value = error instanceof Error ? error.message : '比对失败'
    } finally {
      isRunning.value = false
    }
  }

  function clearEditor(side: 'old' | 'new'): void {
    if (side === 'old') oldMarkdown.value = ''
    else newMarkdown.value = ''

    result.value = null
    selectedChangeKey.value = null
    errorMessage.value = ''
    lastDiffedOld.value = ''
    lastDiffedNew.value = ''
  }

  function selectLine(changeKey?: string): void {
    if (!changeKey) return
    selectedChangeKey.value = changeKey
  }

  function closeDetail(): void {
    selectedChangeKey.value = null
  }

  function scrollToFirstMatch(filter: HighlightFilter): void {
    if (!result.value) return
    const first =
      projectionLines.value.find((line) => lineMatchesFilter(line, filter))
      ?? oldProjectionLines.value.find((line) => lineMatchesFilter(line, filter))
    if (!first?.changeKey) return
    document.querySelector<HTMLElement>(`[data-change-key="${CSS.escape(first.changeKey)}"]`)
      ?.scrollIntoView({ block: 'center' })
  }

  return {
    oldMarkdown,
    newMarkdown,
    isRunning,
    errorMessage,
    viewMode,
    activeFilter,
    selectedChangeKey,
    result,
    projectionLines,
    oldProjectionLines,
    detail,
    debugSnapshot,
    canRun,
    isDiffStale,
    statsCards,
    peerHighlightKey,
    peerSide,
    executeDiff,
    clearEditor,
    selectLine,
    closeDetail,
    scrollToFirstMatch,
  }
}

function buildEmptyLines(markdown: string): ProjectionLine[] {
  return markdown.split(/\r?\n/).map((text, index) => ({
    key: `empty:${index + 1}`,
    lineNumber: index + 1,
    text,
    baseTone: 'plain',
    matchedTones: [],
    changeKeys: [],
    alignmentKey: undefined,
    pairKind: undefined,
    hasDescendantChange: false,
    warnings: [],
    annotations: [],
    lineMatches: [],
  }))
}
