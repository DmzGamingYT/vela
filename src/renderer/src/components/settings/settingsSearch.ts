export type SettingsPage = 'overview' | 'appearance' | 'navigation' | 'privacy' | 'agent' | 'system'

export interface SettingsTarget {
  page: SettingsPage
  tab?: string
  anchor?: string
}

export interface SettingsSearchEntry extends SettingsTarget {
  label: string
  group: string
  hint: string
  keywords: string
}

const SECTIONS: SettingsSearchEntry[] = [
  {
    page: 'overview',
    label: 'Vue d’ensemble',
    group: 'Repères',
    hint: 'Les réglages essentiels et les compteurs de l’appareil.',
    keywords: 'accueil résumé compteurs'
  },
  {
    page: 'appearance',
    tab: 'mode',
    label: 'Mode & couleur',
    group: 'Apparence',
    hint: 'Clair, sombre, accent et thème selon l’heure.',
    keywords: 'thème couleur accent clair sombre système heure verre'
  },
  {
    page: 'appearance',
    tab: 'home',
    label: 'Accueil',
    group: 'Apparence',
    hint: 'Fond, intensité, image et ciel de la page d’accueil.',
    keywords: 'fond image dégradé ciel braise accueil'
  },
  {
    page: 'appearance',
    tab: 'interface',
    label: 'Interface',
    group: 'Apparence',
    hint: 'Densité, taille du texte, barre latérale et ambiance.',
    keywords: 'densité texte taille barre latérale côté ambiance mouvement verre'
  },
  {
    page: 'appearance',
    tab: 'accessibility',
    label: 'Accessibilité',
    group: 'Apparence',
    hint: 'Contraste élevé et réduction des animations.',
    keywords: 'contraste accessibilité animation mouvement réduire'
  },
  {
    page: 'navigation',
    tab: 'search',
    label: 'Recherche',
    group: 'Navigation',
    hint: 'Moteur par défaut, moteurs ajoutés et mots-clés rapides.',
    keywords: 'moteur recherche google duckduckgo bing mots clés'
  },
  {
    page: 'navigation',
    tab: 'startup',
    label: 'Démarrage',
    group: 'Navigation',
    hint: 'Comportement au lancement, nouvel onglet et liens externes.',
    keywords: 'lancement démarrage accueil onglets restauration nouvel onglet liens'
  },
  {
    page: 'navigation',
    tab: 'library',
    label: 'Bibliothèque',
    group: 'Navigation',
    hint: 'Marque-pages, historique et conservation.',
    keywords: 'marque-pages favoris historique bibliothèque conservation effacer'
  },
  {
    page: 'navigation',
    tab: 'downloads',
    label: 'Téléchargements',
    group: 'Navigation',
    hint: 'Dossier, options et fichiers téléchargés.',
    keywords: 'téléchargement dossier fichiers'
  },
  {
    page: 'navigation',
    tab: 'web',
    label: 'Pages web',
    group: 'Navigation',
    hint: 'Langue, zoom par défaut et zoom par site.',
    keywords: 'langue zoom page web site'
  },
  {
    page: 'privacy',
    tab: 'protection',
    label: 'Protection',
    group: 'Confidentialité',
    hint: 'Niveau de blocage, compteurs et exceptions par site.',
    keywords: 'bloqueur traqueurs publicités strict protection exceptions'
  },
  {
    page: 'privacy',
    tab: 'local',
    label: 'Données locales',
    group: 'Confidentialité',
    hint: 'Vignettes, icônes, historique, cookies et effacement.',
    keywords: 'données locales vignettes icônes cache cookies stockage effacer historique'
  },
  {
    page: 'privacy',
    tab: 'permissions',
    label: 'Permissions',
    group: 'Confidentialité',
    hint: 'Caméra, micro, position et notifications.',
    keywords: 'permissions caméra micro position notifications'
  },
  {
    page: 'privacy',
    tab: 'flows',
    label: 'Flux réseau',
    group: 'Confidentialité',
    hint: 'Chaque requête sortante, son déclencheur et ses données.',
    keywords: 'réseau flux requêtes dns audit'
  },
  {
    page: 'agent',
    tab: 'model',
    label: 'Modèle actif',
    group: 'Agent',
    hint: 'Moteur de l’agent, mode démo et test.',
    keywords: 'modèle agent démo api test'
  },
  {
    page: 'agent',
    tab: 'providers',
    label: 'Fournisseurs',
    group: 'Agent',
    hint: 'Clés, endpoints et modèles des fournisseurs.',
    keywords: 'fournisseur clé api endpoint openai anthropic ollama'
  },
  {
    page: 'agent',
    tab: 'notes',
    label: 'Notes',
    group: 'Agent',
    hint: 'Dossier, rapports de l’agent et notes récentes.',
    keywords: 'notes markdown fichiers rapport'
  },
  {
    page: 'system',
    tab: 'shortcuts',
    label: 'Raccourcis',
    group: 'Système',
    hint: 'Toutes les combinaisons clavier de Vela.',
    keywords: 'raccourcis clavier touches commandes'
  },
  {
    page: 'system',
    tab: 'updates',
    label: 'Mises à jour',
    group: 'Système',
    hint: 'Version installée, vérification et installateur.',
    keywords: 'mise à jour version release installer téléchargement'
  },
  {
    page: 'system',
    tab: 'about',
    label: 'À propos',
    group: 'Système',
    hint: 'Identité, version et licence de Vela.',
    keywords: 'à propos version licence identité'
  }
]

