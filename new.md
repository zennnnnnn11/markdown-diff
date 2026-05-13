---
title: Markdown Diff Product Guide
version: 2.1.0
status: reviewed
owner: chen
review:
  required: true
  reviewer: dana
features:
  - parser
  - transformer
  - diff
  - renderer
limits:
  maxNodes: 15000
  timeoutMs: 2500
---

# Markdown Diff Product Guide

This guide explains how the Markdown diff engine should behave in real product scenarios.

## Summary

The engine compares Markdown documents by structure instead of raw lines.

It should recover semantic changes only when the evidence is strong enough.

## Installation

Install the package with pnpm.

```bash
pnpm add @acme/markdown-diff
```

Start the local preview server.

```bash
npm run dev
```

## Configuration

The default configuration favors balanced matching.

| Option | Default | Purpose |
| :--: | --: | :-- |
| minSimilarity | 0.8 | Minimum score for aligned nodes |
| detectMoves | true | Recover moved sections early |
| maxLocalCost | 15000 | Local alignment budget |
| enhancedLocalRecovery | true | Enable structural fallback |

```ts title="diff.config"
export default {
  minSimilarity: 0.75,
  detectMoves: true,
  enhancedLocalRecovery: false
}
```

Checklist:

- [x] Parse Markdown
- [x] Build section tree
- [x] Render visual diff
- [ ] Add virtual scrolling

## CLI Usage

The CLI accepts two Markdown files and writes a structured report.

```bash
mdiff old.md new.md --output report.json
```

The command exits with code `1` when differences are found.

## Architecture

The pipeline has four stages:

1. Parse Markdown into an AST
2. Transform the AST into sections
3. Build semantic indexes
4. Compare the two semantic trees

Each stage keeps context for later recovery.

## API Reference

The public API exposes a single high-level function.

```ts
diffMarkdownTrees(oldTree, newTree, {
  minSimilarity: 0.8
})
```

The return value contains the root change, stats, matches, and quality information.

## Rendering

The renderer consumes a diff tree and produces visual spans.

Inline changes are highlighted inside paragraphs.

> Rendering should not decide whether two nodes are the same entity.
> Rendering should expose conservative decisions with visible anchors.

The renderer must sanitize raw HTML before inserting it into the page.

## Examples

A paragraph edit should produce inline spans.

A moved section should keep a logical move id.

## Troubleshooting

If headings are repeated, add stronger surrounding anchors.

If a document is too large, lower the recovery budget.

## Security

:::warning{#trust .safe}
Diff output should be treated as data, not executable content.
:::

## Math Notes

The fallback score combines text and context.

The final score is computed as $s = 0.8t + 0.2c$.

## Performance

Large documents should use virtualized rendering.

Long code blocks may defer inline character-level spans.

## Release Notes

Version 2.0 introduced stable semantic matching.

Version 2.1 improves rendering details and metadata handling.

## References

Read the source link, the documentation link, and the implementation guide.[^semantic-design]

[source]: https://example.com/markdown-diff "Markdown Diff Repository"
[docs]: https://example.com/docs/v2 "Documentation v2"
[guide]: https://example.com/guide/diff-engine "Diff Engine Guide"

[^semantic-design]: The diff layer prefers conservative semantic recovery.
