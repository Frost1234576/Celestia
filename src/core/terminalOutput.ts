export function colorizeTerminalOutput(data: string): string {
  return data.split(/(\r?\n)/).map(part => {
    if (part === '\n' || part === '\r\n') return part
    if (/\berror\b/i.test(part)) return `\x1b[38;2;244;67;54m${part}\x1b[0m`
    if (/\bwarning\b/i.test(part)) return `\x1b[38;2;240;168;64m${part}\x1b[0m`
    if (/\bsuccess\b/i.test(part)) return `\x1b[38;2;137;209;133m${part}\x1b[0m`
    return part
  }).join('')
}

export type OutputLineKind = 'default' | 'error' | 'warning' | 'success'

export function classifyLine(line: string): OutputLineKind {
  if (/\berror\b/i.test(line)) return 'error'
  if (/\bwarning\b/i.test(line)) return 'warning'
  if (/\bsuccess\b/i.test(line)) return 'success'
  return 'default'
}