const ITEMS: SettingsSearchEntry[] = [
  {
    page: 'appearance',
    tab: 'mode',
    label: 'Mode',
    group: 'Apparence',
    hint: 'Clair, sombre ou comme le système.',
    keywords: 'clair sombre système apparence',
    anchor: 'appearance-mode'
  },
  {
    page: 'appearance',
    tab: 'mode',
    label: 'Accent',
    group: 'Apparence',
    hint: 'Teinte d’accent et palette de couleurs.',
    keywords: 'couleur accent palette personnalisé',
    anchor: 'appearance-accent'
  },
  {
    page: 'appearance',
    tab: 'mode',
    label: 'Thème selon l’heure',
    group: 'Apparence',
    hint: 'Clair le jour, sombre le soir.',
    keywords: 'heure automatique thème',
    anchor: 'appearance-hour-theme'
  },
  {
    page: 'appearance',
    tab: 'mode',
    label: 'Un thème par espace',
    group: 'Apparence',
    hint: 'Chaque espace garde son propre thème.',
    keywords: 'espace thème',
    anchor: 'appearance-per-space'
  },
  {
    page: 'appearance',
    tab: 'mode',
    label: 'Verre dépoli',
    group: 'Apparence',
    hint: 'Flou du verre de l’interface.',
    keywords: 'verre flou glass',
    anchor: 'glass-blur'
  },
  {
    page: 'appearance',
    tab: 'home',
    label: 'Fond de l’accueil',
    group: 'Apparence',
    hint: 'Dégradé, ciel, couleur unie ou image.',
    keywords: 'fond accueil image dégradé ciel',
    anchor: 'home-style'
  },
  {
    page: 'appearance',
    tab: 'home',
    label: 'Intensité du fond',
    group: 'Apparence',
    hint: 'Présence du fond sur l’accueil.',
    keywords: 'intensité fond accueil',
    anchor: 'home-intensity'
  },
  {
    page: 'appearance',
    tab: 'home',
    label: 'Flou de l’image',
    group: 'Apparence',
    hint: 'Flou appliqué à l’image d’accueil.',
    keywords: 'image flou accueil',
    anchor: 'home-blur'
  },
  {
    page: 'appearance',
    tab: 'interface',
    label: 'Densité',
    group: 'Apparence',
    hint: 'Compacte, normale ou aérée.',
    keywords: 'densité interface',
    anchor: 'density-label'
  },
  {
    page: 'appearance',
    tab: 'interface',
    label: 'Taille du texte',
    group: 'Apparence',
    hint: 'Taille de l’interface Vela.',
    keywords: 'texte taille interface',
    anchor: 'text-size-label'
  },
  {
    page: 'appearance',
    tab: 'interface',
    label: 'Barre latérale',
    group: 'Apparence',
    hint: 'À gauche ou à droite.',
    keywords: 'barre latérale côté position',
    anchor: 'side-label'
  },
  {
    page: 'appearance',
    tab: 'interface',
    label: 'Ambiance',
    group: 'Apparence',
    hint: 'Atmosphères animées derrière le verre.',
    keywords: 'ambiance animation',
    anchor: 'appearance-ambience'
  },
  {
    page: 'appearance',
    tab: 'accessibility',
    label: 'Contraste élevé',
    group: 'Apparence',
    hint: 'Bordures renforcées, transparences supprimées.',
    keywords: 'contraste accessibilité',
    anchor: 'appearance-contrast'
  },
  {
    page: 'appearance',
    tab: 'accessibility',
    label: 'Réduire les animations',
    group: 'Apparence',
    hint: 'Fige les animations de l’interface.',
    keywords: 'animation mouvement réduire',
    anchor: 'motion-label'
  },
  {
    page: 'navigation',
    tab: 'search',
    label: 'Moteur de recherche',
    group: 'Navigation',
    hint: 'Moteur par défaut et moteurs ajoutés.',
    keywords: 'moteur recherche google duckduckgo',
    anchor: 'nav-engine'
  },
  {
    page: 'navigation',
    tab: 'search',
    label: 'Moteurs ajoutés',
    group: 'Navigation',
    hint: 'Ajouter une adresse de recherche.',
    keywords: 'moteur ajouté personnalisé',
    anchor: 'nav-custom-engines'
  },
  {
    page: 'navigation',
    tab: 'search',
    label: 'Mots-clés rapides',
    group: 'Navigation',
    hint: 'Raccourcis de recherche dans l’adresse.',
    keywords: 'mots clés keyword recherche',
    anchor: 'nav-keywords'
  },
  {
    page: 'navigation',
    tab: 'startup',
    label: 'À l’ouverture',
    group: 'Navigation',
    hint: 'Reprendre, accueil ou page précise.',
    keywords: 'démarrage lancement ouverture',
    anchor: 'startup-label'
  },
  {
    page: 'navigation',
    tab: 'startup',
    label: 'Nouvel onglet',
    group: 'Navigation',
    hint: 'Accueil ou page vide.',
    keywords: 'nouvel onglet',
    anchor: 'newtab-label'
  },
  {
    page: 'navigation',
    tab: 'library',
    label: 'Marque-pages',
    group: 'Navigation',
    hint: 'Pages gardées, import et export.',
    keywords: 'favoris marque pages',
    anchor: 'nav-bookmarks'
  },
  {
    page: 'navigation',
    tab: 'library',
    label: 'Historique',
    group: 'Navigation',
    hint: 'Entrées conservées et consultation.',
    keywords: 'historique',
    anchor: 'nav-history'
  },
  {
    page: 'navigation',
    tab: 'library',
    label: 'Durée de conservation',
    group: 'Navigation',
    hint: 'Durée de l’historique.',
    keywords: 'historique conservation durée',
    anchor: 'retention-label'
  },
  {
    page: 'navigation',
    tab: 'downloads',
    label: 'Dossier de téléchargement',
    group: 'Navigation',
    hint: 'Destination des fichiers.',
    keywords: 'téléchargement dossier destination',
    anchor: 'download-folder'
  },
  {
    page: 'navigation',
    tab: 'downloads',
    label: 'Demander où enregistrer',
    group: 'Navigation',
    hint: 'Boîte système à chaque fichier.',
    keywords: 'téléchargement demander enregistrer',
    anchor: 'ask-download'
  },
  {
    page: 'navigation',
    tab: 'downloads',
    label: 'Ouvrir après téléchargement',
    group: 'Navigation',
    hint: 'Ouvre le fichier une fois complet.',
    keywords: 'téléchargement ouvrir fichier',
    anchor: 'open-download'
  },
  {
    page: 'navigation',
    tab: 'web',
    label: 'Langue des pages',
    group: 'Navigation',
    hint: 'Langue annoncée aux sites.',
    keywords: 'langue pages web accept-language',
    anchor: 'web-language'
  },
  {
    page: 'navigation',
    tab: 'web',
    label: 'Zoom par défaut',
    group: 'Navigation',
    hint: 'Taille d’affichage initiale des pages.',
    keywords: 'zoom page web taille',
    anchor: 'default-zoom'
  },
  {
    page: 'privacy',
    tab: 'protection',
    label: 'Niveau de blocage',
    group: 'Confidentialité',
    hint: 'Aucun, traqueurs ou renforcé.',
    keywords: 'blocage traqueurs strict publicités',
    anchor: 'privacy-levels'
  },
  {
    page: 'privacy',
    tab: 'protection',
    label: 'Exceptions par site',
    group: 'Confidentialité',
    hint: 'Sites exemptés du blocage.',
    keywords: 'exception site blocage',
    anchor: 'privacy-exceptions'
  },
  {
    page: 'privacy',
    tab: 'local',
    label: 'Vignettes des pages récentes',
    group: 'Confidentialité',
    hint: 'Captures des onglets fermés.',
    keywords: 'vignettes captures pages récentes',
    anchor: 'thumbnails'
  },
  {
    page: 'privacy',
    tab: 'local',
    label: 'Icônes de sites',
    group: 'Confidentialité',
    hint: 'Cache local des favicons.',
    keywords: 'icônes favicons cache',
    anchor: 'privacy-favicons'
  },
  {
    page: 'privacy',
    tab: 'local',
    label: 'Historique local',
    group: 'Confidentialité',
    hint: 'Durée et effacement de l’historique.',
    keywords: 'historique données locales',
    anchor: 'privacy-history'
  },
  {
    page: 'privacy',
    tab: 'local',
    label: 'Cookies et stockage',
    group: 'Confidentialité',
    hint: 'Partitions par espace.',
    keywords: 'cookies stockage partition',
    anchor: 'privacy-cookies'
  },
  {
    page: 'privacy',
    tab: 'local',
    label: 'Effacer des données',
    group: 'Confidentialité',
    hint: 'Historique, vignettes et icônes.',
    keywords: 'effacer données historique vignettes',
    anchor: 'privacy-clear'
  },
  {
    page: 'privacy',
    tab: 'permissions',
    label: 'Permissions des pages',
    group: 'Confidentialité',
    hint: 'Caméra, micro, position et notifications.',
    keywords: 'permissions caméra micro position notifications',
    anchor: 'privacy-panel-permissions'
  },
  {
    page: 'agent',
    tab: 'model',
    label: 'Mode de l’agent',
    group: 'Agent',
    hint: 'Démo locale ou modèle.',
    keywords: 'agent démo modèle api',
    anchor: 'agent-mode'
  },
  {
    page: 'agent',
    tab: 'model',
    label: 'Fournisseur actif',
    group: 'Agent',
    hint: 'Fournisseur et endpoint de l’agent.',
    keywords: 'fournisseur actif clé api endpoint',
    anchor: 'agent-active-provider'
  },
  {
    page: 'agent',
    tab: 'notes',
    label: 'Dossier des notes',
    group: 'Agent',
    hint: 'Markdown local et rapport de l’agent.',
    keywords: 'notes dossier markdown rapport',
    anchor: 'agent-notes-files'
  },
  {
    page: 'agent',
    tab: 'notes',
    label: 'Notes récentes',
    group: 'Agent',
    hint: 'Les six dernières notes.',
    keywords: 'notes récentes',
    anchor: 'agent-notes-recent'
  },
  {
    page: 'system',
    tab: 'shortcuts',
    label: 'Filtrer les raccourcis',
    group: 'Système',
    hint: 'Chercher une combinaison clavier.',
    keywords: 'raccourcis filtre clavier',
    anchor: 'system-shortcut-filter'
  },
  {
    page: 'system',
    tab: 'updates',
    label: 'Vérification automatique',
    group: 'Système',
    hint: 'Fréquence du contrôle des mises à jour.',
    keywords: 'mise à jour automatique fréquence',
    anchor: 'update-checks'
  },
  {
    page: 'system',
    tab: 'updates',
    label: 'Mettre à jour Vela',
    group: 'Système',
    hint: 'Vérifier, télécharger ou installer.',
    keywords: 'mise à jour installer télécharger',
    anchor: 'system-update-action'
  },
  {
    page: 'system',
    tab: 'about',
    label: 'Identité de Vela',
    group: 'Système',
    hint: 'Version, licence et état de l’appareil.',
    keywords: 'à propos version licence identité',
    anchor: 'system-about'
  },
  {
    page: 'system',
    tab: 'about',
    label: 'Gérer les mises à jour',
    group: 'Système',
    hint: 'Ouvrir l’onglet des mises à jour.',
    keywords: 'mise à jour à propos',
    anchor: 'system-about-update'
  }
]

