import { describe, expect, it } from 'vitest'
import { classifyGate, type GateResponse } from '../src/gate.js'

// Synthetic counterparts of the two 2026-10-15 captures. The actual UI sat
// past 64 KB of scripts; script contents must never stand in for controls.
const padding = `<script>${'x'.repeat(100_000)}</script>`
const login = (controls = '<input autocomplete="username webauthn"><button aria-label="passkey">Passkey</button>') =>
  `<html><head><title>Shop</title>${padding}</head><body><h1>Register/Sign in</h1>${controls}<footer>${'Shipping and returns information. '.repeat(45)}</footer></body></html>`
const puzzle = (controls = '<img src="/objects.png"><div role="button">Submit</div>') =>
  `<html><head><title>Security verification</title>${padding}</head><body><div>Security Verification</div><div>Fill each box with the required number of objects indicated</div>${controls}</body></html>`
const verdict = (body: string, finalUrl: string, extra: Partial<GateResponse> = {}) => classifyGate({ status: 200, header: () => null, body, finalUrl, ...extra })

describe('interactive gates beyond the initial head', () => {
  it('names a passwordless login from its auth URL, primary heading and actual WebAuthn controls', () => {
    expect(verdict(login(), 'https://shop.test/p/account/login.html')).toMatchObject({ reason: 'login_wall', signals: expect.arrayContaining(['auth_url', 'heading_sign_in', 'input_webauthn', 'button_passkey']) })
  })

  it('names a verification puzzle from its URL, purpose, instruction and image/control structure', () => {
    expect(verdict(puzzle(), 'https://shop.test/security_verification.html')).toMatchObject({ reason: 'captcha', signals: expect.arrayContaining(['verification_url', 'heading_security_verification', 'object_count_instruction', 'interactive_image']) })
  })

  it('requires the combined evidence, not a URL or words alone', () => {
    expect(verdict(login(''), 'https://shop.test/login.html')).toBeNull()
    expect(verdict(login(), 'https://shop.test/docs/passkeys')).toBeNull()
    expect(verdict(puzzle(''), 'https://shop.test/security_verification.html')).toBeNull()
    expect(verdict(puzzle(), 'https://shop.test/docs/puzzles')).toBeNull()
  })

  it('does not mistake an article, a quoted control, or a contentful page for one of these gates', () => {
    const article = `<html><head><title>How passkeys work</title></head><body><h1>How passkeys work</h1><p>Sign in to continue is a common prompt.</p><input autocomplete="username webauthn"><button aria-label="passkey">Passkey</button></body></html>`
    expect(verdict(article, 'https://shop.test/login.html')).toBeNull()
    expect(verdict(login('&lt;input autocomplete="username webauthn"&gt;&lt;button aria-label="passkey"&gt;Passkey&lt;/button&gt;'), 'https://shop.test/login.html')).toBeNull()
    expect(verdict(login(), 'https://shop.test/login.html', { contentful: true })).toBeNull()
    expect(verdict(puzzle(), 'https://shop.test/security_verification.html', { contentful: true })).toBeNull()
  })

  it('ignores controls inside scripts and bounds the added scan', () => {
    expect(verdict(login('<script>const sample = \'<input autocomplete="username webauthn"><button aria-label="passkey">Passkey</button>\'</script>'), 'https://shop.test/login.html')).toBeNull()
    const tooLarge = login().replace(padding, `<script>${'x'.repeat(1_000_001)}</script>`)
    expect(verdict(tooLarge, 'https://shop.test/login.html')).toBeNull()
  })
})
