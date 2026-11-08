import { describe, expect, it } from 'vitest'
import { chromiumInstalledAt } from '../src/browserInstall.js'

const FULL = '/Users/me/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const SHELL_MARK = '/Users/me/Library/Caches/ms-playwright/chromium_headless_shell-1254/INSTALLATION_COMPLETE'

describe('chromiumInstalledAt', () => {
  it('counts the full Chromium or the headless shell of the same build, which a headless launch starts', () => {
    expect(chromiumInstalledAt(FULL, (path) => path === FULL)).toBe(true)
    // `npx playwright install --only-shell chromium`: the lane launches, so nothing is missing.
    expect(chromiumInstalledAt(FULL, (path) => path === SHELL_MARK)).toBe(true)
    expect(chromiumInstalledAt(FULL, () => false)).toBe(false)
    // Another build's shell is not this one's.
    expect(chromiumInstalledAt(FULL, (path) => path === SHELL_MARK.replace('1254', '1248'))).toBe(false)
    const windows = 'C:\\Users\\me\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win\\chrome.exe'
    expect(chromiumInstalledAt(windows, (path) => path.includes('chromium_headless_shell-1254') && path.endsWith('INSTALLATION_COMPLETE'))).toBe(true)
  })
})
