# Claude-Style Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded hex colors with a CSS custom-property token system and restyle every component to match Claude's warm, clean aesthetic with zero functional changes.

**Architecture:** A new `src/style.css` holds all design tokens and the shared utility classes (tone backgrounds, annotation chips) currently duplicated across three Vue files. `src/main.ts` imports it once. Every Vue component drops its inline hex literals and duplicate utility CSS in favour of the global tokens and their own scoped structural CSS.

**Tech Stack:** Pure CSS custom properties, Vue 3 scoped styles, no external libraries.

---

## File Map

| File | Change |
|------|--------|
| `src/style.css` | **Create** — all tokens + global utility classes |
| `src/main.ts` | **Modify** — add `import './style.css'` |
| `src/features/diff-workbench/DiffWorkbench.vue` | **Modify** — remove `:global` rules, apply tokens to shell/header/tabs/banner |
| `src/features/diff-workbench/components/DiffInputPanel.vue` | **Modify** — apply tokens to panel, textareas, buttons, spinner |
| `src/features/diff-workbench/components/DiffStatsBar.vue` | **Modify** — apply tokens to panel and stat cards |
| `src/features/diff-workbench/components/UnifiedDiffTable.vue` | **Modify** — apply tokens, remove duplicate tone/annotation CSS |
| `src/features/diff-workbench/components/DiffProjectionTable.vue` | **Modify** — apply tokens, remove duplicate tone/annotation CSS |
| `src/features/diff-workbench/components/DiffDetailModal.vue` | **Modify** — apply tokens, remove duplicate tone/annotation CSS |
| `src/features/diff-workbench/components/DiffDebugPanel.vue` | **Modify** — apply tokens to borders and backgrounds |

There are no logic, template structure, TypeScript, or test changes anywhere in this plan.

---

## Task 1: Create `src/style.css` with all tokens and global utilities

This is the foundation. All subsequent tasks depend on the CSS custom properties defined here.

**Files:**
- Create: `src/style.css`
- Modify: `src/main.ts`

- [ ] **Step 1-1: Create `src/style.css`**

Create `src/style.css` with this exact content:

