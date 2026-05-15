# Claude-Style Visual Redesign

**Goal:** Replace all hardcoded hex values with a CSS custom-property token system and restyle every component to match Claude's warm, clean aesthetic — with no functional changes.

**Architecture:** A new `src/style.css` becomes the single source of truth for all design tokens and shared utility classes (tone backgrounds, annotation chips). Every `.vue` file drops its inline hex literals and duplicate utility CSS in favour of the global tokens. `src/main.ts` imports `style.css` once.

**Tech Stack:** Pure CSS (custom properties), Vue 3 scoped styles, no external libraries.

---

## Design Tokens

All defined in `src/style.css` under `:root`.

### Surfaces
```css
--bg-page:    #FAF9F7;   /* warm off-white page */
--bg-surface: #FFFFFF;   /* card / panel surface */
--bg-subtle:  #F5F3F0;   /* gutter, inset areas */
--bg-muted:   #EDEAE5;   /* hover, code blocks */
```

### Borders
```css
--border:        #E5E0D8;   /* panels, tables, cards */
--border-subtle: #EDE9E3;   /* row dividers */
```

### Text
```css
--text-primary:   #1A1918;
--text-secondary: #6B6560;
--text-muted:     #9E9892;
```

### Accent (Claude coral)
```css
--accent:        #D97757;
--accent-subtle: #FDF4F0;
```

### Diff tone backgrounds
```css
--tone-insert-bg:  #E4F4EB;
--tone-delete-bg:  #FDEEF1;
--tone-replace-bg: #FEF3E2;
--tone-move-bg:    #EAF0FB;
--tone-meta-bg:    #F3EDFB;
--tone-rename-bg:  #FDFAE0;
--tone-reorder-bg: #F0EDE8;
--tone-blank-bg:   #F5F3F0;
```

### Diff tone text (for annotations and segments)
```css
--tone-insert-text:  #1B5E36;
--tone-delete-text:  #8E1B27;
--tone-replace-text: #7A4B10;
--tone-move-text:    #2B4A8D;
--tone-meta-text:    #5B3A9B;
--tone-rename-text:  #786A10;
```

### Diff tone borders (for annotation chips)
```css
--tone-insert-border:  #7DC99A;
--tone-delete-border:  #E8A0B2;
--tone-replace-border: #DEAF72;
--tone-move-border:    #95B0E8;
--tone-meta-border:    #BBA8E8;
--tone-rename-border:  #CCC090;
```

### Warning
```css
--warning-bg:     #FFFBF0;
--warning-border: #D4A84B;
--warning-text:   #8A6000;
```

### Shape & shadow
```css
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--shadow-sm: 0 1px 3px rgb(0 0 0 / 8%), 0 1px 2px rgb(0 0 0 / 5%);
--shadow-md: 0 4px 16px rgb(0 0 0 / 10%), 0 2px 6px rgb(0 0 0 / 6%);
--shadow-lg: 0 12px 40px rgb(0 0 0 / 14%), 0 4px 12px rgb(0 0 0 / 8%);
```

### Typography
```css
--font-sans: -apple-system, BlinkMacSystemFont, "Inter", ui-sans-serif, system-ui, sans-serif;
--font-mono: "Berkeley Mono", ui-monospace, "Cascadia Code", "Fira Code", monospace;
```

---

## Global Utility Classes (in `src/style.css`, non-scoped)

### Tone row backgrounds
```css
.tone-plain    { background: transparent; }
.tone-insert   { background: var(--tone-insert-bg); }
.tone-delete   { background: var(--tone-delete-bg); }
.tone-replace  { background: var(--tone-replace-bg); }
.tone-move     { background: var(--tone-move-bg); }
.tone-meta     { background: var(--tone-meta-bg); }
.tone-rename   { background: var(--tone-rename-bg); }
.tone-reorder  { background: var(--tone-reorder-bg); }
.tone-blank    { background: var(--tone-blank-bg); }
```

### Annotation chips (base + per-tone variants)
```css
.annotation-chip { ... }       /* base pill shape */
.annotation-insert { ... }
.annotation-delete { ... }
.annotation-replace { ... }
.annotation-move, .annotation-reorder { ... }
.annotation-meta, .annotation-rename { ... }
.annotation-warning { ... }
.annotation-overlap { ... }
```

These classes are currently duplicated verbatim in `UnifiedDiffTable.vue`, `DiffProjectionTable.vue`, and `DiffDetailModal.vue`. Moving to `style.css` eliminates the duplication.

---

## File Changes

### `src/style.css` (create)
- `:root` block with all tokens above
- Global reset: `body { margin: 0; font-family: var(--font-sans); background: var(--bg-page); color: var(--text-primary); }`
- Global `* { box-sizing: border-box; }`
- All `.tone-*` utility classes
- All `.annotation-chip` and `.annotation-*` variant classes

### `src/main.ts` (modify)
- Add `import './style.css'` before app creation

### `DiffWorkbench.vue` (modify)
- Remove `:global(body)` and `:global(*)` rules (moved to style.css)
- Replace all hex literals with CSS vars
- Page header: smaller subtitle, quieter color (`--text-muted`)
- View tabs: pill shape (`border-radius: var(--radius-lg)`), active state uses `--accent` border + `--accent-subtle` background, text `--accent`
- Warnings banner: uses `--warning-*` tokens, `border-radius: var(--radius-md)`

