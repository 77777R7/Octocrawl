import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it } from 'vitest'

// The sign-in page's script (public/docs-assets/account.js) on the page's own structure (scripts/build-docs.mjs,
// signinBody), in a browser-like window: what it says before and after an account is deleted.
const SCRIPT = readFileSync(new URL('../public/docs-assets/account.js', import.meta.url), 'utf8')
const PAGE = `<article id="signin"><div class="account-panel"><div class="signin-options"><a class="signin-button" data-provider="github" href="/auth/github">Continue with GitHub</a><a class="signin-button" data-provider="google" href="/auth/google">Continue with Google</a><p class="signin-or">or</p>
<form id="email-form"><input id="signin-email" name="email" type="email" /><button type="submit">Email me a sign-in link</button></form></div>
<p class="account-message" id="signin-message" role="status"></p></div></article>`

const open: Window[] = []
afterEach(async () => { await Promise.all(open.splice(0).map(window => window.happyDOM.close())) })

async function signin(search: string) {
  const window = new Window({ url: `https://octocrawl.dev/signin/${search}` })
  open.push(window)
  window.document.body.innerHTML = PAGE
  const asked: string[] = []
  ;(window as unknown as { fetch: unknown }).fetch = async (url: string) => { asked.push(url); return { ok: true, json: async () => ({ signedIn: false }) } }
  window.eval(SCRIPT)
  await new Promise(resolve => setTimeout(resolve, 0))
  const message = window.document.getElementById('signin-message')!
  const options = window.document.querySelector('.signin-options')!
  return { window, asked, message, options, links: [...window.document.querySelectorAll('[data-provider]')].map(link => link.getAttribute('href')) }
}

describe('the sign-in page around deleting an account', () => {
  it('says, above the buttons, that a deleted account can be replaced by signing in again', async () => {
    const page = await signin('?deleted=1')
    expect(page.message.textContent).toMatch(/^Your Octocrawl account is deleted/)
    expect(page.message.textContent).toContain('sign in below with the same email address to start a new, empty account')
    expect(page.message.classList.contains('is-notice')).toBe(true)
    // Before the options, where it is read before anyone clicks.
    expect(page.message.nextElementSibling).toBe(page.options)
    expect(page.links).toEqual(['/auth/github?next=%2Fdashboard%2F', '/auth/google?next=%2Fdashboard%2F'])
  })

  it('says before the deleting sign-in that it deletes instead of opening the account, and stays on the page', async () => {
    const page = await signin('?reauth=delete')
    expect(page.message.textContent).toContain('This sign-in deletes the account instead of opening it')
    expect(page.message.textContent).toContain('You can make a new account with the same email address later')
    expect(page.message.nextElementSibling).toBe(page.options)
    expect(page.links).toEqual(['/auth/github?next=%2Fdashboard%2Fsettings%2F', '/auth/google?next=%2Fdashboard%2Fsettings%2F'])
    // A signed-in visitor is not sent on: the deletion needs this sign-in.
    expect(page.asked).toEqual([])
  })

  it('sends a signed-in visitor on from the plain page, as before', async () => {
    const page = await signin('?next=%2Fdashboard%2Fkeys%2F')
    expect(page.asked).toEqual(['/api/me'])
    expect(page.message.textContent).toBe('')
  })
})