```css
/* ─── Design Tokens ─────────────────────────────────────── */
:root {
  /* Surfaces */
  --bg-page:    #FAF9F7;
  --bg-surface: #FFFFFF;
  --bg-subtle:  #F5F3F0;
  --bg-muted:   #EDEAE5;

  /* Borders */
  --border:        #E5E0D8;
  --border-subtle: #EDE9E3;

  /* Text */
  --text-primary:   #1A1918;
  --text-secondary: #6B6560;
  --text-muted:     #9E9892;

  /* Accent (Claude coral) */
  --accent:        #D97757;
  --accent-subtle: #FDF4F0;

  /* Diff tone backgrounds */
  --tone-insert-bg:  #E4F4EB;
  --tone-delete-bg:  #FDEEF1;
  --tone-replace-bg: #FEF3E2;
  --tone-move-bg:    #EAF0FB;
  --tone-meta-bg:    #F3EDFB;
  --tone-rename-bg:  #FDFAE0;
  --tone-reorder-bg: #F0EDE8;
  --tone-blank-bg:   #F5F3F0;

  /* Diff tone text */
  --tone-insert-text:  #1B5E36;
  --tone-delete-text:  #8E1B27;
  --tone-replace-text: #7A4B10;
  --tone-move-text:    #2B4A8D;
  --tone-meta-text:    #5B3A9B;
  --tone-rename-text:  #786A10;

  /* Diff tone borders (annotation chips) */
  --tone-insert-border:  #7DC99A;
  --tone-delete-border:  #E8A0B2;
  --tone-replace-border: #DEAF72;
  --tone-move-border:    #95B0E8;
  --tone-meta-border:    #BBA8E8;
  --tone-rename-border:  #CCC090;

  /* Warnings */
  --warning-bg:     #FFFBF0;
  --warning-border: #D4A84B;
  --warning-text:   #8A6000;

  /* Shape */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Shadow */
  --shadow-sm: 0 1px 3px rgb(0 0 0 / 8%), 0 1px 2px rgb(0 0 0 / 5%);
  --shadow-md: 0 4px 16px rgb(0 0 0 / 10%), 0 2px 6px rgb(0 0 0 / 6%);
  --shadow-lg: 0 12px 40px rgb(0 0 0 / 14%), 0 4px 12px rgb(0 0 0 / 8%);

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Berkeley Mono", ui-monospace, "Cascadia Code", "Fira Code", monospace;
}

/* ─── Global Reset ───────────────────────────────────────── */
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--bg-page);
  color: var(--text-primary);
}

/* ─── Tone Row Backgrounds ───────────────────────────────── */
.tone-plain   { background: transparent; }
.tone-insert  { background: var(--tone-insert-bg); }
.tone-delete  { background: var(--tone-delete-bg); }
.tone-replace { background: var(--tone-replace-bg); }
.tone-move    { background: var(--tone-move-bg); }
.tone-meta    { background: var(--tone-meta-bg); }
.tone-rename  { background: var(--tone-rename-bg); }
.tone-reorder { background: var(--tone-reorder-bg); }
.tone-blank   { background: var(--tone-blank-bg); }

/* ─── Annotation Chips ───────────────────────────────────── */
.annotation-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
  background: var(--bg-surface);
  color: var(--text-secondary);
}

.annotation-insert {
  border-color: var(--tone-insert-border);
  color: var(--tone-insert-text);
}

.annotation-delete {
  border-color: var(--tone-delete-border);
  color: var(--tone-delete-text);
}

.annotation-replace {
  border-color: var(--tone-replace-border);
  color: var(--tone-replace-text);
}

.annotation-move,
.annotation-reorder {
  border-color: var(--tone-move-border);
  color: var(--tone-move-text);
}

.annotation-meta,
.annotation-rename {
  border-color: var(--tone-meta-border);
  color: var(--tone-meta-text);
}

.annotation-warning {
  border-color: var(--warning-border);
  background: var(--warning-bg);
  color: var(--warning-text);
}

.annotation-overlap {
  border-color: var(--border);
  background: var(--bg-subtle);
  color: var(--text-secondary);
}
```

- [ ] **Step 1-2: Import `style.css` in `src/main.ts`**

Read `src/main.ts`. It currently starts with `import { createApp } from 'vue'`. Add one line at the very top:

```typescript
import './style.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
```

- [ ] **Step 1-3: Verify dev server starts without errors**

```
pnpm dev
```

Expected: Server starts, no CSS parse errors in console. Page background changes from `#fff` to `#FAF9F7` (warm off-white).

- [ ] **Step 1-4: Commit**

```
git add src/style.css src/main.ts
git commit -m "feat: add Claude design token system to style.css"
```

---

## Task 2: Restyle `DiffWorkbench.vue` (shell, header, tabs, warnings banner)

**Files:**
- Modify: `src/features/diff-workbench/DiffWorkbench.vue`

- [ ] **Step 2-1: Replace the entire `<style scoped>` block**

Read `src/features/diff-workbench/DiffWorkbench.vue`. Find the `<style scoped>` block (lines 227–307). Replace it entirely with:

```css
<style scoped>
.app-shell {
  display: grid;
  gap: 16px;
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.page-header h1 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.page-header p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 2px 0 0;
}

.view-tabs {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.secondary-button {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms, border-color 120ms, color 120ms;
}

.secondary-button:hover {
  background: var(--bg-subtle);
  border-color: var(--border);
}

.secondary-button.active {
  border-color: var(--accent);
  background: var(--accent-subtle);
  color: var(--accent);
}

.projection-layout {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.warnings-banner {
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-md);
  background: var(--warning-bg);
  padding: 10px 14px;
  font-size: 14px;
}

.warnings-banner summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--warning-text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.warnings-list {
  margin: 8px 0 0 0;
  padding-left: 20px;
  color: var(--text-secondary);
}

.warnings-list li {
  font-family: var(--font-mono);
  font-size: 13px;
  word-break: break-all;
}

.locate-button {
  margin-left: 4px;
  font-size: 12px;
  padding: 2px 8px;
}

@media (max-width: 960px) {
  .projection-layout {
    grid-template-columns: 1fr;
  }
}
</style>
```

