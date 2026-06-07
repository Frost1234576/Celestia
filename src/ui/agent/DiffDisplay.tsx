import './DiffDisplay.css'
import type { AgentToolEvent } from '../../core/agent/types'

interface DiffDisplayProps {
  diff: NonNullable<AgentToolEvent['diff']>
  filePath?: string
}

export default function DiffDisplay({ diff, filePath }: DiffDisplayProps) {
  const lines = diff.filter((d, i, arr) => {
    if (d.type !== 'same') return true
    const ctx = arr.slice(Math.max(0, i - 2), i + 3)
    return ctx.some(c => c.type !== 'same')
  })

  if (lines.every(d => d.type === 'same')) return null

  return (
    <div className="diff-display">
      {filePath && <div className="diff-file">{filePath.split(/[\\/]/).pop()}</div>}
      <pre className="diff-lines">
        {lines.map((d, i) => (
          <div key={i} className={`diff-line ${d.type}`}>
            <span className="diff-gutter">{d.type === 'add' ? '+' : d.type === 'remove' ? '-' : ' '}</span>
            <span className="diff-text">{d.line}</span>
          </div>
        ))}
      </pre>
    </div>
  )
}