const ENTRIES = [...SECTIONS, ...ITEMS]

/** Comparaison sans accent ni casse : « precedente » trouve « Précédente ». */
export function normalizeSettingText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Valide un onglet reçu par lien profond ; une valeur inconnue retombe sur le défaut. */
export function resolveTab<T extends string>(
  value: string | undefined,
  tabs: readonly { id: T }[],
  fallback: T
): T {
  return tabs.some((entry) => entry.id === value) ? (value as T) : fallback
}

export function searchSettings(query: string): SettingsSearchEntry[] {
  const needle = normalizeSettingText(query.trim())
  if (!needle) return []

  const scored: { entry: SettingsSearchEntry; score: number }[] = []
  for (const entry of ENTRIES) {
    const label = normalizeSettingText(entry.label)
    const group = normalizeSettingText(entry.group)
    const haystack = normalizeSettingText(
      `${entry.label} ${entry.group} ${entry.hint} ${entry.keywords}`
    )
    if (!haystack.includes(needle)) continue

    let score = 5
    if (label === needle) score = 0
    else if (label.startsWith(needle)) score = 1
    else if (label.includes(needle)) score = 2
    else if (group === needle) score = 3
    else if (group.includes(needle)) score = 4
    scored.push({ entry, score })
  }

  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)
    .map((item) => item.entry)
}
