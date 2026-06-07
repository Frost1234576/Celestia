import type { ReactNode } from 'react'
import './IconButton.css'

interface IconButtonProps {
  icon: ReactNode
  title: string
  onClick?: () => void
  variant?: 'default' | 'accent' | 'terminal' | 'danger'
  active?: boolean
  className?: string
}

export default function IconButton({
  icon,
  title,
  onClick,
  variant = 'default',
  active = false,
  className = '',
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn-${variant}${active ? ' active' : ''}${className ? ` ${className}` : ''}`}
      title={title}
      onClick={onClick}
    >
      <span className="icon-btn-inner">{icon}</span>
    </button>
  )
}
