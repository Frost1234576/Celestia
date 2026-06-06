import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import './AgentInput.css'
import { flattenFileTree } from '../../core/agent/types'
import type { FileNode } from '../../../electron/celestia.d'

interface AgentInputProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  fileTree: FileNode[]
  projectPath: string | null
}

// Split text into plain segments and @token segments for rendering
function tokenize(text: string): { type: 'text' | 'at'; value: string }[] {
  const result: { type: 'text' | 'at'; value: string }[] = []
  const regex = /@([\w./\\-]+)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) result.push({ type: 'text', value: text.slice(last, match.index) })
    result.push({ type: 'at', value: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) result.push({ type: 'text', value: text.slice(last) })
  return result
}

export default function AgentInput({ value, onChange, onSend, disabled, fileTree, projectPath }: AgentInputProps) {
  const [atOpen, setAtOpen] = useState(false)
  const [atFilter, setAtFilter] = useState('')
  const [atIndex, setAtIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  const files = flattenFileTree(fileTree)

  const filtered = files.filter(f =>
    f.name.toLowerCase().includes(atFilter.toLowerCase())
  ).slice(0, 12)

  const tokens = useMemo(() => tokenize(value), [value])

  // Keep highlight div scroll in sync with textarea
  const syncScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }, [])

  const insertAtRef = useCallback((file: { path: string; name: string }) => {
    const ta = textareaRef.current
    if (!ta) return
    const rel = projectPath && file.path.startsWith(projectPath)
      ? file.path.slice(projectPath.length).replace(/^[/\\]/, '')
      : file.name
    const before = value.slice(0, ta.selectionStart).replace(/@([\w./\\-]*)$/, `@${rel} `)
    const after = value.slice(ta.selectionStart)
    onChange(before + after)
    setAtOpen(false)
    setAtFilter('')
    requestAnimationFrame(() => ta.focus())
  }, [value, onChange, projectPath])

  const handleChange = (v: string) => {
    onChange(v)
    const ta = textareaRef.current
    if (!ta) return
    const head = v.slice(0, ta.selectionStart)
    const atMatch = head.match(/@([\w./\\-]*)$/)
    if (atMatch) {
      setAtOpen(true)
      setAtFilter(atMatch[1])
      setAtIndex(0)
    } else {
      setAtOpen(false)
    }
  }

  useEffect(() => {
    const handler = (e: CustomEvent<{ text: string }>) => {
      const text = e.detail.text
      onChange(text+"\n\n")
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        // textareaRef.current?.select()
      })
    }
    window.addEventListener('fill-agent-input', handler as EventListener)
    return () => window.removeEventListener('fill-agent-input', handler as EventListener)
  }, [onChange])

  useEffect(() => {
    if (!atOpen) return
    const close = () => setAtOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [atOpen])

  return (
    <div className="agent-input-wrap">
      {atOpen && filtered.length > 0 && (
        <div className="at-menu" onClick={e => e.stopPropagation()}>
          {filtered.map((f, i) => (
            <button
              key={f.path}
              type="button"
              className={`at-item${i === atIndex ? ' active' : ''}`}
              onClick={() => insertAtRef(f)}
            >
              <span className="at-name">{f.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="agent-input-field">
        <div
          ref={highlightRef}
          className="agent-input-highlight"
          aria-hidden="true"
        >
          {tokens.map((tok, i) =>
            tok.type === 'at'
              ? <mark key={i} className="at-token">{tok.value}</mark>
              : <span key={i}>{tok.value}</span>
          )}
          {' '}
        </div>

        <textarea
          ref={textareaRef}
          className="agent-input"
          value={value}
          onChange={e => { handleChange(e.target.value); syncScroll() }}
          onScroll={syncScroll}
          onKeyDown={e => {
            if (atOpen && filtered.length > 0) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setAtIndex(i => Math.min(i + 1, filtered.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setAtIndex(i => Math.max(i - 1, 0)) }
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault()
                insertAtRef(filtered[atIndex])
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
          }}
          placeholder="Ask anything… @ to reference files"
          rows={3}
          disabled={disabled}
        />
      </div>

      <div className="agent-input-hint">
        <span>@ file</span>
        <span>↵ send</span>
        <span>⇧↵ newline</span>
      </div>
    </div>
  )
}