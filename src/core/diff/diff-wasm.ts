import { DIFF_WASM_BASE64 } from './diff-wasm.generated'
import type { SequenceEdit } from './sequence'

interface DiffWasmExports {
  memory: WebAssembly.Memory
  alloc(size: number): number
  dealloc(ptr: number, size: number): void
  hungarian_assignment(
    costPtr: number,
    rows: number,
    cols: number,
    outputPtr: number,
  ): number
  myers_diff(
    oldPtr: number,
    oldLen: number,
    newPtr: number,
    newLen: number,
    outputPtr: number,
  ): number
}

let wasmExports: DiffWasmExports | undefined

const LARGE_COST = 1e18

export function hungarianAssignmentWasm(
  costMatrix: readonly (readonly number[])[],
): Array<[number, number]> {
  const rows = costMatrix.length
  if (rows === 0) return []
  const cols = costMatrix[0]!.length
  if (cols === 0) return []

  const wasm = loadDiffWasm()
  const flat = new Float64Array(rows * cols)
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const v = costMatrix[i]![j]!
      flat[i * cols + j] = Number.isFinite(v) ? v : LARGE_COST
    }
  }

  const costPtr = wasm.alloc(flat.byteLength)
  const maxPairs = Math.min(rows, cols)
  const outputByteLen = maxPairs * 2 * Int32Array.BYTES_PER_ELEMENT
  const outputPtr = wasm.alloc(outputByteLen)

  try {
    const memF64 = new Float64Array(wasm.memory.buffer)
    memF64.set(flat, costPtr / Float64Array.BYTES_PER_ELEMENT)

    const count = wasm.hungarian_assignment(costPtr, rows, cols, outputPtr)

    const memI32 = new Int32Array(wasm.memory.buffer)
    const base = outputPtr / Int32Array.BYTES_PER_ELEMENT
    const result: Array<[number, number]> = []
    for (let i = 0; i < count; i++) {
      result.push([memI32[base + i * 2]!, memI32[base + i * 2 + 1]!])
    }
    return result
  } finally {
    wasm.dealloc(costPtr, flat.byteLength)
    wasm.dealloc(outputPtr, outputByteLen)
  }
}

export function myersDiffWasm<T>(
  oldValues: readonly T[],
  newValues: readonly T[],
): SequenceEdit<T>[] {
  const wasm = loadDiffWasm()

  const intern = new Map<T, number>()
  let nextId = 0
  const oldIds = new Uint32Array(oldValues.length)
  const newIds = new Uint32Array(newValues.length)

  for (let i = 0; i < oldValues.length; i++) {
    const v = oldValues[i]!
    let id = intern.get(v)
    if (id === undefined) {
      id = nextId++
      intern.set(v, id)
    }
    oldIds[i] = id
  }
  for (let i = 0; i < newValues.length; i++) {
    const v = newValues[i]!
    let id = intern.get(v)
    if (id === undefined) {
      id = nextId++
      intern.set(v, id)
    }
    newIds[i] = id
  }

  const oldPtr = wasm.alloc(oldIds.byteLength)
  const newPtr = wasm.alloc(newIds.byteLength)
  const maxEdits = oldValues.length + newValues.length
  const outputByteLen = maxEdits * 3 * Int32Array.BYTES_PER_ELEMENT
  const outputPtr = wasm.alloc(outputByteLen)

  try {
    const memU32 = new Uint32Array(wasm.memory.buffer)
    memU32.set(oldIds, oldPtr / Uint32Array.BYTES_PER_ELEMENT)
    memU32.set(newIds, newPtr / Uint32Array.BYTES_PER_ELEMENT)

    const editCount = wasm.myers_diff(
      oldPtr,
      oldValues.length,
      newPtr,
      newValues.length,
      outputPtr,
    )

    const memI32 = new Int32Array(wasm.memory.buffer)
    const base = outputPtr / Int32Array.BYTES_PER_ELEMENT
    const edits: SequenceEdit<T>[] = []

    for (let i = 0; i < editCount; i++) {
      const op = memI32[base + i * 3]!
      const oldIdx = memI32[base + i * 3 + 1]!
      const newIdx = memI32[base + i * 3 + 2]!

      if (op === 0) {
        edits.push({ op: 'equal', oldIndex: oldIdx, newIndex: newIdx, value: oldValues[oldIdx] })
      } else if (op === 1) {
        edits.push({ op: 'insert', newIndex: newIdx, value: newValues[newIdx] })
      } else {
        edits.push({ op: 'delete', oldIndex: oldIdx, value: oldValues[oldIdx] })
      }
    }
    return edits
  } finally {
    wasm.dealloc(oldPtr, oldIds.byteLength)
    wasm.dealloc(newPtr, newIds.byteLength)
    wasm.dealloc(outputPtr, outputByteLen)
  }
}

function loadDiffWasm(): DiffWasmExports {
  if (wasmExports) return wasmExports
  const bytes = decodeBase64(DIFF_WASM_BASE64)
  const source = new Uint8Array(bytes.byteLength)
  source.set(bytes)
  const module = new WebAssembly.Module(source)
  const instance = new WebAssembly.Instance(module)
  const exports = instance.exports as unknown as Partial<DiffWasmExports>
  if (
    !exports.memory ||
    !exports.alloc ||
    !exports.dealloc ||
    !exports.hungarian_assignment ||
    !exports.myers_diff
  ) {
    throw new Error('Diff WASM exports are incomplete')
  }
  wasmExports = exports as DiffWasmExports
  return wasmExports
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  }

  const bufferCtor = (globalThis as typeof globalThis & { Buffer?: { from(data: string, encoding: string): Uint8Array } }).Buffer
  if (bufferCtor) {
    return Uint8Array.from(bufferCtor.from(base64, 'base64'))
  }

  throw new Error('No base64 decoder available for Diff WASM')
}
