import { create } from 'zustand'
import { FileNode } from '../../electron/celestia.d'
import { joinPath } from './path'

interface ProjectState {
  projectPath: string | null
  fileTree: FileNode[]
  openFolder: () => Promise<void>
  setProjectPath: (path: string) => Promise<void>
  refreshTree: () => Promise<void>
  createFileIn: (dirPath: string, name: string) => Promise<string | null>
  createFolderIn: (dirPath: string, name: string) => Promise<boolean>
  renameEntry: (targetPath: string, newName: string) => Promise<string | null>
  deleteEntry: (targetPath: string) => Promise<boolean>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectPath: null,
  fileTree: [],

  openFolder: async () => {
    const path = await window.celestia.dialog.openFolder()
    if (path) await get().setProjectPath(path)
  },

  setProjectPath: async (path: string) => {
    set({ projectPath: path })
    await get().refreshTree()
  },

  refreshTree: async () => {
    const { projectPath } = get()
    if (!projectPath) return
    const tree = await window.celestia.fs.readDir(projectPath)
    set({ fileTree: tree })
  },

  createFileIn: async (dirPath, name) => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const filePath = joinPath(dirPath, trimmed)
    await window.celestia.fs.createFile(filePath)
    await get().refreshTree()
    return filePath
  },

  createFolderIn: async (dirPath, name) => {
    const trimmed = name.trim()
    if (!trimmed) return false
    await window.celestia.fs.createDir(joinPath(dirPath, trimmed))
    await get().refreshTree()
    return true
  },

  renameEntry: async (targetPath, newName) => {
    const trimmed = newName.trim()
    if (!trimmed) return null
    const parent = targetPath.replace(/[/\\][^/\\]+$/, '')
    const newPath = joinPath(parent, trimmed)
    await window.celestia.fs.rename(targetPath, newPath)
    await get().refreshTree()
    return newPath
  },

  deleteEntry: async (targetPath) => {
    await window.celestia.fs.delete(targetPath)
    await get().refreshTree()
    return true
  },
}))