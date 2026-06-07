import { create } from 'zustand'

interface LayoutState {
  sidebarWidth: number
  terminalHeight: number
  chatWidth: number
  sidebarVisible: boolean
  terminalVisible: boolean
  chatVisible: boolean
  setSidebarWidth: (w: number) => void
  setTerminalHeight: (h: number) => void
  setChatWidth: (w: number) => void
  toggleSidebar: () => void
  toggleTerminal: () => void
  toggleChat: () => void
  showTerminal: () => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarWidth:    240,
  terminalHeight:  220,
  chatWidth:       320,
  sidebarVisible:  true,
  terminalVisible: true,
  chatVisible:     true,

  setSidebarWidth:    (w) => set({ sidebarWidth: w }),
  setTerminalHeight:  (h) => set({ terminalHeight: h }),
  setChatWidth:       (w) => set({ chatWidth: w }),
  toggleSidebar:      ()  => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  toggleTerminal:     ()  => set((s) => ({ terminalVisible: !s.terminalVisible })),
  toggleChat:         ()  => set((s) => ({ chatVisible: !s.chatVisible })),
  showTerminal:       ()  => set({ terminalVisible: true }),
}))
