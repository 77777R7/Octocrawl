/**
 * The access grant of the route Octocrawl recommends on a person's own machine
 * (ADR 0005: installed_chrome with compatible_transport), as `octocrawl
 * access-grant` writes it once the person accepted the statement. The server
 * never writes one: it reads the file it is started with.
 */

import { dirname, join } from 'node:path'
import { accessGrantFromText } from '@w2l/http-core'
import { defaultSessionsFile } from './engine.js'

/** What the person accepts, word for word: shown before they answer, and written into the grant's attestation. */
export const LOCAL_GRANT_STATEMENT = "I accept that Octocrawl opens Google Chrome windows on this machine and reads some hosts' pages with Chrome's own headers and TLS handshake."

/** Where `octocrawl access-grant` writes by default: beside the saved logins (`W2L_SESSIONS_FILE`, else `~/.w2l`). No server reads it from there unasked. */
export function defaultAccessGrantFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(dirname(defaultSessionsFile(env)), 'access-grant.json')
}

/** The grant file's text for `principal`, who accepted the statement at `at`; checked by the loader a server reads it with. */
export function localGrantText(principal: string, at: Date): { text: string; sha256: string } {
  const text = `${JSON.stringify({
    tier: 'enhanced',
    capabilities: ['installed_chrome', 'compatible_transport'],
    attestation: { principal, at: at.toISOString(), statement: LOCAL_GRANT_STATEMENT },
  }, null, 2)}\n`
  return { text, sha256: accessGrantFromText(text).sha256! }
}
