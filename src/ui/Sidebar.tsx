import { useState, useRef, useCallback, useMemo } from 'react'
import './Sidebar.css'
import { useProjectStore } from '../core/project'
import { useEditorStore } from '../core/editor'
import { fileName } from '../core/path'
import FileIcon from './FileIcon'
import IconButton from './IconButton'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'
import { IconNewFile, IconNewFolder, IconRefresh } from './icons'
import type { FileNode } from '../../electron/celestia.d'
import { getRunCommand } from '../core/terminal'

interface ContextState { x: number; y: number; node: FileNode }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the dominant file extension if all *files* (non-directories) in
 * `children` share the same extension, otherwise returns undefined.
 * Folders-only or empty children return undefined.
 */
function dominantExt(children: FileNode[] | undefined): string | undefined {
  if (!children || children.length === 0) return undefined
  const files = children.filter(c => !c.isDirectory && !c.isArchive)
  if (files.length === 0) return undefined
  const exts = files.map(f => f.name.split('.').pop()?.toLowerCase() ?? '')
  const first = exts[0]
  if (first === '' || !exts.every(e => e === first)) return undefined
  return first
}

// ─── Inline rename input ──────────────────────────────────────────────────────
function RenameInput({ defaultValue, onConfirm, onCancel }: {
  defaultValue: string
  onConfirm: (v: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <input
      ref={ref}
      className="tree-rename-input"
      defaultValue={defaultValue}
      autoFocus
      onFocus={e => {
        const dot = e.target.value.lastIndexOf('.')
        e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length)
      }}
      onBlur={e => onConfirm(e.target.value.trim())}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); onConfirm((e.target as HTMLInputElement).value.trim()) }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onClick={e => e.stopPropagation()}
    />
  )
}

