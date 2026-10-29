/**
 * Toutes les destinations que Vela contacte elle-même, hors pages que vous
 * ouvrez. La page Confidentialité lit cette liste, et `network.test.ts` échoue
 * dès qu'une adresse apparaît dans le code sans figurer ici.
 *
 * Une entrée décrit quatre choses : la destination, ce qui déclenche la
 * requête, les données réellement envoyées, et le moyen de l'éviter.
 */

export type FlowCategory =
  | 'meteo'
  | 'recherche'
  | 'tunnel'
  | 'journal'
  | 'modeles'
  | 'mises-a-jour'
  | 'pages'
  | 'extensions'

export interface NetworkFlow {
  id: string
  label: string
  /** Destination telle qu'elle doit se lire dans l'interface. */
  target: string
  /**
   * Hôtes littéraux présents dans le code, pour le test d'audit. Vide quand la
   * destination dépend de la page ouverte (un site cité, un favicon).
   */
  hosts: readonly string[]
  category: FlowCategory
  /** Ce qui déclenche la requête. */
  trigger: string
  /** Données réellement envoyées. */
  data: string
  /** Ce qui coupe le flux ; `null` quand aucun réglage n'existe encore. */
  off: string | null
  /** true quand la requête ne quitte pas la machine. */
  local?: boolean
}

const SEARCH_HOSTS = [
  'duckduckgo.com',
  'search.brave.com',
  'www.startpage.com',
  'www.google.com',
  'www.bing.com',
  'www.ecosia.org',
  'www.qwant.com',
  'searx.be'
] as const

const MODEL_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.x.ai',
  'api.mistral.ai',
  'api.deepseek.com',
  'api.groq.com',
  'api.cerebras.ai',
  'openrouter.ai',
  'translation.googleapis.com'
] as const

