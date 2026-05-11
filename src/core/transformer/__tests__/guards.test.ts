/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import {
  isHeading,
  isList,
  isBlockquote,
  isTable,
  isCode,
  isHtml,
  isDefinition,
  isFootnoteDefinition,
  isFootnoteReference,
  isFrontmatter,
  isYaml,
  isToml,
  isParagraph,
  isMath,
  isThematicBreak,
  isListItem,
} from '../guards'

function node(type: string, extra?: Record<string, unknown>) {
  return { type, ...extra } as any
}

describe('guards', () => {
  describe('isHeading', () => {
    it('G01: returns true for heading node', () => {
      expect(isHeading(node('heading', { depth: 1 }))).toBe(true)
    })
    it('G02: returns true for depths 1-6', () => {
      for (let d = 1; d <= 6; d++) {
        expect(isHeading(node('heading', { depth: d }))).toBe(true)
      }
    })
    it('G03: returns false for non-heading', () => {
      expect(isHeading(node('paragraph'))).toBe(false)
    })
    it('G04: returns false for null/undefined', () => {
      expect(isHeading(null as any)).toBe(false)
      expect(isHeading(undefined as any)).toBe(false)
    })
  })

  describe('isList', () => {
    it('G05: returns true for ordered list', () => {
      expect(isList(node('list', { ordered: true }))).toBe(true)
    })
    it('G06: returns true for unordered list', () => {
      expect(isList(node('list', { ordered: false }))).toBe(true)
    })
    it('G07: returns false for non-list', () => {
      expect(isList(node('paragraph'))).toBe(false)
    })
  })

  it('G08: isBlockquote', () => {
    expect(isBlockquote(node('blockquote'))).toBe(true)
    expect(isBlockquote(node('paragraph'))).toBe(false)
  })
  it('G09: isTable', () => {
    expect(isTable(node('table'))).toBe(true)
    expect(isTable(node('paragraph'))).toBe(false)
  })
  it('G10: isDefinition', () => {
    expect(isDefinition(node('definition'))).toBe(true)
    expect(isDefinition(node('paragraph'))).toBe(false)
  })
  it('G11: isFootnoteDefinition', () => {
    expect(isFootnoteDefinition(node('footnoteDefinition'))).toBe(true)
    expect(isFootnoteDefinition(node('paragraph'))).toBe(false)
  })
  it('G12: isFootnoteReference', () => {
    expect(isFootnoteReference(node('footnoteReference'))).toBe(true)
    expect(isFootnoteReference(node('paragraph'))).toBe(false)
  })

  describe('isFrontmatter', () => {
    it('G13: recognizes yaml', () => {
      expect(isFrontmatter(node('yaml'))).toBe(true)
    })
    it('G14: recognizes toml', () => {
      expect(isFrontmatter(node('toml'))).toBe(true)
    })
    it('G15: returns false for code node', () => {
      expect(isFrontmatter(node('code'))).toBe(false)
    })
  })

  it('G16: all guards accept standard mdast nodes without throwing', () => {
    const n = node('heading', { depth: 1, children: [node('text', { value: 'hi' })] })
    const guards = [
      isHeading,
      isParagraph,
      isList,
      isListItem,
      isBlockquote,
      isTable,
      isCode,
      isHtml,
      isYaml,
      isToml,
      isDefinition,
      isFootnoteDefinition,
      isFootnoteReference,
      isMath,
      isThematicBreak,
      isFrontmatter,
    ]
    for (const g of guards) {
      expect(() => g(n)).not.toThrow()
    }
  })
})
