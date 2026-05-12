/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Block, Section } from '../transformer'
import type { BacklinkIndex, DiffNode, SemanticIndex } from './types'
import {
  charikarSimHash,
  extractInlineStructure,
  extractNodeText,
  hashCanonical,
  hashText,
  isSection,
  mergeSourceRanges,
  normalizeHeadingTitle,
  normalizeIdentifier,
  pathHashInput,
  slugifyHeading,
  sourceRangeFromPosition,
  structuredTextTokens,
  tokenizeText,
} from './utils'

interface IndexedRawNode {
  id: string
  sourceId: string
  tree: 'old' | 'new'
  raw: Section | Block
  entity: 'section' | 'block'
  kind?: Section['kind']
  blockType?: string
  parentId?: string
  siblingIndex: number
  pathParts: string[]
  logicalChildren: IndexedRawNode[]
}

export async function buildSemanticIndex(root: Section, tree: 'old' | 'new'): Promise<SemanticIndex> {
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
  const byPathHash = new Map<string, string[]>()
  const backlinks: BacklinkIndex = {
    footnotes: new Map(),
    definitions: new Map(),
  }
  let nextPreorder = 0

  const indexedRoot = buildLogicalTree(root, tree)
  await visit(indexedRoot, undefined, [])

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
    byPathHash,
    backlinks,
  }

  async function visit(
    current: IndexedRawNode,
    parentId: string | undefined,
    headingPath: string[],
  ): Promise<DiffNode> {
    const preorder = nextPreorder++
    const nextPath =
      current.entity === 'section' && current.kind === 'heading'
        ? [...headingPath, (current.raw as Section).title]
        : headingPath

    const childNodes: DiffNode[] = []
    for (let index = 0; index < current.logicalChildren.length; index++) {
      const child = current.logicalChildren[index]!
      childNodes.push(await visit(child, current.id, nextPath))
    }

    const baseNode = await createDiffNode(current, childNodes, parentId, preorder, nextPath)

    byId.set(baseNode.id, baseNode)
    nodesInPreorder[preorder] = baseNode
    childrenById.set(baseNode.id, childNodes.map((child) => child.id))
    if (baseNode.kind) addToMap(byKind, baseNode.kind, baseNode.id)
    if (baseNode.blockType) addToMap(byBlockType, baseNode.blockType, baseNode.id)
    if (baseNode.section?.headingDepth !== undefined) addToMap(byHeadingDepth, baseNode.section.headingDepth, baseNode.id)
    addToMap(bySelfHash, baseNode.selfHash, baseNode.id)
    addToMap(byDirectHash, baseNode.directHash, baseNode.id)
    addToMap(bySubtreeHash, baseNode.subtreeHash, baseNode.id)
    addToMap(byIdentityHash, baseNode.identityHash, baseNode.id)
    if (baseNode.headingBodyHash) addToMap(byHeadingBodyHash, baseNode.headingBodyHash, baseNode.id)
    if (baseNode.pathHash) addToMap(byPathHash, baseNode.pathHash, baseNode.id)

    if (baseNode.entity === 'block' && baseNode.block) {
      registerBacklinks(baseNode.block, baseNode.id)
    }
    if (baseNode.entity === 'section' && baseNode.section?.heading) {
      registerBacklinks(baseNode.section.heading, baseNode.id)
    }

    return baseNode
  }

  function registerBacklinks(block: Block, holderId: string): void {
    if (block.type === 'footnoteReference') {
      addToMap(backlinks.footnotes, normalizeIdentifier((block as any).identifier), holderId)
    }
    if (block.type === 'linkReference' || block.type === 'imageReference' || block.type === 'definition') {
      addToMap(backlinks.definitions, normalizeIdentifier((block as any).identifier), holderId)
    }
    if (Array.isArray(block.children)) {
      for (const child of block.children) registerBacklinks(child, holderId)
    }
  }
}

function buildLogicalTree(root: Section, tree: 'old' | 'new'): IndexedRawNode {
  return buildIndexedSection(root, tree, undefined, 0, [])
}

