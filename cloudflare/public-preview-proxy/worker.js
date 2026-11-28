// Serves the public domain from the Cloud Run preview service. Cloudflare's free plan cannot rewrite the Host header,
// so this Worker fetches the run.app address itself and names the public domain in X-Forwarded-Host and the visitor
// in CF-Connecting-IP. It proves it is this Worker with the PROXY_SECRET it shares with the service (W2L_PROXY_SECRET);
// without it the service ignores both headers (packages/public-preview/src/server.ts, acceptProxyHeaders).
// Every other host it answers on (octocrawl.app, www.octocrawl.dev) redirects to PRIMARY_HOST.
//
// While PAUSED is set (wrangler.toml), the Worker answers every page itself with a short notice and the service is
// never called, so the domain keeps explaining itself after the service's public access is removed
// (docs/hosted-api.md, "Pausing"). The status is 503, which tells crawlers the page is away for now, not gone.
const PAUSED_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Octocrawl is paused</title>
<style>
:root { color-scheme: light dark }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.6 system-ui, sans-serif; background: Canvas; color: CanvasText }
main { max-width: 34rem; padding: 2rem }
h1 { font-size: 1.5rem; margin: 0 0 1rem }
code { font-family: ui-monospace, monospace }
</style>
</head>
<body>
<main>
<h1>Octocrawl is paused</h1>
<p>This site, the hosted API (api.octocrawl.dev) and the hosted MCP server (mcp.octocrawl.dev) are offline for now.</p>
<p>The open-source server still runs on your own computer: <code>npx octocrawl serve</code></p>
<p>Source and updates: <a href="https://github.com/77777R7/Octocrawl">github.com/77777R7/Octocrawl</a></p>
</main>
</body>
</html>
`

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url)
    if (incoming.protocol === 'http:' || incoming.host !== env.PRIMARY_HOST) {
      incoming.protocol = 'https:'
      incoming.host = env.PRIMARY_HOST
      return Response.redirect(incoming.toString(), 301)
    }
    if (env.PAUSED) {
      return new Response(PAUSED_PAGE, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '86400', 'cache-control': 'no-store' } })
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
