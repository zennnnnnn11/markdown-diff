import { isSection } from '@/core/transformer'
import type { Block, DiffChange, DiffResult, Section, SourceRange, Tone } from './types'
import type {
  ProjectionAnnotation,
  ProjectionLine,
  ProjectionLineMatch,
  ProjectionSegment,
} from './types'
import { entityLabel, operationLabel, formatWarningLabel, toneLabels } from './labels'
import {
  flattenChanges,
  getChangeReference,
  getAlignmentReference,
  tonesForChange,
  uniqueTones,
  uniqueStrings,
  rangeSpan,
} from './utils'
import { buildSideSegmentsFromSpans, headingPrefix } from './segments'

type RangeLookup = (change: DiffChange, result: DiffResult) => SourceRange | undefined

export function buildProjectionLines(
  newMarkdown: string,
  result: DiffResult,
  changes?: DiffChange[],
): ProjectionLine[] {
  return buildProjectionLinesFromMarkdown(newMarkdown, result, getProjectionRange, 'new', changes)
}

export function buildOldProjectionLines(
  oldMarkdown: string,
  result: DiffResult,
  changes?: DiffChange[],
): ProjectionLine[] {
  return buildProjectionLinesFromMarkdown(
    oldMarkdown,
    result,
    getOldProjectionRange,
    'old',
    changes,
  )
}

function buildProjectionLinesFromMarkdown(
  markdown: string,
  result: DiffResult,
  getRange: RangeLookup,
  side: 'old' | 'new',
  prebuiltChanges?: DiffChange[],
): ProjectionLine[] {
  const lines = markdown.split(/\r?\n/)
  const changes = prebuiltChanges ?? flattenChanges(result.root)

  const changeEntries = changes
    .map((change) => {
      const range = getRange(change, result)
      if (!range?.start?.line || !range?.end?.line) return undefined
      return { change, range, tones: tonesForChange(change) }
    })
    .filter((e): e is { change: DiffChange; range: SourceRange; tones: Tone[] } => !!e)

  const changesByLine = new Map<number, typeof changeEntries>()
  for (const entry of changeEntries) {
    const startLine = entry.range.start!.line!
    const endLine = entry.range.end!.line!
    for (let ln = startLine; ln <= endLine; ln++) {
      let arr = changesByLine.get(ln)
      if (!arr) {
        arr = []
        changesByLine.set(ln, arr)
      }
      arr.push(entry)
    }
  }

  return lines.map((text, index) => {
    const lineNumber = index + 1
    const matched = changesByLine.get(lineNumber) ?? []

    const matchedTones = uniqueTones(matched.flatMap((entry) => entry.tones))
    const dominant = pickDominantMatch(matched)
    const baseTone = dominant?.tones[0] ?? 'plain'
    const changeKeys = uniqueStrings(matched.map((entry) => getChangeReference(entry.change)))
    const warnings = uniqueStrings(matched.flatMap((entry) => entry.change.warnings))
    const lineMatches = matched.map(({ change, tones }) => ({
      changeKey: getChangeReference(change),
      tone: tones[0] ?? 'plain',
      pairKind: change.pairKind,
      summary: `${entityLabel(change)} · ${operationLabel(change)}`,
    }))

    return {
      key: `line:${lineNumber}`,
      lineNumber,
      text,
      baseTone,
      matchedTones,
      changeKeys,
      segments: dominant ? buildProjectionSegments(text, dominant.change, side) : undefined,
      changeKey: dominant ? getChangeReference(dominant.change) : undefined,
      alignmentKey: dominant ? getAlignmentReference(dominant.change) : undefined,
      pairKind: dominant?.change.pairKind,
      hasDescendantChange:
        dominant?.change.status.descendantChanged && !dominant?.change.status.selfChanged,
      warnings,
      annotations: buildProjectionAnnotations(matchedTones, warnings, changeKeys.length),
      lineMatches,
      changeTooltip:
        dominant && dominant.tones[0] !== 'plain' ? dominant.change.summary : undefined,
      movePeerLineNumber:
        dominant?.change.primaryOp === 'move'
          ? resolvePeerLineNumber(dominant.change, result)
          : undefined,
    }
  })
}

