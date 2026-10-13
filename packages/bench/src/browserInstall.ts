/** What a machine without the browser runs once, so the browser lane can start: stock Playwright's Chromium. */
export const BROWSER_INSTALL_COMMAND = 'npx playwright install chromium'

/**
 * The install command for the engine whose browser is missing. Patchright pins its own Chromium build, so Playwright's
 * would leave it missing (browserEngine.ts, PATCHRIGHT_INSTALL).
 */
export function browserInstallCommand(engine: 'playwright' | 'patchright'): string {
  return engine === 'patchright' ? 'npx patchright install chromium' : BROWSER_INSTALL_COMMAND
}

/** Whether a launch failed because the browser itself is not installed (Playwright's and Patchright's "Executable doesn't exist at …"). */
export function browserNotInstalled(err: unknown): boolean {
  return err instanceof Error && /Executable doesn't exist|executable doesn't exist|Please run the following command to download new browsers/.test(err.message)
}
