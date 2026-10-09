import { describe, expect, it } from 'vitest'
import { classifyGate, type GateResponse } from '../src/gate.js'

/**
 * The gate reads a 2xx page's whole body for a short wall (ROADMAP PA item 4), on every page of every lane: in one linear
 * pass, however the page is built. Each shape below made the first, regex-based reading take seconds per call.
 */
const res = (body: string): GateResponse => ({ status: 200, header: () => null, body, contentful: true })

function timed(body: string): number {
  const started = performance.now()
  classifyGate(res(body))
  return performance.now() - started
}

describe('classifyGate on large or hostile pages', () => {
  it('reads each in bounded time', () => {
    const shapes: Record<string, string> = {
      'unclosed svg openers': 'reference ' + '<svg'.repeat(100_000),
      'unclosed comment openers': 'reference ' + '<!--'.repeat(100_000),
      'unclosed heading openers': 'reference ' + '<h1>'.repeat(100_000),
      'app shell with escaped closers': `<html><body><h1>Shop</h1><p>Unusual activity reference</p><script>var data = ${JSON.stringify('<h2>Details<\\/h2>'.repeat(250_000))}</script></body></html>`,
      'large article': '<html><body>' + '<p>reference text of an ordinary article, paragraph after paragraph.</p>'.repeat(250_000) + '</body></html>',
      'large script': '<html><head><script>' + 'var reference = 1;'.repeat(1_000_000) + '</script></head><body><p>Short.</p></body></html>',
    }
    for (const [name, body] of Object.entries(shapes)) expect(timed(body), name).toBeLessThan(1_500)
  })
})
