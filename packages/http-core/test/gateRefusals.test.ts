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
 * A refusal is reported as access_denied. The older captcha page shares the block page's title and stays a challenge.
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

describe('classifyGate — pages that refuse this exit', () => {
  it('reports Cloudflare\'s block page as a refusal, not as a challenge', () => {
    expect(classifyGate(res(403, cloudflareBlock, CLOUDFLARE))).toEqual({
      reason: 'access_denied',
      signals: ['cf_attention_required', 'text_you_have_been_blocked'],
    })
    // The capture's status was not saved, and the wait for a check reads a page it already took for content.
    expect(classifyGate(res(200, cloudflareBlock))?.reason).toBe('access_denied')
    expect(classifyGate({ ...res(403, cloudflareBlock), contentful: true })?.reason).toBe('access_denied')
  })

  it('keeps the page under the same title that asks for a captcha a challenge', () => {
    const captchaPage = '<html><head><title>Attention Required! | Cloudflare</title></head><body><h1>One more step</h1><p>Please complete the security check to access example.com</p></body></html>'
    expect(classifyGate(res(403, captchaPage, CLOUDFLARE))).toEqual({ reason: 'cloudflare_challenge', signals: ['cf_attention_required'] })
    // A page that carries the challenge's own plumbing is a challenge, whatever else it says.
    expect(classifyGate(res(403, cloudflareBlock.replace('</body>', '<script>window._cf_chl_opt={}</script></body>'), CLOUDFLARE))?.reason).toBe('cloudflare_challenge')
  })

  it('reports Cloudflare\'s error 1020 page as a refusal', () => {
    expect(classifyGate(res(403, cloudflare1020, CLOUDFLARE))).toEqual({
      reason: 'access_denied',
      signals: ['cf_error_1020', 'cf_error_page', 'status_403'],
    })
  })

  it('reports the one-line 1020 body Cloudflare sends a client that is not a browser as a refusal', () => {
    expect(classifyGate(res(403, 'error code: 1020', CLOUDFLARE))).toEqual({ reason: 'access_denied', signals: ['cf_error_1020', 'status_403'] })
    expect(classifyGate(res(403, 'error code: 1020\n'))?.reason).toBe('access_denied')
  })

  it('does not take another Cloudflare error, or a page that quotes the code, for error 1020', () => {
    expect(classifyGate(res(403, 'error code: 1010', CLOUDFLARE))).toBeNull()
    expect(classifyGate(res(200, 'error code: 1020', CLOUDFLARE))).toBeNull()
    expect(classifyGate(res(403, '<html><body><p>Our API answers "error code: 1020" when a firewall rule matches.</p></body></html>'))).toBeNull()
    // Another error on the same page layout keeps today's reading: its "Access denied" with the 403.
    expect(classifyGate(res(403, cloudflare1020.replace('>1020<', '>1010<'), CLOUDFLARE))?.reason).toBe('bot_detected_generic')
  })

  it('reports Cloudflare\'s error 1015 as a rate limit, from the 429 alone', () => {
    expect(classifyGate(res(429, cloudflare1015, CLOUDFLARE))).toEqual({ reason: 'rate_limit', signals: ['status_429'] })
    expect(classifyGate(res(429, 'error code: 1015', CLOUDFLARE))).toEqual({ reason: 'rate_limit', signals: ['status_429'] })
  })

  it('reports CloudFront\'s page for a request AWS WAF blocked as a refusal', () => {
    expect(classifyGate(res(403, cloudfrontWaf))).toEqual({
      reason: 'access_denied',
      signals: ['cloudfront_request_blocked', 'status_403', 'short_page'],
    })
  })

  it('reports the 403 an AWS load balancer answers by itself as a refusal', () => {
    expect(classifyGate(res(403, albWaf, ALB))).toEqual({
      reason: 'access_denied',
      signals: ['header_server_awselb', 'status_403', 'short_page'],
    })
  })

  it('leaves the same bare 403 from any other server unnamed', () => {
    expect(classifyGate(res(403, albWaf))).toBeNull()
    expect(classifyGate(res(403, albWaf, { server: 'nginx' }))).toBeNull()
    expect(classifyGate(res(403, '<html><body><h1>Forbidden</h1><p>You do not have permission.</p></body></html>', ALB))).toBeNull()
  })
})
