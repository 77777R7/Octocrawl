import { describe, expect, it } from 'vitest'
import { INSTALLED_CHROME_INSTALL } from '@w2l/bench'
import { batchExtractionHints, batchFailureHints, batchLoginWallHint, failureGroupOf, withFailure, agentHintsFor, mapAgentHints, offPageHint, SIGN_IN_PROMPT_HINT, THIN_PAGE_HINT, BROWSER_NOT_INSTALLED_HINT, FAST_MODE_DECLINED_HINT, HOSTED_LOGIN_WALL_HINT, hostedFileNotKeptHint, hostedGateHint, hostedRefusedHint, INSTALLED_CHROME_MISSING_HINT, renderedLowYieldHint, renderedNotLoadedHint, INSTALLED_CHROME_RECOMMENDED_HINT, lowContentYieldHint, MAX_AGENT_HINTS, pinnedFastModeHints, RENDERED_LOW_YIELD_HINT, SCREENSHOT_UNAVAILABLE_HINT, type HintedAttempt, type HintedResult } from '../src/hints.js'
import { UNSOURCED_FIELD_MESSAGE } from '../src/structured.js'

const URL_ = 'https://example.test/report'

/** A result to read hints from: a plain http success unless the test says otherwise. */
function result(partial: Partial<HintedResult> = {}): HintedResult {
  return {
    requestedUrl: URL_, status: 'success', failureReason: null, blockReason: null, lane: 'http', escalations: [], trace: [],
    markdown: 'Report', truncated: false, truncatedAt: null,
    evidence: { finalUrl: URL_, httpStatus: 200 },
    ...partial,
  }
}

const hints = (res: HintedResult, channelsTried: readonly string[] = ['http'], req: { fastMode?: boolean; waitFor?: number } = {}) => agentHintsFor(req, { channelsTried, result: res })

