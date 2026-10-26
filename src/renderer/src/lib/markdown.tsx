import { createElement, type ReactNode } from 'react'

function safeUrl(value: string): string | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
  } catch {
    return null
  }
}

function renderInline(text: string, prefix: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|~~[^~]+~~)/g)
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
  sourceLinks = []
}: {
  text: string
  sourceLinks?: { title: string; url: string; anchor?: string }[]
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
      blocks.push(
        <ul key={listKey}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `ul-${listKey}-${itemIndex}`)}</li>
          ))}
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

  return <div className="markdown">{blocks}</div>
}
