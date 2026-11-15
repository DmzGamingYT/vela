import {
  EXTENSION_CATEGORIES,
  EXTENSION_SUGGESTIONS,
  storeUrl
} from '@shared/extensions'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'

/**
 * Un catalogue, pas un magasin : Azimut tourne sur Chromium mais ne charge pas
 * encore d’extensions. L’écran le dit d’entrée, puis ouvre la page du Chrome
 * Web Store dans un onglet — de quoi comparer sans croire à une installation.
 */
export default function ExtensionsPage() {
  const newTab = useBrowser((state) => state.newTab)
  const setOverlay = useBrowser((state) => state.setOverlay)

  const open = (query: string): void => {
    newTab(storeUrl(query))
    setOverlay(null)
  }

  return (
    <div className="appearance-page extensions-page">
      <section className="appearance-section ext-intro">
        <h3 className="appearance-sub-title">Des extensions choisies, pas une boutique</h3>
        <p className="appearance-note">
          Azimut s’appuie sur Chromium : les extensions du Chrome Web Store existent, mais Azimut ne les
          charge pas encore. Chaque fiche ouvre donc la page du magasin dans un onglet — pour
          comparer, ou pour équiper un autre navigateur en attendant.
        </p>
        <p className="ext-flag">
          <Icon name="shield" size={13} />
          Aucune extension n’est installée ni téléchargée par Azimut depuis cet écran.
        </p>
      </section>

      {EXTENSION_CATEGORIES.map((category) => {
        const items = EXTENSION_SUGGESTIONS.filter((entry) => entry.category === category.id)
        if (items.length === 0) return null
        return (
          <section className="appearance-section" key={category.id}>
            <div className="ext-head">
              <h3 className="appearance-sub-title">{category.label}</h3>
              <span className="ext-hint">{category.hint}</span>
            </div>
            <div className="ext-grid">
              {items.map((entry) => (
                <article className="ext-card" key={entry.id}>
                  <span className="ext-mark" aria-hidden="true">
                    {entry.name.slice(0, 1)}
                  </span>
                  <div className="ext-copy">
                    <strong>{entry.name}</strong>
                    <span>{entry.vendor}</span>
                    <p>{entry.blurb}</p>
                  </div>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => open(entry.query)}
                    title={`Chercher ${entry.name} sur le Chrome Web Store`}
                  >
                    Chrome Web Store
                  </button>
                </article>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