describe('agent hints', () => {
  it('says nothing about a plain success, a verified empty page or a TLS caveat', () => {
    expect(hints(result())).toEqual([])
    expect(hints(result({ status: 'empty_verified', markdown: null }))).toEqual([])
    expect(hints(result({ warnings: [{ code: 'tls_unverified', message: 'not verified' }] }))).toEqual([])
    expect(hints(result({ status: 'failed', failureReason: 'dns_error', markdown: null }))).toEqual([])
  })

  it('says what to do about a page read without the login it needed', () => {
    expect(hints(result({ lane: 'my_browser', warnings: [{ code: 'sign_in_prompt', message: 'says "Log in for contact details"' }] }))).toEqual([SIGN_IN_PROMPT_HINT])
  })

  it('says what to do about a page that came far shorter than the others of its site', () => {
    expect(hints(result({ warnings: [{ code: 'thin_page', message: 'short' }] }))).toEqual([THIN_PAGE_HINT])
  })

  it('says where the site sent a request it answered with another page, and what to check', () => {
    const moved = result({ requestedUrl: 'https://example.test/exhibitor/acme/', evidence: { finalUrl: 'https://example.test/', httpStatus: 200 }, warnings: [{ code: 'redirected_off_page', message: 'The site sent the request on.' }] })
    expect(hints(moved)).toEqual([offPageHint(moved)])
    expect(offPageHint(moved)).toBe("example.test answered https://example.test/ in place of https://example.test/exhibitor/acme/, and the content is that page's, not the requested page's; check that the link is still live (the site may have moved or removed the page, or sent an automated request to its home page), and scrape https://example.test/ on purpose only when it is the page you want")
    // The same hint on the my-browser lane, after a lane-escalation note when there is one; none without the warning.
    expect(hints({ ...moved, lane: 'my_browser' }, ['my_browser'])).toEqual([offPageHint(moved)])
    expect(hints(result({ evidence: { finalUrl: 'https://example.test/', httpStatus: 200 } }))).toEqual([])
  })

  it('names the robots.txt rule and where it is set aside for a policy denial, and an unreachable robots.txt for what it is', () => {
    const disallowed = (detail: Record<string, unknown>) => result({ status: 'failed', failureReason: 'policy_denied', markdown: null, evidence: { finalUrl: URL_, httpStatus: null }, trace: [{ at: 1, lane: 'http', event: 'robots_disallowed', detail: { url: URL_, ...detail } }] })
    expect(hints(disallowed({ appliedRules: [{ pattern: '/report', allow: false }, { pattern: '/public', allow: true }] }))).toEqual([
      "robots.txt of example.test disallows this URL for Octocrawl's identity (rule /report). A local Octocrawl server fetches a URL a scrape or batch names whatever robots.txt says, and a crawl or map started there with ignoreRobotsTxt fetches the links it disallows, each on the record; a hosted server obeys robots.txt for every URL",
    ])
    expect(hints(disallowed({ appliedRules: [] }))[0]).toContain('(rule unknown)')
    // A rule written for Octocrawl by name is the site owner's opt-out, and the hint says what still sets it aside.
    const targeted = result({ status: 'failed', failureReason: 'policy_denied', markdown: null, evidence: { finalUrl: URL_, httpStatus: null }, trace: [
      { at: 0, lane: 'http', event: 'robots_checked', detail: { decision: 'disallowed', matchedGroup: 'octocrawl' } },
      { at: 1, lane: 'http', event: 'robots_disallowed', detail: { url: URL_, appliedRules: [{ pattern: '/', allow: false }] } },
    ] })
    expect(hints(targeted)).toEqual(["robots.txt of example.test disallows this URL for Octocrawl by name (User-agent: octocrawl; rule /): the site owner's opt-out, which a named URL and ignoreRobotsTxt do not set aside; only a robotsOverride with your recorded reason does, on a local server"])
    expect(hints(disallowed({ appliedRules: [], unreachable: 'server_error' }))).toEqual([
      'robots.txt of example.test could not be read (server_error), which counts as a complete disallow; Octocrawl asks for it again after five minutes. A local Octocrawl server fetches a URL a scrape or batch names whatever robots.txt says, and a crawl or map started there with ignoreRobotsTxt fetches the links it disallows, each on the record; a hosted server obeys robots.txt for every URL',
    ])
    // A timeout or a network failure is asked again sooner (robotsLookup.ts ROBOTS_NETWORK_FAILURE_TTL_MS).
    expect(hints(disallowed({ appliedRules: [], unreachable: 'timeout' }))[0]).toContain('could not be read (timeout), which counts as a complete disallow; Octocrawl asks for it again after half a minute.')
    expect(hints(disallowed({ appliedRules: [], unreachable: 'network_error' }))[0]).toContain('asks for it again after half a minute')
    // A denial that was not robots.txt's (an address the policy refuses) names the egress policy and the recorded reason instead of a rule.
    expect(hints(result({ status: 'failed', failureReason: 'policy_denied', markdown: null, trace: [{ at: 1, lane: 'http', event: 'ssrf_denied', detail: { to: URL_, error: 'private address 10.0.0.1' } }] }))).toEqual([
      'the egress policy refused example.test (private address 10.0.0.1) and nothing was fetched; Octocrawl reaches public addresses, and a local server the addresses its policy allowlists',
    ])
    expect(hints(result({ status: 'failed', failureReason: 'policy_denied', markdown: null, trace: [{ at: 0, lane: 'http', event: 'governance_refusal', detail: { reason: 'host outside allowlist' } }] }))[0]).toContain('(host outside allowlist)')
    // A policy_denied with neither event (a lane that recorded nothing) has nothing to name.
    expect(hints(result({ status: 'failed', failureReason: 'policy_denied', markdown: null }))).toEqual([])
  })

  describe('a login wall', () => {
    const wall = result({ status: 'blocked', blockReason: 'login_wall', markdown: null })
    const CHROME = 'in the Chrome they are signed in to (lane my-browser in mode standard on a scrape or batch, octocrawl scrape --lane my-browser; they turn on remote debugging at chrome://inspect/#remote-debugging, click Allow there, then Allow reading these sites)'
    const SAVED = 'with a login they save once (import_login example.test, or octocrawl login import example.test, then mode authed on a scrape or batch: no click per page after that)'
    const ASK = 'the page asks for a login; Octocrawl does not sign in or create accounts for anyone; ask the person first, naming example.test, whether to read it'
    const on = (offers: Parameters<typeof agentHintsFor>[2], res = wall, channelsTried: readonly string[] = ['http']) => agentHintsFor({}, { channelsTried, result: res }, offers)

    it('offers the routes this server has for this request, and asks the person first', () => {
      expect(on({ personChrome: true, savedLogins: true })).toEqual([`${ASK} ${CHROME} or ${SAVED}`])
      // A request with actions or a screenshot cannot be read in their Chrome: the saved login is what is left.
      expect(on({ savedLogins: true })).toEqual([`${ASK} ${SAVED}`])
      expect(on({ personChrome: true })).toEqual([`${ASK} ${CHROME}`])
      // Mode authed refuses an executeJavascript action, and their Chrome takes no actions: it goes first, or neither route reads the page.
      expect(on({ savedLogins: true, scriptAction: true })).toEqual([`the page asks for a login; Octocrawl does not sign in or create accounts for anyone; send the request without its executeJavascript action, which mode authed refuses, and ask the person first, naming example.test, whether to read it ${SAVED}`])
    })

    it('on a server with neither route, names none as its own and points to the person\'s computer', () => {
      expect(on({})).toEqual(['the page asks for a login; this server reads no saved login and no Chrome of the person\'s; on their own computer Octocrawl reads it as them, after asking them (npx octocrawl serve, then lane my-browser, or octocrawl login import example.test and mode authed)'])
    })

    it('read in the person\'s own Chrome and still asking, says to sign in there and offers that lane no more', () => {
      expect(on({ personChrome: true, savedLogins: true }, { ...wall, lane: 'my_browser' }, ['my_browser'])).toEqual(['example.test asks for a login in the person\'s own Chrome too: ask them to sign in to it there, then read it again'])
    })

    it('names the site asked for, not the sign-in host it redirected to', () => {
      const redirected = { ...wall, evidence: { finalUrl: 'https://accounts.idp.test/signin', httpStatus: 200 } }
      const [hint] = on({ savedLogins: true }, redirected)
      expect(hint).toContain('octocrawl login import example.test')
      expect(hint).not.toContain('idp.test')
    })

    it('a saved login the site refused: says what happened, and the fix is to sign in and save it again', () => {
      const refused = (offers: Parameters<typeof agentHintsFor>[2]) => agentHintsFor({}, { channelsTried: ['authed_session'], result: wall, ladderTrace: [{ at: 0, event: 'ladder_session_rejected', channel: 'authed_session', detail: { domain: 'example.test', blockReason: 'login_wall' } }] }, offers)
      const again = 'example.test no longer accepts the saved login for example.test (expired or signed out); ask the person to sign in to it again in Chrome, then save it again (import_login example.test, or octocrawl login import example.test): a running server uses the new one at once'
      expect(refused({ savedLogins: true })).toEqual([again])
      expect(refused({ personChrome: true, savedLogins: true })).toEqual([`${again}; or, with their yes, read this page in their Chrome now (lane my-browser in mode standard)`])
    })
  })

  describe('a batch whose pages asked for a login', () => {
    const urls = (...hosts: string[]) => hosts.map((host) => `https://${host}/page`)
    const HANDOFF = 'hand_off_batch (POST /v1/batches/:id/handoff; they get through in their Chrome, one tab at a time)'
    const LANE = 'a new batch of those URLs with lane my-browser in mode standard'
    const SAVED = (host: string) => `a new batch of those URLs in mode authed, after import_login ${host} (or octocrawl login import ${host})`

    it('counts the pages, names the site and gives the routes this server has, asking first', () => {
      expect(batchLoginWallHint(urls('a.test', 'a.test'), {}, { personChrome: true, savedLogins: true, handoff: true })).toBe(`2 pages of a.test asked for a login: ask the person first, naming the site, whether to read them with ${HANDOFF}, ${LANE} or ${SAVED('a.test')}`)
      expect(batchLoginWallHint(urls('a.test'), {}, { savedLogins: true })).toBe(`1 page of a.test asked for a login: ask the person first, naming the site, whether to read it with ${SAVED('a.test')}`)
    })

    it('names three sites at most, and leaves the import to the person to name', () => {
      const hint = batchLoginWallHint(urls('a.test', 'b.test', 'c.test', 'd.test', 'e.test', 'a.test'), {}, { savedLogins: true })
      expect(hint).toContain('6 pages of a.test, b.test, c.test and 2 more asked for a login')
      expect(hint).toContain('naming each site')
      expect(hint).toContain('import_login <host>')
    })

    it('in mode authed, says the saved login did not do it', () => {
      expect(batchLoginWallHint(urls('a.test'), { mode: 'authed' }, { savedLogins: true })).toContain('1 page of a.test still asked for a login in mode authed, so its saved login is missing or expired:')
    })

    it('on the my-browser lane, says to sign in there and offers that lane no more', () => {
      expect(batchLoginWallHint(urls('a.test', 'a.test'), { lane: 'my-browser' }, { personChrome: true, savedLogins: true })).toBe('2 pages of a.test asked for a login in the person\'s own Chrome too: ask them to sign in there, then read those pages again')
    })

    it('with a webhook, which neither route takes, says to leave it out of the new batch', () => {
      const hint = batchLoginWallHint(urls('a.test'), { webhook: true }, { personChrome: true, savedLogins: true })
      expect(hint).toContain('a new batch of those URLs without its webhook with lane my-browser')
      expect(hint).toContain('a new batch of those URLs without its webhook in mode authed')
    })

    it('with an executeJavascript action, says to drop it first', () => {
      expect(batchLoginWallHint(urls('a.test'), {}, { savedLogins: true, scriptAction: true })).toContain('send the batch without its executeJavascript action, which mode authed refuses, and ask the person first')
    })

    it('names the batch for a new one of those pages alone (loginWallsOf), on each route', () => {
      const hint = batchLoginWallHint(urls('a.test'), { id: 'b-1' }, { personChrome: true, savedLogins: true })
      expect(hint).toContain('a new batch with loginWallsOf b-1 with lane my-browser in mode standard')
      expect(hint).toContain('a new batch with loginWallsOf b-1 in mode authed, after import_login a.test')
      expect(batchLoginWallHint(urls('a.test'), { id: 'b-1', webhook: true }, { savedLogins: true })).toContain('a new batch with loginWallsOf b-1, without a webhook, in mode authed')
      expect(batchLoginWallHint(urls('a.test', 'a.test'), { id: 'b-1', lane: 'my-browser' }, { personChrome: true })).toBe('2 pages of a.test asked for a login in the person\'s own Chrome too: ask them to sign in there, then read those pages again (a new batch with loginWallsOf b-1 and lane my-browser)')
      // Hosted runs no such batch: it reads as nobody.
      expect(batchLoginWallHint(urls('a.test'), { id: 'b-1' }, { hosted: true })).not.toContain('loginWallsOf')
    })

    it('on a server with neither route, and on a hosted one, names none as its own', () => {
      expect(batchLoginWallHint(urls('a.test'), {}, {})).toBe('1 page of a.test asked for a login; this server reads no saved login and no Chrome of the person\'s; on their own computer Octocrawl reads it as them, after asking them (npx octocrawl serve, then lane my-browser, or octocrawl login import a.test and mode authed)')
      const hosted = batchLoginWallHint(urls('a.test'), {}, { hosted: true })
      expect(hosted).toContain('hosted Octocrawl holds no logins and never takes theirs')
      expect(hosted).toContain('ask the person first, naming the site')
      for (const local of ['hand_off_batch', 'import_login', 'my-browser']) expect(hosted).not.toContain(local)
    })
  })

  describe('a finished batch\'s failed pages, a line a reason', () => {
    const facts = (partial: Partial<Parameters<typeof failureGroupOf>[0]>) => ({ status: 'failed', failureReason: null, blockReason: null, robots: null, browserDeclined: false, ...partial })

    it('groups a page by what stops it, and leaves read, cancelled and login-wall pages alone', () => {
      expect(failureGroupOf(facts({ status: 'success' }))).toBeNull()
      expect(failureGroupOf(facts({ status: 'cancelled' }))).toBeNull()
      expect(failureGroupOf(facts({ status: 'budget_exceeded' }))).toBeNull()
      expect(failureGroupOf(facts({ status: 'blocked', blockReason: 'login_wall' }))).toBeNull()
      expect(failureGroupOf(facts({ failureReason: 'empty_unverified', browserDeclined: true }))).toBe('fast_mode_declined')
      expect(failureGroupOf(facts({ failureReason: 'empty_unverified' }))).toBe('empty_unverified')
      expect(failureGroupOf(facts({ failureReason: 'policy_denied', robots: 'unreachable' }))).toBe('robots_unreachable')
      expect(failureGroupOf(facts({ failureReason: 'policy_denied', robots: 'disallowed' }))).toBe('robots_disallowed')
      expect(failureGroupOf(facts({ failureReason: 'policy_denied' }))).toBe('policy_denied')
      for (const gate of ['cloudflare_challenge', 'captcha', 'bot_detected_generic']) expect(failureGroupOf(facts({ status: 'blocked', blockReason: gate }))).toBe('gated')
      // A block page is not a check: its line says another next step, so it is its own group.
      expect(failureGroupOf(facts({ status: 'blocked', blockReason: 'access_denied' }))).toBe('access_denied')
      expect(failureGroupOf(facts({ status: 'blocked', blockReason: 'rate_limited' }))).toBe('rate_limited')
      expect(failureGroupOf(facts({ failureReason: 'timeout' }))).toBe('timeout')
      expect(failureGroupOf(facts({ failureReason: 'http_error', browserDeclined: true }))).toBe('http_error')
    })

    it('keeps the count, the first four sites and whether more were seen', () => {
      let failures = withFailure({}, 'timeout', 'a.test')
      for (const host of ['a.test', 'b.test', 'c.test', 'd.test']) failures = withFailure(failures, 'timeout', host)
      expect(failures).toEqual({ timeout: { count: 5, hosts: ['a.test', 'b.test', 'c.test', 'd.test'] } })
      expect(withFailure(failures, 'timeout', 'e.test')).toEqual({ timeout: { count: 6, hosts: ['a.test', 'b.test', 'c.test', 'd.test'], moreHosts: true } })
      expect(withFailure(failures, 'timeout', 'a.test').timeout!.moreHosts).toBeUndefined()
    })

    it('says to send the pages fastMode kept from the browser again without it, most pages first', () => {
      const hints = batchFailureHints({ timeout: { count: 2, hosts: ['slow.test'] }, fast_mode_declined: { count: 11, hosts: ['a.test', 'b.test', 'c.test', 'd.test'], moreHosts: true } }, { hosted: true, timeout: 30_000 })
      expect(hints).toEqual([
        '11 pages of a.test, b.test, c.test and more sites read empty over HTTP and asked for the browser lane, which fastMode declined: a new batch of those URLs without fastMode reads them in a browser (5 credits a page)',
        '2 pages of slow.test ran out of their 30000 ms timeout: a new batch of those URLs with a longer timeout (up to 300000 ms) when the sites are slow rather than down',
      ])
      expect(batchFailureHints({ fast_mode_declined: { count: 1, hosts: ['a.test'] } }, {})).toEqual(['1 page of a.test read empty over HTTP and asked for the browser lane, which fastMode declined: a new batch of that URL without fastMode reads it in a browser'])
      // A key with no browser lane ran on HTTP alone: sending the pages again without fastMode would read them empty again.
      expect(batchFailureHints({ fast_mode_declined: { count: 1, hosts: ['a.test'] } }, { hosted: true, browserLane: false })).toEqual(['1 page of a.test read empty over HTTP and asked for the browser lane, which this key does not have: the browser lane comes with an account\'s own key (https://octocrawl.dev/dashboard/keys/) or a signed-in MCP connection; a new batch of that URL from one reads it in a browser (5 credits a page)'])
    })

    it('names what this server obeys for robots.txt and gates, and the route on the person\'s own computer', () => {
      const robots = { robots_unreachable: { count: 11, hosts: ['a.test', 'b.test', 'c.test', 'd.test'] } }
      expect(batchFailureHints(robots, { hosted: true })[0]).toBe('11 pages of a.test, b.test, c.test and 1 more were refused because their robots.txt could not be read from this server, which counts as a complete disallow; hosted Octocrawl obeys that for every URL: a new batch of those URLs with access: "enhanced" reads them through its own exits, on an account that has it, and on your computer Octocrawl reads a URL you name whatever robots.txt says (npx octocrawl serve)')
      expect(batchFailureHints(robots, {})[0]).toBe('11 pages of a.test, b.test, c.test and 1 more were refused because their robots.txt could not be read from this server, which counts as a complete disallow; Octocrawl asks for the file again after a while')
      const gated = batchFailureHints({ gated: { count: 3, hosts: ['g.test'] } }, { hosted: true })[0]!
      expect(gated).toContain('3 pages of g.test gate automated access (a challenge or bot check); hosted Octocrawl does not solve challenges')
      expect(gated).toContain('npx octocrawl serve, then the batch with a handoff')
      expect(batchFailureHints({ gated: { count: 1, hosts: ['g.test'] } }, { handoff: true })[0]).toContain('a batch handoff (hand_off_batch, POST /v1/batches/:id/handoff, octocrawl batch --handoff) opens them there')
      expect(batchFailureHints({ gated: { count: 1, hosts: ['g.test'] } }, {})[0]).toBe('1 page of g.test gates automated access (a challenge or bot check); this server has no Chrome of the person\'s to hand them to; on their own computer Octocrawl can (npx octocrawl serve, then the batch with a handoff)')
      expect(batchFailureHints({ robots_disallowed: { count: 1, hosts: ['r.test'] } }, { hosted: true })[0]).toBe('1 page of r.test is disallowed by its robots.txt for Octocrawl: the site owner\'s rule, which hosted Octocrawl obeys for every URL; on your computer a URL you name is read on the record (npx octocrawl serve)')
    })

    it('says of pages that refused the exit that waiting does not help, and names only the routes this server has', () => {
      const refused = { access_denied: { count: 3, hosts: ['b.test'] } }
      const same = '3 pages of b.test refused this exit with a block page, which has no check to pass: waiting or a new batch from the same network does not help'
      expect(batchFailureHints(refused, { handoff: true })).toEqual([`${same}; another network may be let in (a proxy or session you own), or read them in your own Chrome: a batch handoff (hand_off_batch, POST /v1/batches/:id/handoff, octocrawl batch --handoff) opens them there and Octocrawl reads the page`])
      expect(batchFailureHints(refused, {})).toEqual([`${same}; another network may be let in (a proxy or session you own); this server has no Chrome of the person's to hand them to; on their own computer Octocrawl can (npx octocrawl serve, then the batch with a handoff)`])
      // Refused in the person's own Chrome as well: the line does not send them back there.
      expect(batchFailureHints(refused, { handoff: true, refusedInPersonChrome: true })).toEqual([`${same}, and the person's own Chrome was refused there too; another network may be let in (a proxy or session you own)`])
      const hosted = batchFailureHints({ access_denied: { count: 1, hosts: ['b.test'] } }, { hosted: true, handoff: true })
      expect(hosted).toEqual(['1 page of b.test refused hosted Octocrawl\'s exit with a block page, which has no check to pass: waiting or a new batch from here does not help, and hosted Octocrawl has no proxy or session of yours; on your computer Octocrawl asks from your own network (npx octocrawl serve), and can hand it to you in your own Chrome (the batch with a handoff)'])
      for (const line of [...batchFailureHints(refused, { handoff: true }), ...batchFailureHints(refused, {}), ...hosted]) for (const absent of ['gate', 'challenge', 'solve']) expect(line).not.toContain(absent)
      // Beside real checks it keeps its own line.
      expect(batchFailureHints({ gated: { count: 2, hosts: ['g.test'] }, access_denied: { count: 1, hosts: ['b.test'] } }, {}).map((line) => line.split(' ').slice(0, 5).join(' '))).toEqual(['2 pages of g.test gate', '1 page of b.test refused'])
    })

    it('puts every other reason in one line that points at the items, and a timeout at the ceiling offers no longer one', () => {
      expect(batchFailureHints({ dns_error: { count: 1, hosts: ['d.test'] }, http_error: { count: 2, hosts: ['h.test'] }, tls_error: { count: 1, hosts: ['t.test'] } }, {})).toEqual([
        '4 pages failed for other reasons (http_error 2, dns_error 1, tls_error 1): get_batch_errors (GET /v1/batches/:id/errors) lists them, each with its own agentHints',
      ])
      const hints = batchFailureHints({ timeout: { count: 1, hosts: ['s.test'] }, http_error: { count: 1, hosts: ['h.test'] } }, {})
      expect(hints[0]).toBe('1 page of s.test ran out of the longest timeout Octocrawl takes (300000 ms): the site was down or slower than that; a new batch of that URL later tells one from the other')
      expect(batchFailureHints({ timeout: { count: 1, hosts: ['s.test'] } }, { timeout: 300_000 })[0]).toContain('the longest timeout Octocrawl takes')
      expect(hints[1]).toBe('1 more page failed for other reasons (http_error 1): get_batch_errors (GET /v1/batches/:id/errors) lists them, each with its own agentHints')
      expect(batchFailureHints({}, {})).toEqual([])
    })
  })

  it('points a gate to a proxy or session of your own, naming the lanes tried', () => {
    for (const blockReason of ['cloudflare_challenge', 'captcha', 'bot_detected_generic'] as const) {
      expect(hints(result({ status: 'blocked', blockReason, markdown: null, evidence: { finalUrl: URL_, httpStatus: 403 } }), ['http', 'browser_local']), blockReason).toEqual([
        'example.test gates automated access on the lanes tried (http, browser_local); Octocrawl does not solve challenges or change its identity unless this server\'s access grant names a provider that does (--access-grant, ADR 0005); a proxy or session you own is the supported route, or, on your own machine, getting through the check yourself in your own Chrome: handoff: true on a scrape (octocrawl scrape --handoff), or a batch handoff (octocrawl batch --handoff, POST /v1/batches/:id/handoff)',
      ])
    }
    expect(hints(result({ status: 'blocked', blockReason: 'geo_restricted', markdown: null }))).toEqual([])
  })

  it('says of a block page that the site refused this exit and waiting does not help, with the routes this server has (R1.3)', () => {
    const refused = result({ status: 'blocked', blockReason: 'access_denied', markdown: null, evidence: { finalUrl: URL_, httpStatus: 403 } })
    const local = hints(refused, ['http', 'browser_local'])
    expect(local).toEqual(['example.test refused this exit with a block page on the lanes tried (http, browser_local): the page has no check to pass, so waiting or asking again from the same network does not help; another network may be let in (a proxy or session you own), or, on your own machine, read the page in your own Chrome: handoff: true on a scrape (octocrawl scrape --handoff), or a batch handoff (octocrawl batch --handoff, POST /v1/batches/:id/handoff)'])
    // The person's own Chrome was refused too: it is not offered again.
    const own = agentHintsFor({}, { channelsTried: ['my_browser'], result: { ...refused, lane: 'my_browser' } })
    expect(own).toEqual(['example.test refused this exit with a block page on the lanes tried (my_browser): the page has no check to pass, so waiting or asking again from the same network does not help; another network may be let in (a proxy or session you own)'])
    // Hosted: no proxy or session of the person's, and no handoff; the route is their own computer.
    const hosted = agentHintsFor({}, { channelsTried: ['http', 'browser_local'], result: refused }, { hosted: true })
    expect(hosted).toEqual([hostedRefusedHint('example.test', ['http', 'browser_local'])])
    expect(hosted[0]).toBe('example.test refused hosted Octocrawl\'s exit with a block page on the lanes tried (http, browser_local): the page has no check to pass, so waiting or asking again from here does not help, and hosted Octocrawl has no proxy or session of yours; on your computer Octocrawl asks from your own network (npx octocrawl serve), and can hand the page to you in your own Chrome (the scrape with handoff: true)')
    for (const absent of ['--access-grant', 'octocrawl scrape --handoff', 'POST /v1/batches/:id/handoff', 'a proxy or session you own']) expect(hosted[0]).not.toContain(absent)
    // None of them speaks of a check to get through, a challenge to solve or a gate.
    for (const line of [...local, ...own, ...hosted]) for (const absent of ['gates automated access', 'solve challenges', 'getting through the check']) expect(line).not.toContain(absent)
    // The installed_chrome route is recommended for a check it waits out; a block page has none, and what the route does with one was not measured.
    expect(agentHintsFor({}, { channelsTried: ['http', 'browser_local'], result: refused }, { installedChrome: true })).toEqual(local)
  })

  it('on hosted Octocrawl names only what a server on the person\'s computer has: no authed mode, handoff, actions, grant or 300 s there', () => {
    const hosted = { hosted: true }
    const on = (res: HintedResult, channelsTried: readonly string[] = ['http'], req: { fastMode?: boolean; waitFor?: number } = {}) => agentHintsFor(req, { channelsTried, result: res }, hosted)
    // A login wall: hosted holds no logins (the decision of 2026-11-04), so the one route is a server on the person's computer with the login saved there.
    expect(on(result({ status: 'blocked', blockReason: 'login_wall', markdown: null }))).toEqual([HOSTED_LOGIN_WALL_HINT])
    for (const part of ['hosted Octocrawl holds no logins and never takes yours', 'npx octocrawl serve', 'octocrawl login import <host>', 'mode authed']) expect(HOSTED_LOGIN_WALL_HINT).toContain(part)
    expect(HOSTED_LOGIN_WALL_HINT).not.toContain('use mode authed with your own session')
    // A check: no proxy, session, grant or handoff on hosted; the handoff and the saved login are the person's computer's.
    const gate = on(result({ status: 'blocked', blockReason: 'captcha', markdown: null, evidence: { finalUrl: URL_, httpStatus: 403 } }), ['http', 'browser_local'])
    expect(gate).toEqual([hostedGateHint('example.test', ['http', 'browser_local'])])
    for (const part of ['example.test gates automated access on the lanes tried (http, browser_local)', 'has no proxy, session or handoff of yours', 'handoff: true', 'octocrawl login import <host>']) expect(gate[0]).toContain(part)
    for (const absent of ['--access-grant', 'octocrawl scrape --handoff', 'POST /v1/batches/:id/handoff', 'a proxy or session you own is the supported route']) expect(gate[0]).not.toContain(absent)
    // Thin pages: waitFor and onlyMainContent stay, the actions clause goes (hosted takes no actions).
    const thin = result({ warnings: [{ code: 'low_content_yield', message: 'thin' }] })
    expect(on(thin, ['http', 'browser_local'])).toEqual([lowContentYieldHint(true, false)])
    expect(on(thin, ['http', 'browser_local'])[0]).not.toContain('actions')
    expect(on({ ...thin, lane: 'browser_local' }, ['http', 'browser_local'])).toEqual([renderedLowYieldHint(false)])
    expect(renderedLowYieldHint(false)).not.toContain('actions')
    expect(renderedLowYieldHint(false)).toContain('onlyMainContent: false')
    const notLoaded = result({ status: 'failed', failureReason: 'empty_unverified', markdown: null, lane: 'browser_local', trace: [{ at: 1, lane: 'browser_local', event: 'loading_wait', detail: { cleared: false } }] })
    expect(on(notLoaded, ['http', 'browser_local'], { waitFor: 2000 })).toEqual([renderedNotLoadedHint(2000, false)])
    expect(renderedNotLoadedHint(2000, false)).not.toContain('actions')
    // Deadlines: hosted's two ceilings, not the engine's 300 s alone.
    expect(on(result({ status: 'failed', failureReason: 'timeout', markdown: null }))).toEqual(['no lane answered within the request\'s deadline; raise timeout (up to 300000 ms over REST, 180000 ms from an MCP tool)'])
    expect(on(result({ status: 'partial' }))[0]).toContain('up to 300000 ms over REST, 180000 ms from an MCP tool')
    // The json model is hosted Octocrawl's own, charged in credits, not the operator's env.
    const incomplete = on(result({ json: { status: 'incomplete', issues: [{ code: 'missing_required', path: 'price', message: 'not found' }] } as unknown as HintedResult['json'] }))
    expect(incomplete).toHaveLength(1)
    expect(incomplete[0]).toContain('2 credits more a page')
    expect(incomplete[0]).not.toContain('W2L_EXTRACT_BASE_URL')
    // The same results on a local server keep their local hints.
    expect(hints(thin, ['http', 'browser_local'])).toEqual([lowContentYieldHint(true)])
    expect(hints(result({ status: 'failed', failureReason: 'timeout', markdown: null }))).toEqual(['no lane answered within the request\'s deadline; raise timeout (up to 300000 ms)'])
  })

  it('recommends installed_chrome after a gate the bundled browser met too, only where the server offers it (ADR 0005, 2026-10-23)', () => {
    const gate = (blockReason: 'cloudflare_challenge' | 'captcha' | 'bot_detected_generic') => result({ status: 'blocked', blockReason, markdown: null, evidence: { finalUrl: URL_, httpStatus: 403 } })
    const offered = { installedChrome: true }
    for (const blockReason of ['cloudflare_challenge', 'captcha', 'bot_detected_generic'] as const) {
      const said = agentHintsFor({}, { channelsTried: ['http', 'browser_local'], result: gate(blockReason) }, offered)
      expect(said, blockReason).toHaveLength(2)
      expect(said[0], blockReason).toContain('gates automated access on the lanes tried (http, browser_local)')
      expect(said[1], blockReason).toBe(INSTALLED_CHROME_RECOMMENDED_HINT)
    }
    // It names the route, what it opens, and the grant the person writes and starts the server with; and what was not measured.
    for (const part of ['installed_chrome', 'compatible_transport', 'names installed_chrome and compatible_transport', "this machine's Google Chrome", 'at most 2', 'tier enhanced', 'your own attestation', '--access-grant', 'W2L_ACCESS_GRANT', 'access: "enhanced"', 'unknown on yours', 'docs/access.md#the-recommended-route-on-your-own-machine']) {
      expect(INSTALLED_CHROME_RECOMMENDED_HINT).toContain(part)
    }
    // A server that does not offer it (hosted, or one whose grant already names the route) says the gate alone, as before.
    expect(agentHintsFor({}, { channelsTried: ['http', 'browser_local'], result: gate('cloudflare_challenge') })).toHaveLength(1)
    expect(agentHintsFor({}, { channelsTried: ['http', 'browser_local'], result: gate('cloudflare_challenge') }, { installedChrome: false })).toHaveLength(1)
    // The rung comes after the bundled browser: a run that never reached it (fastMode, an http-only server, the person's own Chrome) is not told to skip ahead.
    expect(agentHintsFor({}, { channelsTried: ['http'], result: gate('cloudflare_challenge') }, offered)).toHaveLength(1)
    expect(agentHintsFor({}, { channelsTried: ['my_browser'], result: { ...gate('cloudflare_challenge'), lane: 'my_browser' } }, offered)).toHaveLength(1)
    // A stored page whose run already tried the route (read before the server's grant changed) is not told to try it.
    expect(agentHintsFor({}, { channelsTried: ['http', 'browser_local', 'installed_chrome'], result: gate('cloudflare_challenge') }, offered)).toHaveLength(1)
    // Not for what is not a check the route waits out: a login wall, a rate limit, a region, a page that was read.
    expect(agentHintsFor({}, { channelsTried: ['http', 'browser_local'], result: result({ status: 'blocked', blockReason: 'login_wall', markdown: null }) }, offered)).not.toContain(INSTALLED_CHROME_RECOMMENDED_HINT)
    expect(agentHintsFor({}, { channelsTried: ['http', 'browser_local'], result: result({ status: 'blocked', blockReason: 'rate_limit', markdown: null }) }, offered)).not.toContain(INSTALLED_CHROME_RECOMMENDED_HINT)
    expect(agentHintsFor({}, { channelsTried: ['http', 'browser_local'], result: result({ status: 'blocked', blockReason: 'geo_restricted', markdown: null }) }, offered)).toEqual([])
    expect(agentHintsFor({}, { channelsTried: ['http', 'browser_local'], result: result({ lane: 'browser_local' }) }, offered)).toEqual([])
  })

  it('gives the Retry-After time for a rate limit, the cut for a truncated page, and the error page for an HTTP error', () => {
    const retryAt = Date.UTC(2026, 9, 2, 12, 0, 0)
    expect(hints(result({ status: 'blocked', blockReason: 'rate_limit', markdown: null, retryAt }))).toEqual(['wait until 2026-10-02T12:00:00.000Z before asking example.test again'])
    expect(hints(result({ status: 'blocked', blockReason: 'rate_limit', markdown: null }))).toEqual(['example.test answered with a rate limit and named no Retry-After; wait before asking it again'])
    // A deferred Retry-After on any result is a wait, whatever the status.
    expect(hints(result({ retryAt }))).toEqual(['wait until 2026-10-02T12:00:00.000Z before asking example.test again'])
    expect(hints(result({ truncated: true, truncatedAt: 120000 }))).toEqual(['the content was cut at character 120000; ask for rawHtml or a narrower includeTags'])
    expect(hints(result({ status: 'failed', failureReason: 'http_error', markdown: '# Not Found', evidence: { finalUrl: URL_, httpStatus: 404 } }))).toEqual(['the server answered 404; the markdown is that error page, not the requested page; check the link'])
    expect(hints(result({ status: 'failed', failureReason: 'http_error', markdown: '# Gone', evidence: { finalUrl: URL_, httpStatus: 500 } }))).toEqual(['the server answered 500; the markdown is that error page, not the requested page'])
    // An error status that kept no page says nothing: there is no markdown to mistake for the page; a 404 still says to check the link.
    expect(hints(result({ status: 'failed', failureReason: 'http_error', markdown: null, evidence: { finalUrl: URL_, httpStatus: 500 } }))).toEqual([])
    expect(hints(result({ status: 'failed', failureReason: 'http_error', markdown: null, evidence: { finalUrl: URL_, httpStatus: 404 } }))).toEqual(['the server answered 404; check the link'])
    // The host is the final URL's, after a redirect.
    expect(hints(result({ status: 'blocked', blockReason: 'rate_limit', markdown: null, evidence: { finalUrl: 'https://www.example.test/x', httpStatus: 429 } }))[0]).toContain('www.example.test')
  })

  it('describes a client-rendered page by whether the browser lane had its turn, and under fastMode names what was declined once', () => {
    const shell = result({ status: 'failed', failureReason: 'empty_unverified', warnings: [{ code: 'client_rendered_suspected', message: 'shell' }], escalations: [{ from: 'http', to: 'browser_local', trigger: 'extract_low_confidence', improved: null }], trace: [{ at: 1, lane: 'http', event: 'quality_client_rendered' }] })
    expect(hints(shell, ['http', 'browser_local'])).toEqual(['the page fills its data with JavaScript; the browser lane was tried'])
    expect(hints(shell, ['http'])).toEqual(['the page fills its data with JavaScript; the browser lane was not tried'])
    // http_compat is the http lane over another transport, not a browser.
    expect(hints(shell, ['http_compat'])).toEqual(['the page fills its data with JavaScript; the browser lane was not tried'])
    expect(hints(shell, ['http'], { fastMode: true })).toEqual([FAST_MODE_DECLINED_HINT])
    // A success the http lane offered to the browser lane carries the fastMode hint too; a rendered page carries none.
    expect(hints(result({ trace: [{ at: 1, lane: 'http', event: 'quality_low_yield' }] }), ['http'], { fastMode: true })).toEqual([FAST_MODE_DECLINED_HINT])
    expect(hints(result({ lane: 'browser_local' }), ['http', 'browser_local'], { fastMode: true })).toEqual([])
    // Several hints keep the table's order: the block before the wait, the wait before the cut.
    expect(hints(result({ status: 'blocked', blockReason: 'rate_limit', markdown: null, retryAt: Date.UTC(2026, 0, 1), truncated: true, truncatedAt: 10 })).map((hint) => hint.split(' ')[0])).toEqual(['wait', 'the'])
  })

  it('says a pinned fastMode\'s reason in place of the fastMode hint, within the cap, and outright to a caller that sent fastMode: false', () => {
    const pin = { reason: 'the gate read it over HTTP alone', askedOff: false }
    expect(pinnedFastModeHints([FAST_MODE_DECLINED_HINT], pin)).toEqual([pin.reason])
    expect(pinnedFastModeHints(['other'], pin)).toEqual(['other'])
    expect(pinnedFastModeHints([], { ...pin, askedOff: true })).toEqual([`fastMode: false was not honoured: ${pin.reason}`])
    // A full answer gives up its last line for the reason.
    const full = [...Array.from({ length: MAX_AGENT_HINTS - 1 }, (_, index) => `line ${index}`), FAST_MODE_DECLINED_HINT]
    expect(pinnedFastModeHints([...full.slice(0, -1), 'last'], { ...pin, askedOff: true })).toHaveLength(MAX_AGENT_HINTS)
    expect(pinnedFastModeHints(full, pin)).toEqual([...full.slice(0, -1), pin.reason])
  })

  it('suggests waitFor or a longer timeout for a thin http answer the browser lane did not improve or could not be offered to, and says what a file\'s markdown is', () => {
    const thin = (message: string) => result({ warnings: [{ code: 'low_content_yield', message }], trace: [{ at: 1, lane: 'http', event: 'quality_low_yield', detail: { contentTokens: 20, confidence: 0.1 } }] })
    expect(hints(thin('The http lane extracted 20 tokens at confidence 0.1; the browser lane did not improve it.'), ['http', 'browser_local'])).toEqual([lowContentYieldHint(true)])
    expect(hints(thin('The http lane extracted 20 tokens at confidence 0.1; the browser lane was not available to this request.'), ['http'])).toEqual([lowContentYieldHint(false)])
    expect(lowContentYieldHint(false)).toBe("the http lane's content was thin and the browser lane was not available; pass waitFor (up to 60000 ms) or a longer timeout with the browser lane available, or actions (a click, a scroll, a wait for a selector) when the data appears after an interaction")
    // Under fastMode the one fastMode sentence says what was declined; the warning's own hint is left out.
    expect(hints(thin('…'), ['http'], { fastMode: true })).toEqual([FAST_MODE_DECLINED_HINT])
    // A thin rendered answer: the browser lane's own extraction found it thin, so the hint is about the rendered page.
    const rendered = result({ lane: 'browser_local', warnings: [{ code: 'low_content_yield', message: 'The browser_local lane rendered the page and extracted 226 tokens at confidence 0; that is the answer.' }], trace: [{ at: 1, lane: 'browser_local', event: 'extract', detail: { confidence: 0 } }] })
    expect(hints(rendered, ['http', 'browser_local'])).toEqual([RENDERED_LOW_YIELD_HINT])
    // A shell carries the client-rendered sentence first, then the thin-content one.
    const shell = result({ status: 'failed', failureReason: 'empty_unverified', warnings: [{ code: 'client_rendered_suspected', message: 'shell' }, { code: 'low_content_yield', message: 'thin' }], trace: [{ at: 1, lane: 'http', event: 'quality_client_rendered' }] })
    expect(hints(shell, ['http'])).toEqual(['the page fills its data with JavaScript; the browser lane was not tried', lowContentYieldHint(false)])
    // The browser rung could not start, no browser installed (a new install): the command first, and never "was tried".
    const noBrowser = { ...shell, warnings: [...shell.warnings!, { code: 'browser_not_installed', message: 'no browser' }] }
    expect(hints(noBrowser, ['http', 'browser_local'])).toEqual([BROWSER_NOT_INSTALLED_HINT, 'the page fills its data with JavaScript; the browser lane could not start', lowContentYieldHint(false)])
    expect(BROWSER_NOT_INSTALLED_HINT).toContain('npx playwright install chromium')
    // The hint names the command the warning names: Patchright's own browser under that engine.
    const noPatchright = { ...shell, warnings: [...shell.warnings!, { code: 'browser_not_installed', message: 'the browser lane could not start: Chromium is not installed where Octocrawl runs; run npx patchright install chromium once' }] }
    expect(hints(noPatchright, ['http', 'browser_local'])[0]).toBe('Chromium is not installed where Octocrawl runs, so the browser lane could not start; run npx patchright install chromium once, then scrape again')
    // No Google Chrome for the installed_chrome rung: its own hint, and the browser lane before it still counts as tried.
    const noChrome = { ...shell, warnings: [...shell.warnings!, { code: 'browser_not_installed', message: `the installed_chrome rung could not start: Google Chrome is not installed where Octocrawl runs; ${INSTALLED_CHROME_INSTALL}` }] }
    expect(hints(noChrome, ['http', 'browser_local', 'installed_chrome'])).toEqual([INSTALLED_CHROME_MISSING_HINT, 'the page fills its data with JavaScript; the browser lane was tried', lowContentYieldHint(true)])
    expect(INSTALLED_CHROME_MISSING_HINT).toContain('install Google Chrome')
    const file = (kind: 'pdf' | 'csv' | 'xlsx', markdownFrom: 'pdf_text' | 'text' | null, path: string | null) => result({ file: { kind, detectedBy: 'content_type', contentType: null, declaredBytes: null, maxBytes: 10, bytes: 10, sha256: 'a'.repeat(64), path, markdownFrom, encoding: null, warnings: [], pdf: null } as unknown as NonNullable<HintedResult['file']> })
    expect(hints(file('pdf', 'pdf_text', 'files/aaa.pdf'))).toEqual(['the response was a pdf file kept at files/aaa.pdf; markdown is its text layer'])
    expect(hints(file('csv', 'text', 'files/aaa.csv'))).toEqual(['the response was a csv file kept at files/aaa.csv; markdown is its text as received'])
    expect(hints(file('xlsx', null, null))).toEqual(['the response was a xlsx file not saved; it has no markdown'])
    // Hosted Octocrawl keeps no file, so its hint names no place, and the route to a file with no text is the person's own computer.
    const hosted = (run: Parameters<typeof hints>[0]) => agentHintsFor({}, { channelsTried: ['http'], result: run }, { hosted: true, noFiles: true })
    expect(hosted(file('pdf', 'pdf_text', null))).toEqual(['the response was a pdf file; markdown is its text layer'])
    expect(hosted(file('csv', 'text', null))).toEqual(['the response was a csv file; markdown is its text as received'])
    expect(hosted(file('xlsx', null, null))).toEqual([hostedFileNotKeptHint('xlsx')])
    expect(hostedFileNotKeptHint('xlsx')).toBe('the response was a xlsx file; it has no markdown, and hosted Octocrawl keeps no files; on your computer Octocrawl saves it as received: npx octocrawl scrape <url>')
    // A self-hosted hosted server keeps its files, and its hint says where.
    expect(agentHintsFor({}, { channelsTried: ['http'], result: file('csv', 'text', 'files/aaa.csv') }, { hosted: true })).toEqual(['the response was a csv file kept at files/aaa.csv; markdown is its text as received'])
    // An empty file has nothing to save anywhere.
    const empty = file('csv', null, null)
    expect(hosted({ ...empty, file: { ...empty.file!, bytes: 0 } })).toEqual(['the response was a csv file; it has no markdown'])
  })

  it('names what the http lane got when a browser lane served the page after it, and nothing for the ladder\'s ordinary thin-page hop', () => {
    const served = (http: Partial<HintedAttempt['result']> & Pick<HintedAttempt['result'], 'status'>, httpStatus: number | null = 403) => agentHintsFor({}, {
      channelsTried: ['http', 'browser_local'],
      result: result({ lane: 'browser_local' }),
      summary: { attempts: [{ channel: 'http', result: { failureReason: null, blockReason: null, ...http, evidence: { httpStatus } } }, { channel: 'browser_local', result: { status: 'success', failureReason: null, blockReason: null, evidence: { httpStatus: 200 } } }] },
    })
    expect(served({ status: 'blocked', blockReason: 'bot_detected_generic' })).toEqual(['the http lane got blocked/bot_detected_generic (HTTP 403) from example.test and the local browser lane served the page; expect other pages of example.test to need the browser lane too'])
    expect(served({ status: 'failed', failureReason: 'http_error' }, 503)).toEqual(['the http lane got failed/http_error (HTTP 503) from example.test and the local browser lane served the page; expect other pages of example.test to need the browser lane too'])
    // The same over the compatible transport, whose rung is http_compat.
    expect(agentHintsFor({}, {
      channelsTried: ['http_compat', 'browser_local'],
      result: result({ lane: 'browser_local' }),
      summary: { attempts: [{ channel: 'http_compat', result: { status: 'blocked', failureReason: null, blockReason: 'bot_detected_generic', evidence: { httpStatus: 403 } } }, { channel: 'browser_local', result: { status: 'success', failureReason: null, blockReason: null, evidence: { httpStatus: 200 } } }] },
    })).toEqual(['the http lane got blocked/bot_detected_generic (HTTP 403) from example.test and the local browser lane served the page; expect other pages of example.test to need the browser lane too'])
    // A thin or empty http answer the browser lane improved on is the ladder's ordinary hop, not a hint; so is a page the http lane served itself, and a run without its summary.
    expect(served({ status: 'failed', failureReason: 'empty_unverified' }, 200)).toEqual([])
    expect(served({ status: 'success' }, 200)).toEqual([])
    expect(hints(result({ lane: 'browser_local' }), ['http', 'browser_local'])).toEqual([])
    expect(hints(result(), ['http'])).toEqual([])
  })

  it('names a certificate that did not verify, a deadline that passed, and a page without main content, each with its honest option', () => {
    expect(hints(result({ status: 'failed', failureReason: 'tls_error', markdown: null }))).toEqual(['the certificate of example.test did not verify and Octocrawl keeps verification on; a local server takes skipTlsVerification for one request, recorded in the trace and a tls_unverified warning, and a hosted server refuses it'])
    expect(hints(result({ status: 'failed', failureReason: 'timeout', markdown: null }))).toEqual(["no lane answered within the request's deadline; raise timeout (up to 300000 ms)"])
    expect(hints(result({ status: 'partial' }))).toEqual(['the result is partial: the deadline passed with this much of the page read; raise timeout (up to 300000 ms) for the rest'])
    const empty = result({ status: 'failed', failureReason: 'empty_unverified', markdown: '# Chrome only' })
    expect(hints(empty)).toEqual(["Octocrawl found no main content on the page; onlyMainContent: false returns the whole page's Markdown as content, and includeTags names the elements to read instead"])
    // A shell or thin answer already carries its own sentence; under fastMode that option's sentence stands alone.
    expect(hints({ ...empty, warnings: [{ code: 'client_rendered_suspected', message: 'shell' }] })).toEqual(['the page fills its data with JavaScript; the browser lane was not tried'])
    expect(hints({ ...empty, trace: [{ at: 1, lane: 'http', event: 'quality_low_yield' }] }, ['http'], { fastMode: true })).toEqual([FAST_MODE_DECLINED_HINT])
    // A rendered page read before its main content came (little text, or a wait that ended with it still loading) is told
    // to wait longer, by more than any waitFor it sent; one the browser saw done, with nothing on the way, keeps the sentence above.
    const extract = (textChars: number) => ({ at: 2, lane: 'browser_local' as const, event: 'extract', detail: { textChars } })
    const early = { ...empty, lane: 'browser_local' as const, trace: [extract(40)] }
    expect(hints(early, ['http', 'browser_local'])).toEqual([renderedNotLoadedHint()])
    expect(renderedNotLoadedHint()).toContain('pass waitFor (up to 60000 ms)')
    expect(hints(early, ['browser_local'], { waitFor: 2_000 })).toEqual([renderedNotLoadedHint(2_000)])
    expect(renderedNotLoadedHint(2_000)).toContain('it waited 2000 ms (waitFor); raise waitFor (up to 60000 ms)')
    const stillLoading = { ...early, trace: [{ at: 1, lane: 'browser_local' as const, event: 'loading_wait', detail: { waitedMs: 8_000, cleared: false } }, extract(9_000)] }
    expect(hints(stillLoading, ['browser_local'])).toEqual([renderedNotLoadedHint()])
    const settled = { ...early, trace: [{ at: 1, lane: 'browser_local' as const, event: 'content_wait', detail: { ended: 'settled', waitedMs: 1_200, pending: 0 } }, extract(40)] }
    expect(hints(settled, ['browser_local'])).toEqual(["Octocrawl found no main content on the page; onlyMainContent: false returns the whole page's Markdown as content, and includeTags names the elements to read instead"])
    // The person's own Chrome (my-browser, a handoff) and a provider take no waitFor: the whole-page sentence stays theirs.
    for (const lane of ['my_browser', 'browser_local_authed', 'provider'] as const) {
      expect(hints({ ...early, lane, trace: [{ ...extract(40), lane }] }, [lane]), lane).toEqual(["Octocrawl found no main content on the page; onlyMainContent: false returns the whole page's Markdown as content, and includeTags names the elements to read instead"])
    }
    expect(hints({ ...early, trace: [extract(9_000)] }, ['browser_local'])).toEqual(["Octocrawl found no main content on the page; onlyMainContent: false returns the whole page's Markdown as content, and includeTags names the elements to read instead"])
    // A PDF with no text layer is the one empty page W2L cannot read differently.
    const pdf = { kind: 'pdf', detectedBy: 'content_type', contentType: 'application/pdf', declaredBytes: null, maxBytes: 10, bytes: 10, sha256: 'a'.repeat(64), path: 'files/aaa.pdf', markdownFrom: null, encoding: null, warnings: [], pdf: null } as unknown as NonNullable<HintedResult['file']>
    expect(hints(result({ status: 'failed', failureReason: 'empty_unverified', markdown: null, file: pdf }))).toEqual(['the PDF has no text layer, and Octocrawl runs no OCR', 'the response was a pdf file kept at files/aaa.pdf; it has no markdown'])
  })

  it('names the required json fields the page did not state and a model fallback that did not run, and keeps at most five hints', () => {
    const json = (issues: NonNullable<HintedResult['json']>['issues']): HintedResult => result({ json: { status: 'incomplete', data: { title: 'Report' }, evidence: [], issues } })
    expect(hints(json([{ code: 'missing_required', message: 'no source', path: '/price' }]))).toEqual(['json is incomplete: the required field /price was not found on the page; modelFallback fills what the page does not state when the server has W2L_EXTRACT_BASE_URL and W2L_EXTRACT_MODEL'])
    expect(hints(json([{ code: 'missing_required', message: 'no source', path: '/price' }, { code: 'missing_required', message: 'no source', path: '/sku' }, { code: 'model_unavailable', message: 'model fallback requested but Octocrawl extraction model is not configured' }]))).toEqual([
      'json is incomplete: the required fields /price, /sku were not found on the page; modelFallback fills what the page does not state when the server has W2L_EXTRACT_BASE_URL and W2L_EXTRACT_MODEL',
      'the json model fallback did not run: model fallback requested but Octocrawl extraction model is not configured',
    ])
    expect(hints(result({ json: { status: 'complete', data: { title: 'Report' }, evidence: [], issues: [] } }))).toEqual([])
    expect(hints(json([{ code: 'field_unavailable', message: 'nullable field not found', path: '/isbn' }]))).toEqual([])
    // The table's order decides which five stay.
    const many = hints({ ...json([{ code: 'missing_required', message: 'no source', path: '/price' }, { code: 'model_unavailable', message: 'no model' }]), status: 'partial', retryAt: Date.UTC(2026, 0, 1), truncated: true, truncatedAt: 10, warnings: [{ code: 'screenshot_unavailable', message: 'no capture' }] })
    expect(many).toHaveLength(5)
    expect(many.map((hint) => hint.split(' ')[0])).toEqual(['the', 'wait', 'the', 'the', 'json'])
  })

  it('says why json left a field null with no source on the page, and what reads it, unless a model tried', () => {
    const unsourced = (paths: string[], modelAttempts = 0): HintedResult => result({ json: { status: 'complete', data: Object.fromEntries(paths.map((path) => [path.slice(1), null])), evidence: [], issues: paths.map((path) => ({ code: 'field_unavailable' as const, path, message: UNSOURCED_FIELD_MESSAGE })), modelUsage: modelAttempts === 0 ? null : { attempts: modelAttempts } } as unknown as HintedResult['json'] })
    expect(hints(unsourced(['/license']))).toEqual(['json found no source for /license on this page; such a field stays null: json fills a top-level field from data the page states for it (JSON-LD, metadata, microdata, a selected list) or from a label on the page that matches the field\'s name (a two-cell table row or a dt/dd pair in the main content), not from other text or links; name the field as the page labels it, read the value from the markdown (onlyMainContent: false keeps sidebars), or name its element in an attributes or list format; a model reads a field only when the schema requires it and does not allow null: drop null from its type and send modelFallback, on a server with W2L_EXTRACT_BASE_URL and W2L_EXTRACT_MODEL'])
    expect(agentHintsFor({}, { channelsTried: ['http'], result: unsourced(['/license', '/stars']) }, { hosted: true })[0]).toMatch(/^json found no source for \/license, \/stars on this page; such a field stays null.*drop null from its type and send modelFallback: true \(hosted Octocrawl's model, for an account at 2 credits more a page/)
    // A model filled in, or tried to: its null stands.
    expect(hints(unsourced(['/license'], 1))).toEqual([])
    // Another field_unavailable (a check the value broke) is not a missing source.
    expect(hints(result({ json: { status: 'incomplete', data: {}, evidence: [], issues: [{ code: 'field_unavailable', path: '/price', message: 'the value breaks minimum' }] } }))).toEqual([])
  })

  it('says on a finished batch how many pages read held nothing selected, and which json fields had no source on how many', () => {
    expect(batchExtractionHints({ read: 0, emptySelection: 0, unsourced: {} }, false)).toEqual([])
    expect(batchExtractionHints({ read: 20, emptySelection: 0, unsourced: {} }, false)).toEqual([])
    expect(batchExtractionHints({ read: 20, emptySelection: 20, unsourced: {} }, false)).toEqual(['on 20 of 20 pages read, includeTags selected nothing to read: its selectors matched no element there, or only elements without text or an image (scripts, styles, form controls, embedded media, the <head>); check them against one page\'s rawHtml, or name elements that hold text'])
    const [line] = batchExtractionHints({ read: 20, emptySelection: 0, unsourced: { '/stars': 3, '/license': 20 } }, false)
    expect(line).toMatch(/^json found no source for \/license on 20 of 20 pages read, \/stars on 3 of 20 pages read; such a field stays null: /)
    const many = batchExtractionHints({ read: 9, emptySelection: 0, unsourced: Object.fromEntries(['/a', '/b', '/c', '/d', '/e', '/f', '/g'].map((path) => [path, 9])) }, false)[0]!
    expect(many).toContain('/e on 9 of 9 pages read and 2 more fields; such a field stays null')
  })

  it('says the page stands when the browser lane could not capture the screenshot asked for, and names the lighter request', () => {
    const unavailable = result({ lane: 'browser_local', warnings: [{ code: 'screenshot_unavailable', message: 'The browser lane rendered the page but could not capture the requested screenshot (Timeout 30000ms exceeded); the page result stands without it.' }] })
    expect(hints(unavailable, ['browser_local'])).toEqual([SCREENSHOT_UNAVAILABLE_HINT])
    expect(SCREENSHOT_UNAVAILABLE_HINT).toContain('screenshot_failed')
    expect(SCREENSHOT_UNAVAILABLE_HINT).toContain('fullPage false')
  })
})

describe('dns twin hint', () => {
  const dns = (detail: Record<string, unknown> | null) => result({
    requestedUrl: 'https://www.premiumplus.com/', status: 'failed', failureReason: 'dns_error', markdown: null, evidence: { finalUrl: 'https://www.premiumplus.com/', httpStatus: null },
    trace: [{ at: 1, lane: 'http', event: 'dns_failed', detail: { to: 'https://www.premiumplus.com/', error: 'dns lookup failed for www.premiumplus.com: getaddrinfo ENOTFOUND www.premiumplus.com' } }, ...(detail === null ? [] : [{ at: 2, lane: 'http' as const, event: 'dns_twin_checked', detail }])],
  })
  const checked = (outcome: string, extra: Record<string, unknown> = {}) => ({ host: 'www.premiumplus.com', twin: 'premiumplus.com', to: 'https://premiumplus.com/', outcome, timeoutMs: 2000, ...extra })

  it('names the twin that resolves and the URL to send, and keeps the record on the URL asked for', () => {
    expect(hints(dns(checked('resolves')))).toEqual(['www.premiumplus.com does not resolve; premiumplus.com does; send https://premiumplus.com/ instead (this result stays the record of the URL asked for, which was not fetched)'])
  })

  it('says when neither name resolves, when the twin resolves to a refused address, and when the check ran out of time', () => {
    expect(hints(dns(checked('unresolved', { error: 'dns lookup failed for premiumplus.com: getaddrinfo ENOTFOUND premiumplus.com' })))).toEqual(['www.premiumplus.com does not resolve, and neither does premiumplus.com; check the domain'])
    // A resolver failure that is not the name's own answer may be the resolver's: the hint says so and quotes it.
    expect(hints(dns(checked('unresolved', { error: 'dns lookup failed for premiumplus.com: getaddrinfo EAI_AGAIN premiumplus.com' })))).toEqual(['www.premiumplus.com does not resolve, and neither does premiumplus.com (dns lookup failed for premiumplus.com: getaddrinfo EAI_AGAIN premiumplus.com); check the domain, or the resolver where Octocrawl runs'])
    expect(hints(dns(checked('denied', { error: 'ssrf denied https://premiumplus.com/: private address 10.0.0.1' })))).toEqual(['www.premiumplus.com does not resolve; premiumplus.com resolves to an address the egress policy refuses (ssrf denied https://premiumplus.com/: private address 10.0.0.1)'])
    expect(hints(dns(checked('timeout')))).toEqual(['www.premiumplus.com does not resolve; whether premiumplus.com does was not learned within 2000 ms'])
  })

  it('says nothing for a dns_error whose lane checked no twin', () => {
    expect(hints(dns(null))).toEqual([])
  })
})

describe('map hints', () => {
  const refused = (partial: Partial<Parameters<typeof mapAgentHints>[0]['refused']> = {}) => ({ duplicate: 0, collapsed: 0, hostDenied: 0, subtreeDenied: 0, pathDenied: 0, assetDenied: 0, robots: 0, robotsUnchecked: 0, searchFiltered: 0, overLimit: 0, samples: { collapsed: [], hostDenied: [], robots: [] }, ...partial })
  const url = 'https://www.english.ids-cologne.de/ids-cologne-exhibitors/list-of-exhibitors/'

  it('says how many URLs the start path\'s subtree kept out and what lists them', () => {
    expect(mapAgentHints({ url, warnings: [], refused: refused({ subtreeDenied: 2555, hostDenied: 3 }) }, 60_000)).toEqual([
      '2555 URLs found were outside the start URL\'s path subtree (/ids-cologne-exhibitors/list-of-exhibitors/) and are not listed; map https://www.english.ids-cologne.de/ or pass crawlEntireDomain: true for the whole host',
    ])
    expect(mapAgentHints({ url, warnings: [], refused: refused({ subtreeDenied: 1 }) }, 60_000)[0]).toMatch(/^1 URL found was outside/)
    // Other refusals (other hosts, the caller's own filters, robots.txt) are counted, not hinted.
    expect(mapAgentHints({ url, warnings: [], refused: refused({ hostDenied: 40, pathDenied: 3, robots: 2 }) }, 60_000)).toEqual([])
  })
})
