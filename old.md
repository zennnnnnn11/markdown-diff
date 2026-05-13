---
title: Markdown Diff Product Guide
version: 2.0.0
status: draft
owner: alice
review:
  required: true
  reviewer: bob
features:
  - parser
  - transformer
  - diff
limits:
  maxNodes: 10000
  timeoutMs: 2500
---

# Markdown Diff Product Guide

This guide explains how the Markdown diff engine should behave in real product scenarios.

## Overview

The engine compares Markdown documents by structure instead of raw lines.

It should recover semantic changes only when the evidence is strong enough.

## Installation

Install the package with npm.

```bash
npm install @acme/markdown-diff
```

Start the local preview server.

```bash
npm run dev
```

## Concepts

A semantic diff should distinguish identity from position.

A visual diff should only present decisions made by the engine.

## Architecture

The pipeline has four stages:

1. Parse Markdown into an AST
2. Transform the AST into sections
3. Build semantic indexes
4. Compare the two semantic trees

Each stage keeps metadata for later recovery.

## Configuration

The default configuration favors conservative matching.

| Option | Default | Purpose |
| :-- | --: | :-- |
| minSimilarity | 0.75 | Minimum score for aligned nodes |
| detectMoves | true | Recover moved sections |
| maxLocalCost | 10000 | Local alignment budget |
| enhancedLocalRecovery | false | Enable structural fallback |

```js title="diff.config"
export default {
  minSimilarity: 0.75,
  detectMoves: true,
  enhancedLocalRecovery: false
}
```

Checklist:

- [x] Parse Markdown
- [x] Build section tree
- [ ] Render visual diff
- [ ] Add virtual scrolling

## CLI Usage

The CLI accepts two Markdown files and writes a structured report.

```bash
mdiff old.md new.md --output report.json
```

The command exits with code `1` when differences are found.

## API Reference

The public API exposes a single high-level function.

```ts
diffMarkdownTrees(oldTree, newTree, {
  minSimilarity: 0.75
})
```

The return value contains the root change, stats, matches, and quality information.

## Rendering

The renderer consumes a diff tree and produces visual spans.

Inline changes are shown inside paragraphs.

> Rendering should not decide whether two nodes are the same entity.

The renderer must escape raw HTML before inserting it into the page.

## Security

:::note{#trust .safe}
Diff output should be treated as data, not executable content.
:::

## Troubleshooting

If a document is too large, lower the recovery budget.

If headings are repeated, add stronger surrounding anchors.

## Examples

A paragraph edit should produce inline spans.

A moved section should keep a logical move id.

## Math Notes

The fallback score combines text and context.

The final score is computed as $s = 0.7t + 0.3c$.

## Release Notes

Version 2.0 introduced stable semantic matching.

Version 2.1 will improve rendering details.

## References

Read the repository link, the documentation link, and the design specification.[^design]

[repo]: https://example.com/markdown-diff "Markdown Diff Repository"
[docs]: https://example.com/docs/v1 "Documentation v1"
[spec]: https://example.com/spec/semantic-diff "Semantic Diff Specification"

[^design]: The diff layer prefers conservative semantic recovery.
