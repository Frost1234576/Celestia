import type { ReactNode } from 'react'
import folderIcon from '../assets/folder/folder.svg'
import starIcon from '../assets/file/star.svg'
import javaIcon from '../assets/file/java.svg'
import jsonIcon from '../assets/file/json.svg'
import fileIcon from '../assets/file/file.svg'
import './FileIcon.css'

interface FileIconProps {
  name: string
  isDirectory?: boolean
  open?: boolean
  className?: string
  /** If set, renders a small badge icon in the bottom-right of a folder icon */
  badgeExt?: string
}

function ArchiveIcon({ mini }: { mini?: boolean }) {
  const s = mini ? 10 : 16
  return (
    <svg viewBox="0 0 16 18" width={s} height={s} className={mini ? undefined : 'file-icon-svg file-icon-archive'}>
      <path d="M10 9 L10 4 Q10 1 7 1 Q4 1 4 4 L4 1.5" fill="none" stroke="#f5c842" strokeWidth="3" strokeLinecap="round"/>
      <rect x="1" y="9" width="14" height="9" rx="2" fill="#f5c842"/>
      <circle cx="8" cy="12.5" r="1.5" fill="#8b6914"/>
      <path d="M7 13.5 L6.5 16 L9.5 16 L9 13.5" fill="#8b6914"/>
    </svg>
  )
}

function TypeScriptIcon({ mini }: { mini?: boolean }) {
  const s = mini ? 10 : 16
  return (
    <svg viewBox="0 0 16 16" width={s} height={s} className={mini ? undefined : 'file-icon-svg file-icon-ts'}>
      <rect width="16" height="16" rx="2" fill="#3178c6" />
      <text x="8" y="11.5" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" fontFamily="Segoe UI, sans-serif">TS</text>
    </svg>
  )
}

function JavaScriptIcon({ mini }: { mini?: boolean }) {
  const s = mini ? 10 : 16
  return (
    <svg viewBox="0 0 16 16" width={s} height={s} className={mini ? undefined : 'file-icon-svg file-icon-js'}>
      <rect width="16" height="16" rx="2" fill="#f7df1e" />
      <text x="8" y="11.5" textAnchor="middle" fill="#323330" fontSize="7" fontWeight="700" fontFamily="Segoe UI, sans-serif">JS</text>
    </svg>
  )
}

function MarkdownIcon({ mini }: { mini?: boolean }) {
  const s = mini ? 10 : 16
  return (
    <svg viewBox="0 0 16 16" width={s} height={s} className={mini ? undefined : 'file-icon-svg file-icon-md'}>
      <rect width="16" height="16" rx="2" fill="#519aba" />
      <text x="8" y="11.5" textAnchor="middle" fill="#fff" fontSize="6.5" fontWeight="700" fontFamily="Segoe UI, sans-serif">MD</text>
    </svg>
  )
}

function CssIcon({ mini }: { mini?: boolean }) {
  const s = mini ? 10 : 16
  return (
    <svg viewBox="0 0 16 16" width={s} height={s} className={mini ? undefined : 'file-icon-svg file-icon-css'}>
      <rect width="16" height="16" rx="2" fill="#264de4" />
      <text x="8" y="11.5" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="700" fontFamily="Segoe UI, sans-serif">CSS</text>
    </svg>
  )
}

function HtmlIcon({ mini }: { mini?: boolean }) {
  const s = mini ? 10 : 16
  return (
    <svg viewBox="0 0 16 16" width={s} height={s} className={mini ? undefined : 'file-icon-svg file-icon-html'}>
      <rect width="16" height="16" rx="2" fill="#e44d26" />
      <text x="8" y="11.5" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="700" fontFamily="Segoe UI, sans-serif">HTML</text>
    </svg>
  )
}

function KotlinIcon({ mini }: { mini?: boolean }) {
  const s = mini ? 10 : 16
  return (
    <svg viewBox="0 0 16 16" width={s} height={s} className={mini ? undefined : 'file-icon-svg file-icon-kt'}>
      <defs>
        <linearGradient id="kt-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7b61ff" />
          <stop offset="50%" stopColor="#e44857" />
          <stop offset="100%" stopColor="#f9a825" />
        </linearGradient>
      </defs>
      <polygon points="0,16 8,0 16,16" fill="url(#kt-grad)" />
    </svg>
  )
}

