import './MarkdownContent.css'
import DOMPurify from 'dompurify'


interface MarkdownContentProps {
  text: string
}

export default function MarkdownContent({ text }: MarkdownContentProps) {
  const blocks = parseBlocks(text)

  return (
    <div className="md-content">
      {blocks.map((block, i) => {
        if (block.type === 'code') {
          return (
            <pre key={i} className="md-code-block">
              {block.lang && <span className="md-code-lang">{block.lang}</span>}
              <code>{block.content}</code>
            </pre>
          )
        }
        return <p key={i} className="md-para" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(inlineFormat(block.content)) }} />
      })}
    </div>
  )
}

function parseBlocks(text: string): { type: 'text' | 'code'; content: string; lang?: string }[] {
  const blocks: { type: 'text' | 'code'; content: string; lang?: string }[] = []
  const re = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) blocks.push({ type: 'text', content: text.slice(last, m.index).trim() })
    blocks.push({ type: 'code', lang: m[1] || undefined, content: m[2].trimEnd() })
    last = m.index + m[0].length
  }
  if (last < text.length) blocks.push({ type: 'text', content: text.slice(last).trim() })
  if (blocks.length === 0) blocks.push({ type: 'text', content: text })
  return blocks.filter(b => b.content)
}

function inlineFormat(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="md-inline">$1</code>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n/g, '<br/>')
}
