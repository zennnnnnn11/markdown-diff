const MAX_SIZE = 5 * 1024 * 1024

export function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    return Promise.reject(new Error(`文件过大（${sizeMB} MB），上限 5 MB`))
  }
  if (file.size === 0) return Promise.resolve('')
  return file.text()
}
