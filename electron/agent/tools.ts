import fs from 'node:fs'
import path from 'node:path'
import { computeLineDiff, type DiffLine } from './diff'

export interface ToolContext {
  projectPath: string | null
  openFileContents: Map<string, string>
}

export interface ToolResult {
  ok: boolean
  output: string
  diff?: DiffLine[]
  filePath?: string
  filesChanged?: boolean
}

export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read file contents. Use relative path from project root.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          start_line: { type: 'number', description: 'Optional 1-based start line' },
          end_line: { type: 'number', description: 'Optional 1-based end line' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace exact text in a file. old_string must match exactly once.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite entire file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and folders in a directory.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Directory path, default "."' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_codebase',
      description: 'Search for regex pattern in project files.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          glob: { type: 'string', description: 'Optional extension filter e.g. ts, py' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_file',
      description: 'Get file metadata and a short preview for large files.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for documentation, errors, or APIs.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
]

function resolvePath(ctx: ToolContext, filePath: string): string | null {
  if (!ctx.projectPath) return null
  if (filePath === '.' || filePath === './') return ctx.projectPath
  if (path.isAbsolute(filePath)) {
    const norm = path.normalize(filePath)
    if (!norm.startsWith(path.normalize(ctx.projectPath))) return null
    return norm
  }
  return path.normalize(path.join(ctx.projectPath, filePath))
}

function readTextFile(abs: string): { ok: true; content: string } | { ok: false; msg: string } {
  if (!fs.existsSync(abs)) return { ok: false, msg: 'File not found' }
  const buf = fs.readFileSync(abs)
  if (buf.includes(0)) return { ok: false, msg: 'Binary file — cannot read as text' }
  return { ok: true, content: buf.toString('utf8') }
}

function walkDir(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkDir(p, out)
    else out.push(p)
  }
  return out
}

async function webSearch(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'CelestiaAgent/1.0' } })
    if (!res.ok) return `Search failed: HTTP ${res.status}`
    const data = await res.json() as {
      Abstract?: string
      AbstractText?: string
      AbstractURL?: string
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string } | { Topics?: { Text?: string }[] }>
    }
    const parts: string[] = []
    if (data.AbstractText) parts.push(data.AbstractText, data.AbstractURL ?? '')
    const topics = data.RelatedTopics ?? []
    for (const t of topics.slice(0, 5)) {
      if ('Text' in t && t.Text) parts.push(`• ${t.Text}`)
      if ('Topics' in t && t.Topics) {
        for (const sub of t.Topics.slice(0, 3)) {
          if (sub.Text) parts.push(`• ${sub.Text}`)
        }
      }
    }
    return parts.filter(Boolean).join('\n') || 'No results found.'
  } catch (err) {
    return `Search error: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case 'read_file': {
      const abs = resolvePath(ctx, String(args.path ?? '').split(':')[0])
      if (!abs) return { ok: false, output: 'Invalid path or no project open' }
      const fromOpen = ctx.openFileContents.get(abs)
      const raw = fromOpen ?? (() => {
        const r = readTextFile(abs)
        return r.ok ? r.content : null
      })()
      if (raw === null) {
        const r = readTextFile(abs)
        return { ok: false, output: r.ok ? '' : r.msg }
      }
      const lines = raw.split('\n')
      const start = Math.max(1, Number(args.start_line) || 1)
      const end = Math.min(lines.length, Number(args.end_line) || lines.length)
      const slice = lines.slice(start - 1, end)
      const numbered = slice.map((l, i) => `${start + i}|${l}`).join('\n')
      return { ok: true, output: numbered, filePath: abs }
    }

    case 'edit_file': {
      const abs = resolvePath(ctx, String(args.path ?? ''))
      if (!abs) return { ok: false, output: 'Invalid path' }
      const r = readTextFile(abs)
      if (!r.ok) return { ok: false, output: r.msg }
      const oldStr = String(args.old_string ?? '')
      const newStr = String(args.new_string ?? '')
      const count = r.content.split(oldStr).length - 1
      if (count === 0) return { ok: false, output: 'old_string not found in file' }
      if (count > 1) return { ok: false, output: `old_string matches ${count} times — must be unique` }
      const updated = r.content.replace(oldStr, newStr)
      fs.writeFileSync(abs, updated, 'utf8')
      ctx.openFileContents.set(abs, updated)
      return {
        ok: true,
        output: `Edited ${args.path}`,
        diff: computeLineDiff(r.content, updated),
        filePath: abs,
        filesChanged: true,
      }
    }

    case 'write_file': {
      const abs = resolvePath(ctx, String(args.path ?? ''))
      if (!abs) return { ok: false, output: 'Invalid path' }
      const content = String(args.content ?? '')
      const before = fs.existsSync(abs) ? readTextFile(abs) : null
      const oldContent = before?.ok ? before.content : ''
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, content, 'utf8')
      ctx.openFileContents.set(abs, content)
      return {
        ok: true,
        output: `Wrote ${args.path}`,
        diff: oldContent !== content ? computeLineDiff(oldContent, content) : undefined,
        filePath: abs,
        filesChanged: true,
      }
    }

    case 'list_directory': {
      const rel = String(args.path ?? '.')
      const abs = resolvePath(ctx, rel === '.' ? '.' : rel)
      if (!abs || !fs.existsSync(abs)) return { ok: false, output: 'Directory not found' }
      const entries = fs.readdirSync(abs, { withFileTypes: true })
        .filter(e => !e.name.startsWith('.'))
        .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
      return { ok: true, output: entries.join('\n') || '(empty)' }
    }

    case 'search_codebase': {
      if (!ctx.projectPath) return { ok: false, output: 'No project open' }
      const pattern = String(args.pattern ?? '')
      const ext = args.glob ? String(args.glob).replace(/^\./, '') : null
      let re: RegExp
      try { re = new RegExp(pattern, 'gi') } catch {
        return { ok: false, output: 'Invalid regex pattern' }
      }
      const hits: string[] = []
      for (const file of walkDir(ctx.projectPath)) {
        if (ext && !file.endsWith(`.${ext}`)) continue
        const r = readTextFile(file)
        if (!r.ok) continue
        const rel = path.relative(ctx.projectPath, file)
        r.content.split('\n').forEach((line, i) => {
          if (re.test(line)) {
            hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`)
            re.lastIndex = 0
          }
        })
        if (hits.length >= 40) break
      }
      return { ok: true, output: hits.join('\n') || 'No matches' }
    }

    case 'summarize_file': {
      const abs = resolvePath(ctx, String(args.path ?? ''))
      if (!abs) return { ok: false, output: 'Invalid path' }
      const r = readTextFile(abs)
      if (!r.ok) return { ok: false, output: r.msg }
      const lines = r.content.split('\n')
      const preview = lines.slice(0, 30).map((l, i) => `${i + 1}|${l}`).join('\n')
      const summary = [
        `Path: ${args.path}`,
        `Lines: ${lines.length}`,
        `Chars: ${r.content.length}`,
        `Preview (first 30 lines):`,
        preview,
        lines.length > 30 ? `\n... ${lines.length - 30} more lines` : '',
      ].join('\n')
      return { ok: true, output: summary, filePath: abs }
    }

    case 'web_search': {
      const out = await webSearch(String(args.query ?? ''))
      return { ok: true, output: out }
    }

    default:
      return { ok: false, output: `Unknown tool: ${name}` }
  }
}
