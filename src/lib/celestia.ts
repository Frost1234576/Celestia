/**
 * celestia.ts — Tauri v2 replacement for the Electron contextBridge.
 *
 * Exposes `window.celestia` with the exact same API surface so no other
 * frontend code needs to change.
 */

import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  isArchive?: boolean
  children?: FileNode[]
}

export type ReadFileResult =
  | { kind: 'text'; content: string }
  | { kind: 'binary' | 'archive' | 'error'; message: string }

export interface CompileResult {
  success: boolean
  stdout: string
  stderr: string
}

const win = getCurrentWindow()

const celestia = {
  rich_presence: {
    set: (details: string, state?: string, projectName?: string, smallImageKey?: string) =>
      invoke('rich_presence_set', { details, state: state ?? null, projectName: projectName ?? null, smallImageKey: smallImageKey ?? null }),
    clear: () => invoke('rich_presence_clear'),
  },

  window: {
    minimize: () => invoke('window_minimize'),
    maximize: () => invoke('window_maximize'),
    close: () => invoke('window_close'),
    isMaximized: () => invoke<boolean>('window_is_maximized'),
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      win.onResized(async () => {
        cb(await win.isMaximized())
      })
    },
  },

  dialog: {
    openFolder: () => invoke<string | null>('dialog_open_folder'),
    openFile: () => invoke<string | null>('dialog_open_file'),
  },

  fs: {
    readDir: (path: string) => invoke<FileNode[]>('fs_read_dir', { dirPath: path }),
    readArchiveTree: (path: string) => invoke<FileNode[]>('fs_read_archive_tree', { uriOrPath: path }),
    readFile: (path: string) => invoke<ReadFileResult>('fs_read_file', { filePath: path }),
    writeFile: (path: string, content: string) => invoke<boolean>('fs_write_file', { filePath: path, content }),
    createFile: (path: string) => invoke<boolean>('fs_create_file', { filePath: path }),
    createDir: (path: string) => invoke<boolean>('fs_create_dir', { dirPath: path }),
    rename: (oldPath: string, newPath: string) => invoke<boolean>('fs_rename', { oldPath, newPath }),
    delete: (path: string) => invoke<boolean>('fs_delete', { targetPath: path }),
    exists: (path: string) => invoke<boolean>('fs_exists', { targetPath: path }),
  },

  shell: {
    showItemInFolder: (path: string) => invoke<boolean>('shell_show_item_in_folder', { targetPath: path }),
  },

  terminal: {
    create: (id: string, cwd?: string) => invoke<boolean>('terminal_create', { id, cwd: cwd ?? null }),
    write: (id: string, data: string) => invoke('terminal_write', { id, data }),
    resize: (id: string, cols: number, rows: number) => invoke('terminal_resize', { id, cols, rows }),
    kill: (id: string) => invoke('terminal_kill', { id }),
    onData: (id: string, cb: (data: string) => void) => {
      let unlisten: (() => void) | null = null
      listen<string>(`terminal:data:${id}`, e => cb(e.payload)).then(u => { unlisten = u })
      return () => unlisten?.()
    },
    onExit: (id: string, cb: () => void) => {
      listen(`terminal:exit:${id}`, () => cb()).then(() => {})
    },
  },

  ollama: {
    chat: (payload: { model: string; messages: { role: string; content: string }[] }) =>
      invoke<string>('ollama_chat', { model: payload.model, messages: payload.messages }),
    listModels: () => invoke<string[]>('ollama_list_models'),
  },

  agent: {
    run: (payload: {
      model: string
      userMessage: string
      history: { role: 'user' | 'assistant'; content: string }[]
      projectPath: string | null
      openFiles: { path: string; content: string }[]
      activeFilePath: string | null
      referencedFiles: { path: string; content: string }[]
    }) => invoke<{
      content: string
      toolEvents: {
        id: string
        name: string
        args: Record<string, unknown>
        status: 'running' | 'done' | 'error'
        output?: string
        diff?: { type: 'add' | 'remove' | 'same'; line: string; lineNo?: number }[]
        filePath?: string
      }[]
      filesChanged: boolean
    }>('agent_run', { payload }),
  },

  stella: {
    compile: (filePath: string, outputDir: string) =>
      invoke<CompileResult>('stella_compile', { filePath, outputDir }),
  },
}

// Expose as window.celestia — same surface as the old Electron contextBridge
;(window as any).celestia = celestia

// Also expose window.electron.onSaveFile compatibility shim using Tauri keyboard shortcut
// The Ctrl+S shortcut is handled via TitleBar's keydown listener in the app,
// but we keep this shim for any code using window.electron.onSaveFile.
;(window as any).electron = {
  onSaveFile: (cb: () => void) => {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        cb()
      }
    })
  },
  offSaveFile: () => {},
}

export default celestia
