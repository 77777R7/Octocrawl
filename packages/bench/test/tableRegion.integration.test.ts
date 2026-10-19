import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { localNetworkPolicy } from '@w2l/contracts'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'

const table = '<style>:host{display:block}[role=table]{display:table}[role=row]{display:table-row}[role=cell]{display:table-cell;padding:2px}</style><div role="table"><div role="row" part="table-header-row"><div role="cell">Date</div><div role="cell">Price</div></div><div role="row"><div role="cell">2026-01-01</div><div role="cell">$100</div></div><div role="row"><div role="cell">2026-01-02</div><div role="cell">$101</div></div></div>'
let source: Server
let origin: string
let subject: BrowserLocalSubject
beforeAll(async () => {
  source = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
    const path = req.url ?? '/'
    const mode = path === '/closed' ? 'closed' : 'open'
    const inner = path === '/unheaded' ? table.replace(' part="table-header-row"', '') : path === '/ambiguous' ? table + table : table
    const roots = path === '/root-cap' ? Array.from({length:256}, () => '<empty-root></empty-root>').join('') : ''
    const large = path === '/html-cap' ? '<!--' + 'x'.repeat(1_000_001) + '-->' : ''
    const content = path === '/native' ? '<table><tr><th>Date</th><th>Price</th></tr><tr><td>2026-01-01</td><td>$100</td></tr><tr><td>2026-01-02</td><td>$101</td></tr></table>' : '<quote-table' + (path === '/hidden' ? ' style="display:none"' : '') + '></quote-table>'
    const script = path === '/native' ? '' : 'document.querySelector("quote-table").attachShadow({mode:' + JSON.stringify(mode) + '}).innerHTML=' + JSON.stringify(inner) + ';for(const el of document.querySelectorAll("empty-root"))el.attachShadow({mode:"open"});'
    res.writeHead(200, { 'content-type': 'text/html' }).end('<html><body><main><h1>AAPL fixture</h1>' + content + roots + large + '</main><script>' + script + '</script></body></html>')
  })
  await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
  origin = 'http://127.0.0.1:' + (source.address() as AddressInfo).port
  subject = new BrowserLocalSubject('standard', null, false, { ...localNetworkPolicy(), perHostMinDelayMs: 0 })
})
afterAll(async () => {
  await subject?.teardown()
  await new Promise<void>(resolve => source?.close(() => resolve()))
})

describe('bounded table region capture', () => {
  it.each(['/native', '/open'])('judges the rows it will deliver for %s', async path => {
    const out = await subject.fetch(origin + path, Date.now() + 8_000, undefined, undefined, { onlyMainContent: false, includeTables: true, verify: { checks: [{ type: 'tableRowsMin', tableIndex: 0, columns: [0, 1], min: 2 }] } })
    expect(out.tables?.[0]?.rows.slice(1)).toEqual([['2026-01-01', '$100'], ['2026-01-02', '$101']])
    expect(out.trace.find(event => event.event === 'region_wait')?.detail).toMatchObject({ ready: true, checks: [{ passed: true, observedCount: 2 }] })
  })

  it.each(['/closed', '/hidden', '/unheaded', '/ambiguous', '/root-cap', '/html-cap'])('does not count unsupported or capped shadow data for %s', async path => {
    const out = await subject.fetch(origin + path, Date.now() + 4_000, undefined, undefined, { onlyMainContent: false, includeTables: true, verify: { checks: [{ type: 'markdownIncludes', text: 'AAPL' }, { type: 'tableRowsMin', tableIndex: 0, columns: [0, 1], min: 2 }] } })
    const region = out.trace.find(event => event.event === 'region_wait')?.detail
    expect(region).toMatchObject({ ready: false })
    expect(out.tables?.some(value => value.rows.some(row => row.includes('$100'))) ?? false).toBe(false)
    if (path.endsWith('-cap')) expect(region).toMatchObject({ checks: [{ passed: true }, { passed: null }] })
  })
})
