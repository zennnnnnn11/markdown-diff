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
  runMarkdownDiff,
} from './view-model'

export function useDiffWorkbench(initialOldMarkdown: string, initialNewMarkdown: string) {
  const oldMarkdown = ref(initialOldMarkdown)
  const newMarkdown = ref(initialNewMarkdown)
  const isRunning = ref(false)
  const errorMessage = ref('')
  const showDebug = ref(false)
  const activeFilter = ref<HighlightFilter | null>(null)
  const selectedChangeKey = ref<string | null>(null)
  const result = shallowRef<DiffResult | null>(null)

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
  const canRun = computed(
    () => oldMarkdown.value.trim().length > 0 && newMarkdown.value.trim().length > 0 && !isRunning.value,
  )
  const statsCards = computed<StatCardModel[]>(() => {
    if (!result.value) return []
    const q = result.value.quality
    const cards: StatCardModel[] = [
      { key: 'insert', label: '新增', value: result.value.stats.inserts, filter: 'insert' },
      { key: 'delete', label: '删除', value: result.value.stats.deletes, filter: 'delete' },
      { key: 'replace', label: '替换', value: result.value.stats.replaces, filter: 'replace' },
      { key: 'move', label: '移动', value: result.value.stats.moves, filter: 'move' },
      { key: 'meta', label: '元数据', value: result.value.stats.metaUpdates, filter: 'meta' },
      { key: 'rename', label: '改名', value: result.value.stats.renames, filter: 'rename' },
      { key: 'warning', label: '警告', value: warningCount.value, filter: 'warning' },
    ]
    if (q.degradedCount > 0) cards.push({ key: 'degraded', label: '降级', value: q.degradedCount, filter: 'warning' })
    if (q.inlineDeferredCount > 0) cards.push({ key: 'deferred', label: '延后', value: q.inlineDeferredCount, filter: 'warning' })
    return cards
  })

  async function executeDiff(): Promise<void> {
    if (!canRun.value) return

    isRunning.value = true
    errorMessage.value = ''
    selectedChangeKey.value = null
    activeFilter.value = null

    try {
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
  }

  function selectLine(changeKey?: string): void {
    if (!changeKey) return
    selectedChangeKey.value = changeKey
  }

  function closeDetail(): void {
    selectedChangeKey.value = null
  }

  return {
    oldMarkdown,
    newMarkdown,
    isRunning,
    errorMessage,
    showDebug,
    activeFilter,
    selectedChangeKey,
    result,
    projectionLines,
    oldProjectionLines,
    detail,
    debugSnapshot,
    canRun,
    statsCards,
    peerHighlightKey,
    peerSide,
    executeDiff,
    clearEditor,
    selectLine,
    closeDetail,
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
    pairKind: undefined,
    hasDescendantChange: false,
    warnings: [],
  }))
}
