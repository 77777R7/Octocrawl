import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { INSTALLED_CHROME_INSTALL } from './subjects/installedChrome.js'

/** What a machine without the browser runs once, so the browser lane can start: stock Playwright's Chromium. */
export const BROWSER_INSTALL_COMMAND = 'npx playwright install chromium'

/**
 * The install command for the engine whose browser is missing. Patchright pins its own Chromium build, so Playwright's
 * would leave it missing (browserEngine.ts, PATCHRIGHT_INSTALL).
 */
export function browserInstallCommand(engine: 'playwright' | 'patchright' | 'installed_chrome' | 'hosted_chrome'): string {
  // hosted_chrome's Chrome is the octocrawl-chrome image's (Dockerfile.hosted-chrome): installed where the installed one is.
  return engine === 'patchright' ? 'npx patchright install chromium' : engine === 'installed_chrome' || engine === 'hosted_chrome' ? INSTALLED_CHROME_INSTALL : BROWSER_INSTALL_COMMAND
}

/**
 * Whether a launch failed because the browser itself is not installed: Playwright's and Patchright's "Executable doesn't
 * exist at …", or no Google Chrome for the installed_chrome rung (installedChrome.ts).
 */
export function browserNotInstalled(err: unknown): boolean {
  return err instanceof Error && (err.name === 'InstalledChromeMissingError' || /Executable doesn't exist|executable doesn't exist|Please run the following command to download new browsers/.test(err.message))
}

/**
 * Whether stock Playwright's Chromium is where the browser lane will look for it: a new `npx octocrawl` install has none
 * until BROWSER_INSTALL_COMMAND runs, and an update that moves Playwright to a new Chromium build needs it again. False
 * when Playwright cannot say where it would be.
 */
export function playwrightChromiumInstalled(): boolean {
  try { return chromiumInstalledAt(chromium.executablePath()) } catch { return false }
}

/**
 * Whether the browser lane can launch from this build: the full Chromium at `executablePath`, or the headless shell of
 * the same revision beside it, which is what a headless launch with no channel starts (`npx playwright install
 * --only-shell chromium` installs it alone). Playwright names no path for the shell, so it is found by its directory.
 */
export function chromiumInstalledAt(executablePath: string, exists: (path: string) => boolean = existsSync): boolean {
  if (exists(executablePath)) return true
  const build = /^(.*[\\/])chromium-(\d+)[\\/]/.exec(executablePath)
  return build !== null && exists(join(`${build[1]}chromium_headless_shell-${build[2]}`, 'INSTALLATION_COMPLETE'))
}
