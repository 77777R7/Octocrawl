// Serves the public domain from the Cloud Run preview service. Cloudflare's free plan cannot rewrite the Host header,
// so this Worker fetches the run.app address itself and names the public domain in X-Forwarded-Host. The preview
// server believes that header only when it equals W2L_PUBLIC_ORIGIN (packages/public-preview/src/site.ts).
export default {
  async fetch(request, env) {
    const incoming = new URL(request.url)
    if (incoming.protocol === 'http:') {
      incoming.protocol = 'https:'
      return Response.redirect(incoming.toString(), 301)
    }
    const target = new URL(`${incoming.pathname}${incoming.search}`, env.ORIGIN_URL)
    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.set('x-forwarded-host', incoming.host)
    headers.set('x-forwarded-proto', 'https')
    // Redirects and cookies pass through unchanged; the service sets its own cache headers.
    return fetch(target, { method: request.method, headers, body: request.body, redirect: 'manual' })
  },
}
