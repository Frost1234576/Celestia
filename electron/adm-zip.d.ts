declare module 'adm-zip' {
  export default class AdmZip {
    constructor(path: string)
    getEntries(): { entryName: string; isDirectory: boolean; getData(): Buffer }[]
    getEntry(name: string): { getData(): Buffer } | null
  }
}
