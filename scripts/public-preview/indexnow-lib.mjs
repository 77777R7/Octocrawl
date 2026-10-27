// The pure parts of indexnow.mjs: what changed since the last submission, what may be sent now, and the state kept
// between runs. No network, no files, so indexnow.test.mjs can run them offline.

export const MAX_PER_POST = 10_000
export const RESUBMIT_AFTER_MS = 5 * 60_000
export const RETRY_AFTER_429_MS = 10 * 60_000

export const emptyState = origin => ({ version: 1, origin, urls: {}, retryNotBefore: null })

/** Reads a state file's text. Anything that is not this origin's state is refused, not treated as empty, because an
 * empty state would make the next run send the whole site. */
export function readState(text, origin) {
  const state = JSON.parse(text)
  if (state?.version !== 1 || typeof state.urls !== 'object' || state.urls === null) throw new Error('the IndexNow state file is not a version 1 state')
  if (state.origin !== origin) throw new Error(`the IndexNow state file is for ${state.origin}, not ${origin}`)
  return state
}

/** What says a page changed: its sitemap lastmod, else a hash of its Markdown copy, else nothing (null). */
export const fingerprintOf = (entry, markdownHash) => (entry.lastmod ? `lastmod:${entry.lastmod}` : markdownHash ? `sha256:${markdownHash}` : null)

/** Which sitemap entries to send. `entries` is [{ loc, fingerprint }], `state` the last submissions, `all` sends every
 * entry. A URL with no fingerprint cannot be compared, so it counts as changed and is listed in `uncomparable`. A URL
 * sent less than five minutes ago is held back (`recent`) unless `all`. `gone` are the state's URLs that the sitemap no
 * longer lists; the caller checks that they answer 404 or 410 before sending them as deleted. */
export function plan({ entries, state, now, all = false }) {
  if (state.retryNotBefore && Date.parse(state.retryNotBefore) > now.getTime()) {
    return { blockedUntil: state.retryNotBefore, send: [], fresh: [], changed: [], unchanged: [], recent: [], uncomparable: [], gone: [] }
  }
  const fresh = [], changed = [], unchanged = [], recent = [], uncomparable = []
  for (const entry of entries) {
    const before = state.urls[entry.loc]
    if (!before) fresh.push(entry.loc)
    else if (entry.fingerprint === null || entry.fingerprint !== before.fingerprint) changed.push(entry.loc)
    else if (!all) { unchanged.push(entry.loc); continue }
    if (entry.fingerprint === null) uncomparable.push(entry.loc)
  }
  const wanted = all ? entries.map(entry => entry.loc) : [...fresh, ...changed]
  const send = []
  for (const loc of wanted) {
    const at = state.urls[loc]?.submittedAt
    if (!all && at && now.getTime() - Date.parse(at) < RESUBMIT_AFTER_MS) recent.push(loc)
    else send.push(loc)
  }
  const listed = new Set(entries.map(entry => entry.loc))
  return { blockedUntil: null, send, fresh, changed, unchanged, recent, uncomparable, gone: Object.keys(state.urls).filter(loc => !listed.has(loc)) }
}

/** The posts to make: at most 10,000 URLs each. */
export function batches(urls) {
  const out = []
  for (let i = 0; i < urls.length; i += MAX_PER_POST) out.push(urls.slice(i, i + MAX_PER_POST))
  return out
}

/** The state after a response. 200 and 202 record the URLs sent (and drop deleted ones); 429 blocks the next run for
 * ten minutes; anything else changes nothing, so the same URLs are sent again next time. */
export function afterResponse(state, { status, sent, deleted, fingerprints, now }) {
  const next = { ...state, urls: { ...state.urls } }
  if (status === 200 || status === 202) {
    for (const loc of sent) next.urls[loc] = { fingerprint: fingerprints.get(loc) ?? null, submittedAt: now.toISOString() }
    for (const loc of deleted) delete next.urls[loc]
    next.retryNotBefore = null
  } else if (status === 429) next.retryNotBefore = new Date(now.getTime() + RETRY_AFTER_429_MS).toISOString()
  return next
}
