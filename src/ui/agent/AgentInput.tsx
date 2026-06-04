import { useState, useRef, useEffect, useCallback } from 'react'
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

export default function AgentInput({ value, onChange, onSend, disabled, fileTree, projectPath }: AgentInputProps) {
  const [atOpen, setAtOpen] = useState(false)
  const [atFilter, setAtFilter] = useState('')
  const [atIndex, setAtIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const files = flattenFileTree(fileTree)

  const filtered = files.filter(f =>
    f.name.toLowerCase().includes(atFilter.toLowerCase())
  ).slice(0, 12)

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
      <textarea
        ref={textareaRef}
        className="agent-input"
        value={value}
        onChange={e => handleChange(e.target.value)}
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
      <div className="agent-input-hint">
        <span>@ file</span>
        <span>↵ send</span>
        <span>⇧↵ newline</span>
      </div>
    </div>
  )
}
