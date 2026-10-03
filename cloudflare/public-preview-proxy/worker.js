// Serves the public domain from the Cloud Run preview service. Cloudflare's free plan cannot rewrite the Host header,
// so this Worker fetches the run.app address itself and names the public domain in X-Forwarded-Host and the visitor
// in CF-Connecting-IP. It proves it is this Worker with the PROXY_SECRET it shares with the service (W2L_PROXY_SECRET);
// without it the service ignores both headers (packages/public-preview/src/server.ts, acceptProxyHeaders).
// Every other host it answers on (octocrawl.app, www.octocrawl.dev) redirects to PRIMARY_HOST.
export default {
  async fetch(request, env) {
    const incoming = new URL(request.url)
    if (incoming.protocol === 'http:' || incoming.host !== env.PRIMARY_HOST) {
      incoming.protocol = 'https:'
      incoming.host = env.PRIMARY_HOST
      return Response.redirect(incoming.toString(), 301)
    }
    // Set the path on ORIGIN_URL rather than resolving it against ORIGIN_URL: a path starting with `//` would resolve
    // as protocol-relative and send the request, PROXY_SECRET included, to another host.
    const target = new URL(env.ORIGIN_URL)
    target.pathname = incoming.pathname
    target.search = incoming.search
    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.set('x-forwarded-host', incoming.host)
    headers.set('x-forwarded-proto', 'https')
    if (env.PROXY_SECRET) headers.set('x-w2l-proxy-secret', env.PROXY_SECRET)
    // Redirects and cookies pass through unchanged; the service sets its own cache headers.
    return fetch(target, { method: request.method, headers, body: request.body, redirect: 'manual' })
  },
}
