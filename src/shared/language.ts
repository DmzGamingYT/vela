/**
 * Langue d’une page : on lit d’abord l’attribut `lang` du document, puis on
 * devine sur un échantillon de texte quand la page ne déclare rien. Le résultat
 * sert uniquement à décider si le bouton de traduction a lieu d’être.
 */

const NAME_BY_CODE: Record<string, string> = {
  fr: 'français',
  en: 'anglais',
  de: 'allemand',
  es: 'espagnol',
  it: 'italien',
  pt: 'portugais',
  nl: 'néerlandais',
  ja: 'japonais',
  zh: 'chinois',
  ar: 'arabe',
  ru: 'russe',
  pl: 'polonais',
  sv: 'suédois'
}

/** Mots outils : assez fréquents pour trancher entre deux langues latines. */
const STOP_WORDS: Record<string, string[]> = {
  fr: ['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'est', 'que', 'pour', 'dans', 'sur', 'avec', 'pas', 'plus', 'au', 'aux', 'ce', 'cette', 'nous', 'vous', 'il', 'elle', 'mais', 'son', 'qui'],
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'that', 'for', 'with', 'on', 'as', 'are', 'this', 'it', 'be', 'from', 'not', 'you', 'we', 'they', 'at', 'by', 'but', 'his', 'her', 'was'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'auf', 'für', 'ein', 'eine', 'zu', 'den', 'dem', 'des', 'sich', 'auch', 'wird', 'von', 'im'],
  es: ['el', 'la', 'los', 'las', 'de', 'del', 'y', 'es', 'que', 'para', 'con', 'por', 'una', 'un', 'en', 'no', 'más', 'se', 'su', 'al'],
  it: ['il', 'lo', 'la', 'gli', 'le', 'di', 'del', 'e', 'è', 'che', 'per', 'con', 'una', 'un', 'in', 'non', 'più', 'si', 'su', 'al']
}

/** Code court et normalisé (`en-US` → `en`), ou null si rien de lisible. */
export function langCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toLowerCase().split(/[-_]/)[0]
  return /^[a-z]{2,3}$/.test(code) ? code : null
}

/**
 * Langue de la page. `declared` sort de `document.documentElement.lang` ;
 * `sample` est un extrait du texte visible, utilisé seulement à défaut.
 */
export function detectLanguage(
  declared: string | null | undefined,
  sample: string | null | undefined
): string | null {
  const declaredCode = langCode(declared)
  if (declaredCode) return declaredCode
  const words = (sample ?? '').toLowerCase().match(/[a-zà-ÿ']+/g) ?? []
  if (words.length < 12) return null
  let best: { code: string; score: number } | null = null
  for (const [code, stops] of Object.entries(STOP_WORDS)) {
    const set = new Set(stops)
    let hits = 0
    for (const word of words) if (set.has(word)) hits += 1
    const score = hits / words.length
    if (!best || score > best.score) best = { code, score }
  }
  return best && best.score >= 0.12 ? best.code : null
}

/** Nom lisible d’une langue, pour les libellés (« De anglais vers français »). */
export function languageName(code: string | null | undefined): string {
  const short = langCode(code)
  if (!short) return ''
  return NAME_BY_CODE[short] ?? short.toUpperCase()
}

/** Code affiché dans la pastille : `en` → `EN`. */
export function codeLabel(code: string | null | undefined): string {
  return (langCode(code) ?? '').toUpperCase()
}

/** La page est dans une autre langue que l’interface : la traduction a un sens. */
export function needsTranslation(
  pageLang: string | null | undefined,
  uiLang: string | null | undefined
): boolean {
  const page = langCode(pageLang)
  const ui = langCode(uiLang)
  return Boolean(page && ui && page !== ui)
}
