import { INSTALLED_CHROME_INSTALL } from './subjects/installedChrome.js'

/** What a machine without the browser runs once, so the browser lane can start: stock Playwright's Chromium. */
export const BROWSER_INSTALL_COMMAND = 'npx playwright install chromium'

/**
 * The install command for the engine whose browser is missing. Patchright pins its own Chromium build, so Playwright's
 * would leave it missing (browserEngine.ts, PATCHRIGHT_INSTALL).
 */
export function browserInstallCommand(engine: 'playwright' | 'patchright' | 'installed_chrome'): string {
  return engine === 'patchright' ? 'npx patchright install chromium' : engine === 'installed_chrome' ? INSTALLED_CHROME_INSTALL : BROWSER_INSTALL_COMMAND
}

/**
 * Whether a launch failed because the browser itself is not installed: Playwright's and Patchright's "Executable doesn't
 * exist at …", or no Google Chrome for the installed_chrome rung (installedChrome.ts).
 */
export function browserNotInstalled(err: unknown): boolean {
  return err instanceof Error && (err.name === 'InstalledChromeMissingError' || /Executable doesn't exist|executable doesn't exist|Please run the following command to download new browsers/.test(err.message))
}