function ShellIcon({ mini }: { mini?: boolean }) {
  const s = mini ? 10 : 16
  return (
    <svg viewBox="0 0 16 16" width={s} height={s} className={mini ? undefined : 'file-icon-svg file-icon-sh'}>
      <rect width="16" height="16" rx="2" fill="#4a4a4a" />
      <path d="M3 5h7M3 8h5M3 11h6" stroke="#89d185" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11 10l2 1.5-2 1.5" stroke="#89d185" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function YamlIcon({ mini }: { mini?: boolean }) {
  const s = mini ? 10 : 16
  return (
    <svg viewBox="0 0 16 16" width={s} height={s} className={mini ? undefined : 'file-icon-svg file-icon-yaml'}>
      <rect width="16" height="16" rx="2" fill="#cb171e" />
      <text x="8" y="11.5" textAnchor="middle" fill="#fff" fontSize="5.5" fontWeight="700" fontFamily="Segoe UI, sans-serif">YAML</text>
    </svg>
  )
}

function RustIcon({ mini }: { mini?: boolean }) {
  const s = mini ? 10 : 16
  return (
    <svg viewBox="0 0 16 16" width={s} height={s} className={mini ? undefined : 'file-icon-svg'}>
      <rect width="16" height="16" rx="2" fill="#ce422b" />
      <text x="8" y="11.5" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="700" fontFamily="Segoe UI, sans-serif">RS</text>
    </svg>
  )
}

function PythonIcon({ mini }: { mini?: boolean }) {
  const s = mini ? 10 : 16
  return (
    <svg viewBox="0 0 16 16" width={s} height={s} className={mini ? undefined : 'file-icon-svg'}>
      <rect width="16" height="16" rx="2" fill="#3572a5" />
      <text x="8" y="11.5" textAnchor="middle" fill="#fff" fontSize="6.5" fontWeight="700" fontFamily="Segoe UI, sans-serif">PY</text>
    </svg>
  )
}

function ImageAsset({ src, alt, mini }: { src: string; alt: string; mini?: boolean }) {
  const s = mini ? 10 : 16
  return <img src={src} alt={alt} className={mini ? undefined : 'file-icon-img'} width={s} height={s} draggable={false} />
}

/** Returns the icon for a given extension, optionally at mini (badge) size */
export function iconForExt(ext: string, mini = false): ReactNode {
  switch (ext) {
    case 'st':   return <ImageAsset src={starIcon} alt="stella" mini={mini} />
    case 'java': return <ImageAsset src={javaIcon} alt="java" mini={mini} />
    case 'json': return <ImageAsset src={jsonIcon} alt="json" mini={mini} />
    case 'jar': return <ImageAsset src={javaIcon} alt="java" mini={mini} />
    case 'ts':
    case 'tsx':  return <TypeScriptIcon mini={mini} />
    case 'js':
    case 'jsx':  return <JavaScriptIcon mini={mini} />
    case 'md':   return <MarkdownIcon mini={mini} />
    case 'css':  return <CssIcon mini={mini} />
    case 'html': return <HtmlIcon mini={mini} />
    case 'kt':   return <KotlinIcon mini={mini} />
    case 'yaml':
    case 'yml':  return <YamlIcon mini={mini} />
    case 'sh':
    case 'ps1':
    case 'bat':
    case 'cmd':  return <ShellIcon mini={mini} />
    case 'rs':   return <RustIcon mini={mini} />
    case 'py':   return <PythonIcon mini={mini} />
    default:     return null
  }
}

export default function FileIcon({ name, isDirectory, open, className = '', badgeExt }: FileIconProps) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (isDirectory) {
    const badge = badgeExt ? (badgeExt == "archive" ? <ArchiveIcon mini={true} /> : iconForExt(badgeExt, true)) : null
    return (
      <span className={`file-icon ${open ? 'open' : ''} ${className}`} style={{ position: 'relative' }}>
        {iconForExt(ext) ?? <ImageAsset src={folderIcon} alt="folder" />}
        {badge && (
          <span className="file-icon-badge">
            {badge}
          </span>
        )}
      </span>
    )
  }

  const content = iconForExt(ext) ?? <ImageAsset src={fileIcon} alt="file" />

  return <span className={`file-icon ${className}`}>{content}</span>
}