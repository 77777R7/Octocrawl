/**
 * ADR 0005 `hosted_chrome` (revision of 2026-10-27): Google Chrome on Octocrawl's own server, in the `octocrawl-chrome`
 * service, launched as installed_chrome is (installedChrome.ts) with the same narrowed flag set.
 *
 * Its network: before anything goes through a proxy, the target's name is resolved and private, loopback, link-local and
 * reserved addresses are refused, as strictly as the compatible transport's address guard does on a hosted engine. The
 * guard is that one (compatGuard.ts), listening without a login because Chrome takes none, and Chrome is given it as its
 * only proxy:
 *
 * - `socks5://` sends the guard every name, so Chrome resolves none itself and connects to no address the guard did not
 *   check; each new connection (a redirect to another host, a subresource, a reconnect after a name rebinds) is checked
 *   again;
 * - `<-loopback>` takes away Chrome's own rule that loopback addresses skip the proxy, so a page cannot reach the
 *   service's ports, the guard's or Chrome's debugging port, directly: those names and addresses go to the guard, which
 *   refuses them.
 *
 * These are the run's exit flags, which installedChrome.ts keeps apart from the flags that shape detection.
 *
 * WebRTC sends UDP past any proxy, straight to the address a page names (a STUN server, a remote candidate), loopback
 * and private ones included: a proxy flag cannot close that. Each fresh profile is therefore given the preference
 * `webrtc.ip_handling_policy: disable_non_proxied_udp`, under which Chrome sends no UDP that does not go through the
 * proxy (a SOCKS5 proxy carries none), so WebRTC has no network of its own. Google Chrome reads it from the profile and
 * ignores the command-line switch of the same name (measured 2026-10-28, macOS Chrome and Playwright's Chromium). It
 * changes what a page sees of WebRTC, so the launch is named apart from installed_chrome's (HOSTED_CHROME_PROFILE_ID),
 * and ADR 0005's gate for a change to the launch (two challenge16 runs) applies to it before hosted_chrome serves calls.
 */

import type { Browser, LaunchOptions } from 'playwright'
import type { CompatAddressGuard } from '../compatGuard.js'
import { DETECTION_FLAGS_ID, launchInstalledChrome, type InstalledChromeTestSeams } from './installedChrome.js'

/** The bypass list hosted Chrome is launched with: nothing skips the guard, loopback included. */
export const HOSTED_CHROME_PROXY_BYPASS = '<-loopback>'

/** The proxy hosted Chrome is launched with: its address guard (`CompatAddressGuard`, `login: false`), and no bypass. */
export function hostedChromeProxy(guardUrl: string): NonNullable<LaunchOptions['proxy']> {
  const url = new URL(guardUrl)
  if (url.protocol !== 'socks5:' || url.username !== '' || url.password !== '' || url.hostname !== '127.0.0.1') {
    throw new Error('hosted_chrome goes only through its address guard: socks5://127.0.0.1:<port> with no login')
  }
  return { server: `socks5://127.0.0.1:${url.port}`, bypass: HOSTED_CHROME_PROXY_BYPASS }
}

/** The preferences every fresh hosted profile starts with: no WebRTC UDP that does not go through the proxy. */
export const HOSTED_CHROME_PREFERENCES: Readonly<Record<string, unknown>> = { webrtc: { ip_handling_policy: 'disable_non_proxied_udp' } }

/** The name a record gives hosted_chrome's launch: installed_chrome's flag set, with the WebRTC preference. */
export const HOSTED_CHROME_PROFILE_ID = `${DETECTION_FLAGS_ID}+webrtc-proxied-udp-only`

/** Launch hosted Chrome behind its address guard: installed_chrome's launch, the guard as its only proxy, the hosted preferences. */
export async function launchHostedChrome(guard: CompatAddressGuard, options: Pick<LaunchOptions, 'timeout'> = {}, seams: InstalledChromeTestSeams = {}, signal?: AbortSignal): Promise<Browser> {
  return launchInstalledChrome({ ...options, proxy: hostedChromeProxy(await guard.proxyUrl()) }, seams, signal, { preferences: HOSTED_CHROME_PREFERENCES })
}
