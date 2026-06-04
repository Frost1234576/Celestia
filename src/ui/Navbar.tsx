import { useState, useEffect, useRef } from 'react'
import './Navbar.css'
import logo from '../assets/logo.svg'
import { useLayoutStore } from '../core/layout'
import { useEditorStore } from '../core/editor'
import { useProjectStore } from '../core/project'
import { useOutputStore } from '../core/output'

interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  separator?: boolean
  danger?: boolean
}

export default function Navbar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [status, setStatus] = useState<'ready' | 'building' | 'error'>('ready')
  const [maximized, setMaximized] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  const { toggleSidebar, toggleTerminal, toggleChat } = useLayoutStore()
  const { saveActiveFile, activeTabId } = useEditorStore()
  const { openFolder, projectPath } = useProjectStore()

  const projectName = projectPath
    ? projectPath.split(/[\\/]/).pop() ?? 'celestia'
    : 'no folder open'

  useEffect(() => {
    window.celestia.window.isMaximized().then(setMaximized)
    window.celestia.window.onMaximizeChange(setMaximized)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveActiveFile() }
      if (e.ctrlKey && e.key === 'b') { e.preventDefault(); toggleSidebar() }
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); toggleTerminal() }
      if (e.ctrlKey && e.key === 'o') { e.preventDefault(); openFolder() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saveActiveFile, toggleSidebar, toggleTerminal, openFolder])

  const runBuild = async () => {
    const { projectPath } = useProjectStore.getState()
    const { activeTabId, tabs } = useEditorStore.getState()
    const { appendOutput, appendError } = useOutputStore.getState()
    if (!activeTabId || !projectPath) return
    const tab = tabs.find(t => t.id === activeTabId)
    if (!tab) return
    setStatus('building')
    try {
      const result = await window.celestia.stella.compile(tab.path, projectPath)
      appendOutput(result.stdout)
      appendError(result.stderr)
      setStatus(result.success ? 'ready' : 'error')
    } catch (err) {
      appendError(err instanceof Error ? err.message : 'Build failed')
      setStatus('error')
    }
  }

  const MENUS: { label: string; items: MenuItem[] }[] = [
    {
      label: 'File',
      items: [
        { label: 'Open Folder', shortcut: 'Ctrl+O', action: openFolder },
        { separator: true, label: '' },
        { label: 'Save', shortcut: 'Ctrl+S', action: saveActiveFile },
        { label: 'Save All', shortcut: 'Ctrl+Shift+S', action: () => useEditorStore.getState().saveAllFiles() },
        { separator: true, label: '' },
        { label: 'Close Editor', shortcut: 'Ctrl+W', action: () => {
          if (activeTabId) useEditorStore.getState().closeTab(activeTabId)
        }},
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Find',    shortcut: 'Ctrl+F' },
        { label: 'Replace', shortcut: 'Ctrl+H' },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Toggle Sidebar',  shortcut: 'Ctrl+B', action: toggleSidebar },
        { label: 'Toggle Terminal', shortcut: 'Ctrl+`', action: toggleTerminal },
        { label: 'Toggle Agent Chat', action: toggleChat },
      ],
    },
    {
      label: 'Run',
      items: [
        { label: 'Build', shortcut: 'Ctrl+Shift+B', action: runBuild },
        { label: 'Run',   shortcut: 'F5',            action: runBuild },
        { label: 'Stop',  shortcut: 'Shift+F5',      danger: true },
      ],
    },
    {
      label: 'Stella',
      items: [
        { label: 'Compile File',    shortcut: 'Ctrl+Shift+C' },
        { label: 'Compile Project', action: runBuild },
        { separator: true, label: '' },
        { label: 'Generate Stellab' },
      ],
    },
  ]

  return (
    <nav className="navbar" ref={navRef}>
      <div className="navbar-brand no-drag">
        <img src={logo} className="navbar-logo" alt="Celestia" />
      </div>

      <div className="navbar-menus no-drag">
        {MENUS.map(menu => (
          <div key={menu.label} className={`navbar-menu ${openMenu === menu.label ? 'open' : ''}`}>
            <button className="navbar-menu-btn" onClick={() => setOpenMenu(p => p === menu.label ? null : menu.label)}>
              {menu.label}
            </button>
            {openMenu === menu.label && (
              <div className="navbar-dropdown">
                {menu.items.map((item, i) =>
                  item.separator ? (
                    <div key={i} className="dropdown-sep" />
                  ) : (
                    <div
                      key={i}
                      className={`dropdown-item ${item.danger ? 'danger' : ''}`}
                      onClick={() => { item.action?.(); setOpenMenu(null) }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="navbar-drag">
        <span className="navbar-app-name">Celestia</span>
        <span className="navbar-drag-sep">—</span>
        <span className="navbar-project-name">{projectName}</span>
      </div>

      <div className="navbar-actions no-drag">
        <button className="navbar-action-btn secondary icon-only" title="Settings">⚙</button>
        <div className="navbar-divider" />
        <button className="navbar-action-btn run" onClick={runBuild}>▶ Run</button>
      </div>

      <div className="navbar-status no-drag">
        <div className={`status-dot ${status}`} />
        <span className="status-text">
          {{ ready: 'ready', building: 'building...', error: 'error' }[status]}
        </span>
      </div>

      <div className="navbar-window-controls no-drag">
        <button
          className="window-btn minimize"
          onClick={() => window.celestia.window.minimize()}
          title="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="window-btn maximize"
          onClick={() => window.celestia.window.maximize()}
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M2 0h8v8H8V2H0V0h2z M0 2h6v6H0z" fill="currentColor" fillRule="evenodd" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0" y="0" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button
          className="window-btn close"
          onClick={() => window.celestia.window.close()}
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 0L0 1l4 4-4 4 1 1 4-4 4 4 1-1-4-4 4-4-1-1-4 4z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </nav>
  )
}
