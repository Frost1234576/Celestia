import { useRef } from "react"
import Editor from "@monaco-editor/react"

/**
 * Core text buffer owned by Celestia (NOT Monaco)
 */
export type TextBuffer = {
  id: string
  text: string
  language?: string
}

/**
 * EditorView = Celestia editor abstraction
 * Monaco is just the rendering backend
 */
export function EditorView({
  buffer,
  onChange
}: {
  buffer: TextBuffer
  onChange(text: string): void
}) {
  const editorRef = useRef<any>(null)

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Editor
        value={buffer.text}
        language={buffer.language ?? "plaintext"}
        theme="vs-dark"
        onMount={(editor) => {
          editorRef.current = editor
        }}
        onChange={(value) => {
          onChange(value ?? "")
        }}
        options={{
          automaticLayout: true, // critical for splits
          minimap: { enabled: false },
          fontSize: 14,
          scrollBeyondLastLine: false,
          wordWrap: "off"
        }}
      />
    </div>
  )
}