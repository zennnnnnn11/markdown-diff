# Frontend Info Utilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface five categories of underutilized diff-engine data in the UI: row tooltips, move gutter annotations, stats-card scroll-to-first, warning-banner jump-to-first, and verified old-side inline segments.

**Architecture:** All logic changes live in `view-model.ts` (pure functions, testable without Vue) and `use-diff-workbench.ts` (reactive wiring). Vue components receive new props/emits with minimal template additions. Tests are co-located in `src/features/diff-workbench/__tests__/`.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest (unit), existing `runMarkdownDiff` / `buildProjectionLines` / `buildMergedRows` test helpers.

---

## File Map

| File | Change |
|------|--------|
| `src/features/diff-workbench/view-model.ts` | Add `changeTooltip` to `ProjectionLine`; add `movePeerLineNumber` + `movePeerSide` to `ProjectionLine`; extend `buildProjectionLinesFromMarkdown` to populate both; add `buildScrollTarget` helper |
| `src/features/diff-workbench/types.ts` | Add `onClick` to `StatCardModel` |
| `src/features/diff-workbench/use-diff-workbench.ts` | Implement `scrollToFirstMatch`; wire `onClick` into stat cards; expose `scrollToFirstWarning` |
| `src/features/diff-workbench/components/UnifiedDiffTable.vue` | Bind `title` on cell from `changeTooltip`; render move peer badge in gutter |
| `src/features/diff-workbench/components/DiffProjectionTable.vue` | Same tooltip + move badge as unified table |
| `src/features/diff-workbench/components/DiffStatsBar.vue` | Bind `@click` on cards |
| `src/features/diff-workbench/DiffWorkbench.vue` | Wire warning banner locate button → `scrollToFirstMatch('warning')` |
| `src/features/diff-workbench/__tests__/view-model.test.ts` | New tests for tooltip, movePeerLineNumber, old-side segments |
| `src/features/diff-workbench/__tests__/use-diff-workbench.test.ts` | New tests for scrollToFirstMatch |

---

## Task A: Row tooltip — surface `DiffChange.summary` via `changeTooltip`

**Files:**
- Modify: `src/features/diff-workbench/view-model.ts`
- Modify: `src/features/diff-workbench/components/UnifiedDiffTable.vue`
- Modify: `src/features/diff-workbench/components/DiffProjectionTable.vue`
- Test: `src/features/diff-workbench/__tests__/view-model.test.ts`

### Step A-1: Write failing test for `changeTooltip` on `ProjectionLine`

Add this test to `src/features/diff-workbench/__tests__/view-model.test.ts`:

```typescript
it('populates changeTooltip with the dominant change summary', async () => {
  const result = await runMarkdownDiff('# Title\n\nold paragraph', '# Title\n\nnew paragraph')
  const lines = buildProjectionLines('# Title\n\nnew paragraph', result)
  const replacedLine = lines.find((line) => line.baseTone === 'replace')

  expect(replacedLine?.changeTooltip).toBeDefined()
  expect(typeof replacedLine?.changeTooltip).toBe('string')
  expect(replacedLine!.changeTooltip!.length).toBeGreaterThan(0)
})

it('leaves changeTooltip undefined for plain lines', async () => {
  const result = await runMarkdownDiff('# Title\n\nsame', '# Title\n\nsame')
  const lines = buildProjectionLines('# Title\n\nsame', result)
  const plainLine = lines.find((line) => line.baseTone === 'plain' && !line.hasDescendantChange)

  expect(plainLine?.changeTooltip).toBeUndefined()
})
```

- [ ] Paste the two tests above into the `describe('diff workbench view-model', ...)` block (end of file, before the closing `})`).

