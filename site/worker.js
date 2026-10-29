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
  { test: /^\/(captures|og-vela\.png|favicon|apple-touch-icon)/, value: 'public, max-age=86400, stale-while-revalidate=604800' },
  { test: /\.(css|js)$/, value: 'public, max-age=600, stale-while-revalidate=86400' },
  { test: /\.(html)?$/, value: 'public, max-age=0, must-revalidate' }
]

const SECURITY = {
  'Content-Security-Policy': [
    "default-src 'self'",
    // Le thème est posé par un script inline avant le premier rendu (pas de FOUC),
    // et les pastilles de teinte portent un style inline.
    "script-src 'self' 'unsafe-inline'",
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

const cacheFor = (pathname) => CACHE.find((rule) => rule.test.test(pathname))?.value ?? 'public, max-age=0, must-revalidate'

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const response = await env.ASSETS.fetch(request)
    const cache = cacheFor(url.pathname)

    // Une navigation vers une adresse inconnue reçoit la 404 du site.
    const wantsHtml = (request.headers.get('Accept') || '').includes('text/html')
    if (response.status === 404 && request.method === 'GET' && wantsHtml) {
      const page = await env.ASSETS.fetch(new URL('/404.html', url).toString())
      if (page.ok) {
        return decorate(page, { status: 404, cache: 'public, max-age=0, must-revalidate' })
      }
    }

    return decorate(response, { cache })
  }
}
