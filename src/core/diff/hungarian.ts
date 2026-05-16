/**
 * Kuhn-Munkres (Hungarian) algorithm for optimal bipartite assignment.
 *
 * Given an m x n cost matrix (lower cost = better), returns the set of
 * (row, col) assignments that minimise total cost.
 *
 * - Non-square matrices are padded internally with zero-cost dummy entries.
 * - `Infinity` entries are treated as infeasible: they become a large finite
 *   sentinel during computation and any assignment landing on an original
 *   `Infinity` cell is excluded from the output.
 * - Empty input (0 rows) returns `[]`.
 *
 * Complexity: O(n^3) where n = max(rows, cols).
 */

import { hungarianAssignmentWasm } from './diff-wasm'

let wasmFailed = false

const LARGE_COST = 1e18

export function hungarianAssignment(
  costMatrix: readonly (readonly number[])[],
): Array<[number, number]> {
  if (!wasmFailed) {
    try {
      return hungarianAssignmentWasm(costMatrix)
    } catch {
      wasmFailed = true
    }
  }
  return hungarianAssignmentJs(costMatrix)
}

function hungarianAssignmentJs(
  costMatrix: readonly (readonly number[])[],
): Array<[number, number]> {
  const originalRows = costMatrix.length
  if (originalRows === 0) return []
  const originalCols = costMatrix[0]!.length
  if (originalCols === 0) return []

  // Record which cells were originally Infinity so we can filter them later.
  const infeasible: boolean[][] = []
  for (let i = 0; i < originalRows; i++) {
    infeasible.push(costMatrix[i]!.map((v) => !Number.isFinite(v)))
  }

  // Pad to square with zero-cost dummy rows/cols.
  const n = Math.max(originalRows, originalCols)
  const c: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i < originalRows && j < originalCols) {
        const v = costMatrix[i]![j]!
        return Number.isFinite(v) ? v : LARGE_COST
      }
      return 0 // dummy row/col
    }),
  )

  // Standard O(n^3) Hungarian using potential arrays u[] and v[].
  // 1-indexed worker/job to simplify the bookkeeping.
  const u = new Float64Array(n + 1) // row potentials
  const v = new Float64Array(n + 1) // col potentials
  const colAssign = new Int32Array(n + 1) // colAssign[j] = row assigned to col j (1-indexed, 0 = unassigned)

  for (let i = 1; i <= n; i++) {
    // Start augmenting path from row i.
    const link = new Int32Array(n + 1) // link[j] = previous col in alternating path
    const minCost = new Float64Array(n + 1).fill(Infinity) // shortest reduced-cost to each col
    const used = new Uint8Array(n + 1) // whether col j is in the tree

    colAssign[0] = i // virtual col 0 is seeded with row i
    let j0 = 0 // current col (start from virtual col 0)

    // Dijkstra-like shortest augmenting path.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      used[j0] = 1
      const rowOfJ0 = colAssign[j0]!
      let delta = Infinity
      let j1 = -1

      for (let j = 1; j <= n; j++) {
        if (used[j]) continue
        const cur = c[rowOfJ0 - 1]![j - 1]! - u[rowOfJ0]! - v[j]!
        if (cur < minCost[j]!) {
          minCost[j] = cur
          link[j] = j0
        }
        if (minCost[j]! < delta) {
          delta = minCost[j]!
          j1 = j
        }
      }

      // Update potentials along the alternating tree.
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[colAssign[j]!]! += delta
          v[j]! -= delta
        } else {
          minCost[j]! -= delta
        }
      }

      j0 = j1
      if (colAssign[j0]! === 0) break // reached an unassigned col → augment
    }

    // Trace back the augmenting path and flip assignments.
    while (j0 !== 0) {
      const prev = link[j0]!
      colAssign[j0] = colAssign[prev]!
      j0 = prev
    }
  }

  // Extract assignments, filtering out dummy rows/cols and infeasible cells.
  const result: Array<[number, number]> = []
  for (let j = 1; j <= n; j++) {
    const row = colAssign[j]! - 1
    const col = j - 1
    if (row < originalRows && col < originalCols && !infeasible[row]![col]) {
      result.push([row, col])
    }
  }

  return result
}
