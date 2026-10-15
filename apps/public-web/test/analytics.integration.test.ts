import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createPreviewServer } from '../../../packages/public-preview/src/server.js'
import { Window } from 'happy-dom'

let server: Server | undefined
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.resetModules()
  await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve())
  server = undefined
})

async function receiver() {
  const lines: Record<string, unknown>[] = []
  server = createPreviewServer({ staticDir: '/missing', quota: { consume: async () => 'ok' }, log: line => lines.push(line) })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { base, lines }
}

describe('first-party event sender and actual receiver', () => {
  it('excludes extracted map links while retaining the site navigation event', async () => {
    const { base, lines } = await receiver()
    const window = new Window({ url: `${base}/tools/link-extractor/` })
    const networkFetch = globalThis.fetch
    const deliveries: Promise<Response>[] = []
    vi.stubGlobal('navigator', { sendBeacon: () => false })
    vi.stubGlobal('location', window.location)
    vi.stubGlobal('HTMLAnchorElement', window.HTMLAnchorElement)
    vi.stubGlobal('fetch', (url: string, options: RequestInit) => {
      const response = networkFetch(`${base}${url}`, { ...options, headers: { origin: base, 'content-type': 'application/json' } })
      deliveries.push(response)
      return response
    })
    window.document.body.innerHTML = '<div class="map-row"><a href="https://private.example/sensitive">Extracted URL</a></div><a href="/docs/connect-mcp/">Connect MCP</a>'
    const { trackLinkClicks } = await import('../src/analytics')
    trackLinkClicks(window.document.body as unknown as HTMLElement)
    window.document.body.addEventListener('click', event => event.preventDefault())
    for (const link of window.document.querySelectorAll('a')) link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    expect((await Promise.all(deliveries)).map(response => response.status)).toEqual([204])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ name: 'link_click', props: { path: '/tools/link-extractor/', href: '/docs/connect-mcp/' } })
    expect(JSON.stringify(lines)).not.toContain('private.example')
    await window.happyDOM.close()
  })

  it.each([true, false])('delivers once with page path, beacon accepted=%s', async accepted => {
    const { base, lines } = await receiver()
    const networkFetch = globalThis.fetch
    const deliveries: Promise<Response>[] = []
    const deliver = (url: string, body: BodyInit) => {
      const response = networkFetch(`${base}${url}`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body })
      deliveries.push(response)
      return response
    }
    vi.stubGlobal('location', { pathname: '/tools/link-extractor/', search: '?url=https://private.example/secret?key=hidden' })
    const beacon = vi.fn((url: string, body: Blob) => { if (accepted) void deliver(url, body); return accepted })
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    const fallback = vi.fn((url: string, options: RequestInit) => deliver(url, options.body!))
    vi.stubGlobal('fetch', fallback)
    const { track } = await import('../src/analytics')
    track('result_copy', { view: 'map' })
    expect((await Promise.all(deliveries)).map(response => response.status)).toEqual([204])
    expect(fallback).toHaveBeenCalledTimes(accepted ? 0 : 1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ event: 'w2l_web_event', name: 'result_copy', props: { path: '/tools/link-extractor/', view: 'map' } })
    expect(JSON.stringify(lines)).not.toContain('private.example')
    expect(JSON.stringify(lines)).not.toContain('hidden')
    // The receiver refuses unknown properties rather than storing a target URL supplied as a new field.
    const refused = await networkFetch(`${base}/api/events`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'result_copy', props: { url: 'https://private.example/' } }) })
    expect(refused.status).toBe(400)
    expect(lines).toHaveLength(1)
  })

  it.each([{ doNotTrack: '1' }, { globalPrivacyControl: true }])('sends nothing on client opt-out %j', async preference => {
    const beacon = vi.fn()
    const fetch = vi.fn()
    vi.stubGlobal('navigator', { ...preference, sendBeacon: beacon })
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('location', { pathname: '/scrape/' })
    const { track } = await import('../src/analytics')
    track('docs_code_copy', { tab: 'curl' })
    expect(beacon).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([{ dnt: '1' }, { 'sec-gpc': '1' }])('receiver suppresses logging on opt-out %j', async preference => {
    const { base, lines } = await receiver()
    const response = await fetch(`${base}/api/events`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json', ...preference }, body: JSON.stringify({ name: 'result_download', props: { path: '/tools/link-extractor/', view: 'map-csv' } }) })
    expect(response.status).toBe(204)
    expect(lines).toHaveLength(0)
  })
})
