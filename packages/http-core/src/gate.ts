/**
 * Gate classification: decide whether a non-contentful response is a *block*
 * — an access gate the site deliberately put in the way — rather than a plain
 * failure, and name which gate it is.
 *
 * Why this exists: `failed/http_error` and `blocked/<reason>` are very
 * different facts for the caller. The first says "something went wrong, a
 * retry might help"; the second says "the site refused you, and here is the
 * legitimate way in". Collapsing every gate into `http_error` makes a bot wall
 * indistinguishable from a 500, which is precisely the observability the
 * product claims to sell.
 *
 * Callers pass `contentful: true` when extraction already found a main body.
 * In that mode only *decisive* challenge evidence counts: vendor headers,
 * Cloudflare managed-challenge plumbing, or the interstitial copy pair.
 * Captcha widgets, login forms, and weak bot phrases stay ignored so a real
 * article that embeds a widget is not blocked. Non-contentful responses still
 * use the full classifier.
 *
 * Honesty rules, mirroring the page-type router's signal discipline:
 *  - a status code alone is only decisive where the code *means* the gate
 *    (429 rate limit, 451 legal, 401 auth). A 429 or 401 yields only to a
 *    decisive challenge page served with it. A bare 403 is NOT enough — it is
 *    indistinguishable from an ordinary permission error, so it classifies as
 *    nothing on its own and the caller keeps reporting `http_error`.
 *  - otherwise a strong vendor/interstitial signal is required, or two weak
 *    signals, or one weak signal plus a gate-shaped status.
 *  - every verdict carries the list of signals that fired, so the claim is
 *    auditable rather than asserted.
 *
 * Vendor attribution from page copy is weaker than a vendor header, and the
 * verdict's `signals` say which one applied. Misattributing one vendor for
 * another is cheap here: the escalation path for every JS interstitial is the
 * same. Claiming a gate where there is none is not cheap, which is why the
 * thresholds above lean conservative.
 *
 * Pure logic, no I/O, no dependency on the contracts package (see
 * `ResilientFailureReason` for the same convention): the union below is a
 * structural subset of the contract's `BlockReason`, and the subject layer's
 * assignment is the compile-time drift detector.
 */

/** Structural subset of the contract's `BlockReason`. */
export type GateBlockReason =
  | 'cloudflare_challenge'
  | 'captcha'
  | 'rate_limit'
  | 'login_wall'
  | 'geo_restricted'
  | 'bot_detected_generic'

/** Structural subset of the contract's `Lane`. */
export type GateLane = 'http' | 'browser_local' | 'browser_local_authed' | 'browser_proxy' | 'provider' | 'my_browser'

export interface GateResponse {
  /** Response status, or null when no response arrived (transport error). */
  status: number | null
  /** Case-insensitive single-value header lookup; null when absent. */
  header: (name: string) => string | null
  /** Response body text. May be empty. */
  body: string
  /** The document actually answered, when the caller knows it. Never inferred from links in the body. */
  finalUrl?: string
  /**
   * True when extraction already found a main body. Only decisive challenge
   * evidence (vendor header / CF plumbing / interstitial copy pair) may
   * override that success. Default false: full classifier.
   */
  contentful?: boolean
}

export interface GateVerdict {
  reason: GateBlockReason
  /** Every signal that fired, in the order checked. Never empty. */
  signals: readonly string[]
}

/**
 * Common markers inspect only the head, bounding the cost of lower-casing a
 * multi-megabyte body. The bounded short-wall, captcha-wall and interactive-page
 * checks below separately read visible text and controls beyond a script-heavy head.
 */
const HEAD_BYTES = 65_536

/** Vendor headers that identify a bot-management product outright. */
const VENDOR_HEADERS: readonly (readonly [name: string, reason: GateBlockReason, signal: string])[] = [
  ['cf-mitigated', 'cloudflare_challenge', 'header_cf_mitigated'],
  ['x-datadome', 'bot_detected_generic', 'header_x_datadome'],
  ['x-datadome-cid', 'bot_detected_generic', 'header_x_datadome_cid'],
  ['x-iinfo', 'bot_detected_generic', 'header_x_iinfo_imperva'],
  ['x-kasada-classification', 'bot_detected_generic', 'header_x_kasada'],
  ['x-sucuri-block', 'bot_detected_generic', 'header_x_sucuri_block'],
]

/**
 * Headers that name a challenge a vendor serves with 429, so the 429 is no rate limit; read only on a 429 (`null`:
 * any value). Vercel's checkpoint says `challenge` (`deny` is a refusal, no challenge); Kasada's interstitial sends its
 * client token with the KPSDK script; Expedia's challenge handler draws its captcha.
 */
const CHALLENGE_429_HEADERS: readonly (readonly [name: string, value: string | null, reason: GateBlockReason, signal: string])[] = [
  ['x-vercel-mitigated', 'challenge', 'bot_detected_generic', 'header_x_vercel_mitigated'],
  ['x-kpsdk-ct', null, 'bot_detected_generic', 'header_x_kpsdk_ct'],
  ['x-page-id', 'wildcard-challenge-handler', 'captcha', 'header_expedia_challenge_handler'],
]

/** Cloudflare's managed-challenge plumbing. Any one of these is decisive. */
const CF_STRONG_MARKERS: readonly (readonly [marker: string, signal: string])[] = [
  ['/cdn-cgi/challenge-platform', 'cf_challenge_platform_script'],
  ['__cf_chl', 'cf_challenge_var'],
  ['cf_chl_opt', 'cf_challenge_opt'],
  ['cf-browser-verification', 'cf_browser_verification'],
  ['attention required! | cloudflare', 'cf_attention_required'],
]

/**
 * Cloudflare's managed-challenge interstitial copy. The pair is distinctive
 * enough to name the vendor; either half alone is only a weak signal.
 */
const CF_INTERSTITIAL_PAIR: readonly [string, string] = [
  'just a moment',
  'enable javascript and cookies',
]

