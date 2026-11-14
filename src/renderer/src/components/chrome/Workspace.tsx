import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { PaneSnapshot, TabView } from '@shared/types'
import { clampSplitRatio, panesCanSplit } from '@shared/layout'
import { hostOf, isHomeUrl } from '@shared/url'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'
import PaneHeader from './PaneHeader'
import StartPage from '../start/StartPage'

// La carte de recherche n'est chargée qu'en mode Atelier : elle pèse à elle
// seule une part notable du bundle d'une fenêtre de navigation classique.
const TunnelView = lazy(() => import('../tunnel/TunnelView'))

function ErrorPane({ tab }: { tab: TabView }) {
  const reload = useBrowser((state) => state.reload)
  const navigate = useBrowser((state) => state.navigate)

  return (
    <section className="error-pane" aria-label="Page indisponible">
      <span className="error-icon">
        <Icon name="warning" size={22} />
      </span>
      <h2>Cette page n’a pas répondu</h2>
      <p>{tab.error ?? 'Le chargement a été interrompu.'}</p>
      <p className="error-host">{hostOf(tab.url)}</p>
      <div className="error-actions">
        <button type="button" className="action primary" onClick={() => reload(tab.id)}>
          <Icon name="reload" size={14} />
          Recharger
        </button>
        <button
          type="button"
          className="action"
          onClick={() => navigate(tab.id, 'https://duckduckgo.com')}
        >
          Chercher ailleurs
        </button>
      </div>
    </section>
  )
}

function Pane({
  tab,
  primary,
  secondary = false,
  resizing,
  shot
}: {
  tab: TabView
  primary: boolean
  secondary?: boolean
  resizing: boolean
  shot?: string
}) {
  const home = isHomeUrl(tab.url)

  return (
    <section
      className="pane"
      aria-label={primary ? 'Panneau principal' : 'Panneau secondaire'}
      data-primary={primary}
      data-secondary={secondary ? 'true' : undefined}
      data-resizing={resizing}
    >
      <PaneHeader tab={tab} primary={primary} secondary={secondary} />
      {tab.loading && <span className="load-line" />}
      <div
        className="pane-body"
        data-pane-tab={home ? undefined : tab.id}
        data-pane-primary={primary ? 'true' : 'false'}
      >
        {home ? (
          <StartPage tabId={tab.id} />
        ) : (
          <>
            <div className="pane-ghost">
              <span className="pane-ghost-host">{hostOf(tab.url)}</span>
              <span className="pane-ghost-title">{tab.title}</span>
            </div>
            {/* La page elle-même, figée à la taille du volet au début du geste.
                Les vues natives ne peuvent pas rester à l’écran pendant le
                glissement (elles prendraient le pointeur), mais un fond
                pointillé se lit comme un plantage. */}
            {shot && (
              <span className="pane-shot" aria-hidden="true">
                <img src={shot} alt="" draggable={false} />
              </span>
            )}
            {tab.error && <ErrorPane tab={tab} />}
          </>
        )}
      </div>
    </section>
  )
}

