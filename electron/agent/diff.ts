export interface DiffLine {
  type: 'add' | 'remove' | 'same'
  line: string
  lineNo?: number
}

export function computeLineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', line: a[i], lineNo: i + 1 })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'remove', line: a[i], lineNo: i + 1 })
      i++
    } else {
      out.push({ type: 'add', line: b[j], lineNo: j + 1 })
      j++
    }
  }
  while (i < m) { out.push({ type: 'remove', line: a[i], lineNo: i + 1 }); i++ }
  while (j < n) { out.push({ type: 'add', line: b[j], lineNo: j + 1 }); j++ }
  return out
}