### `DiffInputPanel.vue` (modify)
- `.panel`: `border: 1px solid var(--border)`, `border-radius: var(--radius-lg)`, `background: var(--bg-surface)`
- `textarea`: `border: 1px solid var(--border)`, `border-radius: var(--radius-md)`, `font-family: var(--font-mono)`, focus ring uses `--accent`
- Primary "运行比对" button: `background: var(--accent)`, `color: #fff`, `border: none`, `border-radius: var(--radius-md)`, hover darkens slightly
- Secondary buttons: `background: var(--bg-subtle)`, `border: 1px solid var(--border)`, `border-radius: var(--radius-md)`
- Spinner: border uses `--border`, top-color uses `--accent`
- Error text: `--tone-delete-text`

### `DiffStatsBar.vue` (modify)
- `.panel`: same as InputPanel
- `.stat-card`: `background: var(--bg-surface)`, `border: 1px solid var(--border)`, `border-radius: var(--radius-md)`, `box-shadow: var(--shadow-sm)`, hover `box-shadow: var(--shadow-md)`, `transition: box-shadow 150ms, transform 150ms`, hover `transform: translateY(-1px)`
- Card value (`strong`): larger, `--text-primary`
- Card label (`span`): `--text-secondary`
- Card description (`small`): `--text-muted`

### `UnifiedDiffTable.vue` (modify)
- Remove all `.tone-*` classes and all `.annotation-*` classes (now in style.css — scoped: false not needed; global classes work on elements rendered inside scoped components via `:deep` or by keeping them in the global sheet)
- `.panel`, `.unified-table`: use `--border`, `--radius-md`
- `.unified-header-row`: `background: var(--bg-subtle)`, `color: var(--text-secondary)`, `border-bottom: 1px solid var(--border)`
- `.row-index`: `background: var(--bg-subtle)`, `color: var(--text-muted)`, `border-right: 1px solid var(--border)`
- `.gutter`: `color: var(--text-muted)`, badges use respective `--tone-*-text` vars
- `.cell.active`: `outline: 2px solid var(--accent)`
- `.cell.peer-highlight`: `outline: 2px solid var(--accent)`, `opacity: 0.85`
- `.pair-match`: `border-left: 2px solid var(--text-primary)`
- `.pair-align`: `border-left: 2px dashed var(--text-muted)`
- `.center-gap`: updated gradient using `--border-subtle` and `--border`
- `.move-peer-flag`: `color: var(--tone-move-text)`
- `.warning-flag`: `color: var(--warning-text)`

### `DiffProjectionTable.vue` (modify)
- Same token substitutions as UnifiedDiffTable
- Remove duplicate `.tone-*` and `.annotation-*` classes
- `.projection-row.active`: `outline: 2px solid var(--accent)`
- `.projection-row.peer-highlight`: `outline: 2px solid var(--accent)`
- `.line-hint`: `color: var(--text-muted)`

### `DiffDetailModal.vue` (modify)
- `.modal-backdrop`: `background: rgb(15 18 25 / 50%)`
- `.modal-card`: `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-lg)`, `border: 1px solid var(--border)`, `background: var(--bg-surface)`
- `.pair-info`: `color: var(--text-secondary)`
- `.move-info`: `background: var(--tone-move-bg)`, `color: var(--text-primary)`, uses `--radius-md`
- `.backlink-info`: `background: var(--bg-subtle)`, `border: 1px solid var(--border)`, uses `--radius-md`
- `.content-card`: `border: 1px solid var(--border)`, `border-radius: var(--radius-md)`
- `.title-compare`: uses `--tone-rename-bg` / `--tone-rename-border`
- `.old-title`: `color: var(--tone-delete-text)`
- `.metadata-table th`: `background: var(--bg-subtle)`, `border: 1px solid var(--border)`
- Remove duplicate `.tone-*` classes
- `.secondary-button`: uses `--border`, `--bg-subtle`, `--radius-md`

### `DiffDebugPanel.vue` (modify — minimal)
- Replace the few hardcoded colors with tokens (borders, backgrounds)

---

## What Does NOT Change

- All HTML structure and Vue template logic
- All TypeScript / component logic
- All test files
- All accessibility attributes (role, aria-*)
- Font loading (system fonts only, no new imports)

---

## Self-Review

**Placeholder scan:** No TBD/TODO. All token values are concrete hex codes or calc expressions.

**Consistency:** Accent color `#D97757` is used for interactive elements (button fill, focus rings, active tab). All tone colors follow the pattern `--tone-{name}-{bg|text|border}`.

**Scope:** Single visual pass, no logic changes. Fits one implementation plan.

**Ambiguity:** `scoped` styles in Vue components cannot directly target global classes on child elements. The tone/annotation classes are applied to elements *inside* the same component where they're used (not child components), so global `.tone-*` and `.annotation-*` classes in `style.css` will apply correctly without `:deep`. Confirmed: Vue scoped styles block *inbound* styles from outside, but global stylesheet classes always apply to any element regardless of scoping.