export default function Workspace() {
  const view = useBrowser((state) => state.view)
  const splitAllowed = useBrowser((state) => state.splitAllowed)
  const compactViewport = useBrowser((state) => state.compactViewport)
  const overlay = useBrowser((state) => state.overlay)
  const menuOpen = useBrowser((state) => state.menuOpen)
  const peekOpen = useBrowser((state) => state.peekOpen)
  const workMode = useBrowser((state) => state.workMode)
  const notesOpen = useBrowser((state) => state.notesOpen)
  const agentOpen = useBrowser((state) => state.agentOpen)
  const liveRatio = useBrowser((state) => state.splitRatioLive)
  const commitSplitRatio = useBrowser((state) => state.commitSplitRatio)
  const findOpen = useBrowser((state) => state.findOpen)
  const findQuery = useBrowser((state) => state.findQuery)
  const findResult = useBrowser((state) => state.findResult)
  const activeTabId = useBrowser((state) => state.view?.activeTabId)
  const findInPage = useBrowser((state) => state.findInPage)
  const closeFind = useBrowser((state) => state.closeFind)
  const findInput = useRef<HTMLInputElement>(null)
  const findDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const panesRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)
  // Fin du glissement en cours, à appeler au démontage : les écouteurs sont
  // posés dans un gestionnaire, pas dans un effet.
  const dragCleanup = useRef<(() => void) | null>(null)
  const [resizing, setResizing] = useState(false)
  const [shots, setShots] = useState<Record<string, string>>({})
  // Épreuves des pages pendant qu'un menu, une feuille ou un popover couvre la
  // scène : la vue native passe au-dessus du DOM, donc elle est retirée — mais
  // son image reste en place, sinon la zone qu'elle occupait devient noire.
  const [frozen, setFrozen] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!findOpen) return
    findInput.current?.focus()
    findInput.current?.select()
  }, [findOpen, activeTabId])

  useEffect(
    () =>
      window.vela.views.onFrozen((list) => {
        setFrozen(list ? Object.fromEntries(list.map((shot) => [shot.tabId, shot.image])) : {})
      }),
    []
  )

  useEffect(
    () => () => {
      if (findDebounce.current) clearTimeout(findDebounce.current)
      dragCleanup.current?.()
    },
    []
  )

  // Largeur mesurée, partagée avec le store : la barre d'adresse, la palette
  // et le processus principal prennent la même décision que ce composant.
  const panesWidth = useBrowser((state) => state.panesWidth)
  const ratio = liveRatio ?? view?.splitRatio ?? 0.5
  const secondTab = view?.tabs.find((tab) => tab.id === view.secondTabId)
  // Le processus principal suspend déjà le split sous le seuil ; cette garde
  // évite un panneau minuscule le temps que l'état diffusé arrive. La largeur
  // réellement mesurée couvre aussi le cas d'un tiroir ouvert à droite, qui
  // retire de la place sans que la fenêtre ait bougé.
  const splitFits = panesCanSplit(panesWidth)
  const splitNow = Boolean(view?.split && secondTab && splitAllowed && splitFits)
  const errorKey = view?.tabs.map((tab) => (tab.error ? '1' : '0')).join('') ?? ''
  // Les onglets d'accueil n'ont pas de page native : quand un onglet passe de
  // l'accueil à une page (ou l'inverse), la scène change de contenu sans que
  // l'identifiant de l'onglet bouge. Cette signature force un nouveau calcul
  // de disposition, sinon la page reste chargée mais invisible.
  const paneKey = view
    ? view.tabs.map((tab) => `${tab.id}:${isHomeUrl(tab.url) ? 'h' : 'p'}`).join('|')
    : ''

  const sendLayout = useCallback(() => {
    const state = useBrowser.getState()
    if (!state.view) return
    // Le principal ne voit pas les tiroirs : on lui redit à chaque disposition
    // si deux volets tiennent encore. Il suspend (sans effacer) le split quand
    // la réponse devient négative, et le restaure quand la place revient.
    const splitFits = panesCanSplit(state.panesWidth)
    // En mode Work, l’atelier couvre la scène : aucune page native visible —
    // sauf lorsqu’une vue scindée y installe une source à côté de la carte.
    const workSplit = Boolean(
      state.workMode === 'work' && state.view.split && state.view.secondTabId && state.splitAllowed
    )
    if (
      (state.workMode === 'work' && !workSplit) ||
      state.overlay ||
      state.peekOpen ||
      state.menuOpen > 0 ||
      resizingRef.current
    ) {
      window.vela.views.layout({ panes: [], overlay: true, splitFits })
      return
    }
    const nodes = document.querySelectorAll<HTMLElement>('[data-pane-tab]')
    const panes = Array.from(nodes).flatMap((node) => {
      const rect = node.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) return []
      return [
        {
          tabId: node.dataset.paneTab ?? '',
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }
      ]
    })
    window.vela.views.layout({ panes, overlay: false, splitFits })
  }, [])

  // La mesure possède ses ressources une seule fois. Elle était détruite puis
  // réinstallée à chaque changement d'onglet, d'overlay ou d'erreur — vingt
  // dépendances — avec un `views.layout` complet à chaque fois.
  const scheduleRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    let frame = 0
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(sendLayout)
    }
    scheduleRef.current = schedule
    schedule()
    const observer = new ResizeObserver(() => {
      const width = panesRef.current?.clientWidth ?? 0
      useBrowser.getState().syncPanesWidth(width)
      schedule()
    })
    if (panesRef.current) observer.observe(panesRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [sendLayout])

  // Seule la replanification dépend de ce qui est affiché.
  useEffect(() => {
    scheduleRef.current()
  }, [
    view?.activeTabId,
    view?.secondTabId,
    view?.split,
    splitAllowed,
    splitFits,
    compactViewport,
    ratio,
    errorKey,
    notesOpen,
    agentOpen,
    overlay,
    peekOpen,
    menuOpen,
    workMode,
    resizing,
    view?.settings.sidebarCollapsed,
    paneKey
  ])

  if (!view) return <main className="workspace" />

  const active = view.tabs.find((tab) => tab.id === view.activeTabId)
  const second = secondTab
  const split = splitNow

  if (!active) return <main className="workspace" />

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const container = panesRef.current
    if (!container || !view) return
    const rect = container.getBoundingClientRect()
    const apply = (clientX: number): number =>
      clampSplitRatio((clientX - rect.left) / rect.width, rect.width)

    // Les deux pages restent sous les yeux, en épreuve figée. Leurs vues
    // natives, elles, quittent la scène : posées au-dessus de la coque, elles
    // prendraient le pointeur et le geste s’arrêterait à la première image.
    // La capture part donc **avant** le retrait — une vue cachée n’a plus de
    // trame à rendre — et les vues quittent la scène dès qu’elle est prise,
    // au plus tard après 120 ms pour ne pas laisser le pointeur sur la page.
    const ids = view.tabs
      .filter(
        (tab) => (tab.id === view.activeTabId || tab.id === view.secondTabId) && !isHomeUrl(tab.url)
      )
      .map((tab) => tab.id)
    let begun = false
    let finished = false
    const begin = (list: PaneSnapshot[]): void => {
      if (finished) return
      // Une capture plus lente que le garde-fou arrive après le début du geste :
      // elle remplace alors le fond de veille, sans retarder le glissement.
      if (list.length) setShots(Object.fromEntries(list.map((shot) => [shot.tabId, shot.image])))
      if (begun) return
      begun = true
      resizingRef.current = true
      setResizing(true)
      window.vela.views.layout({
        panes: [],
        overlay: true,
        splitFits: panesCanSplit(useBrowser.getState().panesWidth)
      })
    }
    const guard = setTimeout(() => begin([]), 120)
    void (ids.length ? window.vela.views.snapshot(ids) : Promise.resolve<PaneSnapshot[]>([]))
      .catch(() => [] as PaneSnapshot[])
      .then((list) => {
        clearTimeout(guard)
        begin(list)
      })
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    // Une seule écriture par image, directement sur la variable CSS : aucun
    // rendu React, aucune disposition envoyée au processus principal pendant
    // le geste. Le ratio n’est enregistré qu’au relâchement.
    let pendingX = event.clientX
    let frame = 0
    const paint = (): void => {
      frame = 0
      const next = apply(pendingX)
      container.style.setProperty('--ratio', `${next * 100}%`)
      const hint = container.querySelector('.split-hint')
      if (hint) {
        const label = `${Math.round(next * 100)} / ${Math.round((1 - next) * 100)}`
        if (hint.textContent !== label) hint.textContent = label
      }
    }

    const move = (moveEvent: PointerEvent): void => {
      pendingX = moveEvent.clientX
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const finish = (clientX: number): void => {
      finished = true
      clearTimeout(guard)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      dragCleanup.current = null
      if (frame) cancelAnimationFrame(frame)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      resizingRef.current = false
      // Le ratio final part avant l’état : la coque ne réaffiche pas l’ancien
      // partage le temps que le processus principal confirme.
      commitSplitRatio(apply(clientX))
      setResizing(false)
      setShots({})
    }
    const up = (upEvent: PointerEvent): void => finish(upEvent.clientX)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    // Un démontage en plein glissement (onglet fermé, overlay ouvert) retire
    // les deux écouteurs au lieu de les laisser sur `window`.
    dragCleanup.current = () => finish(pendingX)
  }

  if (workMode === 'work') {
    // Mode Atelier : le tunnel de recherche occupe la scène ; l’agent reste
    // accessible en panneau (⌘J) sans masquer la carte. Une source s’ouvre en
    // vue scindée à droite, la carte restant visible à gauche.
    return (
      <main
        className="workspace work"
        data-resizing={resizing}
        data-split={split}
        data-compact={compactViewport}
        data-collapsed={view.settings.sidebarCollapsed}
      >
        <div
          className={`work-split${split ? ' is-split' : ''}`}
          ref={panesRef}
          style={{ '--ratio': `${ratio * 100}%` } as CSSProperties}
        >
          <div className="work-stage">
            <Suspense
              fallback={
                <div className="work-stage-loading" role="status" aria-live="polite">
                  Chargement de la carte…
                </div>
              }
            >
              <TunnelView />
            </Suspense>
          </div>
          {split && second && (
            <>
              <div
                className="split-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="Largeur de la carte"
                onPointerDown={startDrag}
                onDoubleClick={() => commitSplitRatio(0.5)}
              >
                <span />
                {resizing && <span className="split-hint" aria-hidden="true" />}
              </div>
              <Pane
                tab={second}
                primary={false}
                secondary
                resizing={resizing}
                shot={shots[second.id]}
              />
            </>
          )}
        </div>
      </main>
    )
  }

  return (
    <main
      className="workspace"
      data-resizing={resizing}
      data-compact={compactViewport}
      data-split={split}
      data-collapsed={view.settings.sidebarCollapsed}
    >
      {findOpen && (
        <div className="find-bar" role="search" aria-label="Rechercher dans la page">
          <input
            ref={findInput}
            value={findQuery}
            placeholder="Rechercher dans la page"
            aria-label="Texte recherché"
            onChange={(event) => {
              const value = event.target.value
              useBrowser.setState({
                findQuery: value,
                findResult: { matches: 0, activeMatchOrdinal: 0 }
              })
              if (findDebounce.current) clearTimeout(findDebounce.current)
              findDebounce.current = setTimeout(() => void findInPage(value), 120)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeFind()
              if (event.key === 'Enter') void findInPage(findQuery, !event.shiftKey)
            }}
          />
          <span aria-live="polite">
            {findResult.matches
              ? `${findResult.activeMatchOrdinal} / ${findResult.matches}`
              : findQuery
                ? 'Aucun résultat'
                : ''}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Correspondance précédente"
            onClick={() => void findInPage(findQuery, false)}
          >
            <Icon name="arrow-up" size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Correspondance suivante"
            onClick={() => void findInPage(findQuery, true)}
          >
            <Icon name="arrow-down" size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Fermer la recherche"
            onClick={closeFind}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      <div
        className={`panes${split ? ' is-split' : ''}`}
        ref={panesRef}
        style={{ '--ratio': `${ratio * 100}%` } as CSSProperties}
      >
        <Pane
          tab={active}
          primary
          resizing={resizing}
          shot={shots[active.id] ?? frozen[active.id]}
        />
        {split && second && (
          <>
            <div
              className="split-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Largeur de la vue scindée"
              onPointerDown={startDrag}
              onDoubleClick={() => commitSplitRatio(0.5)}
            >
              <span />
              {resizing && <span className="split-hint" aria-hidden="true" />}
            </div>
            <Pane
              tab={second}
              primary={false}
              secondary
              resizing={resizing}
              shot={shots[second.id] ?? frozen[second.id]}
            />
          </>
        )}
      </div>
    </main>
  )
}
