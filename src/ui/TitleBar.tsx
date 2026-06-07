import { useState, useEffect } from 'react'
import './TitleBar.css'
import logo from '../assets/logo.svg'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.celestia.window.isMaximized().then(setMaximized)
    window.celestia.window.onMaximizeChange(setMaximized)
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <img src={logo} className="titlebar-logo" alt="Celestia" />
        <span className="titlebar-name">Celestia</span>
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn minimize"
          onClick={() => window.celestia.window.minimize()}
          title="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="titlebar-btn maximize"
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
          className="titlebar-btn close"
          onClick={() => window.celestia.window.close()}
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 0L0 1l4 4-4 4 1 1 4-4 4 4 1-1-4-4 4-4-1-1-4 4z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  )
}