function pickDominantMatch(
  matched: Array<{ change: DiffChange; range: SourceRange; tones: Tone[] }>,
): { change: DiffChange; range: SourceRange; tones: Tone[] } | undefined {
  return [...matched].sort((left, right) => {
    const TONE_PRIORITY: Record<Tone, number> = {
      delete: 0,
      replace: 1,
      move: 2,
      insert: 3,
      meta: 4,
      rename: 5,
      reorder: 6,
      plain: 7,
    }
    const toneDiff =
      TONE_PRIORITY[left.tones[0] ?? 'plain'] - TONE_PRIORITY[right.tones[0] ?? 'plain']
    if (toneDiff !== 0) return toneDiff
    return rangeSpan(left.range) - rangeSpan(right.range)
  })[0]
}

function buildProjectionSegments(
  text: string,
  change: DiffChange,
  side: 'old' | 'new',
): ProjectionSegment[] | undefined {
  const tone = tonesForChange(change)[0] ?? 'replace'

  if (change.blockType === 'paragraph' && change.inlineSpans) {
    const segments = buildSideSegmentsFromSpans(change.inlineSpans, side, tone)
    const rendered = segments?.map((segment) => segment.text).join('')
    if (segments && rendered === text) return segments
  }

  if (change.kind === 'heading' && change.titleInlineSpans) {
    const title = buildSideSegmentsFromSpans(change.titleInlineSpans, side, 'rename')
    const prefix = headingPrefix(change)
    const rendered = `${prefix}${title?.map((segment) => segment.text).join('') ?? ''}`
    if (title?.length && rendered === text) {
      return prefix ? [{ text: prefix, tone: 'plain' }, ...title] : title
    }
  }

  return undefined
}

function buildProjectionAnnotations(
  matchedTones: Tone[],
  warnings: string[],
  changeCount: number,
): ProjectionAnnotation[] {
  const annotations: ProjectionAnnotation[] = matchedTones
    .filter((tone) => tone !== 'plain')
    .map((tone) => ({
      kind: 'tone',
      label: toneLabels[tone],
      tone,
    }))

  if (changeCount > 1) {
    annotations.push({
      kind: 'overlap',
      label: `命中 ${changeCount} 个变更`,
    })
  }

  for (const warning of warnings) {
    annotations.push({
      kind: 'warning',
      label: formatWarningLabel(warning),
    })
  }

  return annotations
}

function getProjectionRange(change: DiffChange, result: DiffResult): SourceRange | undefined {
  if (change.newId) {
    const newNode = result.newIndex.byId.get(change.newId)
    if (newNode?.sourceRange) return narrowSectionRange(change, newNode.sourceRange, change.newNode)
  }

  return undefined
}

function getOldProjectionRange(change: DiffChange, result: DiffResult): SourceRange | undefined {
  if (change.oldId) {
    const oldNode = result.oldIndex.byId.get(change.oldId)
    if (oldNode?.sourceRange) return narrowSectionRange(change, oldNode.sourceRange, change.oldNode)
  }

  return undefined
}

function narrowSectionRange(
  change: DiffChange,
  sourceRange: SourceRange,
  node?: Section | Block,
): SourceRange {
  const headingRange = getHeadingRange(node)
  if (!headingRange) return sourceRange

  if (change.status.renamed) return headingRange
  if (change.primaryOp === 'meta-update' && change.entity === 'section') return headingRange
  return sourceRange
}

function getHeadingRange(node: Section | Block | undefined): SourceRange | undefined {
  if (!node || !isSection(node) || !node.heading) return undefined
  const position = (
    node.heading as Block & {
      position?: { start?: SourceRange['start']; end?: SourceRange['end'] }
    }
  ).position
  if (!position) return undefined
  return {
    start: position.start,
    end: position.end,
  }
}

function resolvePeerLineNumber(change: DiffChange, result: DiffResult): number | undefined {
  if (!change.logicalMoveId) return undefined
  const peers = result.changeIndex.byLogicalMoveId.get(change.logicalMoveId)
  if (!peers) return undefined
  const peer = peers.find((p) => p.moveRole !== change.moveRole)
  if (!peer) return undefined

  if (change.moveRole === 'source') {
    if (!peer.newId) return undefined
    return result.newIndex.byId.get(peer.newId)?.sourceRange?.start?.line
  } else {
    if (!peer.oldId) return undefined
    return result.oldIndex.byId.get(peer.oldId)?.sourceRange?.start?.line
  }
}