- [ ] **Step 2-2: Remove the `:global` rules from the template**

In the same file, the old style block contained `:global(body)` and `:global(*)`. These are now handled by `style.css`. They were inside `<style scoped>` and are already removed by replacing the whole block in Step 2-1, so nothing extra is needed here.

- [ ] **Step 2-3: Verify visually**

```
pnpm dev
```

Expected: Header shows "Markdown Diff" with quiet subtitle below it. View tabs are pill-shaped with warm-coral active state instead of GitHub blue.

- [ ] **Step 2-4: Commit**

```
git add src/features/diff-workbench/DiffWorkbench.vue
git commit -m "style: apply Claude tokens to DiffWorkbench shell and header"
```

---

## Task 3: Restyle `DiffInputPanel.vue`

**Files:**
- Modify: `src/features/diff-workbench/components/DiffInputPanel.vue`

- [ ] **Step 3-1: Replace the entire `<style scoped>` block**

Read `src/features/diff-workbench/components/DiffInputPanel.vue`. Replace its `<style scoped>` block (lines 63–138) with:

```css
<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  background: var(--bg-surface);
}

.panel-header,
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.editor-toolbar label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.editor-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 12px;
}

.editor-pane textarea {
  width: 100%;
  min-height: 280px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-primary);
  padding: 10px 12px;
  outline: none;
  transition: border-color 150ms, box-shadow 150ms;
  margin-top: 6px;
}

.editor-pane textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgb(217 119 87 / 12%);
  background: var(--bg-surface);
}

button {
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #fff;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 150ms;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button:not(:disabled):hover {
  opacity: 0.88;
}

.secondary-button {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.secondary-button:hover {
  background: var(--bg-muted);
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.hint {
  color: var(--text-muted);
  font-size: 13px;
  margin: 0;
}

.error-text {
  color: var(--tone-delete-text);
  font-size: 13px;
  margin-top: 8px;
}

@media (max-width: 960px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
```

- [ ] **Step 3-2: Verify visually**

```
pnpm dev
```

Expected: Run button is coral/terracotta. Textareas have warm border and focus glow. Clear buttons are subtle.

- [ ] **Step 3-3: Commit**

```
git add src/features/diff-workbench/components/DiffInputPanel.vue
git commit -m "style: apply Claude tokens to DiffInputPanel"
```

---

## Task 4: Restyle `DiffStatsBar.vue`

**Files:**
- Modify: `src/features/diff-workbench/components/DiffStatsBar.vue`

- [ ] **Step 4-1: Replace the entire `<style scoped>` block**

Read `src/features/diff-workbench/components/DiffStatsBar.vue`. Replace its `<style scoped>` block (lines 51–87) with:

```css
<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  background: var(--bg-surface);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.panel-header details summary {
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
}

.stats-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: 10px 14px;
  cursor: pointer;
  text-align: left;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 150ms, transform 150ms;
}

.stat-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.stat-card strong {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}

.stat-card span {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.stat-card small {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>
```

- [ ] **Step 4-2: Verify visually**

```
pnpm dev
```

Expected: Stat cards are white with a very slight shadow. Hovering lifts them with a slightly stronger shadow.

- [ ] **Step 4-3: Commit**

```
git add src/features/diff-workbench/components/DiffStatsBar.vue
git commit -m "style: apply Claude tokens to DiffStatsBar"
```

---

## Task 5: Restyle `UnifiedDiffTable.vue`

This task removes the large block of duplicated `.tone-*` and `.annotation-*` CSS (now in `style.css`) and replaces all hardcoded hex values with tokens.

**Files:**
- Modify: `src/features/diff-workbench/components/UnifiedDiffTable.vue`

- [ ] **Step 5-1: Replace the entire `<style scoped>` block**

Read `src/features/diff-workbench/components/UnifiedDiffTable.vue`. Replace its `<style scoped>` block (lines 222–494) with:

