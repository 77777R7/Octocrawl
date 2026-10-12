/**
 * Which identity the public browser rung declares and sends (ROADMAP PA, docs/pa-challenge-botcheck-tasks.md G2).
 *
 * `declared` (the default, as before): the mode's identity from `modeIdentity`, a Chrome User-Agent with aligned
 * client hints, set on the context and through `Emulation.setUserAgentOverride`.
 *
 * `actual`: the browser's own identity. The context gets no `userAgent`, no client-hint headers and no CDP override,
 * so Chromium sends what it is (a `HeadlessChrome` User-Agent and its own `sec-ch-ua`), and the record declares the
 * User-Agent read from the browser (`navigator.userAgent`), so the honesty check still compares a declaration with
 * what was sent. Found on 2026-10-12 ([T053](../../../../research/access/runs/2026-10-12-t053-identity-204c8a76.md)):
 * imf.org's edge refuses a headless Chromium that claims Google Chrome and serves one that says what it is. It is an
 * experiment switch, to be measured on item 1's set and the health batches before any default changes: a site that
 * refuses `HeadlessChrome` by name loses what the Chrome claim gets. The standard and authed modes on a desktop
 * identity take it; research mode (its own User-Agent), the mobile identity, the hosted preview's product token and a
 * managed profile keep the declared identity.
 */
export type BrowserIdentityChoice = 'declared' | 'actual'

export const BROWSER_IDENTITY_CHOICES: readonly BrowserIdentityChoice[] = ['declared', 'actual']

/** The choice from `W2L_BROWSER_IDENTITY`; `declared` when unset. A hosted server keeps the declared identity. */
export function browserIdentityChoice(env: NodeJS.ProcessEnv, hosted = false): BrowserIdentityChoice {
  const raw = (env.W2L_BROWSER_IDENTITY ?? '').trim().toLowerCase()
  if (raw === '' || raw === 'declared') return 'declared'
  if (raw !== 'actual') throw new Error(`W2L_BROWSER_IDENTITY is declared or actual, not ${raw}`)
  if (hosted) throw new Error('W2L_BROWSER_IDENTITY=actual is refused on a hosted server: the hosted identity carries its product token')
  return 'actual'
}