export const NETWORK_FLOWS: readonly NetworkFlow[] = [
  {
    id: 'meteo-ville',
    label: 'Recherche de ville',
    target: 'geocoding-api.open-meteo.com',
    hosts: ['geocoding-api.open-meteo.com'],
    category: 'meteo',
    trigger: 'Quand vous validez une ville sur l’accueil.',
    data: 'Le nom de la ville saisi et la langue de recherche. Rien d’autre.',
    off: 'Le bouton Retirer, à côté de la ville.'
  },
  {
    id: 'meteo-releve',
    label: 'Relevé météo',
    target: 'api.open-meteo.com',
    hosts: ['api.open-meteo.com'],
    category: 'meteo',
    trigger: 'À l’ouverture de l’accueil, une fois une ville choisie, puis au plus une fois par demi-heure (relevé gardé sur l’appareil).',
    data: 'La latitude et la longitude de la ville. Aucun identifiant, aucune adresse.',
    off: 'Le bouton Retirer, à côté de la ville.'
  },
  {
    id: 'moteur-connexion',
    label: 'Connexion au moteur',
    target: 'Le moteur de recherche choisi',
    hosts: SEARCH_HOSTS,
    category: 'recherche',
    trigger: 'Au démarrage et à chaque changement de moteur.',
    data: 'Une connexion TLS ouverte vers le moteur, sans requête ni terme recherché.',
    off: 'Choisir un autre moteur : la connexion ne part que vers celui-là.'
  },
  {
    id: 'moteur-recherche',
    label: 'Recherche',
    target: 'Le moteur de recherche choisi',
    hosts: SEARCH_HOSTS,
    category: 'recherche',
    trigger: 'Quand vous validez une recherche dans le champ d’adresse ou sur l’accueil.',
    data: 'Les mots recherchés. C’est le moteur qui les reçoit, pas Vela.',
    off: 'Taper une adresse au lieu d’une recherche, ou changer de moteur.'
  },
  {
    id: 'tunnel-fournisseurs',
    label: 'Tunnel de recherche',
    target: 'DuckDuckGo, Wikipédia, Hacker News, arXiv, GDELT',
    hosts: ['html.duckduckgo.com', 'wikipedia.org', 'hn.algolia.com', 'export.arxiv.org', 'api.gdeltproject.org'],
    category: 'tunnel',
    trigger: 'Quand vous lancez un tunnel de recherche en mode Travail.',
    data: 'La requête et la langue. Chaque fournisseur ne reçoit que la requête.',
    off: 'Ne pas lancer de tunnel.'
  },
  {
    id: 'tunnel-pages',
    label: 'Pages citées par le tunnel',
    target: 'Les sites retenus par les résultats',
    hosts: [],
    category: 'tunnel',
    trigger: 'Pendant un tunnel, pour vérifier chaque source et en lire un extrait.',
    data: 'La page publique demandée, comme un navigateur ; aucun onglet n’est ouvert.',
    off: 'Ne pas lancer de tunnel.'
  },
  {
    id: 'modeles',
    label: 'Modèle choisi',
    target: 'Le fournisseur configuré dans Réglages › Modèles',
    hosts: MODEL_HOSTS,
    category: 'modeles',
    trigger:
      'Quand vous lancez l’agent, une réécriture de note, la traduction d’une planche, ou la transcription d’une note vocale après votre accord.',
    data:
      'Votre demande, le texte des onglets joints ou de la note, et la clé dans un en-tête — jamais dans l’URL. Pour une transcription, l’enregistrement audio complet, et rien de plus : il ne part qu’après une confirmation explicite.',
    off: 'Rester en démo locale, ou brancher un serveur local.'
  },
  {
    id: 'modele-local',
    label: 'Serveur local',
    target: 'localhost:11434 (Ollama) ou l’endpoint que vous configurez',
    hosts: ['localhost'],
    category: 'modeles',
    trigger: 'Même actions, avec le fournisseur Local, transcription des notes vocales comprise.',
    data:
      'Sur une adresse de boucle locale, rien ne quitte la machine. Si vous configurez un autre hôte, la demande et l’audio partent vers cet hôte, avec les mêmes métadonnées réseau.',
    off: 'Choisir une adresse de boucle locale, ou ne pas utiliser ce fournisseur.',
    local: true
  },
  {
    id: 'mises-a-jour',
    label: 'Mises à jour',
    target: 'github.com — releases de Vela',
    hosts: [
      'github.com',
      'objects.githubusercontent.com',
      'release-assets.githubusercontent.com'
    ],
    category: 'mises-a-jour',
    trigger:
      'Douze secondes après le démarrage, puis toutes les trois heures, au retour de veille et au retour du focus. Sur macOS, le téléchargement de l’installateur suit la même règle.',
    data:
      'La version installée et la plateforme. Sur macOS, le manifeste latest-mac.yml puis le .dmg de la nouvelle version sont téléchargés ; l’empreinte SHA-512 du manifeste est vérifiée avant de proposer le fichier. Aucun identifiant, aucun réglage.',
    off: null
  },
  {
    id: 'bd-ocr',
    label: 'Lecture des planches',
    target: 'cdn.jsdelivr.net',
    hosts: ['cdn.jsdelivr.net'],
    category: 'extensions',
    trigger: 'Quand vous lancez la traduction d’une planche de BD.',
    data:
      'Aucune donnée applicative : téléchargement du moteur de reconnaissance de texte, une fois. Comme toute requête, elle expose l’adresse IP et les métadonnées de transport au CDN.',
    off: 'Ne pas lancer la traduction de BD.'
  },
  {
    id: 'letterboxd-journal',
    label: 'Journal Letterboxd',
    target: 'letterboxd.com — flux RSS public du profil',
    hosts: ['letterboxd.com'],
    category: 'journal',
    trigger:
      'Quand vous cliquez sur « Importer le journal » dans la carte À voir. Jamais au démarrage, jamais en arrière-plan.',
    data:
      'Le nom du profil public et la demande du flux. Aucun cookie, aucune session d’espace. Comme toute requête, elle expose l’adresse IP et les métadonnées de transport à Letterboxd.',
    off: 'Ne pas importer, ou retirer le compte Letterboxd de l’espace.'
  },
  {
    id: 'favicons',
    label: 'Icônes des sites',
    target: 'Le site concerné, sur son propre domaine',
    hosts: [],
    category: 'pages',
    trigger: 'Affichage d’un épinglé ou d’un favori dont l’icône n’est pas encore connue.',
    data: 'Une requête d’icône vers le site lui-même. Aucun service tiers.',
    off: 'Rien à couper : la requête ne vise que le site concerné.'
  },
  {
    id: 'pages',
    label: 'Pages visitées',
    target: 'Les sites que vous ouvrez',
    hosts: [],
    category: 'pages',
    trigger: 'Chaque navigation, chaque rechargement.',
    data: 'La requête normale du navigateur, avec les cookies de l’espace actif.',
    off: 'Fermer l’onglet, ou ne pas ouvrir la page.'
  }
]