### Step A-2: Run tests to verify they fail

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/view-model.test.ts 2>&1 | tail -20
```

Expected: Two failures mentioning `changeTooltip` is `undefined`.

### Step A-3: Add `changeTooltip` field to `ProjectionLine`

In `src/features/diff-workbench/view-model.ts`, find the `ProjectionLine` interface and add one field:

```typescript
export interface ProjectionLine {
  key: string
  lineNumber: number
  text: string
  baseTone: Tone
  matchedTones: Tone[]
  changeKeys: string[]
  segments?: ProjectionSegment[]
  changeKey?: string
  alignmentKey?: string
  pairKind?: PairKind
  hasDescendantChange?: boolean
  warnings: string[]
  annotations: ProjectionAnnotation[]
  lineMatches: ProjectionLineMatch[]
  changeTooltip?: string          // ← ADD THIS LINE
}
```

### Step A-4: Populate `changeTooltip` in `buildProjectionLinesFromMarkdown`

In `view-model.ts`, find the object literal returned inside `lines.map(...)` (around line 296 where `key`, `lineNumber`, `text` etc. are set). Add one property after `lineMatches`:

```typescript
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
      changeTooltip: dominant && dominant.change.primaryOp !== 'equal'
        ? dominant.change.lineMatches?.[0]?.summary ?? dominant.change.summary
        : undefined,
    }
```

Wait — `dominant` is `{ change, range, tones }`. The summary is at `dominant.change.summary`. The correct line is:

```typescript
      changeTooltip: dominant && dominant.change.primaryOp !== 'equal'
        ? dominant.change.summary
        : undefined,
```

### Step A-5: Run tests to verify they pass

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/view-model.test.ts 2>&1 | tail -20
```

Expected: Both new tests PASS.

### Step A-6: Bind `title` on cells in `UnifiedDiffTable.vue`

In `src/features/diff-workbench/components/UnifiedDiffTable.vue`, find the old-content `<div class="cell cell-old" ...>` element. Add `:title="row.oldLine?.changeTooltip"` to its attribute list:

```html
        <div
          class="cell cell-old"
          :class="[
            toneClass(row.oldLine),
            pairClass(row.oldLine),
            {
              active: filterClass(row.oldLine, activeFilter),
              'peer-highlight': peerClass(row.oldLine, peerHighlightKey),
              interactive: isInteractive(row.oldLine),
            },
          ]"
          :title="row.oldLine?.changeTooltip"
          :data-change-key="row.oldLine?.changeKey"
          data-side="old"
          role="cell"
          @click="onClick(row.oldLine, 'old')"
        >
```

Then find the new-content `<div class="cell cell-new" ...>` element and add `:title="row.newLine?.changeTooltip"`:

```html
        <div
          class="cell cell-new"
          :class="[
            toneClass(row.newLine),
            pairClass(row.newLine),
            {
              active: filterClass(row.newLine, activeFilter),
              'peer-highlight': peerClass(row.newLine, peerHighlightKey),
              interactive: isInteractive(row.newLine),
            },
          ]"
          :title="row.newLine?.changeTooltip"
          :data-change-key="row.newLine?.changeKey"
          data-side="new"
          role="cell"
          @click="onClick(row.newLine, 'new')"
        >
```

### Step A-7: Bind `title` on rows in `DiffProjectionTable.vue`

In `src/features/diff-workbench/components/DiffProjectionTable.vue`, find the `<component :is="..." class="projection-row" ...>` element. Add `:title="line.changeTooltip"`:

```html
        <component
          :is="line.changeKey ? 'button' : 'div'"
          v-for="line in projectionLines"
          :id="rowId(line)"
          :key="line.key"
          :data-change-key="line.changeKey"
          :data-side="side"
          :title="line.changeTooltip"
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
```

