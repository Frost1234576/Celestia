import { buildSystemPrompt } from './systemPrompt'
import { AGENT_TOOLS, executeTool, type ToolContext } from './tools'
import type { DiffLine } from './diff'

export interface AgentToolEvent {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  output?: string
  diff?: DiffLine[]
  filePath?: string
}

export interface AgentRunRequest {
  model: string
  userMessage: string
  history: { role: 'user' | 'assistant'; content: string }[]
  projectPath: string | null
  openFiles: { path: string; content: string }[]
  activeFilePath: string | null
  referencedFiles: { path: string; content: string }[]
}

export interface AgentRunResult {
  content: string
  toolEvents: AgentToolEvent[]
  filesChanged: boolean
}

const OLLAMA = 'http://127.0.0.1:11434/api/chat'
const MAX_STEPS = 10

interface OllamaMessage {
  role: string
  content: string
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[]
  tool_name?: string
}

function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown> } catch { return {} }
  }
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  return {}
}

function extractFallbackToolCalls(text: string): { name: string; args: Record<string, unknown> }[] {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const re = /```(?:json|tool)?\s*(\{[\s\S]*?\})\s*```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[1]) as { tool?: string; name?: string; args?: Record<string, unknown>; arguments?: Record<string, unknown> }
      const name = obj.tool ?? obj.name
      if (name) calls.push({ name, args: obj.args ?? obj.arguments ?? {} })
    } catch { /* skip */ }
  }
  return calls
}

async function ollamaChat(model: string, messages: OllamaMessage[], useTools: boolean) {
  const body: Record<string, unknown> = { model, messages, stream: false }
  if (useTools) body.tools = AGENT_TOOLS

  const res = await fetch(OLLAMA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text() || `Ollama ${res.status}`)
  return await res.json() as { message: OllamaMessage }
}

export async function runAgent(req: AgentRunRequest): Promise<AgentRunResult> {
  const toolEvents: AgentToolEvent[] = []
  let filesChanged = false
  let toolId = 0

  const openMap = new Map<string, string>()
  for (const f of req.openFiles) openMap.set(f.path, f.content)
  for (const f of req.referencedFiles) openMap.set(f.path, f.content)

  const ctx: ToolContext = {
    projectPath: req.projectPath,
    openFileContents: openMap,
  }

  const refBlock = req.referencedFiles.length
    ? `\n\n## @Referenced files\n${req.referencedFiles.map(f => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 8000)}\n\`\`\``).join('\n')}`
    : ''

  const messages: OllamaMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt({
        projectPath: req.projectPath,
        openFiles: req.openFiles.map(f => f.path),
        activeFile: req.activeFilePath,
      }),
    },
    ...req.history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: req.userMessage + refBlock },
  ]

  let useTools = true
  let finalContent = ''

  for (let step = 0; step < MAX_STEPS; step++) {
    const { message } = await ollamaChat(req.model, messages, useTools)
    let toolCalls = message.tool_calls?.map(tc => ({
      name: tc.function.name,
      args: parseToolArgs(tc.function.arguments),
    })) ?? []

    if (toolCalls.length === 0 && message.content) {
      toolCalls = extractFallbackToolCalls(message.content)
    }

    if (toolCalls.length === 0) {
      finalContent = message.content ?? ''
      break
    }

    messages.push({ role: 'assistant', content: message.content ?? '', tool_calls: message.tool_calls })

    for (const call of toolCalls) {
      const id = `tool-${++toolId}`
      const ev: AgentToolEvent = { id, name: call.name, args: call.args, status: 'running' }
      toolEvents.push(ev)

      try {
        const result = await executeTool(call.name, call.args, ctx)
        ev.status = result.ok ? 'done' : 'error'
        ev.output = result.output
        ev.diff = result.diff
        ev.filePath = result.filePath
        if (result.filesChanged) filesChanged = true

        messages.push({
          role: 'tool',
          tool_name: call.name,
          content: result.output,
        })
      } catch (err) {
        ev.status = 'error'
        ev.output = err instanceof Error ? err.message : String(err)
        messages.push({ role: 'tool', tool_name: call.name, content: ev.output })
      }
    }

    if (step === MAX_STEPS - 1) {
      const { message: final } = await ollamaChat(req.model, messages, false)
      finalContent = final.content ?? 'Reached max tool steps.'
    }
  }

  if (!finalContent && toolEvents.length > 0) {
    finalContent = 'Done.'
  }

  return { content: finalContent, toolEvents, filesChanged }
}
