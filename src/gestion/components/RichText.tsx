import { Fragment, useId, useRef } from 'react'
import { ArrowRight, Bold, Highlighter, Italic, List, Underline } from 'lucide-react'
import '../../rich-text.css'

type FormatKind = 'bold' | 'italic' | 'highlight' | 'underline'

interface RichTextEditorProps {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
  id?: string
  required?: boolean
  descriptionId?: string
  hideLabel?: boolean
}

const formatConfig: Record<FormatKind, { prefix: string; suffix: string; sample: string }> = {
  bold: { prefix: '**', suffix: '**', sample: 'negrita' },
  italic: { prefix: '*', suffix: '*', sample: 'cursiva' },
  highlight: { prefix: '==', suffix: '==', sample: 'resaltado' },
  underline: { prefix: '__', suffix: '__', sample: 'subrayado' },
}

function markerPositions(value: string, marker: string) {
  const positions: number[] = []
  let cursor = 0
  while (cursor < value.length) {
    const index = value.indexOf(marker, cursor)
    if (index === -1) break
    const previous = value[index - 1]
    const following = value[index + marker.length]
    if (marker !== '*' || (previous !== '*' && following !== '*')) positions.push(index)
    cursor = index + marker.length
  }
  return positions
}

function findEnclosingFormat(value: string, start: number, end: number, config: { prefix: string; suffix: string }) {
  const markers = markerPositions(value, config.prefix)
  let match: { open: number; close: number } | undefined
  for (let index = 0; index + 1 < markers.length; index += 2) {
    const open = markers[index]
    const close = markers[index + 1]
    const contentStart = open + config.prefix.length
    if (contentStart <= start && end <= close && (!match || open > match.open)) match = { open, close }
  }
  return match
}

function renderInlineToken(token: string, key: string) {
  if (token.startsWith('**') && token.endsWith('**')) return <strong key={key}>{renderRichInline(token.slice(2, -2), key)}</strong>
  if (token.startsWith('__') && token.endsWith('__')) return <u key={key}>{renderRichInline(token.slice(2, -2), key)}</u>
  if (token.startsWith('==') && token.endsWith('==')) return <mark key={key}>{renderRichInline(token.slice(2, -2), key)}</mark>
  if (token.startsWith('*') && token.endsWith('*')) return <em key={key}>{renderRichInline(token.slice(1, -1), key)}</em>
  return token
}

function renderRichInline(value: string, keyPrefix = 'rt') {
  const pieces = value.split(/(\*\*[^*\n]+?\*\*|__[^_\n]+?__|==[^=\n]+?==|\*[^*\n]+?\*)/g)
  return pieces.map((piece, index) => {
    const nextPiece = pieces[index + 1] || ''
    const isFormatted = /^(\*\*[^*\n]+?\*\*|__[^_\n]+?__|==[^=\n]+?==|\*[^*\n]+?\*)$/.test(piece)
    const needsSeparator = isFormatted && /^\S/.test(nextPiece) && !/^[,.;:!?)]/.test(nextPiece)
    return (
      <Fragment key={`${keyPrefix}-${index}`}>
        {renderInlineToken(piece, `${keyPrefix}-${index}`)}
        {needsSeparator && ' '}
      </Fragment>
    )
  })
}

function getRichTextLines(value: string) {
  return value.split(/\r?\n/).flatMap((line) => {
    if (!/^\s*•\s+/.test(line)) return [line]
    return line.split(/\s+(?=•\s+)/)
  })
}

export function RichText({ value }: { value: string }) {
  const lines = getRichTextLines(value)
  return (
    <span className="du-rich-text">
      {lines.map((line, index) => {
        const bullet = line.match(/^\s*•\s+(.*)$/)
        return (
          <span className={`rich-text-line${bullet ? ' rich-text-bullet' : ''}`} key={`${line}-${index}`}>
            {bullet && <span className="rich-text-bullet-marker" aria-hidden="true">•</span>}
            {renderRichInline(bullet ? bullet[1] : line, `line-${index}`)}
            {!bullet && index < lines.length - 1 && <br />}
          </span>
        )
      })}
    </span>
  )
}

