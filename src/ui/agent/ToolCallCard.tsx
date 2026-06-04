import { useState } from 'react'
import './ToolCallCard.css'
import type { AgentToolEvent } from '../../core/agent/types'
import DiffDisplay from './DiffDisplay'

const TOOL_ICONS: Record<string, string> = {
  read_file: '📖',
  edit_file: '✏️',
  write_file: '📝',
  list_directory: '📁',
  search_codebase: '🔍',
  summarize_file: '📋',
  web_search: '🌐',
}

interface ToolCallCardProps {
  event: AgentToolEvent
}

export default function ToolCallCard({ event }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(!!event.diff)

  const argSummary = Object.entries(event.args)
    .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 40)}`)
    .join(', ')

  return (
    <div className={`tool-card ${event.status}`}>
      <button type="button" className="tool-card-header" onClick={() => setExpanded(e => !e)}>
        <span className="tool-icon">{TOOL_ICONS[event.name] ?? '🔧'}</span>
        <span className="tool-name">{event.name}</span>
        <span className="tool-args">{argSummary}</span>
        <span className={`tool-status ${event.status}`}>{event.status}</span>
        <span className="tool-chevron">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="tool-card-body">
          {event.diff && event.diff.length > 0 && (
            <DiffDisplay diff={event.diff} filePath={event.filePath} />
          )}
          {event.output && (
            <pre className="tool-output">{event.output.slice(0, 4000)}</pre>
          )}
        </div>
      )}
    </div>
  )
}