/** Interactive human-verification widgets. Require a person, not a lane. */
const CAPTCHA_MARKERS: readonly (readonly [marker: string, signal: string])[] = [
  ['g-recaptcha', 'widget_recaptcha'],
  ['recaptcha/api.js', 'widget_recaptcha_api'],
  ['grecaptcha.', 'widget_recaptcha_js'],
  ['hcaptcha.com', 'widget_hcaptcha'],
  ['h-captcha', 'widget_hcaptcha_class'],
  ['cf-turnstile', 'widget_turnstile'],
  ['challenges.cloudflare.com/turnstile', 'widget_turnstile_script'],
  ['funcaptcha', 'widget_funcaptcha'],
  ['arkoselabs', 'widget_arkose'],
  ['data-sitekey', 'widget_sitekey'],
  // PerimeterX's press-and-hold prompt, as Walmart words it: the widget's own instruction.
  ['activate and hold the button', 'text_activate_and_hold'],
]

/**
 * A captcha a site serves itself: its own widget script (a `/captcha/` path) on a page that asks the visitor to prove
 * they are human (studylib.net's "Security Check", 2026-10-15). Both, so a page that only loads such a script for a form
 * is not one; a page read as content never reaches this check.
 */
const SITE_CAPTCHA_PATH = '/captcha/'
const SITE_CAPTCHA_PHRASES: readonly (readonly [phrase: string, signal: string])[] = [
  ['verify you are human', 'text_verify_you_are_human'],
  ['complete the security check', 'text_complete_the_security_check'],
  ['prove you are human', 'text_prove_you_are_human'],
]
/** How far before a `/captcha/` path its <script> tag may open: the tag's other attributes and the address up to it. */
const SITE_CAPTCHA_TAG_MAX_CHARS = 1_000
/**
 * A src attribute in a tag's text, named after a space, a closing quote or a `/` as a browser reads the tag, whose
 * address runs on to the end of the text with no quote, space or `>` in it.
 */