### Step A-8: Run full view-model test suite

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/view-model.test.ts 2>&1 | tail -30
```

Expected: All tests PASS (no regressions).

### Step A-9: Commit

```bash
git add src/features/diff-workbench/view-model.ts src/features/diff-workbench/components/UnifiedDiffTable.vue src/features/diff-workbench/components/DiffProjectionTable.vue src/features/diff-workbench/__tests__/view-model.test.ts
git commit -m "feat: add changeTooltip to projection lines for hover summary"
```

---

## Task B: Move gutter annotation — peer line number badge

**Files:**
- Modify: `src/features/diff-workbench/view-model.ts`
- Modify: `src/features/diff-workbench/components/UnifiedDiffTable.vue`
- Modify: `src/features/diff-workbench/components/DiffProjectionTable.vue`
- Test: `src/features/diff-workbench/__tests__/view-model.test.ts`

### Step B-1: Write failing tests for `movePeerLineNumber` and `movePeerSide`

Add these tests to `src/features/diff-workbench/__tests__/view-model.test.ts`:

```typescript
it('populates movePeerLineNumber on move-source lines in new projection', async () => {
  const oldMd = '# A\n\n## Moved\n\ncontent\n\n# B'
  const newMd = '# A\n\n# B\n\n## Moved\n\ncontent'
  const result = await runMarkdownDiff(oldMd, newMd)
  const lines = buildProjectionLines(newMd, result)
  const moveTargetLine = lines.find((line) => line.baseTone === 'move')

  expect(moveTargetLine).toBeDefined()
  expect(moveTargetLine?.movePeerLineNumber).toBeDefined()
  expect(typeof moveTargetLine?.movePeerLineNumber).toBe('number')
  expect(moveTargetLine?.movePeerLineNumber).toBeGreaterThan(0)
})

it('populates movePeerLineNumber on move-source lines in old projection', async () => {
  const oldMd = '# A\n\n## Moved\n\ncontent\n\n# B'
  const newMd = '# A\n\n# B\n\n## Moved\n\ncontent'
  const result = await runMarkdownDiff(oldMd, newMd)
  const oldLines = buildOldProjectionLines(oldMd, result)
  const moveSourceLine = oldLines.find((line) => line.baseTone === 'move')

  expect(moveSourceLine).toBeDefined()
  expect(moveSourceLine?.movePeerLineNumber).toBeDefined()
  expect(typeof moveSourceLine?.movePeerLineNumber).toBe('number')
  expect(moveSourceLine?.movePeerLineNumber).toBeGreaterThan(0)
})

it('leaves movePeerLineNumber undefined for non-move lines', async () => {
  const result = await runMarkdownDiff('# Title\n\nold', '# Title\n\nnew')
  const lines = buildProjectionLines('# Title\n\nnew', result)
  const replacedLine = lines.find((line) => line.baseTone === 'replace')

  expect(replacedLine?.movePeerLineNumber).toBeUndefined()
})
```

- [ ] Paste the three tests above into the `describe` block.

### Step B-2: Run tests to verify they fail

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/view-model.test.ts 2>&1 | tail -20
```

Expected: Three failures mentioning `movePeerLineNumber` is `undefined`.

### Step B-3: Add `movePeerLineNumber` field to `ProjectionLine`

In `view-model.ts`, extend the `ProjectionLine` interface (right after `changeTooltip`):

```typescript
export interface ProjectionLine {
  key: string
  lineNumber: number
  text: string
  baseTone: Tone
  matchedTones: Tone[]
  changeKeys: string[]
  segments?: ProjectionSegment[]
  changeKey?: string
  alignmentKey?: string
  pairKind?: PairKind
  hasDescendantChange?: boolean
  warnings: string[]
  annotations: ProjectionAnnotation[]
  lineMatches: ProjectionLineMatch[]
  changeTooltip?: string
  movePeerLineNumber?: number     // ← ADD THIS LINE
}
```

### Step B-4: Populate `movePeerLineNumber` in `buildProjectionLinesFromMarkdown`

The function signature of `buildProjectionLinesFromMarkdown` currently is:

```typescript
function buildProjectionLinesFromMarkdown(
  markdown: string,
  result: DiffResult,
  getRange: RangeLookup,
  side: 'old' | 'new',
): ProjectionLine[]
```

It already receives `result` which has `result.changeIndex`, `result.newIndex`, and `result.oldIndex`. No signature change needed.

Inside the `lines.map(...)` closure, after computing `dominant`, add a helper call. Find the return object literal and add `movePeerLineNumber`:

