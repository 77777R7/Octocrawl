/**
 * The sites the person allowed on Octocrawl's page in their Chrome, remembered (login UX A1): a later read of one of
 * them on the my-browser lane opens no page asking again. Chrome's own "Allow remote debugging?" still asks on each
 * connection; that dialog is Chrome's. A site is its exact host, with a port that is not the scheme's default, as the
 * page allowed it: not its subdomains, not its parent. Only a click on that page adds one; `octocrawl login revoke
 * <site>`, or Revoke on the page, forgets it, and a read of it under way stops within REVOKE_POLL_MS.
 *
 * The file sits beside the saved logins (allowed-sites.json in the folder of W2L_SESSIONS_FILE, else ~/.w2l), readable
 * by the person alone, like them. It holds hosts and dates, nothing of a page or a login.
 */

import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** A site the person allowed, and when they clicked Allow for it (ISO 8601). */
export interface RememberedSite {
  host: string
  allowedAt: string
}

/** How often a read on remembered sites looks for a revoke made outside this process (`octocrawl login revoke`). */
export const REVOKE_POLL_MS = 1_000

/** Where the remembered sites are kept: beside the saved logins. */
export function rememberedSitesFile(sessionsFile: string): string {
  return join(dirname(sessionsFile), 'allowed-sites.json')
}

/** A site as the person names it (`site.test`, `site.test:8443`, or a URL of it) as an allowed site is named: its host, lower case. */
export function siteHost(site: string): string {
  const trimmed = site.trim()
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return new URL(trimmed).host
  return new URL(`https://${trimmed}`).host
}

/** The remembered sites; none when the file does not exist yet or cannot be read as one. */
export async function listRememberedSites(file: string): Promise<RememberedSite[]> {
  let raw: string
  try { raw = await readFile(file, 'utf8') } catch { return [] }
  try {
    const sites = (JSON.parse(raw) as { sites?: unknown }).sites
    if (!Array.isArray(sites)) return []
    return sites.filter((site): site is RememberedSite => typeof site?.host === 'string' && typeof site?.allowedAt === 'string')
  } catch {
    return []
  }
}

/** Remember `hosts` as allowed at `allowedAt`; a host already remembered takes the new date. */
export async function rememberSites(file: string, hosts: readonly string[], allowedAt: string): Promise<void> {
  if (hosts.length === 0) return
  await exclusive(file, async () => {
    const kept = (await listRememberedSites(file)).filter((site) => !hosts.includes(site.host))
    await write(file, [...kept, ...hosts.map((host) => ({ host, allowedAt }))])
  })
}

/** Forget remembered sites. The hosts that were remembered and are no longer. */
export async function forgetSites(file: string, hosts: readonly string[]): Promise<string[]> {
  return exclusive(file, async () => {
    const all = await listRememberedSites(file)
    const gone = all.filter((site) => hosts.includes(site.host)).map((site) => site.host)
    if (gone.length > 0) await write(file, all.filter((site) => !gone.includes(site.host)))
    return gone
  })
}

/**
 * A signal that aborts once any of `hosts` is no longer remembered in `file` (a revoke from another process included),
 * read every `pollMs` (the file is a few lines). `stop` ends the watch.
 */
export function watchRevoked(file: string, hosts: readonly string[], pollMs = REVOKE_POLL_MS): { signal: AbortSignal; stop(): void } {
  const controller = new AbortController()
  let stopped = false
  const look = async () => {
    const remembered = new Set((await listRememberedSites(file)).map((site) => site.host))
    const revoked = hosts.filter((host) => !remembered.has(host))
    if (revoked.length > 0 && !stopped) controller.abort(new Error(`you revoked ${revoked.join(', ')} (octocrawl login revoke)`))
  }
  const timer = setInterval(() => { if (!stopped && !controller.signal.aborted) void look() }, pollMs)
  timer.unref?.()
  return { signal: controller.signal, stop: () => { stopped = true; clearInterval(timer) } }
}

/**
 * One read-change-write of the file at a time, in this process and across processes (`octocrawl serve`, the local MCP
 * host and `octocrawl login revoke` share it): two at once would each write what they read, and a revoke could be
 * written over by a site being remembered. In this process a queue; across them a lock file created exclusively,
 * taken over when older than LOCK_STALE_MS (a process that died holding it).
 */
const writing = new Map<string, Promise<void>>()
function exclusive<T>(file: string, change: () => Promise<T>): Promise<T> {
  const before = writing.get(file) ?? Promise.resolve()
  const locked = () => withFileLock(file, change)
  const run = before.then(locked, locked)
  writing.set(file, run.then(() => undefined, () => undefined))
  return run
}

const LOCK_STALE_MS = 10_000
const LOCK_WAIT_MS = 15_000

async function withFileLock<T>(file: string, change: () => Promise<T>): Promise<T> {
  const lock = `${file}.lock`
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  const started = Date.now()
  for (;;) {
    try {
      await (await open(lock, 'wx', 0o600)).close()
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const age = await stat(lock).then((info) => Date.now() - info.mtimeMs, () => 0)
      if (age > LOCK_STALE_MS) { await rm(lock, { force: true }); continue }
      if (Date.now() - started > LOCK_WAIT_MS) throw new Error(`${file} is being changed by another Octocrawl process (${lock}); try again`)
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 20))
    }
  }
  try { return await change() } finally { await rm(lock, { force: true }) }
}

async function write(file: string, sites: readonly RememberedSite[]): Promise<void> {
  // A temporary file of its own: another process writing the same file at once renames its own.
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(tmp, JSON.stringify({ sites }, null, 2), { mode: 0o600 })
  await chmod(tmp, 0o600)
  await rename(tmp, file)
}
