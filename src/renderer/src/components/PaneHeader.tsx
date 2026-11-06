import { useEffect, useRef, useState } from 'react'
import type { TabView } from '@shared/types'
import { isHomeUrl, prettyUrl } from '@shared/url'
import { WEB_LANGUAGES } from '@shared/navigation'
import { shortcut } from '../lib/format'
import { useBrowser } from '../store/browser'
import { usePageTranslation } from '../lib/usePageTranslation'
import { Icon } from './Icon'
import BarButton from './BarButton'
import TranslateButton from './TranslateButton'
import TranslatePopover from './TranslatePopover'

interface PaneHeaderProps {
  tab: TabView
  primary: boolean
  secondary?: boolean
}

export default function PaneHeader({ tab, primary, secondary = false }: PaneHeaderProps) {
  const navigate = useBrowser((state) => state.navigate)
  const back = useBrowser((state) => state.back)
  const forward = useBrowser((state) => state.forward)
  const reload = useBrowser((state) => state.reload)
  const stop = useBrowser((state) => state.stop)
  const splitToggle = useBrowser((state) => state.splitToggle)
  const toggleBookmark = useBrowser((state) => state.toggleBookmark)
  const toast = useBrowser((state) => state.toast)
  const beginMenu = useBrowser((state) => state.beginMenu)
  const endMenu = useBrowser((state) => state.endMenu)
  const bookmarked = useBrowser((state) =>
    Boolean(state.view?.bookmarks.some((bookmark) => bookmark.url === tab.url))
  )
  const downloads = useBrowser((state) => state.view?.downloads.length ?? 0)
  const downloading = useBrowser(
    (state) => state.view?.downloads.find((item) => item.state === 'progress') ?? null
  )
  // Taille inconnue tant que le serveur n’a pas annoncé de Content-Length :
  // l’anneau tourne alors au lieu de mentir sur un pourcentage.
  const percent =
    downloading && downloading.total > 0
      ? Math.min(100, Math.round((downloading.received / downloading.total) * 100))
      : null
  const setOverlay = useBrowser((state) => state.setOverlay)
  const uiLanguage = useBrowser((state) => state.view?.settings.webLanguage ?? 'fr')

  const translation = usePageTranslation(tab, uiLanguage)
  const [translationOpen, setTranslationOpen] = useState(false)
  const translateButton = useRef<HTMLButtonElement>(null)

  // Les calques vivent dans la page : une navigation les emporte avec elle.
  // Les remises à zéro passent par une microtâche : un setState synchrone dans
  // un effet est refusé par le compilateur React, et la microtâche passe avant
  // la peinture.
  useEffect(() => {
    queueMicrotask(() => {
      setTranslationOpen(false)
    })
  }, [tab.id, tab.url])

  // La fenêtre de traduction flotte au-dessus de la page : la vue native
  // quitterait la scène, comme pour un menu contextuel.
  useEffect(() => {
    if (!translationOpen) return
    // La vue native doit quitter la scène avant la peinture, pas forcément
    // dans le corps de l'effet : la microtâche garde ce délai.
    queueMicrotask(() => beginMenu())
    return () => queueMicrotask(() => endMenu())
  }, [translationOpen, beginMenu, endMenu])

  useEffect(() => {
    if (translation.status === 'translated') return
    queueMicrotask(() => setTranslationOpen(false))
  }, [translation.status])

  useEffect(() => {
    if (translation.status === 'error' && translation.error) toast(translation.error, 'error')
  }, [translation.status, translation.error, toast])

  const closeTranslation = (): void => {
    setTranslationOpen(false)
    translateButton.current?.focus()
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [draft, setDraft] = useState('')
  const home = isHomeUrl(tab.url)

  useEffect(() => {
    if (focused) return
    queueMicrotask(() => setDraft(home ? '' : tab.url))
  }, [tab.url, home, focused])

  // Façon Dia/Zephium : au repos on lit le nom de la page, au survol l'adresse,
  // au focus l'URL complète éditable.
  const pageName = (tab.title || '').trim() || prettyUrl(tab.url)
  const resting = hovered ? prettyUrl(tab.url) : pageName
  const display = focused ? draft : home ? '' : resting
  const canClear = focused && draft.trim().length > 0

  return (
    <div
      className="pane-head"
      role="group"
      aria-label={primary ? 'Barre d’adresse' : 'Barre d’adresse secondaire'}
      data-primary={primary}
    >
      <div className="nav-group">
        <button
          type="button"
          className="icon-btn"
          disabled={!tab.canGoBack}
          onClick={() => back(tab.id)}
          title="Précédent"
        >
          <Icon name="back" size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          disabled={!tab.canGoForward}
          onClick={() => forward(tab.id)}
          title="Suivant"
        >
          <Icon name="forward" size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => (tab.loading ? stop(tab.id) : reload(tab.id))}
          title={tab.loading ? 'Arrêter' : 'Recharger'}
        >
          <Icon name={tab.loading ? 'close' : 'reload'} size={15} />
        </button>
      </div>

      <form
        className="address"
        aria-label={primary ? 'Adresse de l’onglet' : 'Adresse de l’onglet secondaire'}
        data-focused={focused}
        data-home={home}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onSubmit={(event) => {
          event.preventDefault()
          const value = draft.trim()
          if (!value) return
          navigate(tab.id, value)
          setFocused(false)
          inputRef.current?.blur()
        }}
      >
        <input
          ref={inputRef}
          className="address-input"
          value={display}
          placeholder={home ? 'Vela — Accueil' : 'Rechercher ou saisir une adresse'}
          spellCheck={false}
          autoComplete="off"
          aria-label="Adresse"
          // Le raccourci se lit dans l'arbre d'accessibilité, pas seulement
          // dans l'infobulle visuelle qui s'affiche au survol. La syntaxe ARIA
          // nomme les modificateurs en anglais, d'où la traduction.
          aria-keyshortcuts={window.vela.platform === 'darwin' ? 'Meta+L' : 'Control+L'}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => {
            setFocused(true)
            setDraft(home ? '' : tab.url)
            requestAnimationFrame(() => event.target.select())
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setFocused(false)
              event.currentTarget.blur()
            }
          }}
        />

        {canClear && (
          <button
            type="button"
            className="address-clear"
            aria-label="Effacer"
            title="Effacer"
            onClick={() => {
              setDraft('')
              inputRef.current?.focus()
            }}
          >
            <Icon name="close" size={16} />
          </button>
        )}

        {tab.agentSent && (
          <span
            className="address-agent-sent"
            title="Cette page a été envoyée au fournisseur de modèle pour l’agent"
          >
            <Icon name="sparkles" size={12} /> Envoyée au modèle
          </span>
        )}

        {!home && translation.status !== 'hidden' && (
          <TranslateButton
            status={translation.status}
            source={translation.source}
            target={translation.target}
            expanded={translationOpen}
            buttonRef={translateButton}
            onTranslate={translation.activate}
            onOpen={() => setTranslationOpen((open) => !open)}
          />
        )}

        {!home && (
          <button
            type="button"
            className="bar-btn"
            data-active={bookmarked}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            title={`${bookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris'} (${shortcut('D')})`}
            onClick={() => void toggleBookmark(tab.id)}
          >
            <Icon name="star" size={18} filled={bookmarked} />
          </button>
        )}

        {!home && translationOpen && translation.status === 'translated' && (
          <TranslatePopover
            source={translation.source}
            target={translation.target}
            always={translation.always}
            languages={WEB_LANGUAGES}
            error={translation.error}
            onTarget={translation.setTarget}
            onAlways={translation.setAlways}
            onOriginal={() => {
              translation.restore()
              closeTranslation()
            }}
            onClose={closeTranslation}
          />
        )}
      </form>

      <div className="pane-tools">
        {primary && (
          <button
            type="button"
            className="bar-btn download-btn"
            onClick={() => setOverlay('downloads')}
            aria-label={
              downloading
                ? `Téléchargement en cours : ${downloading.name}, ${
                    percent === null ? 'durée inconnue' : `${percent} pour cent`
                  } — voir la liste`
                : downloads > 0
                  ? `${downloads} téléchargement${downloads > 1 ? 's' : ''}, voir la liste`
                  : 'Téléchargements'
            }
            title={
              downloading
                ? `${downloading.name} — ${percent === null ? 'en cours' : `${percent} %`}`
                : 'Téléchargements'
            }
          >
            {downloading && (
              <svg className="download-ring" viewBox="0 0 34 34" aria-hidden="true">
                <circle className="download-ring-track" cx="17" cy="17" r="15" />
                <circle
                  className="download-ring-fill"
                  data-known={percent !== null}
                  cx="17"
                  cy="17"
                  r="15"
                  strokeDasharray={
                    percent === null ? '23.5 94.25' : `${Math.max(percent, 1) * 0.9425} 94.25`
                  }
                />
              </svg>
            )}
            <Icon name="download" size={18} />
            {downloads > 0 && !downloading && <span className="bar-count">{downloads}</span>}
          </button>
        )}
        <BarButton
          icon={secondary ? 'close' : 'split'}
          label={secondary ? 'Fermer la vue scindée' : `Vue scindée (${shortcut('⇧D')})`}
          onClick={() => splitToggle()}
        />
      </div>
    </div>
  )
}