```css
<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  background: var(--bg-surface);
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
  letter-spacing: 0.06em;
}

.unified-table {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow-y: auto;
  max-height: 70vh;
  font-family: var(--font-mono);
  font-size: 13px;
}

.unified-header-row,
.unified-row {
  display: grid;
  grid-template-columns: 52px 64px minmax(0, 1fr) 20px 64px minmax(0, 1fr);
}

.unified-header-row {
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.unified-header-row > * {
  padding: 7px 10px;
}

.side-heading-old {
  grid-column: 2 / 4;
  border-right: 1px solid var(--border-subtle);
}

.side-heading-new {
  grid-column: 5 / 7;
}

.row-index {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 8px;
  border-right: 1px solid var(--border);
  background: var(--bg-subtle);
  color: var(--text-muted);
  font-size: 11px;
  user-select: none;
}

.row-index-header {
  justify-content: center;
}

.center-gap {
  background:
    linear-gradient(90deg, var(--border-subtle) 0 1px, transparent 1px),
    linear-gradient(90deg, transparent calc(100% - 1px), var(--border) calc(100% - 1px));
}

.center-gap-header {
  padding: 0;
}

.unified-row {
  border-top: 1px solid var(--border-subtle);
  min-height: 28px;
}

.unified-row:first-child {
  border-top: 0;
}

/* Gutters */
.gutter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-muted);
  user-select: none;
}

.gutter-old {
  border-right: 1px solid var(--border-subtle);
}

.gutter.interactive {
  cursor: pointer;
}

.gutter-badges {
  display: flex;
  align-items: center;
  gap: 4px;
}

.line-number {
  min-width: 24px;
  text-align: right;
}

.descendant-flag {
  color: var(--text-muted);
  font-size: 11px;
}

.overlap-flag {
  color: var(--text-secondary);
  font-size: 10px;
}

.warning-flag {
  color: var(--warning-text);
  font-size: 12px;
}

.move-peer-flag {
  color: var(--tone-move-text);
  font-size: 10px;
  font-weight: 600;
}

/* Cells */
.cell {
  padding: 4px 10px;
  white-space: pre-wrap;
  word-break: break-word;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.cell-old {
  border-right: 1px solid var(--border-subtle);
}

.cell.interactive {
  cursor: pointer;
}

.cell.active {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.cell.peer-highlight {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  opacity: 0.85;
}

/* Pair borders */
.cell.pair-match {
  border-left: 2px solid var(--text-primary);
}

.cell.pair-align {
  border-left: 2px dashed var(--text-muted);
}

/* Placeholder for height matching */
.placeholder-text {
  visibility: hidden;
}

.line-text {
  min-width: 0;
  flex: 1;
}

.segment {
  white-space: pre-wrap;
}

.cell-annotations {
  display: inline-flex;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

@media (max-width: 960px) {
  .unified-header-row,
  .unified-row {
    grid-template-columns: 44px 48px minmax(0, 1fr) 12px 48px minmax(0, 1fr);
  }
}
</style>
```

- [ ] **Step 5-2: Run the unit tests to confirm no regressions**

```
pnpm test:unit 2>&1 | tail -10
```

Expected: All tests pass (CSS changes cannot break logic tests).

- [ ] **Step 5-3: Verify visually**

```
pnpm dev
```

Expected: Diff table uses warm borders. Active outline is coral. Gutters are warm muted gray. Tone row backgrounds are softer (warm off-white tints vs the previous GitHub greens/reds).

- [ ] **Step 5-4: Commit**

```
git add src/features/diff-workbench/components/UnifiedDiffTable.vue
git commit -m "style: apply Claude tokens to UnifiedDiffTable, remove duplicate tone/annotation CSS"
```

---

## Task 6: Restyle `DiffProjectionTable.vue`

**Files:**
- Modify: `src/features/diff-workbench/components/DiffProjectionTable.vue`

- [ ] **Step 6-1: Replace the entire `<style scoped>` block**

Read `src/features/diff-workbench/components/DiffProjectionTable.vue`. Replace its `<style scoped>` block (lines 124–334) with:

```css
<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  background: var(--bg-surface);
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
  letter-spacing: 0.06em;
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
}

.projection-row:first-child {
  border-top: 0;
}

.projection-row.interactive {
  cursor: pointer;
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
```

