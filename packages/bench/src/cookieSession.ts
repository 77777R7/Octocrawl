/**
 * A task's cookie session (ADR 0005 `egress_sessions`, ROADMAP PA item 3): the cookies a page's
 * responses set, kept for the task and sent again to their site on its later pages, by the HTTP
 * rungs (undici and impit) and the browser rung alike. A browser that cleared a site's check leaves
 * its cookies here, so the task's next page of that site can go over HTTP with them.
 *
 * Matching is RFC 6265's (tough-cookie): a cookie goes to the domain and path that set it, a
 * `Secure` one over https only, and an expired one is dropped. One session belongs to one task and
 * one egress: it is never shared between tasks, and nothing in it reaches a record. A lane reports
 * the session's random `id` and how many cookies it sent and kept.
 *
 * On disk. Given a file (the task's directory), the session is read from it when it exists and
 * written back after every change, so a task resumed after a restart keeps its cookies and its id.
 * The file holds cookie values: it is created readable by its owner alone (0600), replaced whole
 * (a temporary file renamed over it), and removed when the task ends (TaskCookieSession.remove).
 */

import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { CookieJar, type Cookie } from 'tough-cookie'
import type { CookieSession, ContextCookie } from '@w2l/contracts'

const SAME_SITE: Readonly<Record<string, ContextCookie['sameSite']>> = { strict: 'Strict', lax: 'Lax', none: 'None' }

export class TaskCookieSession implements CookieSession {
  private sessionId: string = randomUUID()
  // Lenient about what a site sends: a cookie it would not keep is skipped, never an error.
  private jar = new CookieJar(undefined, { looseMode: true })
  /** Done once the file, if any, has been read; every method waits for it. */
  private readonly ready: Promise<void>
  private writing: Promise<void> = Promise.resolve()
  /** Set when the task ended: a page still finishing afterwards changes the session in memory alone. */
  private closed = false

  /** `file`: where the session lives between runs of its task; without one it lives in memory alone. */
  constructor(private readonly file?: string) {
    this.ready = file === undefined ? Promise.resolve() : this.load(file)
  }

  /** An opaque id for the record, unrelated to any cookie value; a session read from its file keeps the id it had. */
  get id(): string {
    return this.sessionId
  }

  /** Deletes a task's session file: the task has ended, and its cookies go with it. */
  static async remove(file: string): Promise<void> {
    await rm(file, { force: true })
  }

  /**
   * The task has ended: deletes the file after the writes already queued, and writes nothing again,
   * so a page that finishes after the task (one a cancel or a deadline stopped waiting for) cannot put it back.
   */
  async close(): Promise<void> {
    this.closed = true
    const file = this.file
    if (file === undefined) return
    this.writing = this.writing.then(() => rm(file, { force: true })).catch(() => {})
    await this.writing
  }

  private async load(file: string): Promise<void> {
    let text: string
    try { text = await readFile(file, 'utf8') } catch { return }
    try {
      const saved = JSON.parse(text) as { version?: number; id?: unknown; jar?: object }
      if (saved.version !== 1 || typeof saved.id !== 'string' || saved.jar === undefined) return
      this.jar = await CookieJar.deserialize({ ...saved.jar, looseMode: true })
      this.sessionId = saved.id
    } catch {
      // A file that does not read is not the session: start a new one, which replaces it on its first change.
    }
  }

