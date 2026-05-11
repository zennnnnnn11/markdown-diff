/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Block, Section } from '../transformer'
import type { BacklinkIndex, DiffNode, SemanticIndex } from './types'
import {
  charikarSimHash,
  extractInlineStructure,
  extractNodeText,
  normalizeHeadingTitle,
  normalizeIdentifier,
  serializeInline,
  slugifyHeading,
  stableHash128,
  tokenizeText,
} from './utils'

export function buildSemanticIndex(root: Section, tree: 'old' | 'new'): SemanticIndex {
  const byId = new Map<string, DiffNode>()
  const nodesInPreorder: DiffNode[] = []
  const childrenById = new Map<string, string[]>()
  const byKind = new Map<string, string[]>()
  const byBlockType = new Map<string, string[]>()
  const byHeadingDepth = new Map<number, string[]>()
  const bySelfHash = new Map<string, string[]>()
  const byDirectHash = new Map<string, string[]>()
  const bySubtreeHash = new Map<string, string[]>()
  const byIdentityHash = new Map<string, string[]>()
  const byHeadingBodyHash = new Map<string, string[]>()
  const backlinks: BacklinkIndex = {
    footnotes: new Map(),
    definitions: new Map(),
  }

  visitSection(root, undefined, 0)

  return {
    tree,
    rootId: root.id,
    byId,
    nodesInPreorder,
    childrenById,
    byKind,
    byBlockType,
    byHeadingDepth,
    bySelfHash,
    byDirectHash,
    bySubtreeHash,
    byIdentityHash,
    byHeadingBodyHash,
    backlinks,
  }

  function visitSection(section: Section, parentId: string | undefined, siblingIndex: number): DiffNode {
    const logicalChildren = getLogicalChildren(section)
    const childNodes: DiffNode[] = []
    const preorder = nodesInPreorder.length
    const normalizedTitle = normalizeHeadingTitle(section.title)
    const titleTokens = tokenizeText(normalizedTitle)

    for (let index = 0; index < logicalChildren.length; index++) {
      const child = logicalChildren[index]!
      const childNode = isSection(child)
        ? visitSection(child, section.id, index)
        : visitBlock(child, section.id, index)
      childNodes.push(childNode)
    }

    const selfHash = computeSectionSelfHash(section, normalizedTitle)
    const directHash = stableHash128({
      selfHash,
      children: childNodes.map((child) => child.selfHash),
    })
    const subtreeHash = stableHash128({
      selfHash,
      children: childNodes.map((child) => child.subtreeHash),
    })
    const identityHash = computeSectionIdentityHash(section, childNodes)
    const headingBodyHash = computeHeadingBodyHash(section, childNodes)
    const text = extractNodeText(section)
    const textTokens = tokenizeText(text)
    const node: DiffNode = {
      id: section.id,
      tree,
      entity: 'section',
      raw: section,
      section,
      kind: section.kind,
      parentId,
      preorder,
      subtreeSize: 1 + childNodes.reduce((total, child) => total + child.subtreeSize, 0),
      siblingIndex,
      selfHash,
      directHash,
      subtreeHash,
      identityHash,
      contentOnlyHash: stableHash128(text),
      headingBodyHash,
      textSimHash: charikarSimHash(textTokens),
      normalizedTitle,
      titleSlug: slugifyHeading(section.title),
      titleTokens,
      textTokens,
    }

    byId.set(node.id, node)
    nodesInPreorder.push(node)
    childrenById.set(
      node.id,
      childNodes.map((child) => child.id),
    )
    addToMap(byKind, section.kind, node.id)
    if (section.headingDepth !== undefined) addToMap(byHeadingDepth, section.headingDepth, node.id)
    addToMap(bySelfHash, selfHash, node.id)
    addToMap(byDirectHash, directHash, node.id)
    addToMap(bySubtreeHash, subtreeHash, node.id)
    addToMap(byIdentityHash, identityHash, node.id)
    if (headingBodyHash) addToMap(byHeadingBodyHash, headingBodyHash, node.id)

    return node
  }

  function visitBlock(block: Block, parentId: string | undefined, siblingIndex: number): DiffNode {
    const preorder = nodesInPreorder.length
    const selfHash = computeBlockSelfHash(block)
    const text = extractNodeText(block)
    const textTokens = tokenizeText(text)
    const node: DiffNode = {
      id: block.id,
      tree,
      entity: 'block',
      raw: block,
      block,
      blockType: block.type,
      parentId,
      preorder,
      subtreeSize: 1,
      siblingIndex,
      selfHash,
      directHash: selfHash,
      subtreeHash: selfHash,
      identityHash: computeBlockIdentityHash(block),
      contentOnlyHash: stableHash128(text),
      textSimHash: charikarSimHash(textTokens),
      titleTokens: [],
      textTokens,
    }

    byId.set(node.id, node)
    nodesInPreorder.push(node)
    childrenById.set(node.id, [])
    addToMap(byBlockType, block.type, node.id)
    addToMap(bySelfHash, selfHash, node.id)
    addToMap(byDirectHash, selfHash, node.id)
    addToMap(bySubtreeHash, selfHash, node.id)
    addToMap(byIdentityHash, node.identityHash, node.id)
    registerBacklinks(block, node.id)

    return node
  }

  function registerBacklinks(block: Block, blockId: string): void {
    if (block.type === 'footnoteReference') {
      addToMap(backlinks.footnotes, normalizeIdentifier((block as any).identifier), blockId)
    }
    if (block.type === 'linkReference' || block.type === 'imageReference' || block.type === 'definition') {
      addToMap(backlinks.definitions, normalizeIdentifier((block as any).identifier), blockId)
    }
    if (Array.isArray(block.children)) {
      for (const child of block.children) {
        registerBacklinks(child, blockId)
      }
    }
  }
}

