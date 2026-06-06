import { create } from 'zustand'
import { useProjectStore } from './project'

export interface EditorTab {
  id: string
  path: string
  name: string
  content: string
  savedContent: string
  language: string
  readOnly?: boolean
  notice?: string
}


function getLanguage(filePath: string): string {
  const base = filePath.includes('#') ? filePath.split('#').pop() ?? filePath : filePath
  const ext = base.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
	ts: 'typescript', tsx: 'typescript',
	js: 'javascript', jsx: 'javascript',
	py: 'python',
	class: "java",
	kt: 'kotlin', kts: 'kotlin',
	java: 'java',
	st: 'stella',
	json: 'json', yaml: 'yaml', yml: 'yaml',
	md: 'markdown', html: 'html', css: 'css',
	sh: 'shell', ps1: 'powershell',
	xml: 'xml', toml: 'ini', gradle: 'groovy',
  }
  return map[ext] ?? 'plaintext'
}

function tabName(filePath: string): string {
  if (filePath.startsWith('archive://')) {
	const entry = filePath.split('#')[1] ?? filePath
	return entry.split('/').pop() ?? entry
  }
  return filePath.split(/[\\/]/).pop() ?? filePath
}

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  openFile: (filePath: string) => Promise<void>
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
  saveActiveFile: () => Promise<void>
  saveAllFiles: () => Promise<void>
  isUnsaved: (id: string) => boolean
  renameTabPath: (oldPath: string, newPath: string) => void
  closeTabByPath: (path: string) => void
}

// const projectPath = useProjectStore(s => s.projectPath)

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openFile: async (filePath: string) => {
	const { tabs } = get()
	const existing = tabs.find(t => t.path === filePath)
	if (existing) {
	  set({ activeTabId: existing.id })
	  return
	}

	const result = await window.celestia.fs.readFile(filePath)

	if (result.kind === 'text') {
	  const tab: EditorTab = {
		id: filePath,
		path: filePath,
		name: tabName(filePath),
		content: result.content,
		savedContent: result.content,
		language: getLanguage(filePath),
		readOnly: filePath.startsWith('archive://'),
	  }
	  set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
	  return
	}

	const tab: EditorTab = {
	  id: filePath,
	  path: filePath,
	  name: tabName(filePath),
	  content: '',
	  savedContent: '',
	  language: 'plaintext',
	  readOnly: true,
	  notice: result.message,
	}
	window.celestia.rich_presence.set("Editing " + tabName(filePath), "...", get().tabs.find(t => t.id === filePath)?.path.split(/[\\/]/).pop() ?? 'celestia')

	set(s => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
  },

  closeTab: (id: string) => {
	set(s => {
	  const idx = s.tabs.findIndex(t => t.id === id)
	  const newTabs = s.tabs.filter(t => t.id !== id)
	  let newActive = s.activeTabId
	  if (s.activeTabId === id) {
		newActive = newTabs[idx]?.id ?? newTabs[idx - 1]?.id ?? null
	  }
	  return { tabs: newTabs, activeTabId: newActive }
	})
  },

  

  setActiveTab: (id: string) => {
	// console.log("setting active tab")
	set({ activeTabId: id }); /* update rpc */ 
	// const projectName = projectPath
		// ? projectPath.split(/[\\/]/).pop() ?? 'celestia'
		// : 'no folder open'
	// console.log("setActiveTab")
	// console.log("Setting active tab to", id)
	// console.log("Rich Presence: "+"Editing " + tabName(id)+", project: " + get().tabs.find(t => t.id === id)?.path.split(/[\\/]/).pop())
	window.celestia.rich_presence.set("Editing " + tabName(id), "...", get().tabs.find(t => t.id === id)?.path.split(/[\\/]/).pop() ?? 'celestia')
  },

  updateContent: (id: string, content: string) => {
	set(s => ({
	  tabs: s.tabs.map(t => t.id === id && !t.readOnly ? { ...t, content } : t),
	}))
  },

  saveActiveFile: async () => {
	const { tabs, activeTabId } = get()
	const tab = tabs.find(t => t.id === activeTabId)
	if (!tab || tab.readOnly) return
	await window.celestia.fs.writeFile(tab.path, tab.content)
	set(s => ({
	  tabs: s.tabs.map(t => t.id === tab.id ? { ...t, savedContent: t.content } : t),
	}))
  },

  saveAllFiles: async () => {
	const { tabs } = get()
	await Promise.all(
	  tabs
		.filter(t => !t.readOnly && t.content !== t.savedContent)
		.map(t => window.celestia.fs.writeFile(t.path, t.content)
		  .then(() => set(s => ({
			tabs: s.tabs.map(x => x.id === t.id ? { ...x, savedContent: x.content } : x),
		  })))
		)
	)
  },

  isUnsaved: (id: string) => {
	const tab = get().tabs.find(t => t.id === id)
	return tab ? !tab.readOnly && tab.content !== tab.savedContent : false
  },

  renameTabPath: (oldPath, newPath) => {
	const name = tabName(newPath)
	set(s => ({
	  tabs: s.tabs.map(t =>
		t.path === oldPath
		  ? { ...t, id: newPath, path: newPath, name, language: getLanguage(newPath) }
		  : t
	  ),
	  activeTabId: s.activeTabId === oldPath ? newPath : s.activeTabId,
	}))
  },

  closeTabByPath: (path) => {
	const tab = get().tabs.find(t => t.path === path)
	if (tab) get().closeTab(tab.id)
  },
}))
