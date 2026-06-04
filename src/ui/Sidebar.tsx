import { useState } from 'react'
import './Sidebar.css'
import { useProjectStore } from '../core/project'
import { useEditorStore } from '../core/editor'
import { fileName } from '../core/path'
import FileIcon from './FileIcon'
import IconButton from './IconButton'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import { IconNewFile, IconNewFolder, IconRefresh } from './icons'
import type { FileNode } from '../../electron/celestia.d'

interface ContextState {
  x: number
  y: number
  node: FileNode
}

function TreeNode({ node, depth, activePath, onFileClick, onContextMenu }: {
  node: FileNode
  depth: number
  activePath: string | null
  onFileClick: (path: string) => void
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
}) {
  const [expanded, setExpanded] = useState(depth === 0)
  const [children, setChildren] = useState<FileNode[] | undefined>(node.children)
  const [loading, setLoading] = useState(false)

  const isExpandable = node.isDirectory || node.isArchive

  const handleClick = async () => {
    if (isExpandable) {
      if (!expanded && node.isArchive && !children?.length) {
        setLoading(true)
        try {
          const tree = await window.celestia.fs.readArchiveTree(node.path)
          setChildren(tree)
        } finally {
          setLoading(false)
        }
      }
      setExpanded(e => !e)
    } else {
      onFileClick(node.path)
    }
  }

  return (
    <div className="tree-node">
      <button
        type="button"
        className={`tree-item ${activePath === node.path ? 'active' : ''}`}
        style={{ '--depth': depth } as React.CSSProperties}
        onClick={() => void handleClick()}
        onContextMenu={(e) => onContextMenu(e, node)}
        title={node.name}
      >
        <span className={`tree-arrow ${isExpandable ? (expanded ? 'open' : loading ? 'loading' : '') : 'hidden'}`}>
          {loading ? '◌' : '▶'}
        </span>
        <FileIcon name={node.name} isDirectory={isExpandable} open={expanded} />
        <span className="tree-name">{node.name}</span>
      </button>
      {isExpandable && expanded && children && (
        <div className="tree-children">
          {children.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              onFileClick={onFileClick}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const {
    projectPath, fileTree, openFolder, refreshTree,
    createFileIn, createFolderIn, renameEntry, deleteEntry,
  } = useProjectStore()
  const { openFile, activeTabId, tabs, closeTabByPath, renameTabPath } = useEditorStore()
  const activePath = tabs.find(t => t.id === activeTabId)?.path ?? null
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null)

  const promptName = (label: string, defaultValue = '') => prompt(label, defaultValue)?.trim() ?? null

  const handleNewFile = async (dirPath?: string) => {
    const base = dirPath ?? projectPath
    if (!base || base.startsWith('archive://')) return
    const name = promptName('File name:')
    if (!name) return
    const fp = await createFileIn(base, name)
    if (fp) await openFile(fp)
  }

  const handleNewFolder = async (dirPath?: string) => {
    const base = dirPath ?? projectPath
    if (!base || base.startsWith('archive://')) return
    const name = promptName('Folder name:')
    if (!name) return
    await createFolderIn(base, name)
  }

  const handleRename = async (node: FileNode) => {
    if (node.path.startsWith('archive://')) return
    const newName = promptName('Rename to:', node.name)
    if (!newName || newName === node.name) return
    const newPath = await renameEntry(node.path, newName)
    if (!newPath) return
    if (tabs.some(t => t.path === node.path)) {
      if (node.isDirectory) closeTabByPath(node.path)
      else renameTabPath(node.path, newPath)
    }
  }

  const handleDelete = async (node: FileNode) => {
    if (node.path.startsWith('archive://')) return
    if (!confirm(`Delete "${node.name}"?`)) return
    closeTabByPath(node.path)
    await deleteEntry(node.path)
  }

  const buildContextItems = (node: FileNode): ContextMenuItem[] => {
    const isVirtual = node.path.startsWith('archive://')
    const items: ContextMenuItem[] = []

    if (!node.isDirectory && !node.isArchive) {
      items.push({ label: 'Open', action: () => void openFile(node.path) })
    }

    if ((node.isDirectory || node.isArchive) && !isVirtual) {
      items.push(
        { label: 'New File...', action: () => void handleNewFile(node.path) },
        { label: 'New Folder...', action: () => void handleNewFolder(node.path) },
        { separator: true, label: '' },
      )
    }

    if (!isVirtual) {
      items.push(
        { label: 'Rename...', shortcut: 'F2', action: () => void handleRename(node) },
        { label: 'Copy Path', action: () => void navigator.clipboard.writeText(node.path) },
        { label: 'Reveal in Explorer', action: () => window.celestia.shell.showItemInFolder(node.path) },
        { separator: true, label: '' },
        { label: 'Delete', shortcut: 'Del', danger: true, action: () => void handleDelete(node) },
      )
    } else if (node.isArchive) {
      items.push({ label: 'Copy Path', action: () => void navigator.clipboard.writeText(node.path) })
    }

    return items
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Explorer</span>
        <div className="sidebar-header-btns">
          <IconButton icon={<IconNewFile />} title="New File" variant="accent" onClick={() => void handleNewFile()} />
          <IconButton icon={<IconNewFolder />} title="New Folder" variant="accent" onClick={() => void handleNewFolder()} />
          <IconButton icon={<IconRefresh />} title="Refresh" onClick={refreshTree} />
        </div>
      </div>
      <div className="sidebar-body">
        {!projectPath ? (
          <div className="sidebar-empty">
            <p>No folder open</p>
            <button type="button" className="sidebar-open-btn" onClick={openFolder}>Open Folder</button>
          </div>
        ) : (
          <div
            className="file-tree"
            onContextMenu={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault()
                setContextMenu({
                  x: e.clientX, y: e.clientY,
                  node: { name: fileName(projectPath), path: projectPath, isDirectory: true },
                })
              }
            }}
          >
            {fileTree.map(node => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                activePath={activePath}
                onFileClick={(path) => void openFile(path)}
                onContextMenu={(e, n) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, node: n }) }}
              />
            ))}
          </div>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems(contextMenu.node)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
