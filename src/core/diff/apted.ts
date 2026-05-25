export interface AptedNode<TMeta = unknown> {
  id: string
  subtreeSize: number
  children: AptedNode<TMeta>[]
  meta: TMeta
}

export interface AptedMatch<TMeta = unknown> {
  oldId: string
  newId: string
  cost: number
  oldMeta: TMeta
  newMeta: TMeta
}

export interface AptedOptions<TMeta = unknown> {
  canMatch: (oldNode: AptedNode<TMeta>, newNode: AptedNode<TMeta>) => boolean
  relabelCost: (oldNode: AptedNode<TMeta>, newNode: AptedNode<TMeta>) => number
  deleteCost: (node: AptedNode<TMeta>) => number
  insertCost: (node: AptedNode<TMeta>) => number
}

interface DistanceResult<TMeta> {
  cost: number
  matches: AptedMatch<TMeta>[]
}

type ForestStep = 'delete' | 'insert' | 'match'

interface ForestDecision {
  step: ForestStep
}

export function computeAptedMatches<TMeta>(
  oldRoots: AptedNode<TMeta>[],
  newRoots: AptedNode<TMeta>[],
  options: AptedOptions<TMeta>,
): AptedMatch<TMeta>[] {
  const nodeCache = new Map<string, DistanceResult<TMeta>>()
  const forestCache = new Map<string, DistanceResult<TMeta>>()

  return computeForestDistance(oldRoots, newRoots).matches

  function computeNodeDistance(
    oldNode: AptedNode<TMeta>,
    newNode: AptedNode<TMeta>,
  ): DistanceResult<TMeta> {
    const cacheKey = `${oldNode.id}|${newNode.id}`
    const cached = nodeCache.get(cacheKey)
    if (cached) return cached

    if (!options.canMatch(oldNode, newNode)) {
      const impossible = { cost: Number.POSITIVE_INFINITY, matches: [] }
      nodeCache.set(cacheKey, impossible)
      return impossible
    }

    const childrenDistance = computeForestDistance(oldNode.children, newNode.children)
    const relabelCost = options.relabelCost(oldNode, newNode)
    const result = {
      cost: relabelCost + childrenDistance.cost,
      matches: [
        {
          oldId: oldNode.id,
          newId: newNode.id,
          cost: relabelCost,
          oldMeta: oldNode.meta,
          newMeta: newNode.meta,
        },
        ...childrenDistance.matches,
      ],
    }
    nodeCache.set(cacheKey, result)
    return result
  }

  function computeForestDistance(
    oldForest: AptedNode<TMeta>[],
    newForest: AptedNode<TMeta>[],
  ): DistanceResult<TMeta> {
    const cacheKey = `${oldForest.map((node) => node.id).join(',')}|${newForest.map((node) => node.id).join(',')}`
    const cached = forestCache.get(cacheKey)
    if (cached) return cached

    const rows = oldForest.length + 1
    const cols = newForest.length + 1
    const costs = Array.from({ length: rows }, () => Array.from<number>({ length: cols }).fill(0))
    const decisions = Array.from({ length: rows }, () =>
      Array.from<ForestDecision | undefined>({ length: cols }).fill(undefined),
    )

    for (let row = 1; row < rows; row++) {
      costs[row]![0] = (costs[row - 1]?.[0] ?? 0) + options.deleteCost(oldForest[row - 1]!)
      decisions[row]![0] = { step: 'delete' }
    }
    for (let col = 1; col < cols; col++) {
      costs[0]![col] = (costs[0]?.[col - 1] ?? 0) + options.insertCost(newForest[col - 1]!)
      decisions[0]![col] = { step: 'insert' }
    }

    for (let row = 1; row < rows; row++) {
      for (let col = 1; col < cols; col++) {
        const oldNode = oldForest[row - 1]!
        const newNode = newForest[col - 1]!
        const deleteCost =
          (costs[row - 1]?.[col] ?? Number.POSITIVE_INFINITY) + options.deleteCost(oldNode)
        const insertCost =
          (costs[row]?.[col - 1] ?? Number.POSITIVE_INFINITY) + options.insertCost(newNode)
        const matchDistance = computeNodeDistance(oldNode, newNode)
        const matchCost =
          (costs[row - 1]?.[col - 1] ?? Number.POSITIVE_INFINITY) + matchDistance.cost

        let bestCost = deleteCost
        let bestDecision: ForestDecision = { step: 'delete' }

        if (insertCost < bestCost) {
          bestCost = insertCost
          bestDecision = { step: 'insert' }
        }
        if (matchCost < bestCost) {
          bestCost = matchCost
          bestDecision = { step: 'match' }
        }

        costs[row]![col] = bestCost
        decisions[row]![col] = bestDecision
      }
    }

    const matches: AptedMatch<TMeta>[] = []
    let row = oldForest.length
    let col = newForest.length
    while (row > 0 || col > 0) {
      const decision = decisions[row]?.[col]
      if (!decision) break

      if (decision.step === 'match') {
        const oldNode = oldForest[row - 1]!
        const newNode = newForest[col - 1]!
        matches.unshift(...computeNodeDistance(oldNode, newNode).matches)
        row--
        col--
        continue
      }
      if (decision.step === 'delete') {
        row--
        continue
      }
      col--
    }

    const result = {
      cost: costs[oldForest.length]?.[newForest.length] ?? 0,
      matches,
    }
    forestCache.set(cacheKey, result)
    return result
  }
}
