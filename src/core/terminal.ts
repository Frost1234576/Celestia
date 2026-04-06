export interface Terminal {
  write(data: string): void
  onData(cb: (d: string) => void): void
}

export function createMockTerminal(): Terminal {
  return {
    write(d) {
      console.log("TERM:", d)
    },
    onData() {}
  }
}