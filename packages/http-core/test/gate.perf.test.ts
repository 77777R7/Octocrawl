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
  it('keeps the 401 DataDome scan bounded on hostile and script-heavy bodies', () => {
    const cases = [
      { body: '<iframe'.repeat(100_000), reason: 'login_wall' },
      { body: '<script>' + 'x'.repeat(2_000_000) + '</script><iframe src="https://geo.captcha-delivery.com/captcha/"></iframe>', reason: 'captcha' },
    ]
    for (const { body, reason } of cases) {
      const started = performance.now()
      expect(classifyGate({ ...res(body), status: 401 })?.reason).toBe(reason)
      expect(performance.now() - started).toBeLessThan(1_500)
    }
  })

  it('bounds the dedicated challenge scan and keeps hostile tags linear', () => {
    const finalUrl = 'https://www.skyscanner.net/sttc/px/captcha-v2/index.html'
    for (const body of ['<h1>Are you a person or a robot?</h1>' + '<iframe'.repeat(100_000), '<script>' + 'x'.repeat(1_000_001) + '</script>']) {
      const started = performance.now()
      expect(classifyGate({ ...res(body), finalUrl })).toBeNull()
      expect(performance.now() - started).toBeLessThan(1_500)
    }
  })

  it('reads an Imperva 2xx for its interstitial in bounded time', () => {
    // A regex reading of the script tag took 6 s on the first body (review of the x-iinfo change, 2026-10-30).
    const imperva = (body: string): GateResponse => ({ status: 200, header: (name) => (name.toLowerCase() === 'x-iinfo' ? '1-2-3' : null), body })
    const bodies = ['<script/src='.repeat(5_462), '<script src=/_incapsula_resource'.repeat(2_000), '/_incapsula_resource'.repeat(3_300), '<script'.repeat(100_000)]
    for (const body of bodies) {
      for (const contentful of [false, true]) {
        const started = performance.now()
        classifyGate({ ...imperva(body), contentful })
        expect(performance.now() - started).toBeLessThan(1_500)
      }
    }
  })

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
