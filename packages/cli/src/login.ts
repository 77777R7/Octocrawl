/**
 * `w2l login`: the logins mode `authed` reads pages with, taken from the
 * user's own Chrome (see `importChromeLogin` in @w2l/api). The file is the
 * one the API server and the local MCP service read, W2L_SESSIONS_FILE else
 * ~/.w2l/sessions.json. Cookie values are never printed.
 */

import { ChromeLoginError, defaultSessionsFile, importChromeLogin, listSavedLogins, removeSavedLogin } from '@w2l/api'
import type { CliIo } from './run.js'

export const LOGIN_USAGE = [
  'usage: w2l login import <domain|url> [--chrome-user-data-dir <dir>] [--timeout <seconds>]',
  '       w2l login list',
  '       w2l login remove <domain>',
  '',
  'import reads the login of one site from the Chrome you already use and saves it, so',
  '`w2l scrape <url> --mode authed` (and the API and MCP in mode authed) read the page signed in as you.',
  'First open chrome://inspect/#remote-debugging in Chrome 144 or later and turn on',
  '"Allow remote debugging for this browser instance"; Chrome then asks "Allow remote debugging?": click Allow.',
  'W2L connects once, reads that site\'s cookies and the localStorage of its tabs you have open',
  '(a site that keeps its login there needs a tab of it open), disconnects, and loads nothing in your tabs.',
  'Logins are kept in W2L_SESSIONS_FILE, else ~/.w2l/sessions.json (readable by you alone).',
].join('\n')

export async function login(argv: readonly string[], io: CliIo, importLogin: typeof importChromeLogin = importChromeLogin): Promise<number> {
  const [action, ...rest] = argv
  if (action === undefined || action === '--help' || action === 'help') { io.stdout(LOGIN_USAGE); return action === undefined ? 2 : 0 }
  const sessionsFile = defaultSessionsFile(io.env)
  try {
    if (action === 'list') {
      const logins = await listSavedLogins(sessionsFile)
      io.stdout(JSON.stringify({ sessionsFile, logins }, null, 2))
      return 0
    }
    if (action === 'remove') {
      if (rest.length !== 1) { io.stderr(`w2l login remove takes one domain\n\n${LOGIN_USAGE}`); return 2 }
      const removed = await removeSavedLogin(sessionsFile, rest[0]!)
      io.stdout(JSON.stringify({ domain: rest[0], removed }))
      return removed ? 0 : 1
    }
    if (action === 'import') {
      let site: string | undefined
      let userDataDir: string | undefined
      let timeoutMs: number | undefined
      for (let i = 0; i < rest.length; i++) {
        const arg = rest[i]!
        if (arg === '--chrome-user-data-dir') {
          userDataDir = rest[++i]
          if (userDataDir === undefined) { io.stderr('w2l login: --chrome-user-data-dir takes a directory'); return 2 }
        } else if (arg === '--timeout') {
          const seconds = Number(rest[++i])
          if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600) { io.stderr('w2l login: --timeout takes whole seconds from 1 to 600'); return 2 }
          timeoutMs = seconds * 1000
        } else if (arg.startsWith('--')) {
          io.stderr(`w2l login: unknown option ${arg}\n\n${LOGIN_USAGE}`); return 2
        } else if (site === undefined) site = arg
        else { io.stderr(`w2l login import takes one site\n\n${LOGIN_USAGE}`); return 2 }
      }
      if (site === undefined) { io.stderr(`w2l login import needs a domain or URL\n\n${LOGIN_USAGE}`); return 2 }
      io.stderr('w2l login: connecting to your Chrome; if Chrome asks "Allow remote debugging?", click Allow')
      const imported = await importLogin({ site, sessionsFile, ...(userDataDir === undefined ? {} : { userDataDir }), ...(timeoutMs === undefined ? {} : { timeoutMs }) })
      io.stdout(JSON.stringify(imported, null, 2))
      return 0
    }
    io.stderr(`w2l login: unknown action ${action}\n\n${LOGIN_USAGE}`)
    return 2
  } catch (error) {
    if (error instanceof ChromeLoginError) { io.stderr(`w2l login: ${error.message}`); return 1 }
    throw error
  }
}
