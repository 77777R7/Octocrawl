import { describe, expect, it } from 'vitest'
import { classifyGate } from '../src/gate.js'

// Minimized from MarketWatch's retained 401 capture; no signed challenge URL.
const captcha = '<iframe title="DataDome CAPTCHA" src="https://geo.captcha-delivery.com/captcha/?example=1"></iframe>'
const login = '<h1>Sign in</h1><form><input type="password"></form>'
const verdict = (body: string, status = 401, contentful = false) => classifyGate({ status, body, contentful, header: () => null })

describe('DataDome CAPTCHA on HTTP 401', () => {
  it.each([false, true])('uses the actual challenge before generic authentication, contentful=%s', contentful => {
    expect(verdict(captcha, 401, contentful)).toEqual({ reason: 'captcha', signals: ['status_401', 'datadome_captcha'] })
  })
  it('reads the challenge beyond the head without classifying the surrounding sign-in form', () => {
    expect(verdict(login + '<script>' + 'x'.repeat(70_000) + '</script>' + captcha)?.reason).toBe('captcha')
  })
  it.each([
    '', login,
    '<iframe title="DataDome Device Check" src="https://geo.captcha-delivery.com/interstitial/"></iframe>',
    '<script src="https://ct.captcha-delivery.com/c.js"></script>',
    '<link rel="preconnect" href="https://geo.captcha-delivery.com/captcha/">',
    '<iframe title="DataDome CAPTCHA" src="https://geo.notcaptcha-delivery.com/captcha/"></iframe>',
    '<iframe title="DataDome CAPTCHA" src="https://captcha-delivery.com.evil.test/captcha/"></iframe>',
    '<p>DataDome CAPTCHA &lt;iframe src="https://geo.captcha-delivery.com/captcha/"&gt;</p>',
  ])('keeps an unproven 401 as authentication: %s', body => {
    expect(verdict(body)).toEqual({ reason: 'login_wall', signals: ['status_401'] })
  })
  it('leaves rate limits and legal restrictions unchanged', () => {
    expect(verdict(captcha, 429)?.reason).toBe('rate_limit')
    expect(verdict(captcha, 451)?.reason).toBe('geo_restricted')
  })
  it('preserves existing success and forbidden CAPTCHA classification', () => {
    for (const status of [200, 403]) expect(verdict(captcha, status)?.reason).toBe('captcha')
    expect(verdict('<article><h1>DataDome CAPTCHA guide</h1><p>A normal article.</p></article>', 200, true)).toBeNull()
  })
})
