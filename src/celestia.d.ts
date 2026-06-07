/**
 * Global type augmentation for window.celestia.
 * The runtime implementation lives in src/lib/celestia.ts (Tauri invoke shim).
 */
import type { FileNode, ReadFileResult, CompileResult } from './lib/celestia'

declare global {
  interface Window {
    celestia: {
      rich_presence: {
        set: (details: string, state?: string, projectName?: string, smallImageKey?: string) => void
        clear: () => void
      }
      window: {
        minimize: () => void
        maximize: () => void
        close: () => void
        isMaximized: () => Promise<boolean>
        onMaximizeChange: (cb: (maximized: boolean) => void) => void
      }
      dialog: {
        openFolder: () => Promise<string | null>
        openFile: () => Promise<string | null>
      }
      fs: {
        readDir: (path: string) => Promise<FileNode[]>
        readArchiveTree: (archivePath: string) => Promise<FileNode[]>
        readFile: (path: string) => Promise<ReadFileResult>
        writeFile: (path: string, content: string) => Promise<boolean>
        createFile: (path: string) => Promise<boolean>
        createDir: (path: string) => Promise<boolean>
        rename: (oldPath: string, newPath: string) => Promise<boolean>
        delete: (path: string) => Promise<boolean>
        exists: (path: string) => Promise<boolean>
      }
      shell: {
        showItemInFolder: (path: string) => Promise<boolean>
      }
      terminal: {
        create: (id: string, cwd?: string) => Promise<boolean>
        write: (id: string, data: string) => void
        resize: (id: string, cols: number, rows: number) => void
        kill: (id: string) => void
        onData: (id: string, cb: (data: string) => void) => () => void
        onExit: (id: string, cb: () => void) => void
      }
      ollama: {
        chat: (payload: { model: string; messages: { role: string; content: string }[] }) => Promise<string>
        listModels: () => Promise<string[]>
      }
      agent: {
        run: (payload: {
          model: string
          userMessage: string
          history: { role: 'user' | 'assistant'; content: string }[]
          projectPath: string | null
          openFiles: { path: string; content: string }[]
          activeFilePath: string | null
          referencedFiles: { path: string; content: string }[]
        }) => Promise<{
          content: string
          toolEvents: import('./core/agent/types').AgentToolEvent[]
          filesChanged: boolean
        }>
      }
      stella: {
        compile: (filePath: string, outputDir: string) => Promise<CompileResult>
      }
    }
    electron: {
      onSaveFile: (cb: () => void) => void
      offSaveFile: () => void
    }
  }
}

export {}
