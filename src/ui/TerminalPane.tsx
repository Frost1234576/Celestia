import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { colorizeTerminalOutput } from '../core/terminalOutput'
import './TerminalPane.css'

interface TerminalPaneProps {
  id: string
  active: boolean
}

export default function TerminalPane({ id, active }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Consolas, "Cascadia Code", monospace',
      theme: {
        background: '#141414',
        foreground: '#e0e0e0',
        cursor: '#98b7d6',
        selectionBackground: '#1e3a5288',
      },
      scrollback: 5000,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    const unsubData = window.celestia.terminal.onData(id, data => {
      term.write(colorizeTerminalOutput(data))
    })

    term.onData(data => window.celestia.terminal.write(id, data))

    const resizeObserver = new ResizeObserver(() => {
      fit.fit()
      window.celestia.terminal.resize(id, term.cols, term.rows)
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      unsubData()
      resizeObserver.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [id])

  useEffect(() => {
    if (active && fitRef.current && termRef.current) {
      requestAnimationFrame(() => {
        fitRef.current?.fit()
        if (termRef.current) {
          window.celestia.terminal.resize(id, termRef.current.cols, termRef.current.rows)
          termRef.current.focus()
        }
      })
    }
  }, [active, id])

  return (
    <div className={`terminal-pane${active ? ' active' : ''}`} ref={containerRef} />
  )
}
