/**
 * `octocrawl access-grant`: the person accepts the statement of the route
 * Octocrawl recommends on their own machine (installed_chrome with
 * compatible_transport, ADR 0005) and the command writes the access grant
 * that carries their acceptance. It is theirs to run: it answers only to a
 * person typing at a terminal, has no flag that accepts for them, and no
 * server, API route or MCP tool calls it. Nothing reads the file unasked: a
 * server is started with it, and a request still asks for `access: "enhanced"`.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { defaultAccessGrantFile, LOCAL_GRANT_STATEMENT, localGrantText } from '@w2l/api'
import type { CliIo } from './run.js'

export const ACCESS_GRANT_USAGE = [
  'usage: octocrawl access-grant [--out <file>]',
  '',
  'Writes the access grant of the route Octocrawl recommends on your own machine: installed_chrome with',
  'compatible_transport. It shows the statement the grant records, asks who accepts it, and writes the file once',
  'you type "I accept". Run it yourself, in a terminal: it writes nothing where nobody can type the answer, and',
  'no option answers for you. An agent must not run it for you.',
  'The file is --out, else access-grant.json beside your saved logins (~/.w2l), readable by you alone; a file',
  'already there is left as it is. Octocrawl does not read it unasked: start the server with it',
  '(octocrawl serve --access-grant <file>, or W2L_ACCESS_GRANT) and ask for the route with access: "enhanced".',
].join('\n')

const NOTHING = 'Nothing was written.'

export async function accessGrant(argv: readonly string[], io: CliIo, now: () => Date = () => new Date()): Promise<number> {
  let out: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--help' || arg === 'help') { io.stdout(ACCESS_GRANT_USAGE); return 0 }
    if (arg === '--out') {
      out = argv[++i]
      if (out === undefined || out === '') { io.stderr('octocrawl access-grant: --out takes a file'); return 2 }
    } else {
      io.stderr(`octocrawl access-grant: ${arg.startsWith('--') ? `unknown option ${arg}` : 'takes no argument'}\n\n${ACCESS_GRANT_USAGE}`)
      return 2
    }
  }
  const file = resolve(out ?? defaultAccessGrantFile(io.env))
  if (io.ask === undefined) {
    io.stderr(`octocrawl access-grant: this command asks you to accept a statement, so it answers only to a person typing at a terminal: run it yourself. ${NOTHING}`)
    return 1
  }
  if (await exists(file)) {
    io.stderr(`octocrawl access-grant: ${file} is already there and stays as it is; remove it first, or name another file with --out. ${NOTHING}`)
    return 1
  }
  io.stdout([
    'This writes the access grant of the route Octocrawl recommends on your own machine:',
    '  installed_chrome      a page that stopped at a check is read in the Google Chrome installed here, in a window it opens (at most 2 at once)',
    '  compatible_transport  the pages of a few hosts are read over a browser-compatible HTTP transport first',
    'Neither pays a third party. Only a request that asks for access: "enhanced" uses them, on a server started with the grant.',
    '',
    'The statement the grant records as accepted by you:',
    '',
    `  ${LOCAL_GRANT_STATEMENT}`,
    '',
    `The file: ${file}`,
    '',
  ].join('\n'))
  const principal = (await io.ask('Your name or e-mail, written into the grant as who accepted: '))?.trim() ?? ''
  if (principal === '') { io.stderr(`octocrawl access-grant: the grant needs who accepted it. ${NOTHING}`); return 1 }
  const answer = (await io.ask('Type "I accept" to write the grant; anything else stops: '))?.trim().toLowerCase() ?? ''
  if (answer !== 'i accept') { io.stderr(`octocrawl access-grant: not accepted. ${NOTHING}`); return 1 }
  const { text, sha256 } = localGrantText(principal, now())
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  try {
    // 'wx': a file that appeared since the check is not written over.
    await writeFile(file, text, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    io.stderr(`octocrawl access-grant: ${file} is already there and stays as it is. ${NOTHING}`)
    return 1
  }
  io.stdout([
    '',
    `Written: ${file}`,
    `SHA-256: ${sha256} (each Evidence Record of a read under it carries this)`,
    '',
    'To use it, start Octocrawl with it:',
    `  octocrawl serve --access-grant ${shellWord(file)}`,
    `  export W2L_ACCESS_GRANT=${shellWord(file)}    for the octocrawl commands and the local MCP service`,
    'and ask for the route on a request: --access enhanced on the command line, "access": "enhanced" in the API and the MCP tools.',
    'To take it back, delete the file and restart the server.',
  ].join('\n'))
  return 0
}

/** A path as one word of a POSIX shell command line, quoted when it holds anything a shell would read. */
function shellWord(path: string): string {
  return /^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`
}

async function exists(file: string): Promise<boolean> {
  try { await stat(file); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
