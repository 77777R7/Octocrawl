// A local proxy on 127.0.0.1 that sends everything to the proxy in UPSTREAM_PROXY with its login (Chrome takes no proxy
// credentials on its command line, and the installed_chrome rung refuses a proxy that needs one). No dependencies: HTTPS
// goes through CONNECT, plain HTTP is forwarded with Proxy-Authorization. The credentials are never logged.
import http from 'node:http'
import net from 'node:net'
const upstream = new URL(process.env.UPSTREAM_PROXY ?? '')
const upstreamPort = Number(upstream.port || 80)
const auth = `Basic ${Buffer.from(`${decodeURIComponent(upstream.username)}:${decodeURIComponent(upstream.password)}`).toString('base64')}`
const port = Number(process.env.FORWARD_PORT ?? 8794)

const server = http.createServer((req, res) => {
  const forwarded = http.request({ host: upstream.hostname, port: upstreamPort, method: req.method, path: req.url, headers: { ...req.headers, 'proxy-authorization': auth } }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers)
    answer.pipe(res)
  })
  forwarded.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
  req.pipe(forwarded)
})

server.on('connect', (req, client, head) => {
  const tunnel = net.connect(upstreamPort, upstream.hostname, () => {
    tunnel.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${auth}\r\n\r\n`)
  })
  let buffered = Buffer.alloc(0)
  const onHead = (chunk) => {
    buffered = Buffer.concat([buffered, chunk])
    const end = buffered.indexOf('\r\n\r\n')
    if (end < 0) return
    tunnel.off('data', onHead)
    const status = buffered.subarray(0, end).toString('latin1').split(' ')[1] ?? '502'
    if (status !== '200') { client.end(`HTTP/1.1 ${status} Upstream refused\r\n\r\n`); tunnel.destroy(); return }
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    const rest = buffered.subarray(end + 4)
    if (rest.length > 0) client.write(rest)
    if (head.length > 0) tunnel.write(head)
    tunnel.pipe(client)
    client.pipe(tunnel)
  }
  tunnel.on('data', onHead)
  tunnel.on('error', () => client.destroy())
  client.on('error', () => tunnel.destroy())
})

server.listen(port, '127.0.0.1', () => console.log(`forwarder on 127.0.0.1:${port} -> ${upstream.hostname}:${upstreamPort}`))
