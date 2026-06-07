/** Join path segments using the separator already present in the base path. */
export function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes('\\') ? '\\' : '/'
  return [base, ...parts]
    .join(sep)
    .replace(/[/\\]+/g, sep)
}

export function parentDir(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/'
  const idx = filePath.lastIndexOf(sep)
  return idx === -1 ? filePath : filePath.slice(0, idx)
}

export function fileName(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/'
  return filePath.slice(filePath.lastIndexOf(sep) + 1)
}