  /** Writes the session to its file after a change, one write at a time. */
  private persist(): Promise<void> {
    const file = this.file
    if (file === undefined) return Promise.resolve()
    this.writing = this.writing.then(async () => {
      if (this.closed) return
      const temporary = `${file}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, JSON.stringify({ version: 1, id: this.sessionId, jar: await this.jar.serialize() }), { mode: 0o600 })
        await rename(temporary, file)
      } catch {
        // A write that failed (a full disk) leaves no copy of the cookies behind.
        await rm(temporary, { force: true }).catch(() => {})
      }
    }).catch(() => {})
    return this.writing
  }

  async cookieHeader(url: string): Promise<string> {
    await this.ready
    return this.jar.getCookieString(url).catch(() => '')
  }

  async store(url: string, setCookies: readonly string[]): Promise<number> {
    await this.ready
    let kept = 0
    for (const line of setCookies) {
      const cookie = await this.jar.setCookie(line, url, { ignoreError: true }).catch(() => undefined)
      // An expired cookie deletes the one it names: nothing is kept.
      if (cookie !== undefined && cookie.TTL() > 0) kept++
    }
    // A Set-Cookie that deleted a cookie changed the session too.
    if (setCookies.length > 0) await this.persist()
    return kept
  }

  async browserCookies(url: string): Promise<ContextCookie[]> {
    await this.ready
    const cookies = await this.jar.getCookies(url).catch(() => [] as Cookie[])
    return cookies.map((cookie) => ({
      name: cookie.key,
      value: cookie.value,
      // A host-only cookie names its host alone; a domain cookie, with the leading dot, its subdomains too.
      domain: cookie.hostOnly === true ? (cookie.domain ?? '') : `.${cookie.domain ?? ''}`,
      path: cookie.path ?? '/',
      expires: cookie.expires instanceof Date ? Math.floor(cookie.expires.getTime() / 1000) : -1,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: SAME_SITE[(cookie.sameSite ?? '').toLowerCase()] ?? 'Lax',
    }))
  }

  async storeBrowserChanges(startedWith: readonly ContextCookie[], held: readonly ContextCookie[]): Promise<{ kept: number; removed: number }> {
    const key = (c: ContextCookie) => `${c.name}\u0000${c.domain}\u0000${c.path}`
    const before = new Map(startedWith.map((c) => [key(c), c]))
    const after = new Map(held.map((c) => [key(c), c]))
    await this.ready
    let kept = 0
    let removed = 0
    // New and changed cookies: what the page itself set. A changed expiry alone is kept only while the
    // session still has the value the context started with; another page's newer value wins.
    for (const c of held) {
      const was = before.get(key(c))
      if (was !== undefined && was.value === c.value) {
        if (was.expires === c.expires || (await this.currentValue(c)) !== was.value) continue
      }
      if (await this.setLine(c, false)) kept++
    }
    // Dropped cookies: deleted by the page, unless the session's value is no longer the one the context started with.
    for (const c of startedWith) {
      if (after.has(key(c))) continue
      if ((await this.currentValue(c)) !== c.value) continue
      await this.setLine(c, true)
      removed++
    }
    if (kept + removed > 0) await this.persist()
    return { kept, removed }
  }

  /** The session's value now for the cookie with this name, domain and path; undefined when it holds none. */
  private async currentValue(c: ContextCookie): Promise<string | undefined> {
    const same = (now: ContextCookie) => now.name === c.name && now.domain === c.domain && now.path === c.path
    return (await this.browserCookies(`${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${c.path}`)).find(same)?.value
  }

  /** The cookie as the site would have set it (or deleted it): a host-only one without Domain, which an IP address cannot take. */
  private async setLine(c: ContextCookie, remove: boolean): Promise<boolean> {
    const host = c.domain.replace(/^\./, '')
    if (host === '') return false
    const path = c.path === '' ? '/' : c.path
    const line = [
      `${c.name}=${remove ? '' : c.value}`,
      `Path=${path}`,
      ...(c.domain.startsWith('.') ? [`Domain=${host}`] : []),
      ...(remove ? ['Expires=Thu, 01 Jan 1970 00:00:00 GMT'] : c.expires > 0 ? [`Expires=${new Date(c.expires * 1000).toUTCString()}`] : []),
      ...(c.httpOnly ? ['HttpOnly'] : []),
      ...(c.secure ? ['Secure'] : []),
      `SameSite=${c.sameSite}`,
    ].join('; ')
    const stored = await this.jar.setCookie(line, `${c.secure ? 'https' : 'http'}://${host}${path}`, { ignoreError: true }).catch(() => undefined)
    return stored !== undefined && stored.TTL() > 0
  }
}
