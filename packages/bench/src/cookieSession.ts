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
 */

import { randomUUID } from 'node:crypto'
import { CookieJar, type Cookie } from 'tough-cookie'
import type { CookieSession, ContextCookie } from '@w2l/contracts'

const SAME_SITE: Readonly<Record<string, ContextCookie['sameSite']>> = { strict: 'Strict', lax: 'Lax', none: 'None' }

export class TaskCookieSession implements CookieSession {
  readonly id = randomUUID()
  // Lenient about what a site sends: a cookie it would not keep is skipped, never an error.
  private readonly jar = new CookieJar(undefined, { looseMode: true })

  async cookieHeader(url: string): Promise<string> {
    return this.jar.getCookieString(url).catch(() => '')
  }

  async store(url: string, setCookies: readonly string[]): Promise<number> {
    let kept = 0
    for (const line of setCookies) {
      const cookie = await this.jar.setCookie(line, url, { ignoreError: true }).catch(() => undefined)
      // An expired cookie deletes the one it names: nothing is kept.
      if (cookie !== undefined && cookie.TTL() > 0) kept++
    }
    return kept
  }

  async browserCookies(url: string): Promise<ContextCookie[]> {
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

  async storeBrowserCookies(cookies: readonly ContextCookie[]): Promise<number> {
    let kept = 0
    for (const c of cookies) {
      const host = c.domain.replace(/^\./, '')
      if (host === '') continue
      // As the site would have set it: a host-only cookie without Domain (an IP address takes no Domain),
      // a cookie for the domain and its subdomains (a leading dot) with it.
      const line = [
        `${c.name}=${c.value}`,
        `Path=${c.path === '' ? '/' : c.path}`,
        ...(c.domain.startsWith('.') ? [`Domain=${host}`] : []),
        ...(c.expires > 0 ? [`Expires=${new Date(c.expires * 1000).toUTCString()}`] : []),
        ...(c.httpOnly ? ['HttpOnly'] : []),
        ...(c.secure ? ['Secure'] : []),
        `SameSite=${c.sameSite}`,
      ].join('; ')
      const stored = await this.jar.setCookie(line, `${c.secure ? 'https' : 'http'}://${host}${c.path === '' ? '/' : c.path}`, { ignoreError: true }).catch(() => undefined)
      if (stored !== undefined && stored.TTL() > 0) kept++
    }
    return kept
  }
}