/**
 * Adresses que Vela ne contacte jamais d'elle-même : elles n'apparaissent que
 * dans des liens que vous ouvrez (dépôt, pages de clés, raccourcis d'espaces).
 */
export const USER_OPENED_HOSTS: readonly string[] = [
  'aistudio.google.com',
  'allocine.fr',
  'app.slack.com',
  'calendar.google.com',
  'chatgpt.com',
  'cloud.cerebras.ai',
  'console.anthropic.com',
  'console.groq.com',
  'console.mistral.ai',
  'console.x.ai',
  'developer.mozilla.org',
  'discord.com',
  'drive.google.com',
  'fr.wikipedia.org',
  'imdb.com',
  'justwatch.com',
  'letterboxd.com',
  'linear.app',
  'mail.google.com',
  'mubi.com',
  'news.ycombinator.com',
  'ollama.com',
  'openclassrooms.com',
  'platform.deepseek.com',
  'platform.openai.com',
  'play.geforcenow.com',
  'scholar.google.com',
  'senscritique.com',
  'site-cd854ef5da03437a8f42ade87147e33d.freebuff.page',
  'stackoverflow.com',
  'store.steampowered.com',
  'www.figma.com',
  'www.lemonde.fr',
  'www.notion.so',
  'www.twitch.tv',
  'www.youtube.com'
]

/** Espaces de noms et motifs : jamais des requêtes. */
export const IGNORED_HOSTS: readonly string[] = ['www.w3.org', 'vela.local']

/** Ce qui ne quitte jamais l'appareil, sans requête aucune. */
export const LOCAL_ONLY = [
  'Historique, onglets, espaces, réglages et brief du jour',
  'Notes Markdown et surlignages, dans un dossier à vous',
  'Notes vocales, en fichiers audio dans le dossier de données de l’espace : lues sur place, jamais téléversées sans votre accord',
  'Clés d’API, chiffrées par le trousseau du système',
  'Liste de blocage des traqueurs, embarquée dans l’app',
  'Rapports de l’agent en mode démo, simulés sur place',
  'Cartes du tunnel, enregistrées avec l’espace',
  'Photos d’avatar et vignettes des pages récentes, en fichiers dans le dossier de données',
  'Journal Letterboxd importé : titres, notes et dates restent dans vela.json, lisibles hors ligne',
  'Correction orthographique désactivée : aucun dictionnaire n’est téléchargé'
] as const

export function flowHosts(): string[] {
  return NETWORK_FLOWS.flatMap((flow) => [...flow.hosts])
}

/** true si `host` correspond à l'entrée, sous-domaine compris. */
export function hostMatches(host: string, entry: string): boolean {
  const clean = host.toLowerCase()
  const rule = entry.toLowerCase()
  return clean === rule || clean.endsWith(`.${rule}`)
}