function getLogicalChildren(section: Section): Array<Section | Block> {
  const items = [...section.items]
  if (section.kind === 'root') {
    if (section.definitions) {
      for (const definition of section.definitions) {
        if (!items.some((item) => item.id === definition.id)) items.push(definition)
      }
    }
    if (section.footnotes) {
      for (const footnote of section.footnotes) {
        if (!items.some((item) => item.id === footnote.id)) items.push(footnote)
      }
    }
  }
  return items
}

function computeSectionSelfHash(section: Section, normalizedTitle: string): string {
  return stableHash128({
    kind: section.kind,
    title: normalizedTitle,
    headingDepth: section.headingDepth,
    listDepth: section.listDepth,
    quoteDepth: section.quoteDepth,
    checked: section.checked,
    ordered: section.ordered,
    identifier: extractSectionIdentifier(section),
    frontmatterType: section.frontmatterType,
    frontmatterValue: section.frontmatterValue,
    heading: section.heading ? computeBlockSelfHash(section.heading) : undefined,
  })
}

function computeSectionIdentityHash(section: Section, childNodes: DiffNode[]): string {
  if (section.kind === 'footnote') {
    return stableHash128({
      kind: section.kind,
      children: childNodes.map((child) => child.subtreeHash),
    })
  }
  return computeSectionSelfHash(section, normalizeHeadingTitle(section.title))
}

function computeHeadingBodyHash(section: Section, childNodes: DiffNode[]): string | undefined {
  if (section.kind !== 'heading') return undefined
  return stableHash128({
    headingDepth: section.headingDepth,
    listDepth: section.listDepth,
    quoteDepth: section.quoteDepth,
    children: childNodes.map((child) => child.subtreeHash),
  })
}

function computeBlockSelfHash(block: Block): string {
  const inlineChildren = Array.isArray(block.children) ? block.children.map((child) => serializeInline(child)) : undefined
  return stableHash128({
    type: block.type,
    value: block.value,
    lang: (block as any).lang,
    meta: (block as any).meta,
    checked: (block as any).checked,
    identifier: (block as any).identifier,
    title: (block as any).title,
    url: (block as any).url,
    align: (block as any).align,
    depth: (block as any).depth,
    ordered: (block as any).ordered,
    start: (block as any).start,
    spread: (block as any).spread,
    children: inlineChildren,
    structure: extractInlineStructure(block),
  })
}

function computeBlockIdentityHash(block: Block): string {
  if (block.type === 'definition') {
    return stableHash128({
      type: block.type,
      url: (block as any).url,
      title: (block as any).title,
      label: (block as any).label,
    })
  }
  return computeBlockSelfHash(block)
}

function extractSectionIdentifier(section: Section): string | undefined {
  if (section.kind !== 'footnote') return undefined
  return normalizeIdentifier((section.heading as any)?.identifier)
}

function addToMap<K>(map: Map<K, string[]>, key: K, value: string): void {
  const existing = map.get(key)
  if (existing) {
    existing.push(value)
    return
  }
  map.set(key, [value])
}

function isSection(value: Section | Block): value is Section {
  return 'kind' in value
}
