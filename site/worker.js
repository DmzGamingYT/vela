/**
 * Vela — worker du site.
 *
 * Sert `public/` via le binding ASSETS, puis :
 *   · durcit les en-têtes (CSP, HSTS, nosniff, framing) ;
 *   · met en cache les assets pour de bon — sans empreinte dans les noms,
 *     les durées restent courtes sur le HTML et longues sur les images ;
 *   · renvoie une page 404 aux couleurs du site pour les navigations.
 */

// Sans empreinte dans les noms de fichiers, on reste prudent : une capture
// remplacée à la release suivante ne doit pas rester une semaine chez un
// visiteur. Le stale-while-revalidate évite la revalidation bloquante.
const CACHE = [
  {
    test: /^\/(captures|og-vela\.jpg|favicon|apple-touch-icon)/,
    value: 'public, max-age=86400, stale-while-revalidate=604800'
  },
  // Le build publie des noms qui portent l’empreinte du contenu : un an sans
  // revalidation ne peut pas servir une version périmée.
  { test: /\.(css|js)$/, value: 'public, max-age=31536000, immutable' },
  { test: /\.(html)?$/, value: 'public, max-age=0, must-revalidate' }
]

const SECURITY = {
  'Content-Security-Policy': [
    "default-src 'self'",
    // Le thème vit dans /theme.js, chargé sans defer : plus d’inline à autoriser.
    // Seules les pastilles de teinte gardent un style inline.
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; '),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
}

const cacheFor = (pathname) =>
  CACHE.find((rule) => rule.test.test(pathname))?.value ?? 'public, max-age=0, must-revalidate'

const decorate = (response, { status, cache, body } = {}) => {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(SECURITY)) headers.set(name, value)
  headers.set('Cache-Control', cache ?? cacheFor(new URL(response.url || 'https://x/').pathname))
  return new Response(body ?? response.body, {
    status: status ?? response.status,
    statusText: response.statusText,
    headers
  })
}

// `/404` est l’adresse que le binding ASSETS sert pour la page d’erreur : elle
// doit répondre 404, jamais 200, sinon un moteur indexe une erreur comme une page.
const NOT_FOUND = new Set(['/404', '/404.html', '/404/'])

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const response = await env.ASSETS.fetch(request)
    const cache = cacheFor(url.pathname)

    // Deux cas mènent à la page d’erreur : une adresse inconnue, et ses alias.
    // ASSETS redirige `/404.html` vers `/404` ; on demande donc directement la
    // cible, sinon la réponse est un 307 et `page.ok` reste faux : le repli ne
    // servait jamais et la 404 sortait sans statut d’erreur.
    const wantsHtml = (request.headers.get('Accept') || '').includes('text/html')
    const navigate = request.method === 'GET' && wantsHtml
    if (navigate && (response.status === 404 || NOT_FOUND.has(url.pathname))) {
      const page = await env.ASSETS.fetch(new URL('/404', url).toString())
      if (page.ok) {
        return decorate(page, { status: 404, cache: 'public, max-age=0, must-revalidate' })
      }
    }

    return decorate(response, { cache })
  }
}
