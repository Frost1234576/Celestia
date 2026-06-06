import { useState, useEffect, useRef } from 'react'
import './AgentChat.css'
import { useProjectStore } from '../core/project'
import { useEditorStore } from '../core/editor'
import { extractAtRefs, type ChatTurn } from '../core/agent/types'
import { joinPath } from '../core/path'
import AgentInput from './agent/AgentInput'
import MarkdownContent from './agent/MarkdownContent'
import ToolCallCard from './agent/ToolCallCard'

let turnId = 0

export default function AgentChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([
    { id: 'welcome', role: 'assistant', content: 'Celestia Agent ready. I can read, edit, search files, and search the web. Use **@** to reference files.' },
  ])
  const [input, setInput] = useState('')
  const [model, setModel] = useState('llama3.1')
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const { projectPath, fileTree, refreshTree } = useProjectStore()
  const { tabs, activeTabId, openFile } = useEditorStore()

  useEffect(() => {
    window.celestia.ollama.listModels().then(setModels).catch(() => setModels([]))
  }, [])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, loading])

  const resolveRefPath = (ref: string): string | null => {
    if (!projectPath) return null
    // if (ref.includes(':') || ref.startsWith('/') || ref.includes('\\')) {
    //   return ref
    // }
    return joinPath(projectPath, ref)
  }

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userTurn: ChatTurn = { id: `u-${++turnId}`, role: 'user', content: text }
    setInput('')
    setTurns(t => [...t, userTurn])
    setLoading(true)

    try {
      const openFiles = tabs.map(t => ({ path: t.path, content: t.content }))
      const activeTab = tabs.find(t => t.id === activeTabId)

      const refs = extractAtRefs(text)
      const cleaned = text.replace(/@(?=[\w./\\])/g, '')
      const referencedFiles: { path: string; content: string }[] = []
      for (const ref of refs) {
        const p = resolveRefPath(ref)
        console.log("Resolved ref", { ref, p })
        if (!p) continue
        const existing = tabs.find(t => t.path === p)
        if (existing) {
          referencedFiles.push({ path: p, content: existing.content })
        } else {
          const result = await window.celestia.fs.readFile(p)
          if (result.kind === 'text') referencedFiles.push({ path: p, content: result.content })
        }
      }

      const history = turns
        .filter(t => t.id !== 'welcome')
        .map(t => ({ role: t.role, content: t.content }))

      const result = await window.celestia.agent.run({
        model,
        userMessage: cleaned,
        history,
        projectPath,
        openFiles,
        activeFilePath: activeTab?.path ?? null,
        referencedFiles,
      })

      setTurns(t => [...t, {
        id: `a-${++turnId}`,
        role: 'assistant',
        content: result.content,
        toolEvents: result.toolEvents,
      }])

      if (result.filesChanged) {
        await refreshTree()
        for (const ev of result.toolEvents) {
          if (ev.filePath && ev.diff) {
            const existing = tabs.find(t => t.path === ev.filePath)
            if (existing) await openFile(ev.filePath)
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Agent failed'
      setTurns(t => [...t, { id: `a-${++turnId}`, role: 'assistant', content: `⚠ ${msg}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="agent-chat">
      <div className="agent-chat-header">
        <span className="agent-chat-title">Agent</span>
        <select className="agent-model-select" value={model} onChange={e => setModel(e.target.value)}>
          {[...new Set([model, ...models])].map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="agent-chat-body" ref={bodyRef}>
        {turns.map(turn => (
          <div key={turn.id} className={`agent-msg ${turn.role}`}>
            <span className="agent-msg-role">{turn.role === 'user' ? 'You' : 'Agent'}</span>
            {turn.role === 'assistant' ? (
              <div className="agent-msg-text">
                <MarkdownContent text={turn.content} />
                {turn.toolEvents?.map(ev => (
                  <ToolCallCard key={ev.id} event={ev} />
                ))}
              </div>
            ) : (
              <div className="agent-msg-text user-text">{turn.content}</div>
            )}
          </div>
        ))}
        {loading && (
          <div className="agent-msg assistant">
            <span className="agent-msg-role">Agent</span>
            <div className="agent-msg-text typing">Working…</div>
          </div>
        )}
      </div>

      <div className="agent-chat-footer">
        <AgentInput
          value={input}
          onChange={setInput}
          onSend={() => void send()}
          disabled={loading}
          fileTree={fileTree}
          projectPath={projectPath}
        />
        <button type="button" className="agent-send" onClick={() => void send()} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
