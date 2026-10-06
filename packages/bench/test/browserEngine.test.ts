import { describe, expect, it } from 'vitest'
import { browserEngineChoice, loadPatchrightEngine } from '../src/subjects/browserEngine.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'
import { buildChannels } from '../src/ladderCli.js'

const GRANT = { capabilities: ['enhanced_browser'] }

/** ADR 0005: Patchright is `enhanced_browser`, off unless the grant names it, never hosted, never with a login. */
describe('browserEngineChoice', () => {
  it('is stock Playwright when W2L_BROWSER_ENGINE is unset or says so', () => {
    expect(browserEngineChoice({}, null, false)).toBe('playwright')
    expect(browserEngineChoice({ W2L_BROWSER_ENGINE: ' Playwright ' }, null, true)).toBe('playwright')
  })

  it('is Patchright only when the grant names enhanced_browser, on a server that is not hosted', () => {
    expect(browserEngineChoice({ W2L_BROWSER_ENGINE: 'patchright' }, GRANT, false)).toBe('patchright')
    expect(() => browserEngineChoice({ W2L_BROWSER_ENGINE: 'patchright' }, null, false)).toThrow(/needs an access grant that names enhanced_browser/)
    expect(() => browserEngineChoice({ W2L_BROWSER_ENGINE: 'patchright' }, { capabilities: ['compatible_transport', 'vendor_stealth'] }, false)).toThrow(/enhanced_browser/)
    expect(() => browserEngineChoice({ W2L_BROWSER_ENGINE: 'patchright' }, GRANT, true)).toThrow(/refused on a hosted server/)
  })

  it('loads the optional Patchright package by name, with its version, without launching it', async () => {
    const engine = await loadPatchrightEngine()
    expect(engine.name).toBe('patchright')
    expect(engine.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(typeof engine.launch).toBe('function')
  })

  it('refuses an engine it does not know', () => {
    expect(() => browserEngineChoice({ W2L_BROWSER_ENGINE: 'camoufox' }, GRANT, false)).toThrow('W2L_BROWSER_ENGINE is playwright or patchright, not camoufox')
  })
})

describe('the enhanced browser stays out of logged-in and managed browsers', () => {
  it('refuses Patchright with a saved login or a managed profile, and takes it for the public browser in any mode', () => {
    const access = { session: { cookies: [{ name: 'sid', value: 'x', domain: 'example.com', path: '/' }] }, attestation: { principal: 'p', at: '2026-10-05T00:00:00Z', statement: 's' } }
    expect(() => new BrowserLocalSubject('authed', access, false, undefined, null, undefined, null, undefined, undefined, null, false, undefined, 'patchright')).toThrow(/never with a saved login or a managed profile/)
    expect(() => new BrowserLocalSubject('standard', null, false, undefined, '/tmp/profile', undefined, null, undefined, undefined, null, false, undefined, 'patchright')).toThrow(/never with a saved login or a managed profile/)
    for (const mode of ['standard', 'research', 'authed'] as const) {
      expect(() => buildChannels(mode, { browserEngine: 'patchright' })).not.toThrow()
    }
  })
})
