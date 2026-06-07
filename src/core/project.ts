import { create } from 'zustand'
import { joinPath } from './path'
import { useTerminalStore } from './terminal'
import { FileNode } from '../lib/celestia'


interface ProjectSettings{
	type: 'kt' | 'python' | 'other'
	build_command: string | null
	run_command: string | null
}

interface ProjectState {
	projectPath: string | null
	fileTree: FileNode[]
	editorState: 'ready' | 'building' | 'error'
	project_settings?: ProjectSettings
	setEditorState: (state: 'ready' | 'building' | 'error') => void
	openFolder: () => Promise<void>
	setProjectPath: (path: string) => Promise<void>
	refreshTree: () => Promise<void>
	createFileIn: (dirPath: string, name: string) => Promise<string | null>
	createFolderIn: (dirPath: string, name: string) => Promise<boolean>
	renameEntry: (targetPath: string, newName: string) => Promise<string | null>
	deleteEntry: (targetPath: string) => Promise<boolean>
}

const {terminals, closeTerminal} = useTerminalStore.getState()

export const useProjectStore = create<ProjectState>((set, get) => ({
	projectPath: null,
	fileTree: [],
	editorState: 'ready',
	project_settings: undefined,

	setEditorState: (state: 'ready' | 'building' | 'error') => set({ editorState: state }),

	openFolder: async () => {
		const path = await window.celestia.dialog.openFolder()
		// delete all open terminals
		for(const term of terminals) {
			await window.celestia.terminal.kill(term.id)
			closeTerminal(term.id)
		}
		if (path) await get().setProjectPath(path)
	},

	setProjectPath: async (path: string) => {
		set({ projectPath: path })
		try{
			if(await window.celestia.fs.exists(path + "\\project.celestia")) {
				const settings = await window.celestia.fs.readFile(path + "\\project.celestia")
				if(settings.kind === 'text')
					set({ project_settings: JSON.parse(settings.content) as ProjectSettings })
			}
		} catch (error) {
			console.error('Error reading project settings:', error)
		}
		
		window.celestia.rich_presence.set("Browsing Files...", undefined, path.split(/[\\/]/).pop() ?? 'celestia')
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
		if (targetPath.startsWith("archive://")){
			targetPath = targetPath.replace("archive://", "").replace("#","")
		}
		await window.celestia.fs.delete(targetPath)
		await get().refreshTree()
		return true
	},
}))