export function RichTextEditor({ label, value, onChange, className, id, required, descriptionId, hideLabel }: RichTextEditorProps) {
  const labelId = useId()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const restoreEditingPosition = (textarea: HTMLTextAreaElement, selectionStart: number, selectionEnd: number) => {
    const scrollTop = textarea.scrollTop
    const scrollLeft = textarea.scrollLeft
    window.requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true })
      textarea.setSelectionRange(selectionStart, selectionEnd)
      textarea.scrollTop = scrollTop
      textarea.scrollLeft = scrollLeft
    })
  }

  const applyFormat = (kind: FormatKind) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const config = formatConfig[kind]
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentValue = textarea.value
    const selected = currentValue.slice(start, end) || config.sample
    const enclosingFormat = findEnclosingFormat(currentValue, start, end, config)
    if (enclosingFormat) {
      const nextValue = `${currentValue.slice(0, enclosingFormat.open)}${currentValue.slice(enclosingFormat.open + config.prefix.length, enclosingFormat.close)}${currentValue.slice(enclosingFormat.close + config.suffix.length)}`
      const nextStart = start - (start > enclosingFormat.open ? config.prefix.length : 0)
      const nextEnd = end - (end > enclosingFormat.open ? config.prefix.length : 0)
      onChange(nextValue)
      restoreEditingPosition(textarea, nextStart, nextEnd)
      return
    }
    const followingText = currentValue.slice(end)
    const needsSeparator = Boolean(selected) && !/\s$/.test(selected) && /^\S/.test(followingText) && !/^[,.;:!?)]/.test(followingText)
    const nextValue = `${currentValue.slice(0, start)}${config.prefix}${selected}${config.suffix}${needsSeparator ? ' ' : ''}${followingText}`
    onChange(nextValue)
    restoreEditingPosition(textarea, start + config.prefix.length, start + config.prefix.length + selected.length)
  }

  const toggleBulletList = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const currentValue = textarea.value
    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const lineStart = currentValue.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1
    const lineEndIndex = currentValue.indexOf('\n', Math.max(0, selectionEnd - 1))
    const lineEnd = lineEndIndex === -1 ? currentValue.length : lineEndIndex
    if (selectionStart === selectionEnd) {
      const currentLine = currentValue.slice(lineStart, lineEnd)
      if (/^\s*•\s+/.test(currentLine)) {
        const nextValue = `${currentValue.slice(0, lineEnd)}\n• ${currentValue.slice(lineEnd)}`
        const nextCursor = lineEnd + 3
        onChange(nextValue)
        restoreEditingPosition(textarea, nextCursor, nextCursor)
        return
      }

      const nextValue = `${currentValue.slice(0, lineStart)}• ${currentLine}${currentValue.slice(lineEnd)}`
      const nextCursor = selectionStart + 2
      onChange(nextValue)
      restoreEditingPosition(textarea, nextCursor, nextCursor)
      return
    }

    const selectedLines = currentValue.slice(lineStart, lineEnd).split('\n')
    const hasOnlyBullets = selectedLines.filter((line) => line.trim()).every((line) => /^\s*•\s+/.test(line))
    const nextSelectedText = selectedLines.map((line) => {
      if (!line.trim()) return line
      return hasOnlyBullets ? line.replace(/^\s*•\s+/, '') : `• ${line}`
    }).join('\n')

    onChange(`${currentValue.slice(0, lineStart)}${nextSelectedText}${currentValue.slice(lineEnd)}`)
    restoreEditingPosition(textarea, lineStart, lineStart + nextSelectedText.length)
  }

  const insertArrow = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentValue = textarea.value
    const nextValue = `${currentValue.slice(0, start)}→${currentValue.slice(end)}`
    onChange(nextValue)
    restoreEditingPosition(textarea, start + 1, start + 1)
  }

  const continueBulletList = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return
    const textarea = textareaRef.current
    if (!textarea) return

    const currentValue = textarea.value
    const cursor = textarea.selectionStart
    const lineStart = currentValue.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
    const lineEndIndex = currentValue.indexOf('\n', cursor)
    const lineEnd = lineEndIndex === -1 ? currentValue.length : lineEndIndex
    if (!/^\s*•\s+/.test(currentValue.slice(lineStart, lineEnd))) return

    event.preventDefault()
    const nextValue = `${currentValue.slice(0, cursor)}\n• ${currentValue.slice(textarea.selectionEnd)}`
    const nextCursor = cursor + 3
    onChange(nextValue)
    restoreEditingPosition(textarea, nextCursor, nextCursor)
  }

  const handleKeyboardShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLocaleLowerCase('es')
    const format = key === 'b' ? 'bold' : key === 'u' ? 'underline' : key === 'i' ? 'italic' : undefined
    if (!format) return
    event.preventDefault()
    applyFormat(format)
  }

  return (
    <div className={`rich-text-editor du-rich-text-editor ${className || ''}`}>
      {!hideLabel && <span id={labelId}>{label}</span>}
      <div className="rich-text-toolbar" aria-label={`Formato de ${label}`} onMouseDown={(event) => event.preventDefault()}>
        <button type="button" title="Negrita" aria-label="Negrita" onClick={() => applyFormat('bold')}><Bold size={14} /></button>
        <button type="button" title="Cursiva" aria-label="Cursiva" onClick={() => applyFormat('italic')}><Italic size={14} /></button>
        <button type="button" title="Resaltar" aria-label="Resaltar" onClick={() => applyFormat('highlight')}><Highlighter size={14} /></button>
        <button type="button" title="Subrayar" aria-label="Subrayar" onClick={() => applyFormat('underline')}><Underline size={14} /></button>
        <button className="rich-text-list-button" type="button" title="Lista con viñetas" aria-label="Lista con viñetas" onClick={toggleBulletList}><List size={14} /></button>
        <button type="button" title="Insertar flecha" aria-label="Insertar flecha" onClick={insertArrow}><ArrowRight size={14} /></button>
      </div>
      <textarea ref={textareaRef} id={id} required={required} aria-describedby={descriptionId} aria-label={hideLabel?label:undefined} aria-labelledby={hideLabel?undefined:labelId} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { continueBulletList(event); if (!event.defaultPrevented) handleKeyboardShortcut(event) }} />
    </div>
  )
}
