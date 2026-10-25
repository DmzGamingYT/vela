export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    // Durcit les réponses d'assets sans changer le corps ni le statut.
    const headers = new Headers(response.headers)
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    headers.set('X-Frame-Options', 'DENY')
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  }
}
