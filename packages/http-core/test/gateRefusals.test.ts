import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classifyGate, type GateResponse } from '../src/gate.js'

/**
 * Pages on which a site refuses this exit outright, read from files under fixtures/gate. Waiting on the page does
 * not clear them and a retry from the same exit gets the same page, which is what sets them apart from a challenge.
 * Error 1015 is the one that ends by itself: a rate limit, lifted after a while, and to be reported as one.
 *
 * Where each file comes from:
 *   cloudflare-block.html       a page Cloudflare served on 2026-11-09 ("Attention Required! | Cloudflare", "Sorry,
 *                               you have been blocked"), with the Ray ID, the visitor's address, the timestamp
 *                               parameter and the host replaced. Its HTTP status and headers were not saved; the
 *                               tests send 403, the status Cloudflare documents for this page.
 *   aws-waf-cloudfront-403.html CloudFront's page for a request AWS WAF blocked, as the bundled Chromium rendered it
 *                               in the 2026-10-30 run gate.test.ts quotes, with the request id replaced.
 *   cloudflare-1020.html, cloudflare-1015.html, aws-waf-alb-403.html
 *                               written after the vendors' published pages, not captured: no capture of them is on
 *                               hand. What they prove about a live page is limited to the strings they share with
 *                               it: the error code, its one-line description, and Cloudflare's error-page markup.
 *
 * The first group states what classifyGate reports today. The second, marked `fails`, states what it should report
 * and does not yet: each test there passes only while its expectation is unmet, so the change that fixes the
 * reporting has to turn it into an ordinary test.
 */

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/gate/${name}`, import.meta.url), 'utf8')

function res(status: number, body: string, headers: Record<string, string> = {}): GateResponse {
  return { status, header: (name) => headers[name.toLowerCase()] ?? null, body }
}

const cloudflareBlock = fixture('cloudflare-block.html')
const cloudflare1020 = fixture('cloudflare-1020.html')
const cloudflare1015 = fixture('cloudflare-1015.html')
const cloudfrontWaf = fixture('aws-waf-cloudfront-403.html')
const albWaf = fixture('aws-waf-alb-403.html')
const CLOUDFLARE = { server: 'cloudflare' }
const ALB = { server: 'awselb/2.0' }

/** The value a refused exit is to be reported with. The name is the task list's default and may still change. */
const REFUSED = 'access_denied'

describe('classifyGate — pages that refuse this exit, as reported today', () => {
  it('reports Cloudflare\'s block page as a challenge', () => {
    expect(classifyGate(res(403, cloudflareBlock, CLOUDFLARE))).toEqual({
      reason: 'cloudflare_challenge',
      signals: ['cf_attention_required'],
    })
  })

  it('reports Cloudflare\'s error 1020 as a generic refusal, from the words "Access denied" and the 403', () => {
    expect(classifyGate(res(403, cloudflare1020, CLOUDFLARE))).toEqual({
      reason: 'bot_detected_generic',
      signals: ['weak_access_denied', 'status_403'],
    })
  })

  it('does not recognise the one-line 1020 body Cloudflare sends a client that is not a browser', () => {
    expect(classifyGate(res(403, 'error code: 1020', CLOUDFLARE))).toBeNull()
  })

  it('reports Cloudflare\'s error 1015 as a rate limit, from the 429 alone', () => {
    expect(classifyGate(res(429, cloudflare1015, CLOUDFLARE))).toEqual({ reason: 'rate_limit', signals: ['status_429'] })
    expect(classifyGate(res(429, 'error code: 1015', CLOUDFLARE))).toEqual({ reason: 'rate_limit', signals: ['status_429'] })
  })

  it('reports CloudFront\'s page for a request AWS WAF blocked as a generic refusal', () => {
    expect(classifyGate(res(403, cloudfrontWaf))).toEqual({
      reason: 'bot_detected_generic',
      signals: ['cloudfront_request_blocked', 'status_403', 'short_page'],
    })
  })

  it('does not recognise the 403 an AWS load balancer answers for a request AWS WAF blocked', () => {
    expect(classifyGate(res(403, albWaf, ALB))).toBeNull()
  })
})

describe('classifyGate — pages that refuse this exit, as they should be reported', () => {
  const reason = (r: GateResponse): string | undefined => classifyGate(r)?.reason

  it.fails('does not call Cloudflare\'s block page a challenge', () => {
    expect(reason(res(403, cloudflareBlock, CLOUDFLARE))).not.toBe('cloudflare_challenge')
  })

  it.fails('reports Cloudflare\'s block page as a refused exit', () => {
    expect(reason(res(403, cloudflareBlock, CLOUDFLARE))).toBe(REFUSED)
  })

  it.fails('reports Cloudflare\'s error 1020 page as a refused exit', () => {
    expect(reason(res(403, cloudflare1020, CLOUDFLARE))).toBe(REFUSED)
  })

  it.fails('reports the one-line 1020 body as a refused exit', () => {
    expect(reason(res(403, 'error code: 1020', CLOUDFLARE))).toBe(REFUSED)
  })

  it.fails('reports CloudFront\'s page for a request AWS WAF blocked as a refused exit', () => {
    expect(reason(res(403, cloudfrontWaf))).toBe(REFUSED)
  })
})