// ─── TreeNode ─────────────────────────────────────────────────────────────────
function TreeNode({ node, depth, activePath, onFileClick, onContextMenu, onRename, onDelete, onNewFile, onNewFolder }: {
  node: FileNode
  depth: number
  activePath: string | null
  onFileClick: (path: string) => void
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
  onRename: (node: FileNode, newName: string) => void
  onDelete: (node: FileNode) => void
  onNewFile: (dirPath: string) => void
  onNewFolder: (dirPath: string) => void
}) {
  const [expanded, setExpanded] = useState(depth === 0)
  const [children, setChildren] = useState<FileNode[] | undefined>(node.children)
  const [loading, setLoading] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [hovered, setHovered] = useState(false)

  const isExpandable = node.isDirectory || node.isArchive
  const isVirtual = node.path.startsWith('archive://')

  // Compute badge: dominant ext among direct file children
  const badgeExt = useMemo(() => dominantExt(children), [children])

  const handleClick = async () => {
    if (renaming) return
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

  const handleRenameConfirm = (newName: string) => {
    setRenaming(false)
    if (newName && newName !== node.name) onRename(node, newName)
  }

  return (
    <div className="tree-node">
      <button
        type="button"
        className={`tree-item${activePath === node.path ? ' active' : ''}`}
        style={{ '--depth': depth } as React.CSSProperties}
        onClick={() => void handleClick()}
        onContextMenu={e => onContextMenu(e, node)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onKeyDown={e => {
          if (e.key === 'F2' && !isVirtual) { e.preventDefault(); setRenaming(true) }
          if (e.key === 'Delete' && !isVirtual) { e.preventDefault(); onDelete(node) }
        }}
        title={node.name}
      >
        <span className={`tree-arrow${isExpandable ? (expanded ? ' open' : loading ? ' loading' : '') : ' hidden'}`}>
          {loading ? '◌' : '▶'}
        </span>
        <FileIcon
          name={node.name}
          isDirectory={isExpandable}
          open={expanded}
          badgeExt={isExpandable ? (node.isArchive ? "archive" : badgeExt) : undefined}
        />

        {renaming ? (
          <RenameInput
            defaultValue={node.name}
            onConfirm={handleRenameConfirm}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <span className={"tree-name" + ((isVirtual && !node.isArchive) ? ' virtual-file' : (node.isArchive ? ' archived-file' : ''))}>{node.name}</span>
        )}

        {hovered && !renaming && !isVirtual && (
          <span className="tree-actions" onClick={e => e.stopPropagation()}>
            {isExpandable && (
              <>
                <span
                  className="tree-action"
                  title="New File"
                  onClick={e => { e.stopPropagation(); onNewFile(node.path) }}
                >+f</span>
                <span
                  className="tree-action"
                  title="New Folder"
                  onClick={e => { e.stopPropagation(); onNewFolder(node.path) }}
                >+d</span>
              </>
            )}
            <span
              className="tree-action"
              title="Rename (F2)"
              onClick={e => { e.stopPropagation(); setRenaming(true) }}
            >✎</span>
            <span
              className="tree-action tree-action-danger"
              title="Delete (Del)"
              onClick={e => { e.stopPropagation(); onDelete(node) }}
            >✕</span>
          </span>
        )}
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
              onRename={onRename}
              onDelete={onDelete}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── New item input (inline at top of folder) ─────────────────────────────────
function NewItemInput({ placeholder, onConfirm, onCancel }: {
  placeholder: string
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  return (
    <div className="tree-new-item">
      <input
        className="tree-rename-input"
        placeholder={placeholder}
        autoFocus
        onBlur={e => { const v = e.target.value.trim(); v ? onConfirm(v) : onCancel() }}
        onKeyDown={e => {
          if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); v ? onConfirm(v) : onCancel() }
          if (e.key === 'Escape') onCancel()
        }}
      />
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const {
    projectPath, fileTree, openFolder, refreshTree,
    createFileIn, createFolderIn, renameEntry, deleteEntry,
  } = useProjectStore()
  const { openFile, activeTabId, tabs, closeTabByPath, renameTabPath } = useEditorStore()
  const activePath = tabs.find(t => t.id === activeTabId)?.path ?? null
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null)

  const [pendingNew, setPendingNew] = useState<{ dir: string; kind: 'file' | 'folder' } | null>(null)

  const startNew = useCallback((dir: string, kind: 'file' | 'folder') => {
    if (!dir || dir.startsWith('archive://')) return
    setPendingNew({ dir, kind })
  }, [])

  const confirmNew = useCallback(async (name: string) => {
    if (!pendingNew) return
    const { dir, kind } = pendingNew
    setPendingNew(null)
    if (kind === 'file') {
      const fp = await createFileIn(dir, name)
      if (fp) await openFile(fp)
    } else {
      await createFolderIn(dir, name)
    }
  }, [pendingNew, createFileIn, createFolderIn, openFile])

  const handleRename = useCallback(async (node: FileNode, newName: string) => {
    const newPath = await renameEntry(node.path, newName)
    if (!newPath) return
    if (tabs.some(t => t.path === node.path)) {
      if (node.isDirectory) closeTabByPath(node.path)
      else renameTabPath(node.path, newPath)
    }
  }, [renameEntry, tabs, closeTabByPath, renameTabPath])

  const handleDelete = useCallback(async (node: FileNode) => {
    if (!confirm(`Delete "${node.name}"?`)) return
    closeTabByPath(node.path)
    await deleteEntry(node.path)
  }, [deleteEntry, closeTabByPath])

  const buildContextItems = (node: FileNode): ContextMenuItem[] => {
    const isVirtual = node.path.startsWith('archive://') && !node.path.endsWith("#")
    const items: ContextMenuItem[] = []
    if (!isVirtual){
      if (getRunCommand(node.path) !== null){
        items.push({ label: 'Run', action: () => window.dispatchEvent(new CustomEvent('terminal:run', { detail: { command: getRunCommand(node.path) } }))})
      }
    }
    if (!node.isDirectory && !node.isArchive)
      
      items.push({ label: 'Open', action: () => void openFile(node.path) })
    if ((node.isDirectory && !node.isArchive) && !isVirtual)
      items.push(
        { label: 'New File...', action: () => startNew(node.path, 'file') },
        { label: 'New Folder...', action: () => startNew(node.path, 'folder') },
        { separator: true, label: '' },
      )
    // console.log(isVirtual, node.isArchive, node.path)
    if (!isVirtual){
      items.push(
        { label: 'Rename...', shortcut: 'F2', action: () => { /* handled inline */ } },
        { label: 'Copy Path', action: () => void navigator.clipboard.writeText(node.path) },
        { label: 'Reveal in Explorer', action: () => window.celestia.shell.showItemInFolder(node.path) },
        { separator: true, label: '' },
        { label: 'Delete', shortcut: 'Del', danger: true, action: () => void handleDelete(node) },
      )
    }
    else if (node.isArchive)
      items.push(
        { label: 'Rename...', shortcut: 'F2', action: () => { /* handled inline */ } },
        { label: 'Copy Path', action: () => void navigator.clipboard.writeText(node.path) },
        { label: 'Reveal in Explorer', action: () => window.celestia.shell.showItemInFolder(node.path) },
        { separator: true, label: '' },
        { label: 'Delete', shortcut: 'Del', danger: true, action: () => void handleDelete(node) }
      )
    return items
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title" />
        <div className="sidebar-header-btns">
          <IconButton icon={<IconNewFile />} title="New File" variant="accent" onClick={() => startNew(projectPath ?? '', 'file')} />
          <IconButton icon={<IconNewFolder />} title="New Folder" variant="accent" onClick={() => startNew(projectPath ?? '', 'folder')} />
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
            onContextMenu={e => {
              if (e.target === e.currentTarget) {
                e.preventDefault()
                setContextMenu({
                  x: e.clientX, y: e.clientY,
                  node: { name: fileName(projectPath), path: projectPath, isDirectory: true },
                })
              }
            }}
          >
            {pendingNew && pendingNew.dir === projectPath && (
              <NewItemInput
                placeholder={pendingNew.kind === 'file' ? 'filename.ext' : 'folder name'}
                onConfirm={name => void confirmNew(name)}
                onCancel={() => setPendingNew(null)}
              />
            )}

            {fileTree.map(node => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                activePath={activePath}
                onFileClick={path => void openFile(path)}
                onContextMenu={(e, n) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, node: n }) }}
                onRename={(node, newName) => void handleRename(node, newName)}
                onDelete={node => void handleDelete(node)}
                onNewFile={dir => startNew(dir, 'file')}
                onNewFolder={dir => startNew(dir, 'folder')}
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