function buildIndexedSection(
  section: Section,
  tree: 'old' | 'new',
  parentId: string | undefined,
  siblingIndex: number,
  headingPath: string[],
): IndexedRawNode {
  const sourceId = section.id
  const id = section.id
  const nextPath = section.kind === 'heading' ? [...headingPath, section.title] : headingPath
  const items = section.kind === 'root' ? mergeRootLogicalItems(section, tree) : [...section.items]

  return {
    id,
    sourceId,
    tree,
    raw: section,
    entity: 'section',
    kind: section.kind,
    parentId,
    siblingIndex,
    pathParts: nextPath,
    logicalChildren: items.map((item, index) =>
      isSection(item)
        ? buildIndexedSection(item, tree, id, index, nextPath)
        : buildIndexedBlock(item, tree, id, index, nextPath),
    ),
  }
}

function mergeRootLogicalItems(root: Section, tree: 'old' | 'new'): Array<Block | Section> {
  const existingItems = [...root.items]
  const existingIds = new Set(existingItems.map((item) => item.id))
  const syntheticItems: Array<Block | Section> = []

  for (const [index, definition] of (root.definitions ?? []).entries()) {
    if (existingIds.has(definition.id)) continue
    syntheticItems.push({
      ...definition,
      id: `synth:def:${tree}:${index}`,
    })
  }

  for (const [index, footnote] of (root.footnotes ?? []).entries()) {
    if (existingIds.has(footnote.id)) continue
    syntheticItems.push({
      ...footnote,
      id: `synth:fn:${tree}:${index}`,
    })
  }

  if (syntheticItems.length === 0) return existingItems

  syntheticItems.sort((left, right) => compareSourceOffsets(getItemSourceOffset(left), getItemSourceOffset(right)))

  const merged: Array<Block | Section> = []
  let syntheticIndex = 0
  for (const item of existingItems) {
    const itemOffset = getItemSourceOffset(item)
    while (
      syntheticIndex < syntheticItems.length &&
      compareSourceOffsets(getItemSourceOffset(syntheticItems[syntheticIndex]!), itemOffset) < 0
    ) {
      merged.push(syntheticItems[syntheticIndex]!)
      syntheticIndex++
    }
    merged.push(item)
  }

  while (syntheticIndex < syntheticItems.length) {
    merged.push(syntheticItems[syntheticIndex]!)
    syntheticIndex++
  }

  return merged
}

function buildIndexedBlock(
  block: Block,
  tree: 'old' | 'new',
  parentId: string | undefined,
  siblingIndex: number,
  pathParts: string[],
): IndexedRawNode {
  return {
    id: block.id,
    sourceId: block.id,
    tree,
    raw: block,
    entity: 'block',
    blockType: block.type,
    parentId,
    siblingIndex,
    pathParts,
    logicalChildren: [],
  }
}

async function createDiffNode(
  current: IndexedRawNode,
  childNodes: DiffNode[],
  parentId: string | undefined,
  preorder: number,
  headingPath: string[],
): Promise<DiffNode> {
  if (current.entity === 'block') {
    const block = current.raw as Block
    const selfHash = await computeBlockSelfHash(block)
    const text = extractNodeText(block)
    const textTokens = tokenizeText(text)
    const structuredTokens = structuredTextTokens(block)
    return {
      id: current.id,
      sourceId: current.sourceId,
      tree: current.tree,
      entity: 'block',
      raw: block,
      block,
      blockType: block.type,
      parentId,
      logicalChildren: [],
      preorder,
      subtreeSize: 1,
      siblingIndex: current.siblingIndex,
      depth: headingPath.length,
      sourceRange: sourceRangeFromPosition((block as any).position),
      selfHash,
      directHash: selfHash,
      subtreeHash: selfHash,
      identityHash: await computeBlockIdentityHash(block),
      contentOnlyHash: await hashText(text),
      textSimHash: await charikarSimHash([...textTokens, ...structuredTokens]),
      titleTokens: [],
      textTokens,
      structuredTokens,
      pathParts: headingPath,
      pathHash: headingPath.length > 0 ? await hashText(pathHashInput(headingPath)) : undefined,
    }
  }

  const section = current.raw as Section
  const normalizedTitle = normalizeHeadingTitle(section.title)
  const titleTokens = tokenizeText(normalizedTitle)
  const structuredTokens = structuredTextTokens(section)
  const selfHash = await computeSectionSelfHash(section, normalizedTitle)
  const directHash = await hashCanonical({
    selfHash,
    children: childNodes.map((child) => child.selfHash),
  })
  const subtreeHash = await hashCanonical({
    selfHash,
    children: childNodes.map((child) => child.subtreeHash),
  })
  const headingBodyHash = await computeHeadingBodyHash(section, childNodes)
  const text = extractNodeText(section)
  const textTokens = tokenizeText(text)
  const sourceRange = mergeSourceRanges([
    sourceRangeFromPosition((section.heading as any)?.position),
    ...childNodes.map((child) => child.sourceRange),
  ])

  return {
    id: current.id,
    sourceId: current.sourceId,
    tree: current.tree,
    entity: 'section',
    raw: section,
    section,
    kind: section.kind,
    parentId,
    logicalChildren: childNodes.map((child) => child.id),
    preorder,
    subtreeSize: 1 + childNodes.reduce((sum, child) => sum + child.subtreeSize, 0),
    siblingIndex: current.siblingIndex,
    depth: headingPath.length,
    sourceRange,
    selfHash,
    directHash,
    subtreeHash,
    identityHash: await computeSectionIdentityHash(section, childNodes),
    contentOnlyHash: await hashText(text),
    headingBodyHash,
    pathHash: headingPath.length > 0 ? await hashText(pathHashInput(headingPath)) : undefined,
    textSimHash: await charikarSimHash([...textTokens, ...structuredTokens]),
    normalizedTitle,
    titleSlug: slugifyHeading(section.title),
    titleTokens,
    textTokens,
    structuredTokens,
    pathParts: headingPath,
  }
}

