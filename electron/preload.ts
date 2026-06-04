import { ipcRenderer, contextBridge } from 'electron'

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

contextBridge.exposeInMainWorld('celestia', {
  window: {
    minimize:    ()  => ipcRenderer.send('window:minimize'),
    maximize:    ()  => ipcRenderer.send('window:maximize'),
    close:       ()  => ipcRenderer.send('window:close'),
    isMaximized: ()  => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      ipcRenderer.on('window:maximized',   () => cb(true))
      ipcRenderer.on('window:unmaximized', () => cb(false))
    },
  },

  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder') as Promise<string | null>,
    openFile:   () => ipcRenderer.invoke('dialog:openFile')   as Promise<string | null>,
  },

  fs: {
    readDir:         (p: string)                    => ipcRenderer.invoke('fs:readDir',         p)          as Promise<FileNode[]>,
    readArchiveTree: (p: string)                    => ipcRenderer.invoke('fs:readArchiveTree', p)        as Promise<FileNode[]>,
    readFile:        (p: string)                    => ipcRenderer.invoke('fs:readFile',        p)          as Promise<ReadFileResult>,
    writeFile:       (p: string, content: string)   => ipcRenderer.invoke('fs:writeFile',       p, content) as Promise<boolean>,
    createFile:      (p: string)                    => ipcRenderer.invoke('fs:createFile',      p)          as Promise<boolean>,
    createDir:       (p: string)                    => ipcRenderer.invoke('fs:createDir',       p)          as Promise<boolean>,
    rename:          (oldP: string, newP: string)   => ipcRenderer.invoke('fs:rename',          oldP, newP) as Promise<boolean>,
    delete:          (p: string)                    => ipcRenderer.invoke('fs:delete',          p)          as Promise<boolean>,
    exists:          (p: string)                    => ipcRenderer.invoke('fs:exists',          p)          as Promise<boolean>,
  },

  shell: {
    showItemInFolder: (p: string) => ipcRenderer.invoke('shell:showItemInFolder', p) as Promise<boolean>,
  },

  terminal: {
    create: (id: string, cwd?: string) => ipcRenderer.invoke('terminal:create', id, cwd) as Promise<boolean>,
    write:  (id: string, data: string) => ipcRenderer.send('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', id, cols, rows),
    kill:   (id: string)               => ipcRenderer.send('terminal:kill', id),
    onData: (id: string, cb: (data: string) => void) => {
      const channel = `terminal:data:${id}`
      const handler = (_: unknown, data: string) => cb(data)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.off(channel, handler)
    },
    onExit: (id: string, cb: () => void) => {
      ipcRenderer.once(`terminal:exit:${id}`, cb)
    },
  },

  ollama: {
    chat: (payload: { model: string; messages: { role: string; content: string }[] }) =>
      ipcRenderer.invoke('ollama:chat', payload) as Promise<string>,
    listModels: () => ipcRenderer.invoke('ollama:listModels') as Promise<string[]>,
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
    }) => ipcRenderer.invoke('agent:run', payload) as Promise<{
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
    }>,
  },

  stella: {
    compile: (filePath: string, outputDir: string) =>
      ipcRenderer.invoke('stella:compile', filePath, outputDir) as Promise<CompileResult>,
  },
})

contextBridge.exposeInMainWorld('ipcRenderer', {
  on:     (...args: Parameters<typeof ipcRenderer.on>)     => ipcRenderer.on(...args),
  off:    (...args: Parameters<typeof ipcRenderer.off>)    => ipcRenderer.off(...args),
  send:   (...args: Parameters<typeof ipcRenderer.send>)   => ipcRenderer.send(...args),
  invoke: (...args: Parameters<typeof ipcRenderer.invoke>) => ipcRenderer.invoke(...args),
})
