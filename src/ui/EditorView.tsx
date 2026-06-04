import './EditorView.css'
import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { useEditorStore } from '../core/editor'
import { setupLinting } from '../core/linting/setupLinting'
import FileIcon from './FileIcon'

export default function EditorView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const modelsRef = useRef<Map<string, monaco.editor.ITextModel>>(new Map())
  const activeTabIdRef = useRef<string | null>(null)

  const { tabs, activeTabId, closeTab, setActiveTab, updateContent, isUnsaved } = useEditorStore()
  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  useEffect(() => {
    if (!containerRef.current) return

    setupLinting(monaco)

    const editor = monaco.editor.create(containerRef.current, {
      theme: 'celestia-dark',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      automaticLayout: true,
      padding: { top: 8 },
      glyphMargin: true,
    })

    editorRef.current = editor

    editor.onDidChangeModelContent(() => {
      const id = activeTabIdRef.current
      if (id) updateContent(id, editor.getValue())
    })

    return () => {
      modelsRef.current.forEach(model => model.dispose())
      modelsRef.current.clear()
      editor.dispose()
      editorRef.current = null
    }
  }, [updateContent])

  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !activeTab) return

    editor.updateOptions({ readOnly: !!activeTab.readOnly })

    if (activeTab.notice && !activeTab.content) {
      editor.setModel(null)
      return
    }

    let model = modelsRef.current.get(activeTab.id)
    if (!model) {
      model = monaco.editor.createModel(
        activeTab.content,
        activeTab.language,
        monaco.Uri.parse(activeTab.path.startsWith('archive://') ? activeTab.path : `file:///${activeTab.path}`),
      )
      modelsRef.current.set(activeTab.id, model)
    } else if (model.getValue() !== activeTab.content) {
      model.setValue(activeTab.content)
    }

    editor.setModel(model)
    editor.focus()
  }, [activeTab])

  useEffect(() => {
    const openIds = new Set(tabs.map(t => t.id))
    for (const [id, model] of modelsRef.current) {
      if (!openIds.has(id)) {
        model.dispose()
        modelsRef.current.delete(id)
      }
    }
  }, [tabs])

  return (
    <div className="editor-view">
      <div className="editor-tabs">
        {tabs.length === 0 ? (
          <div className="editor-tabs-empty">No open files</div>
        ) : (
          tabs.map(tab => (
            <div
              key={tab.id}
              className={`editor-tab ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <FileIcon name={tab.name} />
              <span className="tab-name">
                {tab.name}
                {isUnsaved(tab.id) && <span className="tab-unsaved">●</span>}
              </span>
              <button
                className="tab-close"
                title="Close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div className="editor-body">
        {activeTab?.notice && (
          <div className={`editor-notice${activeTab.content ? '' : ' full'}`}>{activeTab.notice}</div>
        )}
        <div
          ref={containerRef}
          className={`editor-monaco${activeTab && (!activeTab.notice || activeTab.content) ? '' : ' editor-monaco-hidden'}`}
        />
        {!activeTab && (
          <div className="editor-placeholder">
            <div className="editor-placeholder-logo">C</div>
            <p className="editor-placeholder-title">Celestia</p>
            <p className="editor-placeholder-sub">Open a file from the explorer to start editing</p>
          </div>
        )}
      </div>
    </div>
  )
}
