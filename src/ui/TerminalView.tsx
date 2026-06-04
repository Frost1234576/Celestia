import { useEffect, useState } from 'react'
import './TerminalView.css'
import { useTerminalStore } from '../core/terminal'
import { useProjectStore } from '../core/project'
import { useLayoutStore } from '../core/layout'
import { useOutputStore } from '../core/output'
import TerminalPane from './TerminalPane'
import { IconPlus } from './icons'

type PanelTab = 'terminal' | 'output' | 'errors'

function OutputLines({ lines, empty }: { lines: { text: string; kind: string }[]; empty: string }) {
  if (lines.length === 0) return <div className="terminal-content terminal-muted">{empty}</div>
  return (
    <div className="terminal-log">
      {lines.map((line, i) => (
        <div key={i} className={`terminal-log-line ${line.kind}`}>{line.text}</div>
      ))}
    </div>
  )
}

export default function TerminalView() {
  const [panelTab, setPanelTab] = useState<PanelTab>('terminal')
  const {
    terminals, activeTerminalId, splitPair,
    createTerminal, closeTerminal, setActiveTerminal, splitTerminal,
  } = useTerminalStore()
  const { projectPath } = useProjectStore()
  const { terminalVisible } = useLayoutStore()
  const { outputLines, errorLines } = useOutputStore()

  useEffect(() => {
    if (terminalVisible && terminals.length === 0) {
      void createTerminal(projectPath ?? undefined)
    }
  }, [terminalVisible, terminals.length, createTerminal, projectPath])

  const handleNewTerminal = () => void createTerminal(projectPath ?? undefined)

  const visibleIds = splitPair ?? (activeTerminalId ? [activeTerminalId] : [])

  return (
    <div className="terminal-view">
      <div className="terminal-header">
        <div className="terminal-tabs">
          {(['terminal', 'output', 'errors'] as PanelTab[]).map(tab => (
            <button
              key={tab}
              type="button"
              className={`terminal-tab ${panelTab === tab ? 'active' : ''}`}
              onClick={() => setPanelTab(tab)}
            >
              {tab}
              {tab === 'errors' && errorLines.length > 0 && (
                <span className="terminal-tab-badge error">{errorLines.length}</span>
              )}
            </button>
          ))}
        </div>

        {panelTab === 'terminal' && (
          <div className="terminal-tab-bar">
            {terminals.map(term => (
              <div
                key={term.id}
                className={`terminal-tab-item ${term.id === activeTerminalId ? 'active' : ''}`}
              >
                <button type="button" className="terminal-tab-label" onClick={() => setActiveTerminal(term.id)}>
                  {term.title}
                </button>
                <button
                  type="button"
                  className="terminal-tab-action"
                  title="Split terminal"
                  onClick={() => void splitTerminal(term.id, projectPath ?? undefined)}
                >
                  ⊞
                </button>
                <button
                  type="button"
                  className="terminal-tab-action close"
                  title="Kill terminal"
                  onClick={() => closeTerminal(term.id)}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="terminal-tab-action new" title="New terminal" onClick={handleNewTerminal}>
              <IconPlus />
            </button>
          </div>
        )}
      </div>

      <div className="terminal-body">
        {panelTab === 'terminal' && (
          <div className={`terminal-panes${splitPair ? ' split' : ''}`}>
            {terminals.length === 0 ? (
              <div className="terminal-empty">
                <button type="button" className="terminal-open-btn" onClick={handleNewTerminal}>+ New Terminal</button>
              </div>
            ) : (
              visibleIds.map(id => (
                <TerminalPane
                  key={id}
                  id={id}
                  active={panelTab === 'terminal' && (id === activeTerminalId || !!splitPair)}
                />
              ))
            )}
          </div>
        )}
        {panelTab === 'output' && (
          <OutputLines lines={outputLines} empty="No output yet." />
        )}
        {panelTab === 'errors' && (
          <OutputLines lines={errorLines} empty="No errors." />
        )}
      </div>
    </div>
  )
}
