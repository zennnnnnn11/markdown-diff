import { describe, expect, it } from 'vitest'
import {
  estimateSectionAlignmentCost,
  estimateAptedRecoveryCost,
  estimateInlineDiffCost,
} from '../engine/cost'
import { makeChange, makeStatus } from './test-helpers'
import type { DiffContext } from '../engine/context'
import type { SemanticIndex } from '../types'

function makeContextWithChildren(
  oldChildren: Record<string, string[]>,
  newChildren: Record<string, string[]>,
): DiffContext {
  return {
    oldIndex: {
      childrenById: new Map(Object.entries(oldChildren)),
    } as unknown as SemanticIndex,
    newIndex: {
      childrenById: new Map(Object.entries(newChildren)),
    } as unknown as SemanticIndex,
  } as unknown as DiffContext
}

function makeNode(id: string) {
  return { id } as NonNullable<ReturnType<SemanticIndex['byId']['get']>>
}

describe('cost module', () => {
  describe('estimateSectionAlignmentCost', () => {
    it('returns 0 when both nodes have no children', () => {
      const context = makeContextWithChildren({}, {})
      expect(estimateSectionAlignmentCost(context, makeNode('a'), makeNode('b'))).toBe(0)
    })

    it('returns linear cost when one side has no children', () => {
      const context = makeContextWithChildren({ a: ['c1', 'c2', 'c3'] }, {})
      expect(estimateSectionAlignmentCost(context, makeNode('a'), makeNode('b'))).toBe(3)
    })

    it('returns quadratic-plus-linear cost for non-trivial case', () => {
      const context = makeContextWithChildren({ a: ['c1', 'c2'] }, { b: ['c3', 'c4', 'c5'] })
      const cost = estimateSectionAlignmentCost(context, makeNode('a'), makeNode('b'))
      expect(cost).toBe(2 * 3 + 2 + 3)
    })

    it('is symmetric for equal-sized children', () => {
      const context = makeContextWithChildren({ a: ['c1', 'c2'] }, { b: ['c3', 'c4'] })
      const cost = estimateSectionAlignmentCost(context, makeNode('a'), makeNode('b'))
      expect(cost).toBe(2 * 2 + 2 + 2)
    })

    it('scales with large subtrees', () => {
      const oldIds = Array.from({ length: 10 }, (_, i) => `o${i}`)
      const newIds = Array.from({ length: 20 }, (_, i) => `n${i}`)
      const context = makeContextWithChildren({ a: oldIds }, { b: newIds })
      const cost = estimateSectionAlignmentCost(context, makeNode('a'), makeNode('b'))
      expect(cost).toBe(10 * 20 + 10 + 20)
    })
  })

  describe('estimateAptedRecoveryCost', () => {
    it('returns 0 when no deletes or inserts', () => {
      const change = makeChange({
        primaryOp: 'equal',
        summary: 'root',
        status: makeStatus(),
        children: [makeChange({ primaryOp: 'equal', summary: 'child', status: makeStatus() })],
      })
      expect(estimateAptedRecoveryCost(change)).toBe(0)
    })

    it('returns 0 when only deletes', () => {
      const change = makeChange({
        primaryOp: 'equal',
        summary: 'root',
        status: makeStatus(),
        children: [
          makeChange({ primaryOp: 'delete', summary: 'del1', status: makeStatus() }),
          makeChange({ primaryOp: 'delete', summary: 'del2', status: makeStatus() }),
        ],
      })
      expect(estimateAptedRecoveryCost(change)).toBe(0)
    })

    it('returns 0 when only inserts', () => {
      const change = makeChange({
        primaryOp: 'equal',
        summary: 'root',
        status: makeStatus(),
        children: [makeChange({ primaryOp: 'insert', summary: 'ins1', status: makeStatus() })],
      })
      expect(estimateAptedRecoveryCost(change)).toBe(0)
    })

    it('returns product of deletes and inserts', () => {
      const change = makeChange({
        primaryOp: 'equal',
        summary: 'root',
        status: makeStatus(),
        children: [
          makeChange({ primaryOp: 'delete', summary: 'del1', status: makeStatus() }),
          makeChange({ primaryOp: 'delete', summary: 'del2', status: makeStatus() }),
          makeChange({ primaryOp: 'insert', summary: 'ins1', status: makeStatus() }),
          makeChange({ primaryOp: 'insert', summary: 'ins2', status: makeStatus() }),
          makeChange({ primaryOp: 'insert', summary: 'ins3', status: makeStatus() }),
          makeChange({ primaryOp: 'equal', summary: 'eq1', status: makeStatus() }),
        ],
      })
      expect(estimateAptedRecoveryCost(change)).toBe(2 * 3)
    })

    it('handles empty children', () => {
      const change = makeChange({
        primaryOp: 'equal',
        summary: 'root',
        status: makeStatus(),
        children: [],
      })
      expect(estimateAptedRecoveryCost(change)).toBe(0)
    })
  })

  describe('estimateInlineDiffCost', () => {
    it('returns 0 when both arrays are empty', () => {
      expect(estimateInlineDiffCost([], [])).toBe(0)
    })

    it('returns 0 when one array is empty', () => {
      const nodes = [{ type: 'text', value: 'hello' }] as any[]
      expect(estimateInlineDiffCost(nodes, [])).toBe(0)
      expect(estimateInlineDiffCost([], nodes)).toBe(0)
    })

    it('returns product of array lengths', () => {
      const old = [{ type: 'text' }, { type: 'strong' }] as any[]
      const nw = [{ type: 'text' }, { type: 'emphasis' }, { type: 'code' }] as any[]
      expect(estimateInlineDiffCost(old, nw)).toBe(6)
    })

    it('returns 1 for single-element arrays', () => {
      const a = [{ type: 'text' }] as any[]
      const b = [{ type: 'text' }] as any[]
      expect(estimateInlineDiffCost(a, b)).toBe(1)
    })
  })

  describe('module independence', () => {
    it('cost.ts does not import from helpers', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const source = fs.readFileSync(path.resolve(__dirname, '../engine/cost.ts'), 'utf-8')
      expect(source).not.toContain("from './helpers'")
    })

    it('helpers.ts re-exports cost functions', async () => {
      const helpers = await import('../engine/helpers')
      expect(typeof helpers.estimateSectionAlignmentCost).toBe('function')
      expect(typeof helpers.estimateAptedRecoveryCost).toBe('function')
      expect(typeof helpers.estimateInlineDiffCost).toBe('function')
    })
  })
})
