import { chromium, type BrowserContext } from 'playwright'
import { chromeEndpoint } from '../src/chromeLogin.js'

/**
 * "The person's Chrome" for the integration tests: Chromium with remote
 * debugging on, returned once its DevToolsActivePort names an endpoint.
 * Playwright drives it over a pipe and returns as soon as the pipe answers;
 * Chrome writes DevToolsActivePort only when its debugging server is
 * listening, which a busy CI runner can leave until after that. The
 * person's own Chrome is already running when Octocrawl reads the file, so the
 * wait belongs here, not in chromeEndpoint.
 */
export async function launchDebuggingChrome(userDataDir: string, timeoutMs = 30_000): Promise<BrowserContext> {
  const chrome = await chromium.launchPersistentContext(userDataDir, { args: ['--remote-debugging-port=0'] })
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      await chromeEndpoint(userDataDir)
      return chrome
    } catch (error) {
      if (Date.now() >= deadline) {
        await chrome.close()
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}