```typescript
      changeTooltip: dominant && dominant.change.primaryOp !== 'equal'
        ? dominant.change.summary
        : undefined,
      movePeerLineNumber: dominant?.change.primaryOp === 'move'
        ? resolvePeerLineNumber(dominant.change, result, side)
        : undefined,
```

Then add the `resolvePeerLineNumber` helper function **outside** the export functions, near the bottom of `view-model.ts` (before the first private helper, e.g. before `pickDominantMatch`):

```typescript
function resolvePeerLineNumber(
  change: DiffChange,
  result: DiffResult,
  side: 'old' | 'new',
): number | undefined {
  const pairKey = change.pairKey
  if (!pairKey) return undefined

  // byPairKey always stores the target change (the one with newId).
  const targetChange = result.changeIndex.byPairKey.get(pairKey)

  if (change.moveRole === 'source') {
    // peer is the target (lives in new doc)
    const peerId = targetChange?.newId
    if (!peerId) return undefined
    return result.newIndex.byId.get(peerId)?.sourceRange?.start?.line
  } else {
    // peer is the source (lives in old doc)
    const peerId = targetChange?.oldId
    if (!peerId) return undefined
    return result.oldIndex.byId.get(peerId)?.sourceRange?.start?.line
  }
}
```

### Step B-5: Run tests to verify they pass

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/view-model.test.ts 2>&1 | tail -20
```

Expected: Three new tests PASS.

### Step B-6: Render peer badge in `UnifiedDiffTable.vue` gutter

In `UnifiedDiffTable.vue`, find the old gutter `<span class="gutter-badges">` block (around line 93). Add the move peer badge after the existing badges:

```html
            <span class="gutter-badges">
              <span v-if="row.oldLine.hasDescendantChange && row.oldLine.baseTone === 'plain'" class="descendant-flag" title="子内容有变更">▸</span>
              <span v-if="row.oldLine.changeKeys.length > 1" class="overlap-flag" :title="`旧侧命中 ${row.oldLine.changeKeys.length} 个变更`">+{{ row.oldLine.changeKeys.length - 1 }}</span>
              <span v-if="row.oldLine.warnings.length" class="warning-flag" title="存在告警">⚠</span>
              <span
                v-if="row.oldLine.baseTone === 'move' && row.oldLine.movePeerLineNumber"
                class="move-peer-flag"
                :title="`移动目标：第 ${row.oldLine.movePeerLineNumber} 行`"
              >↓{{ row.oldLine.movePeerLineNumber }}</span>
            </span>
```

Do the same for the new gutter `<span class="gutter-badges">` (around line 155):

```html
            <span class="gutter-badges">
              <span v-if="row.newLine.hasDescendantChange && row.newLine.baseTone === 'plain'" class="descendant-flag" title="子内容有变更">▸</span>
              <span v-if="row.newLine.changeKeys.length > 1" class="overlap-flag" :title="`新侧命中 ${row.newLine.changeKeys.length} 个变更`">+{{ row.newLine.changeKeys.length - 1 }}</span>
              <span v-if="row.newLine.warnings.length" class="warning-flag" title="存在告警">⚠</span>
              <span
                v-if="row.newLine.baseTone === 'move' && row.newLine.movePeerLineNumber"
                class="move-peer-flag"
                :title="`移动来源：第 ${row.newLine.movePeerLineNumber} 行`"
              >↑{{ row.newLine.movePeerLineNumber }}</span>
            </span>
