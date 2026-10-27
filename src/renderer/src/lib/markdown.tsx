import { createContext, createElement, useContext, type ReactNode } from 'react'
import NoteAudio from '../components/NoteAudio'

function safeUrl(value: string): string | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
  } catch {
    return null
  }
}

/** Images de note : https, ou croquis embarqué en data URL PNG/JPEG. */
function safeImage(value: string): string | null {
  if (/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value)) return value
  return safeUrl(value)
}

export interface NoteLinkContext {
  /** Note qui porte ce titre, ou null. */
  resolve(title: string): { id: string; title: string } | null
  open(id: string): void
  create?(title: string): void
}

export interface NoteAudioContext {
  remove?(name: string): void
  transcribe?(name: string, text: string): void
  error?(message: string): void
}

const LinkContext = createContext<NoteLinkContext | null>(null)
const AudioContext = createContext<NoteAudioContext | null>(null)

/** Lien `[[Titre]]` : cliquable s'il pointe vers une note, marqué sinon. */
function WikiToken({ title, shown, raw }: { title: string; shown: string; raw: string }) {
  const links = useContext(LinkContext)
  if (!links) return <>{raw}</>
  const found = links.resolve(title)
  if (found) {
    return (
      <button
        type="button"
        className="md-wikilink"
        onClick={() => links.open(found.id)}
        title={`Ouvrir la note « ${found.title} »`}
      >
        {shown}
      </button>
    )
  }
  return (
    <span className="md-wikilink missing">
      <span title={`La note « ${title} » n’existe pas encore`}>{shown}</span>
      {links.create && (
        <button type="button" className="md-wikilink-create" onClick={() => links.create?.(title)}>
          Créer la note
        </button>
      )}
    </span>
  )
}

/** Enregistrement vocal d'une note, lu depuis le disque de l'espace. */
function AudioToken({ name, label }: { name: string; label?: string }) {
  const audio = useContext(AudioContext)
  return (
    <NoteAudio
      name={name}
      label={label}
      onRemove={audio?.remove}
      onTranscribe={audio?.transcribe}
      onError={audio?.error}
    />
  )
}