const SRC_TO_END = /(?:^|[\s"'])\/?src\s*=\s*["']?[^"'\s>]*$/

/**
 * Whether a lowercased head loads a site's own captcha script: the path sits in the src of the nearest <script> tag that
 * opens before it and has not closed. Each path is read in a bounded window, so a page of half-open tags stays linear.
 */
function loadsSiteCaptchaScript(lower: string): boolean {
  for (let at = lower.indexOf(SITE_CAPTCHA_PATH); at !== -1; at = lower.indexOf(SITE_CAPTCHA_PATH, at + SITE_CAPTCHA_PATH.length)) {
    const before = lower.slice(Math.max(0, at - SITE_CAPTCHA_TAG_MAX_CHARS), at)
    const open = before.lastIndexOf('<script')
    if (open === -1 || before.includes('>', open)) continue
    const attributes = before.slice(open + '<script'.length)
    if (!/^\w/.test(attributes) && SRC_TO_END.test(attributes)) return true
  }
  return false
}

/** Phrases that make a login the page's purpose rather than one of its widgets. */
const LOGIN_INTENT_PHRASES: readonly string[] = [
  'sign in to continue',
  'sign in to read',
  'sign in to view',
  'log in to continue',
  'login to continue',
  'please sign in',
  'please log in',
  'subscribe to continue',
  'create an account to continue',
  'members only',
  'login required',
  'you must be logged in',
]

const PASSWORD_INPUT = /<input[^>]+type\s*=\s*["']?password/i
const TITLE_OR_H1 = /<(?:title|h1)\b[^>]*>([\s\S]{0,200}?)<\/(?:title|h1)>/gi
const BARE_LOGIN_HEADING = /^\s*(?:sign|log)\s*-?\s*in\b/i

const GEO_MARKERS: readonly (readonly [marker: string, signal: string])[] = [
  ['not available in your country', 'geo_not_in_country'],
  ['not available in your region', 'geo_not_in_region'],
  ['not available in your location', 'geo_not_in_location'],
  ['unavailable in your country', 'geo_unavailable_country'],
  ['european economic area', 'geo_eea_block'],
  ['due to legal reasons', 'geo_legal_reasons'],
]

/** Any one of these names a refusal outright. */
const BOT_STRONG_MARKERS: readonly (readonly [marker: string, signal: string])[] = [
  ['you have been blocked', 'text_you_have_been_blocked'],
  ['request unsuccessful. incapsula incident', 'text_incapsula_incident'],
  ['pardon our interruption', 'text_pardon_our_interruption'],
  ['unusual traffic from your computer network', 'text_unusual_traffic'],
  ['automated queries', 'text_automated_queries'],
  ['are you a robot', 'text_are_you_a_robot'],
  ['robot or human?', 'text_robot_or_human'],
  ['verify you are human', 'text_verify_you_are_human'],
  ['verifying you are human', 'text_verifying_you_are_human'],
  ['bot detected', 'text_bot_detected'],
  ['humans only', 'text_humans_only'],
]

/** Suggestive but not decisive: two of these, or one plus a gate-shaped status. */
const BOT_WEAK_MARKERS: readonly (readonly [marker: string, signal: string])[] = [
  ['just a moment', 'weak_just_a_moment'],
  ['please wait', 'weak_please_wait'],
  ['checking your browser', 'weak_checking_your_browser'],
  ['enable javascript and cookies', 'weak_enable_js_and_cookies'],
  ['enable javascript', 'weak_enable_javascript'],
  ['ddos protection', 'weak_ddos_protection'],
  ['security check', 'weak_security_check'],
  ['access denied', 'weak_access_denied'],
  ['access to this page has been denied', 'weak_access_to_page_denied'],
]

/**
 * Statuses that corroborate a single weak marker. 403 is here rather than in
 * the decisive set for exactly the reason stated above: alone it means nothing.
 */
const GATE_SHAPED_STATUS: readonly number[] = [403, 429, 503]

/**
 * Cloudflare injects its bot-management script into the ordinary pages of a
 * site it protects (`/cdn-cgi/challenge-platform/scripts/jsd/main.js`, with
 * `__CF$cv$params`), the page a visitor gets once through as well as any
 * other: that path alone is no challenge. Any other use of the platform's
 * path (the challenge's own `/h/.../orchestrate`) is.
 */
const CF_JSD_PATH = '/cdn-cgi/challenge-platform/scripts/jsd/'
/**
 * Cloudflare's precursor script, which it also serves on the page a visitor gets once through the challenge
 * (ember-energy.org and stackoverflow.com in the installed Chrome, 2026-10-14): like jsd, no challenge of its own.
 */
const CF_PRECURSOR_PATH = '/cdn-cgi/challenge-platform/scripts/precursor/'

/**
 * PerimeterX (HUMAN) answers a page it refuses with its press-and-hold
 * challenge: the page sets `window._pxAppId` and loads the vendor's captcha
 * script, which draws the widget into `#px-captcha`. Neither the app id nor
 * the container is the challenge alone. The sensor sets `_pxAppId` on every
 * page of a protected site (Walmart's home page, 2026-10-05), and a site
 * using in-page blocking keeps an empty `#px-captcha` on its ordinary pages
 * (the vendor's ABR sample), loading the script only once a request is
 * blocked. The script and the app id together are. Only the script's URL
 * counts: a protected page may name the captcha hosts in a CSP or preconnect.
 */
const PX_CAPTCHA_SCRIPT = /\/captcha\/captcha\.js|captcha\.px-(?:cdn|cloud)\.net\/[^"'\s<>]*captcha\.js/
const PX_CAPTCHA_CONTAINER = /<[a-z][^>]*\sid\s*=\s*["']?px-captcha(?=["'\s>/])/i

/**
 * DataDome's challenge iframe, from captcha-delivery.com or a subdomain of it: its interstitial (a device check) or its
 * captcha, by the path its src names. The tag's attributes before src are bounded, so a body of unclosed tags stays linear.
 */
const DATADOME_CHALLENGE = /<iframe\b[^>]{0,2000}?\bsrc\s*=\s*["']?https?:\/\/(?:[a-z0-9-]+\.)*captcha-delivery\.com\/(interstitial|captcha)\//i

/** The path of Imperva's challenge script, which its JS interstitial loads and its protected pages carry as well. */
const INCAPSULA_RESOURCE = '/_incapsula_resource'
/** How far before that path the script tag loading it may open: the tag's other attributes. */
const SCRIPT_TAG_MAX_CHARS = 600
/** The most text Imperva's interstitial shows beside its script: it shows none, and an article's first line is longer. */
const INTERSTITIAL_MAX_TEXT = 20

/**
 * Whether a lowercased head loads Imperva's challenge script: the path sits inside a <script> tag, the nearest tag that
 * opens before it and has not closed. Each occurrence is read in a bounded window, so a page of half-open tags stays linear.
 */
function loadsIncapsulaResource(lower: string): boolean {
  for (let at = lower.indexOf(INCAPSULA_RESOURCE); at !== -1; at = lower.indexOf(INCAPSULA_RESOURCE, at + INCAPSULA_RESOURCE.length)) {
    const before = lower.slice(Math.max(0, at - SCRIPT_TAG_MAX_CHARS), at)
    const open = before.lastIndexOf('<')
    if (open !== -1 && /^<script[\s/]/.test(before.slice(open, open + 8)) && !before.includes('>', open)) return true
  }
  return false
}

/** Whether a page is Imperva's JS interstitial: its challenge script and next to no visible text. */
function impervaInterstitial(body: string): boolean {
  return loadsIncapsulaResource(body.slice(0, HEAD_BYTES).toLowerCase()) && pageText(body, INTERSTITIAL_MAX_TEXT) !== null
}

/** The PerimeterX challenge's signals, or null when the page is not the challenge. */
function perimeterXChallenge(head: string, lower: string): string[] | null {
  if (!lower.includes('_pxappid') || !PX_CAPTCHA_SCRIPT.test(lower)) return null
  const signals = ['px_captcha_script', 'px_app_id']
  if (PX_CAPTCHA_CONTAINER.test(head)) signals.push('px_captcha_container')
  return signals
}

function challengePlatformBeyondJsd(lower: string): boolean {
  const marker = '/cdn-cgi/challenge-platform'
  for (let at = lower.indexOf(marker); at !== -1; at = lower.indexOf(marker, at + marker.length)) {
    if (!lower.startsWith(CF_JSD_PATH, at) && !lower.startsWith(CF_PRECURSOR_PATH, at)) return true
  }
  return false
}

function matched(
  haystack: string,
  table: readonly (readonly [string, string])[],
): string[] {
  const hits: string[] = []
  for (const [marker, signal] of table) {
    if (haystack.includes(marker)) hits.push(signal)
  }
  return hits
}

function headingTexts(body: string): string[] {
  const out: string[] = []
  for (const m of body.matchAll(TITLE_OR_H1)) {
    const text = m[1]?.replace(/<[^>]*>/g, ' ').trim()
    if (text) out.push(text)
  }
  return out
}

/**
 * Classify a response as a specific block, or return null when the evidence
 * does not support any gate claim.
 *
 * On a contentful 200, only decisive challenge evidence may override success.
 * Weak markers, widgets, and login forms stay null so an article that mentions
 * captcha or embeds a widget is not blocked.
 */
export function classifyGate(res: GateResponse): GateVerdict | null {
  // No response at all means a transport error, not a gate. Nothing to read.
  if (res.status === null) return null

  const head = res.body.slice(0, HEAD_BYTES)
  const lower = head.toLowerCase()
  const contentful = res.contentful === true

  // --- statuses whose meaning *is* the gate -------------------------------
  if (res.status === 429) {
    // PerimeterX serves its press-and-hold challenge with 429 on some sites
    // (Wayfair and its sibling stores, 2026-10-05). A person gets through
    // that page; waiting does not, so rate_limit (terminal, no handoff) would
    // be the wrong claim. Only the decisive challenge evidence overrides the
    // status: copy or the sensor alone leave a 429 a rate limit. The host
    // cooldown and Retry-After follow the status, not this verdict.
    const px = perimeterXChallenge(head, lower)
    if (px !== null) return { reason: 'captcha', signals: [...px, 'status_429'] }
    // Vercel, Kasada and Expedia send their challenge with 429 too, and name it in a header (K1, 2026-10-25).
    for (const [name, value, reason, signal] of CHALLENGE_429_HEADERS) {
      const got = res.header(name)?.trim().toLowerCase()
      if (got !== undefined && got !== '' && (value === null || got === value)) return { reason, signals: [signal, 'status_429'] }
    }
    return { reason: 'rate_limit', signals: ['status_429'] }
  }
  if (res.status === 451) {
    return { reason: 'geo_restricted', signals: ['status_451'] }
  }
  if (res.status === 401) {
    // DataDome can serve its human challenge with 401 (MarketWatch, T059). Its captcha iframe is more specific than the
    // status; its sensor script, device check or a look-alike host is not, and leaves the 401 as authentication.
    if (DATADOME_CHALLENGE.exec(res.body)?.[1]?.toLowerCase() === 'captcha') {
      return { reason: 'captcha', signals: ['status_401', 'datadome_captcha'] }
    }
    return { reason: 'login_wall', signals: ['status_401'] }
  }

  // --- vendor headers: decisive, no body evidence needed ------------------
  for (const [name, reason, signal] of VENDOR_HEADERS) {
    // DataDome sends `x-datadome: protected` on every page of a site it guards, the pages it lets through too (etsy.com
    // and tripadvisor.com in the installed Chrome, 2026-10-14). Its block is a 403 with x-datadome-cid and x-dd-b, so the
    // header alone names a block only on an answer that is not a success; a 2xx is judged by its body, which still names
    // DataDome's interstitial or captcha (DATADOME_CHALLENGE). A 202 meets its own rule below.
    if (name === 'x-datadome' && res.status >= 200 && res.status < 300) continue
    // Imperva sends x-iinfo on every answer of a site it fronts, and injects its _Incapsula_Resource script into the
    // pages it lets through (in-n-out.com, aaii.com and lizearle.com rendered in full with both, Firecrawl's scrape
    // content set, 2026-10-30). On a 2xx the header names a block only on its JS interstitial: a page of that script
    // and next to no text. Its refusal names itself in the body (text_incapsula_incident) or comes with a 403.
    if (name === 'x-iinfo' && res.status >= 200 && res.status < 300) {
      if (res.header(name) !== null && impervaInterstitial(res.body)) return { reason, signals: [signal, 'incapsula_resource_script', 'short_page'] }
      continue
    }
    if (res.header(name) !== null) {
      // These headers name DataDome, but its actual captcha iframe says what the person must do.
      // Keep the header as evidence without letting its generic verdict hide the specific gate.
      if (name === 'x-datadome' || name === 'x-datadome-cid') {
        const challenge = DATADOME_CHALLENGE.exec(res.body)
        if (challenge?.[1]?.toLowerCase() === 'captcha') {
          return { reason: 'captcha', signals: [signal, 'datadome_captcha'] }
        }
      }
      return { reason, signals: [signal] }
    }
  }

  // --- Cloudflare managed challenge --------------------------------------
  const cfStrong = matched(lower, CF_STRONG_MARKERS).filter((signal) => signal !== 'cf_challenge_platform_script' || challengePlatformBeyondJsd(lower))
  if (cfStrong.length > 0) {
    return { reason: 'cloudflare_challenge', signals: cfStrong }
  }
  const [cfA, cfB] = CF_INTERSTITIAL_PAIR
  if (lower.includes(cfA) && lower.includes(cfB)) {
    return { reason: 'cloudflare_challenge', signals: ['cf_interstitial_text'] }
  }

  // Amazon's 200 verification page uses a plain image/form rather than a
  // third-party widget. The form action is decisive even if surrounding text
  // happens to look contentful to a generic extractor.
  if (/<form\b[^>]*action=["'][^"']*\/errors_page\/validatecaptcha(?:[?"'])/i.test(head)) {
    return { reason: 'captcha', signals: ['amazon_validate_captcha_form'] }
  }

  // Reddit currently serves an HTTP 200 page containing a hidden form that
  // submits a JavaScript proof instead of the requested post. Both inputs
  // together identify that interstitial without mistaking article copy for it.
  if (/<form\b[^>]*\bhidden\b/i.test(head)
    && /\bname\s*=\s*["']js_challenge["']/i.test(head)
    && /\bname\s*=\s*["']jsc_token["']/i.test(head)) {
    return { reason: 'bot_detected_generic', signals: ['reddit_js_verification'] }
  }

  // Reddit's reCAPTCHA page, served with HTTP 200 (to a Chrome-like TLS client, 2026-10-06): its form sits
  // past the head behind inline images, but the page opens with this title and Google's reCAPTCHA script.
  // Neither alone: a post's title reads "… : r/sub", and a Reddit page may load reCAPTCHA for a form.
  if (/<title[^>]*>\s*reddit - prove your humanity\s*<\/title>/.test(lower) && lower.includes('google.com/recaptcha/api.js')) {
    return { reason: 'captcha', signals: ['reddit_captcha_title', 'recaptcha_script'] }
  }

  // Best Buy's country selector, served with HTTP 200 at the URL asked for to an address outside the US (2026-10-07):
  // a choice between Canada and the US, not the page. Its title with the links that skip it (intl=nosplash): neither alone.
  if (/<title[^>]*>\s*best buy international: select your country/.test(lower) && lower.includes('intl=nosplash')) {
    return { reason: 'geo_restricted', signals: ['bestbuy_country_selector'] }
  }

  // PerimeterX's press-and-hold, served with HTTP 200 (Walmart, after a 307
  // to /blocked) or 403. Its button needs a person to press and hold it: a
  // widget, not an interstitial a browser clears by running its JS.
  const px = perimeterXChallenge(head, lower)
  if (px !== null) return { reason: 'captcha', signals: px }

  // Skyscanner's dedicated 200 challenge uses a different script path and no
  // _pxAppId assignment. Its URL and rendered human-check UI agree instead.
  const skyscanner = res.status === 200 ? skyscannerChallenge(res.body, res.finalUrl) : null
  if (skyscanner !== null) return skyscanner

  // DataDome's challenge, laid over a page that rendered (StubHub from a Singapore exit, 2026-10-11): its iframe from
  // captcha-delivery.com (geo., or another subdomain) sits wherever the script put it, past the head too, so the whole body is read. The
  // interstitial (a device check the browser runs) is a bot check, the captcha a person's. Its tag alone
  // (js.datadome.co) is on pages it lets through and decides nothing.
  const dd = DATADOME_CHALLENGE.exec(res.body)
  if (dd !== null) return dd[1]!.toLowerCase() === 'captcha' ? { reason: 'captcha', signals: ['datadome_captcha'] } : { reason: 'bot_detected_generic', signals: ['datadome_interstitial'] }

  // A short page answered with a 2xx that is only a refusal of automated visitors, read past the head: such walls often
  // sit behind a page's worth of scripts (ROADMAP PA item 4). Decisive on a page read as content; on one that was not, a
  // captcha or a login form on it names the gate first, since a person can get through those.
  const wall = res.status >= 200 && res.status < 300 ? shortWallPage(res.body) : null
  if (contentful) return wall

  // --- interactive captcha widget ----------------------------------------
  // Reached only when no Cloudflare managed-challenge marker fired, so a
  // Turnstile hit here is a site that embedded the widget itself. A widget
  // needs a person, which is a different escalation than a JS interstitial.
  // A marker in the head is read as a wall only on a short page that carries
  // the widget (captchaWall).
  const captcha = matched(lower, CAPTCHA_MARKERS).length > 0 ? captchaWall(res.body) : null
  if (captcha !== null) return captcha
  const siteCaptchaText = matched(lower, SITE_CAPTCHA_PHRASES)
  if (siteCaptchaText.length > 0 && loadsSiteCaptchaScript(lower)) {
    return { reason: 'captcha', signals: ['site_captcha_script', ...siteCaptchaText] }
  }
  const interaction = interactivePage(res.body, res.finalUrl)
  if (interaction !== null) return interaction

  // --- login wall ---------------------------------------------------------
  const headings = headingTexts(head).map((h) => h.toLowerCase())
  const loginPhrases = LOGIN_INTENT_PHRASES.filter((p) => lower.includes(p))
  const bareLoginHeading = headings.some((h) => BARE_LOGIN_HEADING.test(h))
  if (PASSWORD_INPUT.test(head) && (loginPhrases.length > 0 || bareLoginHeading)) {
    const signals = ['input_password']
    if (loginPhrases.length > 0) signals.push(`text_${loginPhrases[0]!.replace(/\s+/g, '_')}`)
    if (bareLoginHeading) signals.push('heading_sign_in')
    return { reason: 'login_wall', signals }
  }

  // --- geo restriction ----------------------------------------------------
  const geo = matched(lower, GEO_MARKERS)
  if (geo.length > 0) {
    return { reason: 'geo_restricted', signals: geo }
  }

  // --- generic bot gate ---------------------------------------------------
  const botStrong = matched(lower, BOT_STRONG_MARKERS)
  if (botStrong.length > 0) {
    return { reason: 'bot_detected_generic', signals: botStrong }
  }
  const botWeak = matched(lower, BOT_WEAK_MARKERS)
  const gateShaped = GATE_SHAPED_STATUS.includes(res.status)
  if (botWeak.length >= 2 || (botWeak.length === 1 && gateShaped)) {
    const signals = [...botWeak]
    if (gateShaped) signals.push(`status_${res.status}`)
    return { reason: 'bot_detected_generic', signals }
  }

  // A 403 whose page or header names the refusal in one vendor's own terms (vendorRefusal403).
  if (res.status === 403) {
    const refusal = vendorRefusal403(res)
    if (refusal !== null) return refusal
  }

  // A 202 is suspicious — a page GET has no legitimate 202 answer — but it is
  // NOT decisive on its own: some sites answer 202 while still streaming a
  // real document. It classifies as a gate only with a second signal:
  // an empty or near-empty body (the shape of a swallowed request), another
  // gate signal already firing, or a gate-shaped header. A 202 carrying a
  // substantive page is no gate: the caller judges it from its content, like
  // any other 2xx answer.
  if (res.status === 202) {
    const bodyNearEmpty = head.trim().length <= 512
    const gateHeader = VENDOR_HEADERS.some(([name]) => res.header(name) !== null)
    if (bodyNearEmpty || botWeak.length > 0 || botStrong.length > 0 || gateHeader) {
      return {
        reason: 'bot_detected_generic',
        signals: ['status_202', ...(bodyNearEmpty ? ['empty_body'] : []), ...botWeak, ...botStrong],
      }
    }
  }

  // A short wall the checks above, which read the head, did not name: its copy past the head, or its signs only together.
  return wall
}

/** A page with no more visible text than this may be nothing but a refusal; any longer page is read for its content. */
const WALL_PAGE_MAX_TEXT = 1_500
/** Akamai's reference to a refused request, as its pages print it: "Reference #18.2f1d3e17.1791543951.6a0b2c", "Incident Number: 18.…". */
const AKAMAI_REFERENCE = /\b(?:reference|incident)\b\s*(?:number|id|no\.?)?\s*[:#]?\s*#?\s*\d{1,3}\.[0-9a-f]{6,8}\.\d{10}\.[0-9a-f]{6,12}\b/i
const UNUSUAL_ACTIVITY = /\b(?:unusual|suspicious) (?:activity|traffic)\b/i
/** A word one of the short-wall signs needs: a page without any is not read for them. */
const WALL_TRIGGER = /\b(?:reference|incident|unusual|suspicious|blocked|interruption|automated|robot|human|humans|bot|checking|wait|moment|security|ddos|denied|protected)\b/i
/** Akamai's logo as its bot check shows it, by its source on akamai.com; its name ("Akamai") also names it. */
const AKAMAI_LOGO_SOURCE = /^(?:https?:)?\/\/(?:[a-z0-9-]+\.)*akamai\.com(?:[/?#:]|$)/
/** The weak signs of a browser check; a page asking for JavaScript is a shell its scripts fill, not a wall, so those are left out. */
const WALL_WEAK_MARKERS = BOT_WEAK_MARKERS.filter(([, signal]) => signal !== 'weak_enable_js_and_cookies' && signal !== 'weak_enable_javascript')
const AUTOMATED_TRAFFIC = /\bautomated (?:traffic|access|requests|queries|browsing)\b/i
/** Elements whose content is not the page's visible text. */
const HIDDEN_ELEMENTS: ReadonlySet<string> = new Set(['script', 'style', 'noscript', 'template', 'svg'])
/** Elements whose text names the page. */
const HEADING_ELEMENTS: ReadonlySet<string> = new Set(['h1', 'h2', 'h3', 'title'])

/** Bound the additional scan, which reads controls past script-heavy heads. */
const INTERACTION_MAX_HTML = 1_000_000
const INTERACTION_MAX_TEXT = 4_000
const AUTOCOMPLETE_ATTRIBUTE = /\sautocomplete\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const ARIA_LABEL_ATTRIBUTE = /\saria-label\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const ROLE_ATTRIBUTE = /\srole\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const ID_ATTRIBUTE = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const TITLE_ATTRIBUTE = /\stitle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
/** A tag that names one of CAPTCHA_MARKERS, found before the tag is lowercased to say which. */
const CAPTCHA_MARKER = new RegExp(CAPTCHA_MARKERS.map(([marker]) => marker.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|'), 'i')
const SRC_ATTRIBUTE = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const ALT_ATTRIBUTE = /\salt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i

function attributeText(tag: string, pattern: RegExp): string {
  const match = pattern.exec(tag)
  return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').toLowerCase()
}

/** A scoped challenge route plus real heading, container and loading/rendered widget; never quoted article copy. */
function skyscannerChallenge(body: string, finalUrl: string | undefined): GateVerdict | null {
  if (finalUrl === undefined || !finalUrl.includes('/sttc/px/captcha-v2/') || body.length > INTERACTION_MAX_HTML) return null
  let url: URL
  try { url = new URL(finalUrl) } catch { return null }
  if (!['skyscanner.net', 'www.skyscanner.net'].includes(url.hostname) || url.pathname !== '/sttc/px/captcha-v2/index.html') return null
  const page = pageText(body, WALL_PAGE_MAX_TEXT, true)
  if (page === null || !page.primaryHeadings.some(heading => /^are you a person or a robot\?$/i.test(heading)) ||
    !page.controls.pxCaptcha || !(page.controls.humanChallengeFrame || page.controls.pxLoader)) return null
  return { reason: 'captcha', signals: ['skyscanner_challenge_url', 'heading_person_or_robot', 'px_captcha_container', page.controls.humanChallengeFrame ? 'human_challenge_frame' : 'px_challenge_loader'] }
}

/** The final URL, a primary heading and real controls must agree; prose or script strings alone are not a gate. */
function interactivePage(body: string, finalUrl: string | undefined): GateVerdict | null {
  if (finalUrl === undefined || body.length > INTERACTION_MAX_HTML || !/webauthn|security\s+verification/i.test(body)) return null
  let path: string
  try { path = new URL(finalUrl).pathname } catch { return null }
  const auth = /(?:^|\/)(?:login|signin|sign-in|auth)(?:[./_-]|$)/i.test(path)
  const verification = /(?:^|[/_-])verif(?:ication|y)(?:[./_-]|$)/i.test(path)
  if (!auth && !verification) return null
  const page = pageText(body, INTERACTION_MAX_TEXT, true)
  if (page === null) return null
  if (auth && page.primaryHeadings.some(heading => BARE_LOGIN_HEADING.test(heading) || /^register\s*\/\s*sign\s*-?\s*in\s*$/i.test(heading)) && page.controls.webauthn && page.controls.passkey) {
    return { reason: 'login_wall', signals: ['auth_url', 'heading_sign_in', 'input_webauthn', 'button_passkey'] }
  }
  if (verification && page.primaryHeadings.some(heading => /^security\s+verification$/i.test(heading)) &&
    page.text.toLowerCase().includes('fill each box with the required number of objects indicated') && page.controls.button && page.controls.image) {
    return { reason: 'captcha', signals: ['verification_url', 'heading_security_verification', 'object_count_instruction', 'interactive_image'] }
  }
  return null
}

/**
 * The signals of a short page, answered with a 2xx, that is only a refusal of automated visitors, or null. Two such pages
 * were read as content in the PA 4 Steel runs: Autotrader's Akamai page, whose text carries Akamai's reference to the
 * refused request, and Nordstrom's wall, whose heading reports unusual activity and whose copy refuses automated
 * traffic, 120 KB past the head the rest of the classifier reads. Each needs the page's visible text to be short
 * (WALL_PAGE_MAX_TEXT): an article quoting either is long. Not on an error status: Akamai prints the same reference on
 * its 5xx and 4xx error pages, which are the page's own answer. Akamai's bot check, which shows only its vendor's line
 * and logo while its script runs, was read as an empty page in the installed Chrome (2026-10-30). The body is read in
 * one linear pass that stops at the bound (pageText).
 */
function shortWallPage(body: string): GateVerdict | null {
  if (!WALL_TRIGGER.test(body)) return null
  const page = pageText(body)
  if (page === null) return null
  const bot = (signals: string[]): GateVerdict => ({ reason: 'bot_detected_generic', signals })
  if (AKAMAI_REFERENCE.test(page.text)) return bot(['akamai_reference', 'short_page'])
  // businesswire.com, money.usnews.com and lequipe.fr answered 200 with it, "Powered and protected by" beside Akamai's
  // logo and a privacy link: both, since the line beside another logo, or Akamai's logo alone, may be any page's.
  if (page.akamaiLogo && page.text.toLowerCase().includes('powered and protected by')) return bot(['text_powered_and_protected_by', 'akamai_logo', 'short_page'])
  if (page.headings.some((h) => UNUSUAL_ACTIVITY.test(h)) && AUTOMATED_TRAFFIC.test(page.text)) return bot(['heading_unusual_activity', 'text_automated_traffic', 'short_page'])
  // The short page's heading names a refusal outright ("Pardon Our Interruption"), or a browser check its text names
  // twice over (eBay's "Checking your browser before you access eBay" … "Please wait", T021): read in what the page
  // shows, not in its scripts, and led by a heading, since an article's prose may quote such words.
  const shown = page.text.toLowerCase()
  const named = page.headings.join('\n').toLowerCase()
  const strong = matched(named, BOT_STRONG_MARKERS)
  if (strong.length > 0) {
    // A check a person has to do (PerimeterX's press and hold) is a captcha: the handoff, not another client, gets through.
    const person = shown.includes('activate and hold the button') ? ['text_activate_and_hold'] : []
    return { reason: person.length > 0 ? 'captcha' : 'bot_detected_generic', signals: [...strong, ...person, 'short_page'] }
  }
  const weak = matched(shown, WALL_WEAK_MARKERS)
  if (weak.length >= 2 && matched(named, WALL_WEAK_MARKERS).length > 0) return bot([...weak, 'short_page'])
  return null
}

/**
 * A captcha wall, or null: a short page (WALL_PAGE_MAX_TEXT) whose purpose is the check, carrying the widget in its markup
 * or showing its prompt. Two pages the extractor found no main content in were no wall (2026-10-30): social27.com, whose
 * reCAPTCHA guards a contact form among some 14,000 characters of text, and a Shopify store's contact page, whose script
 * names the widgets' response fields in its code with no widget on the page. The signals are what the whole page carries.
 */
function captchaWall(body: string): GateVerdict | null {
  const page = pageText(body, WALL_PAGE_MAX_TEXT, false, true)
  if (page === null) return null
  const shown = page.text.toLowerCase()
  const signals = CAPTCHA_MARKERS.filter(([marker, signal]) => page.widgets.has(signal) || shown.includes(marker)).map(([, signal]) => signal)
  return signals.length > 0 ? { reason: 'captcha', signals } : null
}

/**
 * The text a page shows and the text of its headings (h1–h3, its title), roughly: markup, comments, the head's other
 * content and the content of scripts, styles, templates and SVG left out, entities decoded, whitespace collapsed. Null
 * once the visible text passes WALL_PAGE_MAX_TEXT. One pass in linear time: each tag, comment and hidden element's end is
 * found once, from where the last one ended, and an end that is missing ends the reading there (a page cut off, or one
 * built to make a scanner search again and again). It notes an image of Akamai's logo the page shows and, asked to,
 * the controls its body shows (readControls) and the captcha widgets its tags name (readWidgets).
 */
function pageText(body: string, maxText = WALL_PAGE_MAX_TEXT, readControls = false, readWidgets = false): { text: string; headings: string[]; primaryHeadings: string[]; akamaiLogo: boolean; widgets: ReadonlySet<string>; controls: { webauthn: boolean; passkey: boolean; button: boolean; image: boolean; pxCaptcha: boolean; humanChallengeFrame: boolean; pxLoader: boolean } } | null {
  // Positions are the body's own: a lowercased copy can be longer ("İ" lowercases to two characters), so tags are matched
  // case-insensitively in place.
  const visible: string[] = []
  let visibleLength = 0
  const headings: string[] = []
  const primaryHeadings: string[] = []
  const controls = { webauthn: false, passkey: false, button: false, image: false, pxCaptcha: false, humanChallengeFrame: false, pxLoader: false }
  let akamaiLogo = false
  const widgets = new Set<string>()
  let heading: { name: string; parts: string[] } | null = null
  let inHead = false
  let at = 0
  const text = (raw: string) => {
    if (raw.length === 0) return
    if (heading !== null) heading.parts.push(raw)
    if (inHead) return
    visible.push(raw)
    visibleLength += collapse(raw).length + 1
  }
  while (at < body.length) {
    const open = body.indexOf('<', at)
    if (open < 0) { text(body.slice(at)); break }
    text(body.slice(at, open))
    // Entities shorten the text once decoded, a few times at most: past four times the bound the page is long; the exact
    // bound is checked on the decoded text.
    if (visibleLength > maxText * 4) return null
    if (body.startsWith('<!--', open)) {
      const close = body.indexOf('-->', open + 4)
      if (close < 0) break
      at = close + 3
      continue
    }
    const end = body.indexOf('>', open + 1)
    if (end < 0) break
    const tag = /^<(\/?)([a-z][a-z0-9-]*)(?=[\s/>])/i.exec(body.slice(open, Math.min(end + 1, open + 64)))
    at = end + 1
    if (tag === null) continue
    const [, closing, tagName] = tag as unknown as [string, string, string]
    const name = tagName.toLowerCase()
    if (name === 'head') { inHead = closing === ''; continue }
    if (name === 'body') { inHead = false; continue }
    if (HEADING_ELEMENTS.has(name)) {
      if (closing === '') heading = { name, parts: [] }
      else if (heading !== null && heading.name === name) {
        const shown = collapse(decodeEntities(heading.parts.join(' ')))
        headings.push(shown)
        if (name === 'title' || name === 'h1') primaryHeadings.push(shown)
        heading = null
      }
      continue
    }
    // A captcha widget on the page is named by a tag, a script's in the head too; never by a script's code, skipped below.
    if (readWidgets && closing === '') {
      const tagText = body.slice(open, Math.min(end + 1, open + 2_000))
      if (CAPTCHA_MARKER.test(tagText)) for (const signal of matched(tagText.toLowerCase(), CAPTCHA_MARKERS)) widgets.add(signal)
    }
    if (!akamaiLogo && closing === '' && name === 'img' && !inHead) {
      const tagText = body.slice(open, Math.min(end + 1, open + 2_000))
      akamaiLogo = AKAMAI_LOGO_SOURCE.test(attributeText(tagText, SRC_ATTRIBUTE)) || /^akamai\b/.test(attributeText(tagText, ALT_ATTRIBUTE).trim())
    }
    if (readControls && closing === '' && !inHead && !HIDDEN_ELEMENTS.has(name)) {
      const tagText = body.slice(open, Math.min(end + 1, open + 2_000))
      if (name === 'input') {
        const autocomplete = attributeText(tagText, AUTOCOMPLETE_ATTRIBUTE).split(/\s+/)
        if (autocomplete.includes('username') && autocomplete.includes('webauthn')) controls.webauthn = true
      }
      if (name === 'button' && /\bpasskey\b/.test(attributeText(tagText, ARIA_LABEL_ATTRIBUTE))) controls.passkey = true
      if (name === 'button' || attributeText(tagText, ROLE_ATTRIBUTE) === 'button') controls.button = true
      if (name === 'img') controls.image = true
      if (name === 'div' && attributeText(tagText, ID_ATTRIBUTE) === 'px-captcha') controls.pxCaptcha = true
      if (name === 'div' && attributeText(tagText, ID_ATTRIBUTE) === 'px-loader') controls.pxLoader = true
      if (name === 'iframe' && attributeText(tagText, TITLE_ATTRIBUTE) === 'human verification challenge') controls.humanChallengeFrame = true
    }
    if (closing === '' && HIDDEN_ELEMENTS.has(name) && body[end - 1] !== '/') {
      const closer = new RegExp(`</${name}`, 'gi')
      closer.lastIndex = at
      const close = closer.exec(body)?.index ?? -1
      if (close < 0) break
      const closeEnd = body.indexOf('>', close)
      if (closeEnd < 0) break
      at = closeEnd + 1
    }
  }
  const visibleText = collapse(decodeEntities(visible.join(' ')))
  return visibleText.length > maxText ? null : { text: visibleText, headings, primaryHeadings, akamaiLogo, widgets, controls }
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    // A number past Unicode's range is left as written: fromCodePoint would throw, and the page is not ours to fail.
    const code = dec !== undefined ? Number(dec) : hex !== undefined ? parseInt(hex, 16) : null
    if (code !== null) return code <= 0x10ffff ? String.fromCodePoint(code) : whole
    return named[name!.toLowerCase()] ?? whole
  })
}

/** The line CloudFront signs its own error pages with. */
const CLOUDFRONT_SIGNATURE = 'generated by cloudfront (cloudfront)'
/** Vercel's id of a request, as its error pages print it: "sin1::ndc2g-1793343683243-5f3602af290d". */
const VERCEL_REQUEST_ID = /\b[a-z]{3}\d(?:::[a-z]{3}\d)*::[a-z0-9]{5}-\d{13}-[0-9a-f]{12}\b/
/** A word one of the pages below needs: a page without any is not read for them. */
const REFUSAL_403_TRIGGER = /block|验证解封/i

/**
 * A refusal served with 403 that names itself in one vendor's terms, or null. The bundled Chromium got these in the
 * Firecrawl scrape-content run (2026-10-30), each reported as http_error:
 *  - CloudFront's error page, signed by CloudFront, for a request AWS WAF blocked ("Request blocked."; abcauto.com,
 *    jcsc.org, oc.eco.br, similarweb.com, soundpure.com) and for its geographic restriction (soundpure.com, direct). Its
 *    page for a host it is not set up to serve ("Bad request.") is a configuration error and stays null.
 *  - Vercel's deny (superatv.com): its firewall's header, or its page's heading with Vercel's request id.
 *  - Real Geeks' page (fbrealestateco.com): the heading with "blocked this request on purpose". It names the visitor's
 *    location, a bot or a bad address as the usual causes, so it is no geo block.
 *  - A WAF's plain-text country block behind Cloudflare (orthazone.com, from Singapore and the Netherlands).
 *  - vzkoo.com's "访问受限", whose "点击验证解封" link leads to a slider a person completes: a captcha.
 * Each page is short (WALL_PAGE_MAX_TEXT), so an article quoting one is not it, and a bare 403 stays null. A page read as
 * content never reaches this: a refusal is no check to wait out.
 */
function vendorRefusal403(res: GateResponse): GateVerdict | null {
  if (res.header('x-vercel-mitigated')?.trim().toLowerCase() === 'deny') return { reason: 'bot_detected_generic', signals: ['header_x_vercel_mitigated_deny', 'status_403'] }
  if (!REFUSAL_403_TRIGGER.test(res.body)) return null
  const page = pageText(res.body)
  if (page === null) return null
  const shown = page.text.toLowerCase()
  const verdict = (reason: GateBlockReason, ...signals: string[]): GateVerdict => ({ reason, signals: [...signals, 'status_403', 'short_page'] })
  if (shown.includes(CLOUDFRONT_SIGNATURE)) {
    if (shown.includes('configured to block access from your country')) return verdict('geo_restricted', 'cloudfront_geo_restriction')
    if (/\brequest blocked\./.test(shown)) return verdict('bot_detected_generic', 'cloudfront_request_blocked')
    return null
  }
  if (page.primaryHeadings.some((heading) => /^this request was blocked$/i.test(heading))) {
    if (VERCEL_REQUEST_ID.test(page.text)) return verdict('bot_detected_generic', 'heading_request_blocked', 'vercel_request_id')
    if (shown.includes('blocked this request on purpose')) return verdict('bot_detected_generic', 'heading_request_blocked', 'text_blocked_on_purpose')
  }
  if (shown.includes('request blocked by waf. reason: country_block')) return verdict('geo_restricted', 'text_waf_country_block')
  if (shown.includes('访问受限') && shown.includes('验证解封')) return verdict('captcha', 'text_verify_to_unblock')
  return null
}

export interface GateEscalation {
  from: GateLane
  to: GateLane
  trigger: string
}

/**
 * The legitimate next lane for a given gate, or null when no lane we offer
 * would honestly help. Null is a first-class answer here: telling the caller
 * "nothing we have clears this" is the product's claim, and inventing an
 * escalation that cannot work would break it.
 *
 * Note what is deliberately absent: no path routes through defeating the gate
 * (solving the captcha, rotating IPs to evade a ban, patching the automation
 * fingerprint). Every target below is either more capability we legitimately
 * have (a real browser), the user's own access (their session), or the user's
 * own network (their proxy).
 */
export function escalationForBlock(
  reason: GateBlockReason,
  from: GateLane,
): GateEscalation | null {
  const trigger = `blocked:${reason}`
  const to = nextLane(reason, from)
  return to === null ? null : { from, to, trigger }
}

function nextLane(reason: GateBlockReason, from: GateLane): GateLane | null {
  switch (reason) {
    // Slowing down is the fix; no lane clears a rate limit, and pretending
    // otherwise would just move the hammering to a more expensive lane.
    case 'rate_limit':
      return null

    // A JS interstitial can be cleared by actually running the JS, and failing
    // that by arriving from an IP with reputation the user owns.
    case 'cloudflare_challenge':
    case 'bot_detected_generic':
      if (from === 'http') return 'browser_local'
      if (from === 'browser_local') return 'browser_proxy'
      return null

    // Needs a human. The user has one; we hand off and reuse the session.
    case 'captcha':
    case 'login_wall':
      return from === 'browser_local_authed' ? null : 'browser_local_authed'

    // The user's own proxy in the right region is the legitimate answer.
    case 'geo_restricted':
      return from === 'browser_proxy' ? null : 'browser_proxy'
  }
}
