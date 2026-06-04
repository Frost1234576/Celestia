import { create } from 'zustand'

export interface TerminalInstance {
  id: string
  title: string
  cwd?: string
}

interface TerminalState {
  terminals: TerminalInstance[]
  activeTerminalId: string | null
  splitPair: [string, string] | null
  createTerminal: (cwd?: string) => Promise<string | null>
  closeTerminal: (id: string) => void
  setActiveTerminal: (id: string) => void
  splitTerminal: (id: string, cwd?: string) => Promise<void>
  unsplit: () => void
}

let termCounter = 0

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: [],
  activeTerminalId: null,
  splitPair: null,

  createTerminal: async (cwd?: string) => {
    const id = `term-${++termCounter}`
    const ok = await window.celestia.terminal.create(id, cwd)
    if (!ok) return null
    const inst: TerminalInstance = { id, title: `powershell`, cwd }
    set(s => ({ terminals: [...s.terminals, inst], activeTerminalId: id }))
    return id
  },

  closeTerminal: (id: string) => {
    window.celestia.terminal.kill(id)
    set(s => {
      const newTerms = s.terminals.filter(t => t.id !== id)
      let splitPair = s.splitPair
      if (splitPair && (splitPair[0] === id || splitPair[1] === id)) {
        splitPair = null
      }
      const newActive = s.activeTerminalId === id
        ? newTerms[newTerms.length - 1]?.id ?? null
        : s.activeTerminalId
      return { terminals: newTerms, activeTerminalId: newActive, splitPair }
    })
  },

  setActiveTerminal: (id: string) => set({ activeTerminalId: id }),

  splitTerminal: async (id, cwd) => {
    const newId = await get().createTerminal(cwd)
    if (!newId) return
    set({ splitPair: [id, newId], activeTerminalId: newId })
  },

  unsplit: () => set({ splitPair: null }),
}))