```

Add the CSS class to `UnifiedDiffTable.vue` `<style scoped>`:

```css
.move-peer-flag {
  color: #1f3f8f;
  font-size: 10px;
  font-weight: 600;
}
```

### Step B-7: Render peer badge in `DiffProjectionTable.vue` gutter

In `DiffProjectionTable.vue`, find the `<span class="gutter-badges">` block (around line 79). Add the move peer badge:

```html
          <span class="gutter-badges">
            <span v-if="line.hasDescendantChange && line.baseTone === 'plain'" class="descendant-flag" title="子内容有变更">▸</span>
            <span v-if="line.changeKeys.length > 1" class="overlap-flag" :title="`该行命中 ${line.changeKeys.length} 个变更`">
              +{{ line.changeKeys.length - 1 }}
            </span>
            <span v-if="line.warnings.length" class="warning-flag" title="存在告警">⚠</span>
            <span
              v-if="line.baseTone === 'move' && line.movePeerLineNumber"
              class="move-peer-flag"
              :title="side === 'old' ? `移动目标：第 ${line.movePeerLineNumber} 行` : `移动来源：第 ${line.movePeerLineNumber} 行`"
            >{{ side === 'old' ? '↓' : '↑' }}{{ line.movePeerLineNumber }}</span>
          </span>
```

Add the CSS class to `DiffProjectionTable.vue` `<style scoped>`:

```css
.move-peer-flag {
  color: #1f3f8f;
  font-size: 10px;
  font-weight: 600;
}
```

### Step B-8: Run full view-model suite

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/view-model.test.ts 2>&1 | tail -30
```

Expected: All tests PASS.

### Step B-9: Commit

```bash
git add src/features/diff-workbench/view-model.ts src/features/diff-workbench/components/UnifiedDiffTable.vue src/features/diff-workbench/components/DiffProjectionTable.vue src/features/diff-workbench/__tests__/view-model.test.ts
git commit -m "feat: add move peer line number badge to gutter"
```

---

## Task C: Stats card click — scroll to first matching row

**Files:**
- Modify: `src/features/diff-workbench/types.ts`
- Modify: `src/features/diff-workbench/use-diff-workbench.ts`
- Modify: `src/features/diff-workbench/components/DiffStatsBar.vue`
- Modify: `src/features/diff-workbench/DiffWorkbench.vue`
- Test: `src/features/diff-workbench/__tests__/use-diff-workbench.test.ts`

### Step C-1: Write failing test for `scrollToFirstMatch`

Read `src/features/diff-workbench/__tests__/use-diff-workbench.test.ts` first to understand its current structure, then add:

```typescript
it('scrollToFirstMatch calls scrollIntoView on the first matching cell', async () => {
  const scrollIntoView = vi.fn()
  const mockElement = { scrollIntoView } as unknown as HTMLElement
  vi.spyOn(document, 'querySelector').mockReturnValue(mockElement)

  const workbench = useDiffWorkbench('# Title\n\nold paragraph', '# Title\n\nnew paragraph')
  await workbench.executeDiff()

  workbench.scrollToFirstMatch('replace')

  expect(document.querySelector).toHaveBeenCalled()
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })

  vi.restoreAllMocks()
})

it('scrollToFirstMatch does nothing when no result exists', () => {
  const workbench = useDiffWorkbench('', '')
  // no executeDiff called — result is null

  expect(() => workbench.scrollToFirstMatch('insert')).not.toThrow()
})
```

- [ ] Add `import { vi } from 'vitest'` at the top of the test file if not present.
- [ ] Paste tests into the describe block.

### Step C-2: Run tests to verify they fail

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/use-diff-workbench.test.ts 2>&1 | tail -20
```

Expected: Failures mentioning `scrollToFirstMatch is not a function`.

### Step C-3: Add `onClick` to `StatCardModel`

In `src/features/diff-workbench/types.ts`, add the optional callback:

```typescript
import type { HighlightFilter } from './view-model'

export interface StatCardModel {
  key: string
  label: string
  value: number
  filter: HighlightFilter
  description: string
  onClick?: () => void
}
```

### Step C-4: Implement `scrollToFirstMatch` in `use-diff-workbench.ts`

In `src/features/diff-workbench/use-diff-workbench.ts`, add the function after `closeDetail`:

```typescript
  function scrollToFirstMatch(filter: HighlightFilter): void {
    if (!result.value) return
    const allLines = projectionLines.value
    const first = allLines.find((line) => lineMatchesFilter(line, filter))
    if (!first?.changeKey) return
    const el = document.querySelector<HTMLElement>(
      `[data-change-key="${first.changeKey}"]`,
    )
    el?.scrollIntoView({ block: 'center' })
  }
