import { LayoutNode } from "../core/layout"

export function LayoutView({ node }: { node: LayoutNode }) {
  if (node.type === "split") {
    return (
      <div style={{ display: "flex", flexDirection: node.dir === "row" ? "row" : "column" }}>
        {node.children.map((c, i) => (
          <LayoutView key={i} node={c} />
        ))}
      </div>
    )
  }

  return (
    <div>
      {node.tabs.map(t => (
        <div key={t.id}>{t.kind}</div>
      ))}
    </div>
  )
}