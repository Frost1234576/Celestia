import type { FileNode } from '../../../electron/celestia.d'

export interface AgentToolEvent {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  output?: string
  diff?: { type: 'add' | 'remove' | 'same'; line: string; lineNo?: number }[]
  filePath?: string
}

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolEvents?: AgentToolEvent[]
}

export function flattenFileTree(nodes: FileNode[], prefix = ''): { path: string; name: string }[] {
  const out: { path: string; name: string }[] = []
  for (const n of nodes) {
    if (n.path.startsWith('archive://')) continue
    const rel = prefix ? `${prefix}/${n.name}` : n.name
    if (n.isDirectory && n.children) {
      out.push(...flattenFileTree(n.children, rel))
    } else if (!n.isDirectory) {
      out.push({ path: n.path, name: rel })
    }
  }
  return out
}

export function extractAtRefs(text: string): string[] {
  const refs: string[] = []
  const re = /@([\w./\\-]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) refs.push(m[1])
  return refs
}