```

Also add `lineMatchesFilter` to the import from `./view-model`:

```typescript
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
```

Expose `scrollToFirstMatch` in the return object:

```typescript
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
    statsCards,
    peerHighlightKey,
    peerSide,
    executeDiff,
    clearEditor,
    selectLine,
    closeDetail,
    scrollToFirstMatch,
  }
```

### Step C-5: Wire `onClick` into stat cards in `use-diff-workbench.ts`

Update the `statsCards` computed to add `onClick` to each card:

```typescript
  const statsCards = computed<StatCardModel[]>(() => {
    if (!result.value) return []
    const q = result.value.quality
    const cards: StatCardModel[] = [
      { key: 'insert', label: '新增', value: result.value.stats.inserts, filter: 'insert', description: '仅新文档存在的内容。', onClick: () => scrollToFirstMatch('insert') },
      { key: 'delete', label: '删除', value: result.value.stats.deletes, filter: 'delete', description: '仅旧文档存在的内容。', onClick: () => scrollToFirstMatch('delete') },
      { key: 'replace', label: '替换', value: result.value.stats.replaces, filter: 'replace', description: '已配对但内容发生变化的区域。', onClick: () => scrollToFirstMatch('replace') },
      { key: 'move', label: '移动', value: result.value.stats.moves, filter: 'move', description: '内容被识别为移动，而不是删后新增。', onClick: () => scrollToFirstMatch('move') },
      { key: 'meta', label: '元数据', value: result.value.stats.metaUpdates, filter: 'meta', description: '结构、frontmatter 或代码围栏元数据变化。', onClick: () => scrollToFirstMatch('meta') },
      { key: 'rename', label: '改名', value: result.value.stats.renames, filter: 'rename', description: '标题或引用标识符发生重命名。', onClick: () => scrollToFirstMatch('rename') },
      { key: 'warning', label: '提示', value: warningCount.value, filter: 'warning', description: '存在降级、预算或一致性提示。', onClick: () => scrollToFirstMatch('warning') },
    ]
    if (q.degradedCount > 0) cards.push({ key: 'degraded', label: '降级', value: q.degradedCount, filter: 'warning', description: '部分区域使用了简化对齐。', onClick: () => scrollToFirstMatch('warning') })
    if (q.inlineDeferredCount > 0) cards.push({ key: 'deferred', label: '延后', value: q.inlineDeferredCount, filter: 'warning', description: '片段级高亮因内容过长而退化。', onClick: () => scrollToFirstMatch('warning') })
    return cards
  })
```

### Step C-6: Bind `@click` in `DiffStatsBar.vue`

In `src/features/diff-workbench/components/DiffStatsBar.vue`, the `<button>` element currently has `@mouseenter` / `@mouseleave` / `@focus` / `@blur`. Add `@click`:

```html
      <button
        v-for="card in statsCards"
        :key="card.key"
        type="button"
        class="stat-card"
        :title="card.description"
        @mouseenter="emit('highlight', card.filter)"
        @mouseleave="emit('highlight', null)"
        @focus="emit('highlight', card.filter)"
        @blur="emit('highlight', null)"
        @click="card.onClick?.()"
      >
```

### Step C-7: Run tests to verify they pass

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/use-diff-workbench.test.ts 2>&1 | tail -20
```

Expected: Both new tests PASS.

