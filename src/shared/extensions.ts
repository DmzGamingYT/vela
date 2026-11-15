export type ExtensionCategoryId = 'block' | 'passwords' | 'reading' | 'privacy' | 'work'

export interface ExtensionCategory {
  id: ExtensionCategoryId
  label: string
  hint: string
}

export interface ExtensionSuggestion {
  id: string
  name: string
  vendor: string
  category: ExtensionCategoryId
  blurb: string
  /** Recherche sur le Chrome Web Store : l'identifiant change, la recherche reste juste. */
  query: string
}

export const EXTENSION_CATEGORIES: ExtensionCategory[] = [
  { id: 'block', label: 'Moins de bruit', hint: 'Ce qui gêne la lecture, retiré d’abord.' },
  { id: 'privacy', label: 'Vie privée', hint: 'Ce qui suit la navigation, laissé de côté.' },
  { id: 'passwords', label: 'Mots de passe', hint: 'Un coffre unique, pas un carnet.' },
  { id: 'reading', label: 'Lecture', hint: 'Le texte seul, dans la lumière qui vous va.' },
  { id: 'work', label: 'Travail', hint: 'Ce qui accélère sans changer les habitudes.' }
]

export const EXTENSION_SUGGESTIONS: ExtensionSuggestion[] = [
  {
    id: 'ublock-origin',
    name: 'uBlock Origin',
    vendor: 'Raymond Hill',
    category: 'block',
    blurb: 'Le bloqueur de référence : listes locales, mémoire basse, rien revendu.',
    query: 'uBlock Origin'
  },
  {
    id: 'sponsorblock',
    name: 'SponsorBlock',
    vendor: 'Ajay Ramachandran',
    category: 'block',
    blurb: 'Saute les passages sponsorisés des vidéos, marqués par la communauté.',
    query: 'SponsorBlock'
  },
  {
    id: 'privacy-badger',
    name: 'Privacy Badger',
    vendor: 'EFF',
    category: 'privacy',
    blurb: 'Apprend quels domaines suivent la navigation et les bloque ensuite.',
    query: 'Privacy Badger'
  },
  {
    id: 'clearurls',
    name: 'ClearURLs',
    vendor: 'ClearURLs',
    category: 'privacy',
    blurb: 'Retire les paramètres de pistage collés aux adresses partagées.',
    query: 'ClearURLs'
  },
  {
    id: 'bitwarden',
    name: 'Bitwarden',
    vendor: 'Bitwarden',
    category: 'passwords',
    blurb: 'Coffre libre, synchronisé ou local, sans dépendre d’un compte payant.',
    query: 'Bitwarden'
  },
  {
    id: '1password',
    name: '1Password',
    vendor: 'AgileBits',
    category: 'passwords',
    blurb: 'Le coffre le plus soigné de la catégorie, pour qui paie déjà l’abonnement.',
    query: '1Password'
  },
  {
    id: 'dark-reader',
    name: 'Dark Reader',
    vendor: 'Alexander Shutau',
    category: 'reading',
    blurb: 'Rend sombre ce qui ne l’est pas, site par site et sans images inversées.',
    query: 'Dark Reader'
  },
  {
    id: 'readwise-reader',
    name: 'Readwise Reader',
    vendor: 'Readwise',
    category: 'reading',
    blurb: 'Envoie un article dans une file de lecture, sans le perdre dans les onglets.',
    query: 'Readwise Reader'
  },
  {
    id: 'vimium',
    name: 'Vimium',
    vendor: 'Phil Crosby, Ilya Sukhar',
    category: 'work',
    blurb: 'Tout au clavier : liens, onglets, historique, sans quitter la page.',
    query: 'Vimium'
  },
  {
    id: 'languagetool',
    name: 'LanguageTool',
    vendor: 'LanguageTooler',
    category: 'work',
    blurb: 'Corrige le français dans les champs de texte, accents et accords compris.',
    query: 'LanguageTool'
  }
]

/** Page de recherche du Chrome Web Store : jamais un identifiant figé. */
export function storeUrl(query: string): string {
  return `https://chromewebstore.google.com/search/${encodeURIComponent(query)}`
}
