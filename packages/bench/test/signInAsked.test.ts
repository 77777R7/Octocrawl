import { describe, expect, it } from 'vitest'
import type { FetchResult } from '@w2l/contracts'
import { contentHeldBack, withSignInWarning } from '../src/signInAsked.js'

const page = (over: Partial<FetchResult>): FetchResult => ({ lane: 'my_browser', status: 'success', markdown: '', warnings: [], ...over }) as FetchResult

// What www.english.ids-cologne.de answered a lapsed session with on 2026-11-07, exhibitor /kerr/.
const LAPSED = `- List of exhibitors

# **Kerr**

**Kerr**

Balz Zimmermann-Strasse 7
8302 Kloten

**Log in for contact details**

[www.kerrdental.com](http://www.kerrdental.com/)
`

describe('a page read with the login that holds content back behind a sign-in (sign_in_prompt)', () => {
  it('finds the line anywhere on the page, however it is set', () => {
    expect(contentHeldBack(LAPSED)).toBe('Log in for contact details')
    for (const line of ['Sign in to view pricing', '## Please log in to see this page', 'LOG IN TO ACCESS THIS DOCUMENT...', 'Log-in for full details', 'Login to read more']) {
      expect(contentHeldBack(`${'Text.\n'.repeat(30)}\n${line}\n`)).not.toBeNull()
    }
  })

  it('leaves what does not hold content back: a widget, a menu, a link, a code sample, prose', () => {
    for (const line of [
      'Sign in to comment', 'Log in to your account', 'Log in', 'Sign in to get trip updates', '- Sign in to view orders', '| Log in to view | yes |', '> Log in to view it',
      '[Log in to view your cart](/cart)', 'Log in to view the page, as the guide below explains step by step for every kind of account on the service.',
      'Step 2: Log in to view your balance',
    ]) expect(contentHeldBack(line)).toBeNull()
    expect(contentHeldBack('```\nLog in to view\n```')).toBeNull()
    expect(contentHeldBack(null)).toBeNull()
  })

  it('warns once, quoting the line; a page that did not come keeps its own verdict', () => {
    const warned = withSignInWarning(page({ markdown: LAPSED }))
    expect(warned.warnings).toEqual([{ code: 'sign_in_prompt', message: expect.stringContaining('"Log in for contact details"') }])
    expect(withSignInWarning(warned).warnings).toHaveLength(1)
    expect(withSignInWarning(page({ markdown: LAPSED, status: 'blocked' })).warnings).toEqual([])
  })
})