function renderInline(text: string, prefix: string): ReactNode[] {
  const tokens = text.split(
    /(!\[[^\]]*\]\([^)]+\)|\[\[[^[\]|\n]+(?:\|[^[\]\n]+)?\]\]|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|~~[^~]+~~)/g
  )
  return tokens.filter(Boolean).map((token, index) => {
    const key = `${prefix}-${index}`
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return <strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>
    }
    if (token.startsWith('~~') && token.endsWith('~~') && token.length > 4) {
      return <del key={key}>{renderInline(token.slice(2, -2), key)}</del>
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return <code key={key}>{token.slice(1, -1)}</code>
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return <em key={key}>{renderInline(token.slice(1, -1), key)}</em>
    }
    const wiki = token.match(/^\[\[([^[\]|\n]{1,120})(?:\|([^[\]\n]{1,120}))?\]\]$/)
    if (wiki) {
      return (
        <WikiToken
          key={key}
          title={wiki[1].trim()}
          shown={(wiki[2] ?? wiki[1]).trim()}
          raw={token}
        />
      )
    }
    const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (image) {
      if (image[2].startsWith('vela-audio:')) {
        return <AudioToken key={key} name={image[2].slice('vela-audio:'.length)} label={image[1]} />
      }
      const src = safeImage(image[2])
      if (!src) return image[1]
      return <img key={key} className="md-image" src={src} alt={image[1]} loading="lazy" />
    }
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const href = safeUrl(link[2])
      if (!href) return link[1]
      return (
        <a key={key} href={href} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      )
    }
    return token
  })
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isBlockStart(line: string): boolean {
  return (
    /^\s*```/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*>/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*\|.*\|\s*$/.test(line) ||
    /^\s*([-*_])\1{2,}\s*$/.test(line)
  )
}

/** Rendu Markdown minimal : titres, listes, tableaux, citations, code et liens. */
export function Markdown({
  text,
  sourceLinks = [],
  links,
  audio
}: {
  text: string
  sourceLinks?: { title: string; url: string; anchor?: string }[]
  /** Fourni dans les notes : liens cliquables et création d'une note manquante. */
  links?: NoteLinkContext
  /** Fourni dans les notes : suppression et transcription des enregistrements. */
  audio?: NoteAudioContext
}) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  let key = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3)
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push(
        <pre key={key++} data-lang={language || undefined}>
          <code>{code.join('\n')}</code>
        </pre>
      )
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      blocks.push(
        createElement(
          `h${level}`,
          { key: key++ },
          renderInline(heading[2], `h-${key}`)
        )
      )
      index += 1
      continue
    }

    if (/^\s*\|.*\|\s*$/.test(line) && index + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1])) {
      const header = splitRow(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
        rows.push(splitRow(lines[index]))
        index += 1
      }
      const tableKey = key++
      blocks.push(
        <div className="md-table" key={tableKey}>
          <table>
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex}>{renderInline(cell, `th-${tableKey}-${cellIndex}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell, `td-${tableKey}-${rowIndex}-${cellIndex}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      const quoteKey = key++
      blocks.push(
        <blockquote key={quoteKey}>
          {quote.map((entry, entryIndex) => (
            <p key={entryIndex}>{renderInline(entry, `q-${quoteKey}-${entryIndex}`)}</p>
          ))}
        </blockquote>
      )
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''))
        index += 1
      }
      const listKey = key++
      const tasks = items.some((item) => /^\[[ xX]\]\s+/.test(item))
      blocks.push(
        <ul key={listKey} className={tasks ? 'md-tasks' : undefined}>
          {items.map((item, itemIndex) => {
            const task = item.match(/^\[([ xX])\]\s+(.*)$/)
            return (
              <li key={itemIndex} className={task ? 'md-task' : undefined}>
                {task && (
                  <span className="md-check" data-done={task[1].toLowerCase() === 'x'} aria-hidden="true">
                    {task[1].toLowerCase() === 'x' ? '✓' : ''}
                  </span>
                )}
                {renderInline(task ? task[2] : item, `ul-${listKey}-${itemIndex}`)}
              </li>
            )
          })}
        </ul>
      )
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''))
        index += 1
      }
      const listKey = key++
      blocks.push(
        <ol key={listKey}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `ol-${listKey}-${itemIndex}`)}</li>
          ))}
        </ol>
      )
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={key++} />)
      index += 1
      continue
    }

    const soleImage = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (soleImage) {
      const src = safeImage(soleImage[2])
      if (src) {
        blocks.push(
          <figure className="md-figure" key={key++}>
            <img className="md-image" src={src} alt={soleImage[1]} loading="lazy" />
            {soleImage[1] && <figcaption>{soleImage[1]}</figcaption>}
          </figure>
        )
        index += 1
        continue
      }
    }

    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    const paragraphKey = key++
    blocks.push(<p key={paragraphKey}>{renderInline(paragraph.join(' '), `p-${paragraphKey}`)}</p>)
  }

  if (sourceLinks.length > 0) {
    const unique = sourceLinks.filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index)
    blocks.push(
      <section className="markdown-sources" key="source-links" aria-label="Sources et passages cités">
        <h2>Sources</h2>
        <ul>
          {unique.map((source, index) => (
            <li key={`${source.url}-${index}`}>
              {safeUrl(source.url) ? (
                <a href={safeUrl(source.url)!} target="_blank" rel="noreferrer">
                  {source.title || source.url}
                </a>
              ) : (
                <span>{source.title || source.url}</span>
              )}
              {source.anchor && safeUrl(source.url) && (
                <a className="markdown-source-quote" href={`${safeUrl(source.url)}${source.anchor}`} target="_blank" rel="noreferrer">
                  Aller au passage transmis ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <LinkContext.Provider value={links ?? null}>
      <AudioContext.Provider value={audio ?? null}>
        <div className="markdown">{blocks}</div>
      </AudioContext.Provider>
    </LinkContext.Provider>
  )
}
