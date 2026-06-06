import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { createRequire } from 'node:module'
import { runAgent } from './agent/agentLoop'
import './rich_presence'

const require = createRequire(import.meta.url)
const pty = require('node-pty') as typeof import('node-pty')
const AdmZip = require('adm-zip') as new (path: string) => import('adm-zip').default



const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST   = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null
const ptyProcesses = new Map<string, import('node-pty').IPty>()

const ARCHIVE_EXTS = new Set(['zip', 'jar', 'war', 'ear'])
const TEXT_EXTS = new Set([
  'txt', 'md', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'ts', 'tsx', 'js', 'jsx', 'py', 'java', 'kt', 'kts', 'st', 'css', 'html',
  'sh', 'ps1', 'bat', 'cmd', 'gradle', 'properties', 'gitignore', 'env',
  'csv', 'sql', 'rs', 'go', 'c', 'cpp', 'h', 'hpp', 'cs', 'rb', 'php', 'lua',
  'vue', 'svelte', 'svg', 'log', 'stella'
])

function isArchivePath(filePath: string): boolean {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return ARCHIVE_EXTS.has(ext)
}

function isLikelyBinary(buf: Buffer): boolean {
  if (buf.length === 0) return false
  const sample = buf.subarray(0, Math.min(buf.length, 8192))
  if (sample.includes(0)) return true
  const text = sample.toString('utf8')
  const bad = (text.match(/\uFFFD/g) ?? []).length
  return bad > sample.length * 0.02
}

function archiveUri(archivePath: string, entryPath = ''): string {
  return `archive://${archivePath}#${entryPath.replace(/\\/g, '/')}`
}

function parseArchiveUri(uri: string): { archivePath: string; entryPath: string } | null {
  const match = uri.match(/^archive:\/\/(.+?)#(.*)$/)
  if (!match) return null
  return { archivePath: match[1], entryPath: match[2] }
}

function buildArchiveTree(archivePath: string): FileNode[] {
  const zip = new AdmZip(archivePath)
  const root: Map<string, FileNode> = new Map()

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const parts = entry.entryName.replace(/\\/g, '/').split('/').filter(Boolean)
    let currentPath = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1
      const entryPath = currentPath ? `${currentPath}/${part}` : part
      const nodePath = archiveUri(archivePath, isFile ? entry.entryName : entryPath)

      if (!root.has(entryPath)) {
        root.set(entryPath, {
          name: part,
          path: nodePath,
          isDirectory: !isFile,
          isArchive: false,
          children: isFile ? undefined : [],
        })
      }

      if (!isFile) {
        currentPath = entryPath
      }
    }
  }

  const nodes = [...root.values()]
  const topLevel: FileNode[] = []
  const byPath = new Map(nodes.map(n => [n.path, n]))

  for (const node of nodes) {
    const parsed = parseArchiveUri(node.path)
    if (!parsed) continue
    const parts = parsed.entryPath.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length <= 1) {
      topLevel.push(node)
    } else {
      const parentEntry = parts.slice(0, -1).join('/')
      const parentPath = archiveUri(parsed.archivePath, parentEntry)
      const parent = byPath.get(parentPath)
      if (parent) {
        parent.isDirectory = true
        parent.children ??= []
        if (!parent.children.some(c => c.path === node.path)) {
          parent.children.push(node)
        }
      } else {
        topLevel.push(node)
      }
    }
  }

  const deduped = new Map<string, FileNode>()
  for (const n of topLevel) deduped.set(n.path, n)
  return [...deduped.values()].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(process.env.VITE_PUBLIC!, 'assets/celestia-logo-tiny.ico'),
    backgroundColor: '#1a1a1a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })



  win.once('ready-to-show', () => win?.show())

  attachWindowStateEvents()

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

ipcMain.on('window:minimize', () => win?.minimize())
ipcMain.on('window:maximize', () => {
  if (win?.isMaximized()) win.unmaximize()
  else win?.maximize()
})
ipcMain.on('window:close', () => win?.close())
ipcMain.handle('window:isMaximized', () => win?.isMaximized() ?? false)

function attachWindowStateEvents() {
  win?.on('maximize', () => win?.webContents.send('window:maximized'))
  win?.on('unmaximize', () => win?.webContents.send('window:unmaximized'))
  win?.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === 's') {
      event.preventDefault()
      win?.webContents.send('save-file')
    }
  })
}

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [
      { name: 'Stella', extensions: ['st'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('fs:readDir', async (_e, dirPath: string) => {
  const readDir = (dir: string): FileNode[] => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    return entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })
      .map(e => {
        const fullPath = path.join(dir, e.name)
        if (isArchivePath(fullPath)) {
          return {
            name: e.name,
            path: archiveUri(fullPath),
            isDirectory: true,
            isArchive: true,
          }
        }
        return {
          name: e.name,
          path: fullPath,
          isDirectory: e.isDirectory(),
          isArchive: false,
          children: e.isDirectory() ? readDir(fullPath) : undefined,
        }
      })
  }
  return readDir(dirPath)
})

