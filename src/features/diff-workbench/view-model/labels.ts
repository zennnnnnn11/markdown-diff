import type { DiffChange, MatchKind, Tone } from './types'

export const matchKindLabels: Record<MatchKind, string> = {
  'forced-root': '根节点强制对应',
  'exact-subtree': '完整子树完全一致',
  'exact-subtree-resolved': '歧义子树消歧匹配',
  'exact-self': '节点自身完全一致',
  'exact-self-with-context': '上下文确认匹配',
  'exact-direct': '直接子节点确认匹配',
  'frontmatter-anchor': '前置元数据锚点',
  'footnote-identity': '脚注正文完全一致',
  'footnote-identifier': '脚注标识符一致',
  'definition-identity': '引用定义内容一致',
  'definition-identifier': '引用定义标识符一致',
  'local-heading-slug': '局部标题标识匹配',
  'local-heading-body': '局部标题正文匹配',
  'local-similarity': '内容高度相似',
  'local-identity': '局部身份匹配',
  'move-exact': '移动：内容完全一致',
  'move-direct': '移动：结构直接匹配',
  'move-heading': '移动：标题匹配',
  'move-code': '移动：代码内容匹配',
}

export const toneLabels: Record<Tone, string> = {
  plain: '无变更',
  insert: '新增',
  delete: '删除',
  replace: '替换',
  move: '移动',
  meta: '元数据',
  rename: '改名',
  reorder: '重排',
}

const WARNING_LABELS: Record<string, string> = {
  'inline-deferred': '内容过长，已降级为区域级高亮。',
  'subtree-budget-exceeded': '结构过大，已使用简化对齐。',
  'local-window-exceeded': '局部区域过大，已使用简化对齐。',
  'enhanced-local-recovery-budget-exceeded': '局部恢复预算不足，已跳过增强恢复。',
  'enhanced-local-recovery-no-candidates': '未找到可靠的局部恢复候选。',
}

export function entityLabel(change: DiffChange): string {
  if (change.entity === 'metadata') return '元数据'
  if (change.kind === 'heading') return '标题'
  if (change.kind === 'frontmatter') return 'Frontmatter'
  if (change.kind === 'listItem') return '列表项'
  if (change.kind === 'blockquote') return '引用块'
  if (change.kind === 'footnote') return '脚注'
  if (change.blockType === 'paragraph') return '段落'
  if (change.blockType === 'code') return '代码块'
  if (change.blockType === 'table') return '表格'
  if (change.blockType === 'definition') return '引用定义'
  return change.entity === 'section' ? 'Section' : 'Block'
}

export function operationLabel(change: DiffChange): string {
  if (change.status.renamed && change.primaryOp === 'equal') return '改名'
  if (change.primaryOp === 'insert') return '新增'
  if (change.primaryOp === 'delete') return '删除'
  if (change.primaryOp === 'replace') return '替换'
  if (change.primaryOp === 'move') return '移动'
  if (change.primaryOp === 'meta-update') return '元数据更新'
  if (change.status.metaChanged) return '元数据更新'
  if (change.status.movedWithinParent || change.reordered) return '重排'
  return '无变更'
}

export function formatWarningLabel(code: string): string {
  if (WARNING_LABELS[code]) return WARNING_LABELS[code]
  if (code.startsWith('invalid-')) return `检测到内部一致性异常：${code}`
  return `存在差异质量提示：${code}`
}