async function computeSectionSelfHash(section: Section, normalizedTitle: string): Promise<string> {
  return hashCanonical({
    kind: section.kind,
    title: normalizedTitle,
    headingDepth: section.headingDepth,
    listDepth: section.listDepth,
    quoteDepth: section.quoteDepth,
    checked: section.checked,
    ordered: section.ordered,
    spread: section.spread,
    identifier: extractSectionIdentifier(section),
    frontmatterType: section.frontmatterType,
    frontmatterValue: section.frontmatterValue,
    heading: section.heading ? await computeBlockSelfHash(section.heading) : undefined,
  })
}

async function computeSectionIdentityHash(section: Section, childNodes: DiffNode[]): Promise<string> {
  if (section.kind === 'footnote') {
    return hashCanonical({
      kind: section.kind,
      children: childNodes.map((child) => child.subtreeHash),
    })
  }
  return computeSectionSelfHash(section, normalizeHeadingTitle(section.title))
}

async function computeHeadingBodyHash(section: Section, childNodes: DiffNode[]): Promise<string | undefined> {
  if (section.kind !== 'heading') return undefined
  return hashCanonical({
    headingDepth: section.headingDepth,
    listDepth: section.listDepth,
    quoteDepth: section.quoteDepth,
    children: childNodes.map((child) => child.subtreeHash),
  })
}

async function computeBlockSelfHash(block: Block): Promise<string> {
  const children = Array.isArray(block.children)
    ? await Promise.all(
        block.children.map(async (child) => ({
          type: child.type,
          hash: await computeBlockSelfHash(child),
        })),
      )
    : undefined

  return hashCanonical({
    type: block.type,
    value: block.value,
    lang: (block as any).lang,
    meta: (block as any).meta,
    checked: (block as any).checked,
    identifier: (block as any).identifier,
    title: (block as any).title,
    url: (block as any).url,
    alt: (block as any).alt,
    align: (block as any).align,
    depth: (block as any).depth,
    ordered: (block as any).ordered,
    start: (block as any).start,
    spread: (block as any).spread,
    children,
    structure: extractInlineStructure(block),
  })
}

async function computeBlockIdentityHash(block: Block): Promise<string> {
  if (block.type === 'definition') {
    return hashCanonical({
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

function getItemSourceOffset(item: Block | Section): number | undefined {
  if (isSection(item)) {
    return (item.heading as any)?.position?.start?.offset as number | undefined
  }
  return (item as any)?.position?.start?.offset as number | undefined
}

function compareSourceOffsets(left?: number, right?: number): number {
  if (left === undefined && right === undefined) return 0
  if (left === undefined) return 1
  if (right === undefined) return -1
  return left - right
}

function addToMap<K>(map: Map<K, string[]>, key: K, value: string): void {
  const existing = map.get(key)
  if (existing) {
    existing.push(value)
    return
  }
  map.set(key, [value])
}
