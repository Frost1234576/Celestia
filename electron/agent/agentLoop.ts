import { buildSystemPrompt } from './systemPrompt' // placeholder, wrong file
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
const MAX_STEPS = 20
// After this many consecutive tool errors, force a final response
const MAX_CONSECUTIVE_ERRORS = 3

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
      const obj = JSON.parse(m[1]) as {
        tool?: string; name?: string
        args?: Record<string, unknown>; arguments?: Record<string, unknown>
        parameters?: Record<string, unknown>
      }
      const name = obj.tool ?? obj.name
      if (name) calls.push({ name, args: obj.args ?? obj.arguments ?? obj.parameters ?? {} })
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
  let result = await res.json() 
  console.log(result);
  return result as { message: OllamaMessage }
}

/**
 * Build the error guidance appended to tool error results.
 * Gives the model specific instructions based on which tool failed and why.
 */
function buildErrorGuidance(toolName: string, errorOutput: string, args: Record<string, unknown>): string {
  if (toolName === 'edit_file') {
    if (errorOutput.includes('not found')) {
      return `\nACTION REQUIRED: The old_string you provided was not found verbatim in the file.
Steps to fix:
1. Call read_file on "${String(args.path ?? '')}" right now to get the exact current content.
2. Copy the exact text you want to replace, character-for-character, from the read_file output.
3. Retry edit_file with that exact text as old_string.
Do not guess — use only text from the read_file result.`
    }
    if (errorOutput.includes('matches')) {
      return `\nACTION REQUIRED: old_string is not unique — it appears multiple times.
Add more surrounding lines to old_string to make it uniquely identify the location, then retry.`
    }
  }
  if (toolName === 'read_file' || toolName === 'summarize_file') {
    if (errorOutput.includes('not found')) {
      return `\nThe file path may be wrong. Call list_directory to find the correct path, then retry.`
    }
  }
  return `\nThis was an error. Diagnose the problem and retry or take an alternative approach.`
}

export async function runAgent(req: AgentRunRequest): Promise<AgentRunResult> {
  const toolEvents: AgentToolEvent[] = []
  let filesChanged = false
  let toolId = 0
  let consecutiveErrors = 0

  const openMap = new Map<string, string>()
  for (const f of req.openFiles) openMap.set(f.path, f.content)
  for (const f of req.referencedFiles) openMap.set(f.path, f.content)

  const ctx: ToolContext = {
    projectPath: req.projectPath,
    openFileContents: openMap,
  }

  // Referenced files: injected into system prompt (not user message) so paths
  // are clearly separated from the user's natural language input
  const refSection = req.referencedFiles.length
    ? `\n\n## Referenced files\nThe user has explicitly attached these files. Treat their content as authoritative and current — you do not need to read_file them unless you need content beyond what is shown here.\n\n${req.referencedFiles.map(f => {
        // Normalize to relative path so it matches what the model should pass to tools
        const relPath = req.projectPath && f.path.startsWith(req.projectPath)
          ? f.path.slice(req.projectPath.length).replace(/^[/\\]/, '').replace(/\\/g, '/')
          : f.path.replace(/\\/g, '/')
        return `### ${relPath}\n\`\`\`\n${f.content.slice(0, 8000)}\n\`\`\``
      }).join('\n\n')}`
    : ''

  const systemContent = buildSystemPrompt({
    projectPath: req.projectPath,
    openFiles: req.openFiles.map(f => f.path),
    activeFile: req.activeFilePath,
  }) + refSection

  const messages: OllamaMessage[] = [
    { role: 'system', content: systemContent },
    ...req.history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: req.userMessage },
  ]

  let finalContent = ''

  for (let step = 0; step < MAX_STEPS; step++) {
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      // Force a final answer instead of looping on errors
      const { message: final } = await ollamaChat(req.model, [
        ...messages,
        {
          role: 'user',
          content: 'You have hit repeated errors. Stop using tools and give your best answer or explanation of what went wrong.',
        },
      ], false)
      finalContent = final.content ?? 'Encountered repeated tool errors and could not complete the task.'
      break
    }

    const useTools = step < MAX_STEPS - 1
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

    messages.push({
      role: 'assistant',
      content: message.content ?? '',
      tool_calls: message.tool_calls,
    })

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

        if (!result.ok) {
          consecutiveErrors++
          const guidance = buildErrorGuidance(call.name, result.output, call.args)
          messages.push({
            role: 'tool',
            tool_name: call.name,
            content: `ERROR: ${result.output}${guidance}`,
          })
        } else {
          consecutiveErrors = 0
          messages.push({
            role: 'tool',
            tool_name: call.name,
            content: result.output,
          })
        }
      } catch (err) {
        consecutiveErrors++
        ev.status = 'error'
        ev.output = err instanceof Error ? err.message : String(err)
        messages.push({
          role: 'tool',
          tool_name: call.name,
          content: `ERROR: ${ev.output}\nDiagnose and retry.`,
        })
      }
    }
  }

  if (!finalContent) {
    // Get a closing summary after tool loop exhausted MAX_STEPS
    const { message: final } = await ollamaChat(req.model, messages, false)
    finalContent = final.content ?? 'Done.'
  }

  return { content: finalContent, toolEvents, filesChanged }
}