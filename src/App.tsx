import { useState } from 'react'
import './App.css'

import { LayoutView } from "./ui/LayoutView"
import { LayoutNode } from "./core/layout"

const layout: LayoutNode = {
  type: "split",
  dir: "row",
  sizes: [1, 1],
  children: [
    { type: "tabs", active: "a", tabs: [{ id: "a", kind: "editor" }] },
    { type: "tabs", active: "b", tabs: [{ id: "b", kind: "terminal" }] }
  ]
}

export default function App() {
  return <LayoutView node={layout} />
}