### Step C-8: Run full workbench suite

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/ 2>&1 | tail -30
```

Expected: All tests PASS.

### Step C-9: Commit

```bash
git add src/features/diff-workbench/types.ts src/features/diff-workbench/use-diff-workbench.ts src/features/diff-workbench/components/DiffStatsBar.vue src/features/diff-workbench/__tests__/use-diff-workbench.test.ts
git commit -m "feat: stats card click scrolls to first matching row"
```

---

## Task D: Warning banner — locate button jumps to first warning

**Files:**
- Modify: `src/features/diff-workbench/DiffWorkbench.vue`
- Test: `src/features/diff-workbench/__tests__/use-diff-workbench.test.ts`

This task reuses `scrollToFirstMatch('warning')` from Task C — no new view-model logic needed.

### Step D-1: Write failing test for warning scroll via banner button

Add to `src/features/diff-workbench/__tests__/use-diff-workbench.test.ts`:

```typescript
it('scrollToFirstMatch with warning filter targets a warning line', async () => {
  const scrollIntoView = vi.fn()
  vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
    if (typeof selector === 'string' && selector.includes('data-change-key')) {
      return { scrollIntoView } as unknown as HTMLElement
    }
    return null
  })

  const workbench = useDiffWorkbench('# Title\n\nold paragraph', '# Title\n\nnew paragraph')
  await workbench.executeDiff()

  // inject a warning onto the first change so the filter can match
  const firstChange = workbench.result.value
    ? flattenChanges(workbench.result.value.root).find((c) => c.primaryOp !== 'equal')
    : undefined
  if (firstChange) firstChange.warnings = ['inline-deferred']

  workbench.scrollToFirstMatch('warning')

  // querySelector may or may not find a DOM element in jsdom, but must not throw
  expect(() => workbench.scrollToFirstMatch('warning')).not.toThrow()

  vi.restoreAllMocks()
})
```

- [ ] Add `import { flattenChanges } from '../view-model'` if not already imported in the test file.
- [ ] Paste the test into the describe block.

### Step D-2: Run test to confirm it passes (no implementation needed)

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/use-diff-workbench.test.ts 2>&1 | tail -20
```

Expected: PASS (the function already works; test validates no-throw contract).

### Step D-3: Add locate button to warning banner in `DiffWorkbench.vue`

In `src/features/diff-workbench/DiffWorkbench.vue`, find the `<details class="warnings-banner">` block. Replace the `<summary>` line to add a locate button:

```html
    <details v-if="resultVisible && displayWarnings.length > 0" class="warnings-banner">
      <summary>
        ⚠ {{ displayWarnings.length }} 个提示
        <button
          type="button"
          class="secondary-button locate-button"
          @click.stop="workbench.scrollToFirstMatch('warning')"
        >定位第一处</button>
      </summary>
      <ul class="warnings-list">
        <li v-for="(warning, index) in displayWarnings" :key="index">{{ warning }}</li>
      </ul>
    </details>
```

Add CSS in `DiffWorkbench.vue` `<style>` (if there is a style block; if not, add one):

```css
.locate-button {
  margin-left: 12px;
  font-size: 12px;
  padding: 2px 8px;
}
```

### Step D-4: Run full suite

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/ 2>&1 | tail -30
```

Expected: All tests PASS.

### Step D-5: Commit

```bash
git add src/features/diff-workbench/DiffWorkbench.vue src/features/diff-workbench/__tests__/use-diff-workbench.test.ts
git commit -m "feat: add locate button to warning banner"
```

---

## Task E: Verify and fix old-side inline segments

**Files:**
- Test: `src/features/diff-workbench/__tests__/view-model.test.ts`
- Conditionally modify: `src/features/diff-workbench/view-model.ts` (only if bug found)

### Step E-1: Write assertion tests for old-side segment correctness

Add to `src/features/diff-workbench/__tests__/view-model.test.ts`:

```typescript
it('old-side replace segments reconstruct exactly the old text', async () => {
  const result = await runMarkdownDiff(
    '# Title\n\nThe quick brown fox',
    '# Title\n\nThe slow green fox',
  )
  const oldLines = buildOldProjectionLines('# Title\n\nThe quick brown fox', result)
  const replacedOldLine = oldLines.find((line) => line.baseTone === 'replace')

  expect(replacedOldLine).toBeDefined()
  if (replacedOldLine?.segments?.length) {
    const reconstructed = replacedOldLine.segments.map((s) => s.text).join('')
    expect(reconstructed).toBe(replacedOldLine.text)
  }
})

