import { describe, expect, it } from 'vitest'
import { computeAptedMatches, type AptedNode } from '../apted'

interface Meta {
  type: string
  name: string
}

function node(
  id: string,
  type: string,
  name: string,
  children: Array<AptedNode<Meta>> = [],
): AptedNode<Meta> {
  return {
    id,
    children,
    subtreeSize: 1 + children.reduce((sum, child) => sum + child.subtreeSize, 0),
    meta: { type, name },
  }
}

describe('apted fallback', () => {
  it('computes ordered tree matches for structurally similar forests', () => {
    const oldForest = [
      node('old-heading', 'heading', 'alpha', [
        node('old-p1', 'paragraph', 'intro'),
        node('old-p2', 'paragraph', 'body'),
      ]),
    ]
    const newForest = [
      node('new-heading', 'heading', 'beta', [
        node('new-p1', 'paragraph', 'intro'),
        node('new-p2', 'paragraph', 'body updated'),
      ]),
    ]

    const matches = computeAptedMatches(oldForest, newForest, {
      canMatch: (oldNode, newNode) => oldNode.meta.type === newNode.meta.type,
      relabelCost: (oldNode, newNode) => (oldNode.meta.name === newNode.meta.name ? 0 : 0.4),
      deleteCost: (tree) => tree.subtreeSize,
      insertCost: (tree) => tree.subtreeSize,
    })

    expect(matches.map((match) => [match.oldId, match.newId])).toEqual([
      ['old-heading', 'new-heading'],
      ['old-p1', 'new-p1'],
      ['old-p2', 'new-p2'],
    ])
  })

  it('refuses cross-type substitutions', () => {
    const oldForest = [node('old-heading', 'heading', 'alpha')]
    const newForest = [node('new-code', 'code', 'alpha')]

    const matches = computeAptedMatches(oldForest, newForest, {
      canMatch: (oldNode, newNode) => oldNode.meta.type === newNode.meta.type,
      relabelCost: () => 0,
      deleteCost: (tree) => tree.subtreeSize,
      insertCost: (tree) => tree.subtreeSize,
    })

    expect(matches).toEqual([])
  })
})
