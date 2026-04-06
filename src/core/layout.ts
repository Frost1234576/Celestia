export type LayoutNode =
  | {
      type: "split"
      dir: "row" | "col"
      children: LayoutNode[]
      sizes: number[]
    }
  | {
      type: "tabs"
      tabs: Tab[]
      active: string
    }

export type Tab = {
  id: string
  kind: "editor" | "terminal"
}