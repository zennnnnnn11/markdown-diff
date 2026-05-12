import { load as parseToml } from 'js-toml'
import { parse as parseYaml } from 'yaml'
import type { MetadataChange } from './types'
import { metadataDiff } from './utils'

export function parseFrontmatter(
  type: 'yaml' | 'toml' | undefined,
  value: string | undefined,
): unknown {
  if (!type || !value) return undefined

  try {
    return type === 'yaml' ? parseYaml(value) : parseToml(value)
  } catch {
    return undefined
  }
}

export function diffFrontmatter(
  oldType: 'yaml' | 'toml' | undefined,
  oldValue: string | undefined,
  newType: 'yaml' | 'toml' | undefined,
  newValue: string | undefined,
): MetadataChange[] {
  const oldParsed = parseFrontmatter(oldType, oldValue)
  const newParsed = parseFrontmatter(newType, newValue)
  if (oldParsed === undefined || newParsed === undefined) {
    return metadataDiff(oldValue ?? undefined, newValue ?? undefined, '$')
  }
  return metadataDiff(oldParsed, newParsed, '$')
}
