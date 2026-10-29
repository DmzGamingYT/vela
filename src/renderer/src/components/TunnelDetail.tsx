import { useMemo, useState } from 'react'
import { NODE_LABELS, SOURCE_TYPES, type MapNode, type MapNodeKind } from '@shared/tunnel'
import { useBrowser } from '../store/browser'
import { useTunnel } from '../store/tunnel'
import { Icon } from './Icon'

const SOURCE_LABEL = new Map(SOURCE_TYPES.map((type) => [type.id, type.label]))

function publishLabel(timestamp?: number): string {
  if (!timestamp) return 'Date inconnue'
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(timestamp)
  )
}

function domainOf(node: MapNode): string {
  if (node.domain) return node.domain
  if (!node.url) return ''
  try {
    return new URL(node.url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export default function TunnelDetail() {
  const active = useTunnel((s) => s.active)
  const selectedId = useTunnel((s) => s.selectedId)
  const select = useTunnel((s) => s.select)
  const setStatus = useTunnel((s) => s.setStatus)
  const renameNode = useTunnel((s) => s.renameNode)
  const addCard = useTunnel((s) => s.addCard)
  const removeNode = useTunnel((s) => s.removeNode)
  const toggleLink = useTunnel((s) => s.toggleLink)
  const runTunnel = useTunnel((s) => s.runTunnel)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [noteState, setNoteState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [adding, setAdding] = useState(false)
  const [excerptOpen, setExcerptOpen] = useState(false)
  const [cardTitle, setCardTitle] = useState('')
  const [cardKind, setCardKind] = useState<MapNodeKind>('detail')
  const [linking, setLinking] = useState(false)
  const [linkId, setLinkId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const node = active && selectedId ? active.nodes.find((entry) => entry.id === selectedId) ?? null : null

  const path = useMemo(() => {
    if (!active || !node) return [] as MapNode[]
    const chain: MapNode[] = []
    let current: MapNode | undefined = node
    let guard = 0
    while (current && guard < 12) {
      chain.unshift(current)
      current = current.parentId ? active.nodes.find((entry) => entry.id === current?.parentId) : undefined
      guard += 1
    }
    return chain
  }, [active, node])

  const related = useMemo(() => {
    if (!active || !node?.relatedIds) return [] as MapNode[]
    return node.relatedIds
      .map((id) => active.nodes.find((entry) => entry.id === id))
      .filter((entry): entry is MapNode => Boolean(entry))
  }, [active, node])

  const linkCandidates = useMemo(() => {
    if (!active || !node) return [] as MapNode[]
    return active.nodes.filter(
      (entry) =>
        entry.id !== node.id &&
        entry.id !== node.parentId &&
        !(node.relatedIds ?? []).includes(entry.id) &&
        entry.kind !== 'subject'
    )
  }, [active, node])

  if (!node) return null

  const domain = domainOf(node)
  const close = (): void => {
    select(null)
    setEditing(false)
    setNoteState('idle')
  }

  const copyCitation = async (): Promise<void> => {
    const citation = [
      `${node.title}${domain ? ` — ${domain}` : ''}`,
      node.url ?? '',
      node.excerpt ? `« ${node.excerpt.slice(0, 400)} »` : '',
      `Pertinence ${node.relevance} % · consulté le ${new Date().toLocaleDateString('fr-FR')}`
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(citation)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      useBrowser.getState().toast('Copie impossible.', 'error')
    }
  }

  const addToNotes = async (): Promise<void> => {
    try {
      await window.vela.notes.save({
        title: node.title.slice(0, 160),
        body: `> ${node.excerpt ?? node.summary}\n\nSource : [${node.title}](${node.url ?? ''})\n\n${node.reason}`,
        spaceId: active?.spaceId || useBrowser.getState().view?.activeSpaceId,
        url: node.url
      })
      setNoteState('saved')
      useBrowser.getState().toast('Source ajoutée aux notes.')
    } catch {
      setNoteState('error')
      useBrowser.getState().toast('Note non enregistrée.', 'error')
    }
  }

  const openSplit = async (url: string): Promise<void> => {
    try {
      const tab = await window.vela.tabs.create({ url })
      if (tab?.id) await window.vela.tabs.splitSet(tab.id)
      else window.vela.views.layout({ panes: [], overlay: false })
    } catch {
      useBrowser.getState().toast('Vue scindée impossible.', 'error')
    }
  }

  const startRename = (): void => {
    setDraft(node.title)
    setEditing(true)
  }

  const createCard = (): void => {
    const title = cardTitle.trim()
    if (!title) return
    void addCard(node.id, { title, kind: cardKind })
    setCardTitle('')
    setAdding(false)
  }

  const linkNode = (): void => {
    if (!linkId) return
    void toggleLink(node.id, linkId)
    setLinkId('')
    setLinking(false)
  }

  return (
    <aside className="tunnel-detail" aria-label="Détail du nœud">
      <header className="tunnel-detail-head">
        <span className="tunnel-kind" data-kind={node.kind}>
          {NODE_LABELS[node.kind]}
        </span>
        <div className="tunnel-detail-tools">
          <button
            type="button"
            className="icon-btn"
            onClick={startRename}
            title="Renommer ce nœud"
            aria-label="Renommer ce nœud"
          >
            <Icon name="edit" size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={close}
            title="Fermer le détail"
            aria-label="Fermer le détail"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      </header>

      {editing ? (
        <form
          className="tunnel-rename"
          onSubmit={(event) => {
            event.preventDefault()
            void renameNode(node.id, draft)
            setEditing(false)
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Nouveau titre du nœud"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false)
            }}
          />
          <button type="submit" className="ghost-btn">
            Renommer
          </button>
        </form>
      ) : (
        <h2>{node.title}</h2>
      )}

      {domain && (
        <p className="tunnel-detail-domain">
          <Icon name="globe" size={13} /> {domain}
          {node.sourceType && <span className="tunnel-tag">{SOURCE_LABEL.get(node.sourceType)}</span>}
        </p>
      )}

      {node.kind === 'tension' ? (
        <section className="tunnel-tension">
          <h3>Sources en désaccord</h3>
          {related.length === 0 && <p className="tunnel-detail-text">Aucune source liée.</p>}
          <div className="tunnel-tension-grid">
            {related.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="tunnel-tension-source"
                onClick={() => select(entry.id)}
              >
                <strong>{entry.title}</strong>
                <span>{domainOf(entry)}</span>
                <q>{entry.excerpt?.slice(0, 220) ?? entry.summary}</q>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          {node.excerpt && (
            <>
              <p className="tunnel-detail-excerpt" data-open={excerptOpen}>
                {excerptOpen ? node.excerpt.slice(0, 1200) : node.excerpt.slice(0, 420)}
              </p>
              {(node.excerpt.length > 240 || node.excerpt.trim().split(/\n\s*\n/).length > 1) && (
                <button
                  type="button"
                  className="tunnel-detail-more"
                  aria-expanded={excerptOpen}
                  onClick={() => setExcerptOpen(!excerptOpen)}
                >
                  {excerptOpen ? 'Voir moins' : 'Voir plus'}
                </button>
              )}
            </>
          )}
          <section>
            <h3>Pourquoi cette source</h3>
            <p className="tunnel-detail-text">{node.reason}</p>
          </section>
        </>
      )}

      <section>
        <h3>Recherche de ce nœud</h3>
        <p className="tunnel-path">
          {path.map((entry, index) => (
            <span key={entry.id}>
              {index > 0 && <b aria-hidden="true">›</b>}
              <button type="button" onClick={() => select(entry.id)}>
                {entry.title}
              </button>
            </span>
          ))}
        </p>
      </section>

      <section className="tunnel-gauges">
        <div className="tunnel-gauge" title="Part des mots de votre requête retrouvés dans la page, et place du résultat dans les sources.">
          <span>Pertinence</span>
          <strong>{node.relevance} %</strong>
          <i role="img" aria-label={`Pertinence ${node.relevance} pour cent`}>
            <b style={{ width: `${node.relevance}%` }} data-level={node.relevance >= 75 ? 'high' : node.relevance >= 60 ? 'mid' : 'low'} />
          </i>
        </div>
        <div className="tunnel-gauge" title="Longueur de l’extrait disponible, page réellement récupérée et concordance du domaine.">
          <span>Confiance</span>
          <strong>{node.confidence} %</strong>
          <i role="img" aria-label={`Confiance ${node.confidence} pour cent`}>
            <b style={{ width: `${node.confidence}%` }} data-level={node.confidence >= 75 ? 'high' : node.confidence >= 60 ? 'mid' : 'low'} />
          </i>
        </div>
        <p className="tunnel-detail-meta">
          {node.kind === 'site' ? publishLabel(node.publishedAt) : NODE_LABELS[node.kind]}
          {node.reachable === false && <span className="tunnel-warn"> · page inaccessible</span>}
        </p>
        {node.relevanceReason && node.kind === 'site' && (
          <p className="tunnel-detail-reason">{node.relevanceReason}</p>
        )}
      </section>

      {node.summary && node.kind !== 'tension' && (
        <section>
          <h3>Résumé</h3>
          <p className="tunnel-detail-text">{node.summary}</p>
        </section>
      )}

      <div className="tunnel-detail-actions">
        {node.url && (
          <button type="button" className="action" onClick={() => useBrowser.getState().newTab(node.url as string)}>
            <Icon name="external" size={13} /> Ouvrir la source
          </button>
        )}
        {node.url && (
          <button type="button" className="ghost-btn" onClick={() => void openSplit(node.url as string)}>
            <Icon name="split" size={13} /> Ouvrir en vue scindée
          </button>
        )}
        <button
          type="button"
          className="ghost-btn"
          onClick={() => void runTunnel(node.title, { parentId: node.id })}
        >
          <Icon name="sparkles" size={13} /> Explorer depuis ce nœud
        </button>
        <button type="button" className="ghost-btn" onClick={() => void runTunnel(active?.query ?? node.title)}>
          <Icon name="reload" size={13} /> Relancer
        </button>
        <button type="button" className="ghost-btn" onClick={() => void copyCitation()}>
          <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Citation copiée' : 'Copier la citation'}
        </button>
        <div className="tunnel-keep">
          <button
            type="button"
            className="ghost-btn"
            data-active={node.status === 'kept'}
            onClick={() => void setStatus(node.id, node.status === 'kept' ? 'neutral' : 'kept')}
          >
            <Icon name="check" size={13} /> Garder
          </button>
          <button
            type="button"
            className="ghost-btn"
            data-active={node.status === 'dismissed'}
            onClick={() => void setStatus(node.id, node.status === 'dismissed' ? 'neutral' : 'dismissed')}
          >
            <Icon name="close" size={13} /> Écarter
          </button>
        </div>
        <button type="button" className="ghost-btn" onClick={() => void addToNotes()}>
          <Icon name={noteState === 'saved' ? 'check' : 'notes'} size={13} />
          {noteState === 'saved' ? 'Ajouté aux notes' : 'Ajouter aux notes'}
        </button>
        {noteState === 'error' && <p className="tunnel-warn">Note non enregistrée.</p>}
      </div>

      <section className="tunnel-edit" aria-label="Modifier la carte">
        <h3>Modifier la carte</h3>

        <div className="tunnel-edit-actions">
          <button type="button" className="ghost-btn" data-active={adding} onClick={() => setAdding(!adding)}>
            <Icon name="plus" size={13} /> Ajouter une carte
          </button>
          <button
            type="button"
            className="ghost-btn"
            data-active={linking}
            onClick={() => setLinking(!linking)}
            disabled={linkCandidates.length === 0}
          >
            <Icon name="link" size={13} /> Relier à…
          </button>
          <button
            type="button"
            className="ghost-btn danger"
            disabled={node.kind === 'subject'}
            onClick={() => {
              if (confirmDelete) {
                void removeNode(node.id)
                setConfirmDelete(false)
              } else {
                setConfirmDelete(true)
                setTimeout(() => setConfirmDelete(false), 4000)
              }
            }}
          >
            <Icon name="trash" size={13} />
            {confirmDelete ? 'Confirmer la suppression' : 'Supprimer'}
          </button>
        </div>

        {adding && (
          <form
            className="tunnel-edit-form"
            onSubmit={(event) => {
              event.preventDefault()
              createCard()
            }}
          >
            <input
              autoFocus
              value={cardTitle}
              onChange={(event) => setCardTitle(event.target.value)}
              placeholder="Titre de la carte"
              aria-label="Titre de la nouvelle carte"
            />
            <select
              value={cardKind}
              onChange={(event) => setCardKind(event.target.value as MapNodeKind)}
              aria-label="Type de la nouvelle carte"
            >
              <option value="angle">Angle</option>
              <option value="subangle">Sous-angle</option>
              <option value="detail">Détail</option>
              <option value="concept">Concept</option>
            </select>
            <button type="submit" className="ghost-btn" disabled={!cardTitle.trim()}>
              Créer
            </button>
          </form>
        )}

        {linking && (
          <form
            className="tunnel-edit-form"
            onSubmit={(event) => {
              event.preventDefault()
              linkNode()
            }}
          >
            <select value={linkId} onChange={(event) => setLinkId(event.target.value)} aria-label="Carte à relier">
              <option value="">Choisir une carte…</option>
              {linkCandidates.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {NODE_LABELS[entry.kind]} — {entry.title}
                </option>
              ))}
            </select>
            <button type="submit" className="ghost-btn" disabled={!linkId}>
              Relier
            </button>
          </form>
        )}

        {related.length > 0 && (
          <ul className="tunnel-links">
            {related.map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={() => select(entry.id)}>
                  {entry.title}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Délier ${entry.title}`}
                  title="Délier"
                  onClick={() => void toggleLink(node.id, entry.id)}
                >
                  <Icon name="close" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="tunnel-edit-hint">
          Glissez une carte sur la toile pour la déplacer, double-cliquez pour ouvrir sa source.
        </p>
      </section>
    </aside>
  )
}
