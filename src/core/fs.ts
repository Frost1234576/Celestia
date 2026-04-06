export type FileNode = {
  id: string
  name: string
  kind: "file" | "dir"
  children?: FileNode[]
}