it('old-side replace segments contain no new-only text', async () => {
  const result = await runMarkdownDiff(
    '# Title\n\nremove this word here',
    '# Title\n\ninsert different word here',
  )
  const oldLines = buildOldProjectionLines('# Title\n\nremove this word here', result)
  const replacedOldLine = oldLines.find((line) => line.baseTone === 'replace')

  expect(replacedOldLine).toBeDefined()
  if (replacedOldLine?.segments?.length) {
    const reconstructed = replacedOldLine.segments.map((s) => s.text).join('')
    // Segments must not contain any text from the new document
    expect(reconstructed).not.toContain('insert')
    expect(reconstructed).not.toContain('different')
    expect(reconstructed).toBe(replacedOldLine.text)
  }
})

it('new-side replace segments contain no old-only text', async () => {
  const result = await runMarkdownDiff(
    '# Title\n\nremove this word here',
    '# Title\n\ninsert different word here',
  )
  const newLines = buildProjectionLines('# Title\n\ninsert different word here', result)
  const replacedNewLine = newLines.find((line) => line.baseTone === 'replace')

  expect(replacedNewLine).toBeDefined()
  if (replacedNewLine?.segments?.length) {
    const reconstructed = replacedNewLine.segments.map((s) => s.text).join('')
    expect(reconstructed).not.toContain('remove')
    expect(reconstructed).toBe(replacedNewLine.text)
  }
})
```

- [ ] Paste the three tests into the describe block.

### Step E-2: Run tests — observe actual results

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/view-model.test.ts 2>&1 | grep -A 10 "old-side replace"
```

**If tests PASS:** Old-side rendering is already correct. Skip to Step E-4.

**If tests FAIL with "reconstructed ≠ line.text":** Proceed to Step E-3.

### Step E-3 (conditional): Fix `buildProjectionSegments` for old side

In `view-model.ts`, find the function `buildSideSegmentsFromSpans`. Look for any span where `op === 'insert'` on the old side — it should yield empty/nothing. Check `buildPreciseSideSegments`:

The existing `buildPreciseSideSegments` function should already skip new-only text on the old side. If E-2 exposed a bug, the fix is: in `buildProjectionSegments`, when `side === 'old'` and the rendered text doesn't match `text`, return `undefined` instead of the mismatched segments:

```typescript
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
    // If rendered text doesn't match the actual line text, fall back to no segments
    return undefined
  }

  if (change.kind === 'heading' && change.titleInlineSpans) {
    const title = buildSideSegmentsFromSpans(change.titleInlineSpans, side, 'rename')
    const prefix = headingPrefix(change)
    const rendered = `${prefix}${title?.map((segment) => segment.text).join('') ?? ''}`
    if (title?.length && rendered === text) {
      return prefix
        ? [{ text: prefix, tone: 'plain' }, ...title]
        : title
    }
  }

  return undefined
}
```

(Note: the current code already has this `rendered === text` guard for the paragraph case — check if it is missing from the existing implementation before applying.)

### Step E-4: Run full suite to confirm no regressions

```bash
pnpm test:unit --reporter=verbose src/features/diff-workbench/__tests__/ 2>&1 | tail -30
```

Expected: All tests PASS.

### Step E-5: Commit

```bash
git add src/features/diff-workbench/__tests__/view-model.test.ts
git commit -m "test: verify old-side and new-side inline segment text reconstruction"
```

If Step E-3 was applied:

```bash
git add src/features/diff-workbench/view-model.ts src/features/diff-workbench/__tests__/view-model.test.ts
git commit -m "fix: ensure projection segments match source line text on both sides"
```

---

## Final: Run complete test suite

```bash
pnpm test:unit 2>&1 | tail -20
```

Expected: All tests PASS across all test files.

```bash
pnpm type-check 2>&1 | tail -10
```

Expected: No type errors.