- [ ] **Step 6-2: Run unit tests**

```
pnpm test:unit 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 6-3: Commit**

```
git add src/features/diff-workbench/components/DiffProjectionTable.vue
git commit -m "style: apply Claude tokens to DiffProjectionTable, remove duplicate tone/annotation CSS"
```

---

## Task 7: Restyle `DiffDetailModal.vue`

**Files:**
- Modify: `src/features/diff-workbench/components/DiffDetailModal.vue`

- [ ] **Step 7-1: Replace the entire `<style scoped>` block**

Read `src/features/diff-workbench/components/DiffDetailModal.vue`. Replace its `<style scoped>` block (lines 272–494) with:

```css
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
```

- [ ] **Step 7-2: Verify visually**

```
pnpm dev
```

Click any changed row to open the detail modal. Expected: modal has `border-radius: 12px`, large shadow, warm border. Move info callout uses soft periwinkle. Old title has soft rose strikethrough.

- [ ] **Step 7-3: Commit**

```
git add src/features/diff-workbench/components/DiffDetailModal.vue
git commit -m "style: apply Claude tokens to DiffDetailModal, remove duplicate tone CSS"
```

---

## Task 8: Restyle `DiffDebugPanel.vue`

**Files:**
- Modify: `src/features/diff-workbench/components/DiffDebugPanel.vue`

- [ ] **Step 8-1: Read the current style block**

Read `src/features/diff-workbench/components/DiffDebugPanel.vue` to see its current CSS.

- [ ] **Step 8-2: Replace all hardcoded hex colors in `<style scoped>`**

Replace the `<style scoped>` block with a version that uses tokens. Based on the debug panel's typical structure (JSON `<pre>` blocks in a 2-column grid), the replacement is:

```css
<style scoped>
.debug-panel {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.debug-pane {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: 12px;
  overflow: auto;
}

.debug-pane h3 {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin: 0 0 8px;
}

.debug-pane pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 960px) {
  .debug-panel {
    grid-template-columns: 1fr;
  }
}
</style>
```

**Important:** Read the actual file first (Step 8-1). If the class names in `DiffDebugPanel.vue` are different from `.debug-panel` / `.debug-pane`, use the actual class names and adjust the CSS above to match them.

- [ ] **Step 8-3: Run unit tests**

```
pnpm test:unit 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 8-4: Commit**

```
git add src/features/diff-workbench/components/DiffDebugPanel.vue
git commit -m "style: apply Claude tokens to DiffDebugPanel"
```

---

## Task 9: Final verification

- [ ] **Step 9-1: Run full test suite**

```
pnpm test:unit 2>&1 | tail -20
```

Expected: All 1546 tests pass (CSS changes cannot affect logic tests).

- [ ] **Step 9-2: Run type-check**

```
pnpm type-check 2>&1 | tail -10
```

Expected: No errors.

- [ ] **Step 9-3: Manual smoke test in browser**

```
pnpm dev
```

Check all three view modes:
1. **Input area** — coral run button, warm-focused textarea
2. **Unified view** — run a diff with inserts, deletes, replaces, moves; verify tone rows are visible with warmer palette; click a row and verify the detail modal has round corners and large shadow
3. **Source view** — verify two projection panes side-by-side each have warm panel borders; gutter line numbers are muted gray; annotation chips are readable
4. **Stats bar** — cards have slight shadow; hover lifts; active filter outline is coral
5. **Warning banner** (add a large document to trigger inline-deferred warnings) — warm amber background and text

- [ ] **Step 9-4: Check that no hardcoded hex colors remain in `.vue` files**

```
pnpm grep -r "#[0-9a-fA-F]\{3,6\}" src/features/diff-workbench --include="*.vue"
```

If any remain that are not referenced elsewhere (e.g., a one-off color for something not covered by tokens), either add a new token for it in `src/style.css` and use it, or leave it if it's intentional and isolated (document why in a comment).

- [ ] **Step 9-5: Final commit**

```
git add -A
git commit -m "style: complete Claude-style visual redesign with CSS token system"
```
