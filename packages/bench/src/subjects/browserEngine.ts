/**
 * Which browser engine the public browser lane launches: stock Playwright (the default) or
 * Patchright, a maintained Playwright fork that patches the automation leaks of its CDP driver.
 *
 * Patchright is ADR 0005's `enhanced_browser`: off unless the access grant names it, refused on a
 * hosted server, and only ever in Octocrawl's own browser instance. The choice is made once, by the
 * entry point that has the grant (the API server, the octocrawl commands, the ladder CLI), and handed
 * to the browser lane, which never reads the environment itself: no caller can reach Patchright
 * without passing the check. The person's own Chrome, a saved login's lane and a managed session's
 * persistent profile always run stock Playwright.
 *
 * Patchright is an optional dependency. It is imported by a name the bundler cannot follow, so the
 * published CLI does not carry or declare it; a person who wants it installs it next to Octocrawl.
 */

import { chromium, type Browser, type LaunchOptions } from 'playwright'

export type BrowserEngineName = 'playwright' | 'patchright'

export interface BrowserEngine {
  name: BrowserEngineName
  launch(options: LaunchOptions): Promise<Browser>
}

export const PLAYWRIGHT_ENGINE: BrowserEngine = { name: 'playwright', launch: (options) => chromium.launch(options) }

/**
 * The engine W2L_BROWSER_ENGINE asks for, checked against ADR 0005: `playwright` when unset; `patchright`
 * only when the access grant names `enhanced_browser`, and never on a hosted server.
 */
export function browserEngineChoice(env: NodeJS.ProcessEnv, grant: { capabilities: readonly string[] } | null, hosted: boolean): BrowserEngineName {
  const raw = (env.W2L_BROWSER_ENGINE ?? '').trim().toLowerCase()
  if (raw === '' || raw === 'playwright') return 'playwright'
  if (raw !== 'patchright') throw new Error(`W2L_BROWSER_ENGINE is playwright or patchright, not ${raw}`)
  if (hosted) throw new Error('W2L_BROWSER_ENGINE=patchright is refused on a hosted server (ADR 0005: the enhanced browser runs only in a local Octocrawl instance)')
  if (!(grant?.capabilities ?? []).includes('enhanced_browser')) {
    throw new Error('W2L_BROWSER_ENGINE=patchright needs an access grant that names enhanced_browser (ADR 0005; --access-grant or W2L_ACCESS_GRANT)')
  }
  return 'patchright'
}

/** The module name, kept out of the bundler's sight so Patchright stays an optional install. */
const PATCHRIGHT_MODULE = ['patch', 'right'].join('')

/** How to install Patchright where Octocrawl runs, for every message that needs it. */
export const PATCHRIGHT_INSTALL = 'install it where Octocrawl runs: npm install octocrawl patchright (or, with npx, npx -p octocrawl -p patchright octocrawl ...), then npx patchright install chromium'

/**
 * Patchright's engine, or an error that says how to install it. Looked for next to Octocrawl first,
 * then from the working directory, so a project that installed it can run Octocrawl through npx.
 */
export async function loadPatchrightEngine(): Promise<BrowserEngine & { version: string | null }> {
  const { createRequire } = await import('node:module')
  const { join } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  let mod: { chromium?: { launch(options: LaunchOptions): Promise<unknown> }; default?: { chromium?: { launch(options: LaunchOptions): Promise<unknown> } } }
  let from = import.meta.url
  try {
    mod = await import(PATCHRIGHT_MODULE) as typeof mod
  } catch {
    try {
      const resolved = createRequire(join(process.cwd(), 'package.json')).resolve(PATCHRIGHT_MODULE)
      mod = await import(pathToFileURL(resolved).href) as typeof mod
      from = pathToFileURL(resolved).href
    } catch {
      throw new Error(`W2L_BROWSER_ENGINE=patchright needs the optional patchright package; ${PATCHRIGHT_INSTALL}`)
    }
  }
  const chromiumApi = mod.chromium ?? mod.default?.chromium
  if (chromiumApi === undefined) throw new Error('the patchright package found has no chromium export')
  let version: string | null = null
  try {
    version = (createRequire(from)(`${PATCHRIGHT_MODULE}/package.json`) as { version?: string }).version ?? null
  } catch {}
  return { name: 'patchright', version, launch: async (options) => await chromiumApi.launch(options) as Browser }
}

/** The engine for a name: Playwright at once, Patchright loaded on first use. */
export async function browserEngineFor(name: BrowserEngineName): Promise<BrowserEngine & { version?: string | null }> {
  return name === 'patchright' ? await loadPatchrightEngine() : PLAYWRIGHT_ENGINE
}
