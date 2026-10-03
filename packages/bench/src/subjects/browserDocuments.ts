import type { Page, Response } from 'playwright'

/**
 * Most URLs a browser redirect chain lists: the requested URL and the 20
 * redirects Chromium follows before it gives up. A page that keeps moving on
 * (a refresh loop) lists its first URL and its last 20.
 */
export const MAX_REDIRECT_CHAIN = 21

/** What the main frame showed after one of its navigations. */
export interface MainFrameEntry {
  /**
   * The page's URL after the navigation, as Playwright reports it (a
   * fragment kept): the base its relative links resolve against.
   */
  url: string
  /** The navigation response that created the document on screen; null when it came without one (about:blank). */
  response: Response | null
  /**
   * `document`: a document loaded from `response`. `fragment`: the same
   * document, only the fragment changed. `history`: the same document, whose
   * URL the history API (pushState, replaceState) set without a request.
   * `unanswered`: a document that came without a response.
   */
  kind: 'document' | 'fragment' | 'history' | 'unanswered'
}

/**
 * The URL and response a result reports for what the page shows: the
 * response that created the document, and the page's URL, unless the history
 * API set one that no request answered. Then it is the URL the document was
 * loaded from, which W2L requested: a final URL is always a URL requested
 * for the page, reported with its own response.
 */
export function reported(entry: MainFrameEntry): { finalUrl: string; response: Response | null } {
  const { response } = entry
  return { finalUrl: response !== null && !sameDocument(response.url(), entry.url) ? response.url() : entry.url, response }
}

/**
 * The documents the page's main frame showed, as Chromium committed them,
 * so that a result pairs the content it reports with that document's own
 * response, not with the response of the navigation W2L started: a script or
 * a meta refresh can load another document after the first one answered.
 *
 * A navigation's response arrives before its commit (Playwright emits the
 * `response` event, then `framenavigated`), so a commit whose URL is the
 * latest main-frame navigation response's is that response's document. Any
 * other commit had no response: only its fragment changed, or the history
 * API set a URL of the same origin in the same document (Playwright disables
 * the back/forward cache, which would restore a document without one too),
 * or the page showed a document without a request (about:blank).
 */
export class MainFrameDocuments {
  private pending: Response | null = null
  private current: MainFrameEntry | null = null
  /** Entries since `restart`, at most MAX_REDIRECT_CHAIN (the first kept). */
  private entries: MainFrameEntry[] = []
  private dropped = false
  /**
   * Documents the main frame loaded so far (not counting a URL or fragment
   * changed within one): a read of the page during which this changed may
   * have read a document that is gone.
   */
  loads = 0
  /** The URL of every document the main frame loaded, in order (as `loads` counts them): what a navigation check has to see, one by one. */
  readonly loaded: string[] = []

  constructor(private readonly page: Page) {
    page.on('response', response => this.onResponse(response))
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) this.onCommit(frame.url()) })
  }

  /** Called before each navigation W2L starts: its chain starts here. */
  restart(): void {
    this.pending = null
    this.entries = []
    this.dropped = false
  }

  /** What the page shows now, or null when nothing was committed since `restart`. */
  shown(): MainFrameEntry | null {
    return this.entries.length === 0 ? null : this.current
  }

  /**
   * The redirect chain since `restart`, as `Evidence.redirectChain` wants it:
   * the requested URL first, `finalUrl` last, every redirect Chromium followed
   * and every document a script or a meta refresh loaded in between; empty
   * when nothing redirected. `complete` is false when the chain did not start
   * at the requested URL (a follow-up navigation), a document came without a
   * request, or hops were left out. `download` is the response of a
   * navigation that became a download, which commits no document.
   */
  chain(requested: string, finalUrl: string, download: Response | null = null): { chain: string[]; complete: boolean } {
    let hops: string[] = []
    let complete = !this.dropped
    for (const entry of this.entries) {
      if (entry.kind === 'document') hops.push(...requestedUrls(entry.response!))
      else if (entry.kind === 'unanswered') {
        hops.push(entry.url)
        complete = false
      }
    }
    if (download !== null) hops.push(...requestedUrls(download))
    if (hops.length === 0) return { chain: sameDocument(requested, finalUrl) ? [] : [requested, finalUrl], complete: false }
    // The ends are written as requested and as the page reports its URL (a fragment kept).
    if (sameDocument(hops[0]!, requested)) hops[0] = requested
    else { hops.unshift(requested); complete = false }
    if (sameDocument(hops.at(-1)!, finalUrl)) hops[hops.length - 1] = finalUrl
    else { hops.push(finalUrl); complete = false }
    if (hops.length > MAX_REDIRECT_CHAIN) {
      hops = [hops[0]!, ...hops.slice(-(MAX_REDIRECT_CHAIN - 1))]
      complete = false
    }
    return { chain: hops.length > 1 ? hops : [], complete }
  }

  private onResponse(response: Response): void {
    const request = response.request()
    if (!request.isNavigationRequest()) return
    try {
      if (request.frame() !== this.page.mainFrame()) return
    } catch {
      return
    }
    this.pending = response
  }

  private onCommit(url: string): void {
    const previous = this.current
    let entry: MainFrameEntry
    if (this.pending !== null && sameDocument(this.pending.url(), url)) {
      entry = { url, response: this.pending, kind: 'document' }
      this.pending = null
    } else if (previous !== null && sameDocument(previous.url, url)) {
      entry = { url, response: previous.response, kind: previous.kind === 'history' ? 'history' : 'fragment' }
    } else if (previous !== null && previous.kind !== 'unanswered' && sameOrigin(previous.url, url)) {
      // The history API keeps the document, its response and its origin.
      entry = { url, response: previous.response, kind: 'history' }
    } else {
      entry = { url, response: null, kind: 'unanswered' }
    }
    this.current = entry
    if (entry.kind === 'document' || entry.kind === 'unanswered') {
      this.loads++
      this.loaded.push(url)
    }
    if (this.entries.length >= MAX_REDIRECT_CHAIN) {
      this.entries.splice(1, 1)
      this.dropped = true
    }
    this.entries.push(entry)
  }
}

/** The URLs one navigation requested, its redirects included, in order. */
function requestedUrls(response: Response): string[] {
  const urls: string[] = []
  for (let request: ReturnType<Response['request']> | null = response.request(); request !== null; request = request.redirectedFrom()) urls.unshift(request.url())
  return urls
}

/** Two URLs name the same document: equal once parsed, fragments aside. */
export function sameDocument(a: string, b: string): boolean {
  try {
    const left = new URL(a)
    const right = new URL(b)
    left.hash = ''
    right.hash = ''
    return left.href === right.href
  } catch {
    return a === b
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    const left = new URL(a)
    return left.origin !== 'null' && left.origin === new URL(b).origin
  } catch {
    return false
  }
}