ipcMain.handle('fs:readArchiveTree', async (_e, uriOrPath: string) => {
  const parsed = parseArchiveUri(uriOrPath)
  const archivePath = parsed?.archivePath ?? uriOrPath
  if (!fs.existsSync(archivePath)) return []
  return buildArchiveTree(archivePath)
})

ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
  const { execFile } = await import('node:child_process')

  const CFR_JAR = path.join(process.env.APP_ROOT!, 'resources', 'cfr.jar')

  const decompileClass = (classPath: string): Promise<{ kind: 'text', content: string }> =>
    new Promise(resolve => {
      execFile('java', ['-jar', CFR_JAR, classPath], (err, stdout, stderr) => {
        if (err && !stdout) resolve({ kind: 'text', content: `// decompile failed: ${stderr || err.message}` })
        else resolve({ kind: 'text', content: stdout })
      })
    })

  const parsed = parseArchiveUri(filePath)
  if (parsed) {
    const zip = new AdmZip(parsed.archivePath)
    const entry = zip.getEntry(parsed.entryPath)
    if (!entry) return { kind: 'error' as const, message: 'Entry not found in archive' }
    const buf = entry.getData()
    const ext = path.extname(parsed.entryPath).slice(1).toLowerCase()

    if (ext === 'class') {
      const tmp = path.join(os.tmpdir(), path.basename(parsed.entryPath))
      fs.writeFileSync(tmp, buf)
      const result = await decompileClass(tmp)
      fs.rmSync(tmp, { force: true })
      return result
    }

    if (isLikelyBinary(buf) && !TEXT_EXTS.has(ext)) {
      return {
        kind: 'binary' as const,
        message: `Binary file inside archive (${parsed.entryPath}) — cannot display in editor`,
      }
    }
    return { kind: 'text' as const, content: buf.toString('utf8') }
  }

  const buf = fs.readFileSync(filePath)
  if (isArchivePath(filePath)) {
    return { kind: 'archive' as const, message: 'Archive — expand in explorer to browse contents' }
  }

  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (ext === 'class') {
    return await decompileClass(filePath)
  }

  if (isLikelyBinary(buf)) {
    return {
      kind: 'binary' as const,
      message: 'Binary-encoded file — cannot display in editor',
    }
  }
  return { kind: 'text' as const, content: buf.toString('utf8') }
})

ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
  if (filePath.startsWith('archive://')) return false
  fs.writeFileSync(filePath, content, 'utf-8')
  return true
})

ipcMain.handle('fs:createFile', async (_e, filePath: string) => {
  fs.writeFileSync(filePath, '', 'utf-8')
  return true
})

ipcMain.handle('fs:createDir', async (_e, dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true })
  return true
})

ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
  fs.renameSync(oldPath, newPath)
  return true
})

ipcMain.handle('fs:delete', async (_e, targetPath: string) => {
  fs.rmSync(targetPath, { recursive: true, force: true })
  return true
})

ipcMain.handle('fs:exists', async (_e, targetPath: string) => {
  return fs.existsSync(targetPath)
})

ipcMain.handle('shell:showItemInFolder', async (_e, targetPath: string) => {
  const parsed = parseArchiveUri(targetPath)
  shell.showItemInFolder(parsed?.archivePath ?? targetPath)
  return true
})

ipcMain.handle('terminal:create', async (_e, id: string, cwd?: string) => {
  try {
    const shellCmd = process.platform === 'win32'
      ? 'powershell.exe'
      : process.env.SHELL ?? 'bash'

    const proc = pty.spawn(shellCmd, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd ?? os.homedir(),
      env: process.env as Record<string, string>,
    })

    proc.onData(data => win?.webContents.send(`terminal:data:${id}`, data))
    proc.onExit(() => {
      win?.webContents.send(`terminal:exit:${id}`)
      ptyProcesses.delete(id)
    })

    ptyProcesses.set(id, proc)
    return true
  } catch (err) {
    console.error('terminal:create failed', err)
    return false
  }
})

ipcMain.on('terminal:write', (_e, id: string, data: string) => {
  ptyProcesses.get(id)?.write(data)
})

ipcMain.on('terminal:resize', (_e, id: string, cols: number, rows: number) => {
  ptyProcesses.get(id)?.resize(cols, rows)
})

ipcMain.on('terminal:kill', (_e, id: string) => {
  ptyProcesses.get(id)?.kill()
  ptyProcesses.delete(id)
})

ipcMain.handle('ollama:chat', async (_e, payload: {
  model: string
  messages: { role: string; content: string }[]
}) => {
  const res = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: payload.model, messages: payload.messages, stream: false }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Ollama error ${res.status}`)
  }
  const data = await res.json() as { message?: { content?: string } }
  return data.message?.content ?? ''
})

ipcMain.handle('ollama:listModels', async () => {
  const res = await fetch('http://127.0.0.1:11434/api/tags')
  if (!res.ok) throw new Error('Ollama not reachable')
  const data = await res.json() as { models?: { name: string }[] }
  return data.models?.map(m => m.name) ?? []
})

ipcMain.handle('agent:run', async (_e, payload) => runAgent(payload))

ipcMain.handle('stella:compile', async (_e, filePath: string, outputDir: string) => {
  const { execFile } = await import('node:child_process')
  return new Promise(resolve => {
    execFile('stella', ['compile', filePath, '-o', path.join(outputDir, 'out.jar')], (err, stdout, stderr) => {
      resolve({ success: !err, stdout, stderr })
    })
  })
})

app.on('window-all-closed', () => {
  ptyProcesses.forEach(p => p.kill())
  if (process.platform !== 'darwin') { app.quit(); win = null }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(createWindow)

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  isArchive?: boolean
  children?: FileNode[]
}