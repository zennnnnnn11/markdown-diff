import { describe, expect, it } from 'vitest'
import { charikarSimHashWasm, estimateMinHashSimilarityWasm, simHashHammingDistanceBatchWasm } from '../simhash-wasm'
import { simHashHammingDistance } from '../utils'

describe('simhash wasm helpers', () => {
  it('preserves representative simhash outputs', async () => {
    expect(await charikarSimHashWasm(['hello', 'world'])).toBe('ffedf9adb79bbeff')
    expect(
      await charikarSimHashWasm([
        'token',
        'set',
        '1',
        'alpha',
        'beta',
        'gamma',
        'delta',
        'epsilon',
        'zeta',
        'eta',
        'theta',
        'iota',
        'kappa',
        'lambda',
        'mu',
      ]),
    ).toBe('1d2475a58e7db019')
  })

  it('matches the legacy minhash similarity semantics', () => {
    const left = Array.from({ length: 80 }, (_, index) => `token-${index}`)
    const right = Array.from({ length: 80 }, (_, index) => `token-${index < 60 ? index : index + 20}`)
    const functions = 32

    expect(estimateMinHashSimilarityWasm(left, right, functions)).toBe(
      legacyMinHashSimilarity(left, right, functions),
    )
    expect(estimateMinHashSimilarityWasm([], [], functions)).toBe(1)
    expect(estimateMinHashSimilarityWasm(['only-left'], [], functions)).toBe(0)
  })

  it('computes one-to-many simhash distances equal to the scalar helper', () => {
    const query = 'ffedf9adb79bbeff'
    const candidates = [
      'ffedf9adb79bbeff',
      '1d2475a58e7db019',
      undefined,
      'fdabfbfe94012d21',
    ]

    expect(simHashHammingDistanceBatchWasm(query, candidates)).toEqual(
      candidates.map((candidate) => simHashHammingDistance(query, candidate)),
    )
    expect(simHashHammingDistanceBatchWasm(undefined, candidates)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })
})

function legacyMinHashSimilarity(left: readonly string[], right: readonly string[], functions: number): number {
  const leftSketch = legacyMinHashSketch(left, functions)
  const rightSketch = legacyMinHashSketch(right, functions)
  let equal = 0
  for (let index = 0; index < Math.min(leftSketch.length, rightSketch.length); index++) {
    if (leftSketch[index] === rightSketch[index]) equal++
  }
  return leftSketch.length === 0 ? 1 : equal / leftSketch.length
}

function legacyMinHashSketch(tokens: readonly string[], functions: number): number[] {
  if (tokens.length === 0) return []
  const unique = [...new Set(tokens)]
  return Array.from({ length: functions }, (_, seed) =>
    unique.reduce((best, token) => Math.min(best, legacySeededHash(token, seed + 1)), Number.POSITIVE_INFINITY),
  )
}

function legacySeededHash(token: string, seed: number): number {
  let hash = seed * 2_654_435_761
  for (let index = 0; index < token.length; index++) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}
