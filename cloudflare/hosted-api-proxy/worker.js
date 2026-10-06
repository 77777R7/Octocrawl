// Serves api.octocrawl.dev and mcp.octocrawl.dev from the Cloud Run service `octocrawl-api` (hosted Octocrawl, phase 1).
// As the public-preview proxy: Cloudflare's free plan cannot rewrite the Host header, so this Worker fetches the
// run.app address itself, names the public host in X-Forwarded-Host and the caller in CF-Connecting-IP, and proves
// it is this Worker with the PROXY_SECRET it shares with the service (W2L_PROXY_SECRET); without the secret the
// service does not believe CF-Connecting-IP (packages/mcp/src/hostedApi.ts, clientAddress). Nothing is redirected
// between hosts: API clients and MCP clients do not follow redirects well, and each host serves the same process.
export default {
  async fetch(request, env) {
    const incoming = new URL(request.url)
    if (incoming.protocol === 'http:') {
      incoming.protocol = 'https:'
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
    return fetch(target, { method: request.method, headers, body: request.body, redirect: 'manual' })
  },
}
