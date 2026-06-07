import { create } from 'zustand'

export interface OutputLine {
  text: string
  kind: 'default' | 'error' | 'warning' | 'success'
}

interface OutputState {
  outputLines: OutputLine[]
  errorLines: OutputLine[]
  appendOutput: (text: string) => void
  appendError: (text: string) => void
  clearOutput: () => void
  clearErrors: () => void
}

function parseLines(text: string, target: 'output' | 'errors'): OutputLine[] {
  return text.split('\n').filter(Boolean).map(line => ({
    text: line,
    kind: target === 'errors' || /\berror\b/i.test(line)
      ? 'error'
      : /\bwarning\b/i.test(line)
        ? 'warning'
        : /\bsuccess\b/i.test(line)
          ? 'success'
          : 'default',
  }))
}

export const useOutputStore = create<OutputState>((set) => ({
  outputLines: [],
  errorLines: [],

  appendOutput: (text) => set(s => ({
    outputLines: [...s.outputLines, ...parseLines(text, 'output')],
  })),

  appendError: (text) => set(s => ({
    errorLines: [...s.errorLines, ...parseLines(text, 'errors')],
  })),

  clearOutput: () => set({ outputLines: [] }),
  clearErrors: () => set({ errorLines: [] }),
}))
