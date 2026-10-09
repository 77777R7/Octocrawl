import { describe, expect, it } from 'vitest'
import {
  classifyGate,
  escalationForBlock,
  type GateBlockReason,
  type GateLane,
  type GateResponse,
} from '../src/gate.js'

/**
 * Gate classifier tests. Two obligations beyond "the happy cases work":
 *
 *  1. every reason the classifier declares must be reachable from a real
 *     response shape — the defect this whole change exists to fix was a
 *     contract declaring six reasons while the code could emit one. That the
 *     six below are exactly the contract's six is asserted in @w2l/bench,
 *     which is where both packages are legitimately visible (http-core stays
 *     dependency-free).
 *  2. the negative cases must stay negative. A classifier that labels every
 *     403 a bot gate is worse than no classifier, because it launders a guess
 *     as an observation.
 */

const ALL_REASONS: readonly GateBlockReason[] = [
  'cloudflare_challenge',
  'captcha',
  'rate_limit',
  'login_wall',
  'geo_restricted',
  'bot_detected_generic',
]

function res(overrides: Partial<GateResponse> & { body?: string }): GateResponse {
  const headers: Record<string, string> = {}
  return {
    status: 200,
    header: (name) => headers[name.toLowerCase()] ?? null,
    body: '',
    ...overrides,
  }
}

function withHeaders(
  headers: Record<string, string>,
  overrides: Partial<GateResponse> = {},
): GateResponse {
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v
  return res({ ...overrides, header: (name) => lower[name.toLowerCase()] ?? null })
}

const ARTICLE = `<!doctype html><html><head><title>How TLS works</title></head><body>
<article><h1>How TLS works</h1><p>A handshake negotiates cipher suites before any
application data flows. This paragraph is ordinary prose with no gate markers.</p>
</article></body></html>`

describe('classifyGate — statuses whose meaning is the gate', () => {
  it('classifies 429 as rate_limit from the status alone', () => {
    const v = classifyGate(res({ status: 429, body: '<h1>Too Many Requests</h1>' }))
    expect(v).toEqual({ reason: 'rate_limit', signals: ['status_429'] })
  })

  it('classifies 451 as geo_restricted', () => {
    expect(classifyGate(res({ status: 451 }))?.reason).toBe('geo_restricted')
  })

  it('classifies 401 as login_wall', () => {
    expect(classifyGate(res({ status: 401 }))?.reason).toBe('login_wall')
  })
})

describe('classifyGate — vendor headers are decisive', () => {
  it('names Cloudflare from cf-mitigated with no body evidence', () => {
    const v = classifyGate(withHeaders({ 'cf-mitigated': 'challenge' }, { status: 403 }))
    expect(v).toEqual({ reason: 'cloudflare_challenge', signals: ['header_cf_mitigated'] })
  })

  it('names a generic bot gate from x-datadome', () => {
    const v = classifyGate(withHeaders({ 'x-datadome': 'protected' }, { status: 403 }))
    expect(v?.reason).toBe('bot_detected_generic')
    expect(v?.signals).toContain('header_x_datadome')
  })

  it('matches vendor headers case-insensitively', () => {
    const v = classifyGate(withHeaders({ 'X-IInfo': '1-2-3' }, { status: 403 }))
    expect(v?.reason).toBe('bot_detected_generic')
  })
})

describe('classifyGate — Cloudflare interstitial', () => {
  it('names Cloudflare from the challenge-platform script path', () => {
    const v = classifyGate(
      res({ status: 403, body: '<script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script>' }),
    )
    expect(v?.reason).toBe('cloudflare_challenge')
    expect(v?.signals).toContain('cf_challenge_platform_script')
  })

  it('does not name Cloudflare from the bot-management script it injects into a site\'s ordinary pages', () => {
    // The page a visitor gets once through the challenge, as Cloudflare serves it.
    const page = `<html><head><title>Cloudflare Challenge</title></head><body><article><h1>You bypassed the challenge</h1>${ARTICLE}</article>` +
      `<script>(function(){var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';window.__CF$cv$params={r:'8c',t:'MTcy'};document.head.appendChild(a)})();</script></body></html>`
    expect(classifyGate(res({ status: 200, body: page }))).toBeNull()
    expect(classifyGate(res({ status: 200, body: page, contentful: true }))).toBeNull()
    // The challenge's own plumbing beside it still names Cloudflare.
    expect(classifyGate(res({ status: 403, body: `<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>${page}` }))?.reason).toBe('cloudflare_challenge')
  })

  it('names Cloudflare from the interstitial copy pair on a 200', () => {
    const v = classifyGate(
      res({
        status: 200,
        body: '<title>Just a moment...</title><h1>Just a moment...</h1><p>Enable JavaScript and cookies to continue.</p>',
      }),
    )
    expect(v).toEqual({ reason: 'cloudflare_challenge', signals: ['cf_interstitial_text'] })
  })

  it('does not name Cloudflare from half the copy pair alone', () => {
    // "Just a moment" without the JS/cookies line is only a weak signal, and a
    // 200 is not a gate-shaped status, so nothing should fire.
    expect(classifyGate(res({ status: 200, body: '<p>Just a moment, loading your cart…</p>' }))).toBeNull()
  })

  it('still names Cloudflare on a contentful 200 with challenge-platform plumbing', () => {
    const v = classifyGate(
      res({
        status: 200,
        contentful: true,
        body:
          '<script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script>' +
          `<article><h1>Just a moment...</h1>${ARTICLE.repeat(2)}</article>`,
      }),
    )
    expect(v?.reason).toBe('cloudflare_challenge')
    expect(v?.signals).toContain('cf_challenge_platform_script')
  })

  it('does not treat an embedded widget as a gate once extraction succeeded', () => {
    expect(
      classifyGate(
        res({
          status: 200,
          contentful: true,
          body: `${ARTICLE}<div class="g-recaptcha" data-sitekey="abc"></div>`,
        }),
      ),
    ).toBeNull()
  })
})

describe('classifyGate — captcha widgets are distinct from interstitials', () => {
  it('classifies the Amazon human-verification form served with HTTP 200', () => {
    const body = '<html><title>Amazon.com</title><form method="get" action="/errors_page/validateCaptcha"><input name="amzn" /></form></html>'
    expect(classifyGate(res({ status: 200, body }))).toEqual({ reason: 'captcha', signals: ['amazon_validate_captcha_form'] })
    expect(classifyGate(res({ status: 200, body, contentful: true }))?.reason).toBe('captcha')
  })
  it('classifies a standalone reCAPTCHA widget as captcha', () => {
    const v = classifyGate(
      res({ status: 403, body: '<div class="g-recaptcha" data-sitekey="abc"></div>' }),
    )
    expect(v?.reason).toBe('captcha')
  })

  it('classifies an hCaptcha widget as captcha', () => {
    expect(
      classifyGate(res({ status: 200, body: '<script src="https://hcaptcha.com/1/api.js"></script>' }))
        ?.reason,
    ).toBe('captcha')
  })

  it('prefers the Cloudflare verdict when a managed challenge also embeds Turnstile', () => {
    // Vendor plumbing wins over the widget: the interstitial is the gate, and
    // its escalation path (run the JS) differs from a widget needing a person.
    const v = classifyGate(
      res({
        status: 403,
        body: '<script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script><div class="cf-turnstile"></div>',
      }),
    )
    expect(v?.reason).toBe('cloudflare_challenge')
  })
})

describe('classifyGate — PerimeterX press-and-hold', () => {
  // Shaped like the page Walmart served with HTTP 200 on 2026-10-05, which the
  // browser lane returned as success. The reason is captcha, not
  // bot_detected_generic: the button needs a person to press and hold it, and
  // the browser lane had already run the page's JS when it got this page. That
  // is what this file calls a widget (escalation: hand off to the person), not
  // an interstitial a browser clears by running it.
  const PX_SENSOR = "<script>window._pxAppId='PXu6b0qd2S'</script><script src=\"/px/PXu6b0qd2S/init.js\" async></script>"
  const PX_PAGE = `<html lang="en"><head><title>Robot or human?</title>
<script>window._pxAppId = 'PXu6b0qd2S'; window._pxFirstPartyEnabled = true;
var captchajs = "/px/" + window._pxAppId + "/captcha/captcha.js?a=c&m=0&g=b"</script></head><body>
<h1 class="heading">Robot or human?</h1>
<div class="re-captcha"><p class="bot-message" id=message>Activate and hold the button to confirm that you’re human. Thank You!</p>
<div id="px-captcha" style="margin:16px"></div></div><script id="blockScript"></script></body></html>`

  it('names the challenge captcha from its app id and captcha script, even once extraction found a body', () => {
    const want = { reason: 'captcha', signals: ['px_captcha_script', 'px_app_id', 'px_captcha_container'] }
    expect(classifyGate(res({ status: 200, body: PX_PAGE }))).toEqual(want)
    expect(classifyGate(res({ status: 200, body: PX_PAGE, contentful: true }))).toEqual(want)
  })

  it('names the stock block template, whose widget the captcha script draws later', () => {
    const body = `<head><meta name="description" content="px-captcha"><title>Access to this page has been denied</title></head><body><script>
window._pxAppId = 'PXHYx10rg3'; var pxCaptchaSrc = '/HYx10rg3/captcha/captcha.js?a=c&u=1&v=&m=0';
script.src = 'https://captcha.px-cloud.net/PXHYx10rg3/captcha.js?a=c';</script></body>`
    expect(classifyGate(res({ status: 403, body, contentful: true }))).toEqual({ reason: 'captcha', signals: ['px_captcha_script', 'px_app_id'] })
  })

  it('names the stock block template captcha when it is served with 429, keeping the status as a signal', () => {
    // Wayfair and its sibling stores served exactly this shape with HTTP 429
    // and no Retry-After on 2026-10-05. A person can get through it; slowing
    // down does not, so rate_limit (terminal, no handoff) would be the wrong claim.
    const body = `<head><meta name="description" content="px-captcha"><title>Access to this page has been denied</title></head><body><script>
window._pxAppId = 'PX3Vk96I6i'; var pxCaptchaSrc = '/3Vk96I6i/captcha/captcha.js?a=c&u=1&v=&m=0';
script.src = 'https://captcha.px-cloud.net/PX3Vk96I6i/captcha.js?a=c';</script></body>`
    const want = { reason: 'captcha', signals: ['px_captcha_script', 'px_app_id', 'status_429'] }
    expect(classifyGate(res({ status: 429, body }))).toEqual(want)
    expect(classifyGate(res({ status: 429, body, contentful: true }))).toEqual(want)
    expect(classifyGate(withHeaders({ 'retry-after': '30' }, { status: 429, body }))).toEqual(want)
  })

  it('keeps a 429 rate_limit when it carries only the sensor or the copy, not the challenge', () => {
    const rateLimit = { reason: 'rate_limit', signals: ['status_429'] }
    expect(classifyGate(res({ status: 429, body: `<h1>Too Many Requests</h1>${PX_SENSOR}` }))).toEqual(rateLimit)
    expect(classifyGate(res({ status: 429, body: '<h1>Robot or human?</h1><p>Activate and hold the button to confirm that you’re human.</p>' }))).toEqual(rateLimit)
  })

  it('names the page from its copy alone when no PerimeterX plumbing survived, on a page with no content', () => {
    const copy = '<h1>Robot or human?</h1><p>Activate and hold the button to confirm that you’re human. Thank You!</p>'
    expect(classifyGate(res({ status: 200, body: copy }))).toEqual({ reason: 'captcha', signals: ['text_activate_and_hold'] })
    expect(classifyGate(res({ status: 200, body: '<h1>Robot or human?</h1>' }))).toEqual({ reason: 'bot_detected_generic', signals: ['text_robot_or_human'] })
    // Read as content, the copy is decisive only on a short page led by it (ROADMAP PA item 4); an article ignores it.
    expect(classifyGate(res({ status: 200, body: copy, contentful: true }))).toEqual({ reason: 'captcha', signals: ['text_robot_or_human', 'text_activate_and_hold', 'short_page'] })
    const article = `<article>${copy}${'<p>An ordinary paragraph of a long article about the web and its checks.</p>'.repeat(30)}</article>`
    expect(classifyGate(res({ status: 200, body: article, contentful: true }))).toBeNull()
  })

  it('does not block an ordinary article that says "robot or human" in its prose', () => {
    const body = ARTICLE.replace('<p>A handshake', '<p>Robot or human? The question opens every handshake. A handshake')
    expect(classifyGate(res({ status: 200, body, contentful: true }))).toBeNull()
  })

  it('does not take the sensor every protected page carries for the challenge', () => {
    // Walmart's home page carried exactly this on 2026-10-05.
    const page = `${ARTICLE}${PX_SENSOR}`
    expect(classifyGate(res({ status: 200, body: page }))).toBeNull()
    expect(classifyGate(res({ status: 200, body: page, contentful: true }))).toBeNull()
    // Nor an in-page (ABR) placeholder the site keeps hidden until a request is blocked.
    const abr = `${page}<div class="modalWindow"><h5>We think you might be a bot...</h5><div id="px-captcha"></div></div>`
    expect(classifyGate(res({ status: 200, body: abr, contentful: true }))).toBeNull()
    // Nor the captcha hosts named in a CSP or a preconnect, with no script loaded from them.
    const hosts = `<meta http-equiv="Content-Security-Policy" content="script-src 'self' captcha.px-cdn.net captcha.px-cloud.net">` +
      `<link rel="preconnect" href="https://captcha.px-cdn.net">${page}`
    expect(classifyGate(res({ status: 200, body: hosts, contentful: true }))).toBeNull()
  })
})

describe('classifyGate — login wall needs structure, not a keyword', () => {
  it('classifies a sign-in-to-continue page with a password field', () => {
    const v = classifyGate(
      res({
        status: 200,
        body: `<title>Sign in</title><h1>Sign in to continue reading</h1>
<form method="post"><input name="email"><input name="password" type="password"></form>`,
      }),
    )
    expect(v?.reason).toBe('login_wall')
    expect(v?.signals).toContain('input_password')
  })

  it('does not classify a login intent phrase without a password field', () => {
    // A teaser that says "sign in to continue" but ships no form is not the
    // wall itself; extraction may still have legitimately failed for other reasons.
    expect(
      classifyGate(res({ status: 200, body: '<p>Please sign in to continue.</p>' })),
    ).toBeNull()
  })

  it('does not classify a password field without login intent', () => {
    expect(
      classifyGate(res({ status: 200, body: '<form><input type="password"></form>' })),
    ).toBeNull()
  })
})

describe('classifyGate — geo restriction', () => {
  it('classifies a country block from body copy', () => {
    const v = classifyGate(
      res({ status: 200, body: '<h1>This video is not available in your country.</h1>' }),
    )
    expect(v?.reason).toBe('geo_restricted')
  })
})

describe('classifyGate — generic bot gate thresholds', () => {
  it('recognizes the Reddit JavaScript verification form even with HTTP 200', () => {
    const body = `<html><head><title>Reddit</title></head><body>
      <form hidden method="GET" action="/r/example/comments/post/">
        <input type="hidden" name="solution" />
        <input type="hidden" name="js_challenge" value="1" />
        <input type="hidden" name="jsc_token" value="test-token" />
      </form></body></html>`
    expect(classifyGate(res({ status: 200, body }))).toEqual({ reason: 'bot_detected_generic', signals: ['reddit_js_verification'] })
    expect(classifyGate(res({ status: 200, body, contentful: true }))?.reason).toBe('bot_detected_generic')
  })
  it('recognizes the Reddit reCAPTCHA page even with HTTP 200 and its form past the head', () => {
    // Served to a Chrome-like TLS client on 2026-10-06 (www.reddit.com/r/datascience/): 167 KB, mostly two
    // inline images, with the form at byte 166 000. The title and the reCAPTCHA script open the page.
    const filler = `<img src="data:image/png;base64,${'A'.repeat(80_000)}" />`
    const body = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
      <title>Reddit - Prove your humanity</title>
      <script src="https://www.google.com/recaptcha/api.js"></script></head>
      <body><div class="header">${filler}</div><div class="main"><h1>Prove your humanity</h1>
      <p>We're committed to safety and security. But not for bots. Complete the challenge below and let us know you're a real person.</p>
      <form method="POST" action="/r/datascience/?captcha=1"><div class="g-recaptcha" data-callback="submit"></div></form></div></body></html>`
    const expected = { reason: 'captcha', signals: ['reddit_captcha_title', 'recaptcha_script'] }
    expect(classifyGate(res({ status: 200, body }))).toEqual(expected)
    expect(classifyGate(res({ status: 200, body, contentful: true }))).toEqual(expected)
    // Either alone is not the page: a Reddit page that loads reCAPTCHA for a form, or a post about the phrase.
    expect(classifyGate(res({ status: 200, body: body.replace('Reddit - Prove your humanity', 'How do you prove your humanity online? : r/AskReddit'), contentful: true }))).toBeNull()
    expect(classifyGate(res({ status: 200, body: body.replace('https://www.google.com/recaptcha/api.js', 'https://www.redditstatic.com/app.js'), contentful: true }))).toBeNull()
  })
  it('recognizes Best Buy\'s country selector, served with HTTP 200 in place of the page to an address outside the US', () => {
    // Served to the compatible transport through a non-US exit on 2026-10-07 (www.bestbuy.com/site/searchpage.jsp?st=laptop):
    // the URL unchanged, the page a choice between Canada and the US, with links that skip it (intl=nosplash).
    const body = `<!doctype html><html class="no-js" lang="en"><head><meta charset="utf-8">
      <meta name="keywords" content=" best buy international, best buy countries" />
      <title>Best Buy International: Select your Country - Best Buy</title></head>
      <body><div class="country-selection"><h1>Choose a country.</h1>
      <a class="canada-link" href="#">Canada</a><a class="us-link" href="#">United States</a>
      <p>International customers can shop on www.bestbuy.com and have orders shipped to any U.S. address or U.S. store.
      <a href="https://www.bestbuy.com/site/help-topics/international-orders/pcmcat204400050019.c?id=pcmcat204400050019&intl=nosplash">See More Details</a></p></div></body></html>`
    const expected = { reason: 'geo_restricted', signals: ['bestbuy_country_selector'] }
    expect(classifyGate(res({ status: 200, body }))).toEqual(expected)
    expect(classifyGate(res({ status: 200, body, contentful: true }))).toEqual(expected)
    // Either alone is not the selector: Best Buy's page about international orders, or another site's country page.
    expect(classifyGate(res({ status: 200, body: body.replace('Best Buy International: Select your Country - Best Buy', 'International Orders - Best Buy'), contentful: true }))).toBeNull()
    expect(classifyGate(res({ status: 200, body: body.replaceAll('intl=nosplash', 'ref=help'), contentful: true }))).toBeNull()
  })
  it('fires on a single strong refusal marker', () => {
    const v = classifyGate(res({ status: 403, body: '<h1>You have been blocked</h1>' }))
    expect(v?.reason).toBe('bot_detected_generic')
    expect(v?.signals).toEqual(['text_you_have_been_blocked'])
  })

  it('fires on two weak markers even with an ordinary status', () => {
    const v = classifyGate(
      res({ status: 200, body: '<p>Please wait</p><p>Security check in progress</p>' }),
    )
    expect(v?.reason).toBe('bot_detected_generic')
    expect(v?.signals.length).toBeGreaterThanOrEqual(2)
  })

  it('fires on one weak marker when the status is gate-shaped', () => {
    const v = classifyGate(res({ status: 403, body: '<p>Please wait</p>' }))
    expect(v?.reason).toBe('bot_detected_generic')
    expect(v?.signals).toContain('status_403')
  })

  it('does NOT fire on one weak marker with an ordinary status', () => {
    expect(classifyGate(res({ status: 200, body: '<p>Please wait</p>' }))).toBeNull()
  })

  it('classifies a 202 with an empty body as a swallowed request', () => {
    const v = classifyGate(res({ status: 202, body: '' }))
    expect(v?.reason).toBe('bot_detected_generic')
    expect(v?.signals).toContain('status_202')
    expect(v?.signals).toContain('empty_body')
  })

  it('classifies a 202 with a near-empty body as a swallowed request', () => {
    const v = classifyGate(res({ status: 202, body: '<html><body><div id="root"></div></body></html>' }))
    expect(v?.reason).toBe('bot_detected_generic')
  })

  it('classifies a 202 carrying another gate signal as a gate', () => {
    const v = classifyGate(res({ status: 202, body: 'Just a moment while we check your browser' }))
    expect(v?.reason).toBe('bot_detected_generic')
    expect(v?.signals).toContain('status_202')
  })

  it('does NOT classify a 202 that actually carries a substantive page — multi-signal rule', () => {
    // A site may answer 202 and still stream a real document. Without an
    // empty body or another gate signal, upstream judges it from its content.
    expect(classifyGate(res({ status: 202, body: ARTICLE.repeat(20) }))).toBeNull()
  })
})

describe('classifyGate — a short page that refuses automated visitors (ROADMAP PA item 4)', () => {
  // Shapes of two 200 answers read as content in the PA 4 Steel runs: Autotrader's Akamai page and Nordstrom's wall,
  // whose copy sits past 120 KB of scripts.
  const akamai = `<!doctype html><html><head><title>Autotrader - page unavailable</title></head><body><div class="wrap">
<img src="/akamai-block/block-images/error-message-icon.png" alt=""><h1>We're sorry for any inconvenience, but the site is currently unavailable.</h1>
<p>Please <a href="#">contact our support team</a> for help.</p><p><b>Thank you!</b> Our engineers will investigate your issue.</p>
<div id="incidentId"><p><span>Incident Number: 18.90ac3017.1791543951.f255f62e</span></p></div></div></body></html>`
  const accessDenied = '<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY><H1>Access Denied</H1>You don\'t have permission to access "http&#58;&#47;&#47;www&#46;example&#46;com&#47;" on this server.<P>Reference&#32;&#35;18&#46;2f1d3e17&#46;1791543951&#46;6a0b2c</BODY></HTML>'
  const wall = `<!doctype html><html><head><title>Nordstrom</title><script>${'window.__data = "x";'.repeat(6000)}</script></head><body>
<header><a href="/"><svg viewBox="0 0 10 10"><path d="M0 0h10v10z"></path></svg></a></header>
<main><h1 class="header">We've noticed some unusual activity</h1><p class="copy">If you are an individual customer, and you believe this is a mistake, contact our Customer Service.</p>
<p>To keep our site secure, we don’t allow unidentified, automated traffic. If you’d like access to our data via automation, apply to join our affiliate network!</p></main>
<footer>© 2026 Example, Inc.</footer></body></html>`

  it('names an Akamai refusal by its reference number on a short page, read as content or not', () => {
    for (const contentful of [true, false]) {
      expect(classifyGate(res({ body: akamai, contentful }))).toEqual({ reason: 'bot_detected_generic', signals: ['akamai_reference', 'short_page'] })
    }
    expect(classifyGate(res({ body: accessDenied, contentful: true }))?.signals).toContain('akamai_reference')
  })

  it('names a wall whose heading reports unusual activity and whose copy refuses automated traffic, past the head it reads', () => {
    expect(wall.indexOf('unusual activity')).toBeGreaterThan(65_536)
    for (const contentful of [true, false]) {
      expect(classifyGate(res({ body: wall, contentful }))).toEqual({ reason: 'bot_detected_generic', signals: ['heading_unusual_activity', 'text_automated_traffic', 'short_page'] })
    }
  })

  it('reads only what a page shows: its text past scripts, styles, templates, SVG and comments, entities decoded, within 1,500 characters', () => {
    const short = (inner: string) => `<html><head><title>Notice</title></head><body><h1>We've noticed some unusual activity</h1>${inner}<p>We don’t allow automated traffic.</p></body></html>`
    const bulk = 'x'.repeat(2_000)
    // Hidden content of any length leaves the page short; a self-closing SVG hides nothing after it.
    for (const hidden of [`<script>var s = "${bulk}"</script>`, `<style>.a{content:"${bulk}"}</style>`, `<noscript>${bulk}</noscript>`, `<template>${bulk}</template>`, `<svg><text>${bulk}</text></svg>`, `<!-- a > b ${bulk} -->`]) {
      expect(classifyGate(res({ body: short(hidden), contentful: true }))?.reason, hidden.slice(0, 12)).toBe('bot_detected_generic')
    }
    // A custom element named like one is visible text, and so is the text after a self-closing SVG.
    expect(classifyGate(res({ body: short(`<svg-icon>${bulk}</svg-icon>`), contentful: true }))).toBeNull()
    expect(classifyGate(res({ body: `<html><body><h1>Unusual activity</h1><p>No automated traffic.</p><svg viewBox="0 0 1 1"/><p>${bulk}</p></body></html>`, contentful: true }))).toBeNull()
    // The bound: about 1,400 characters of text is short, about 1,600 is not.
    expect(classifyGate(res({ body: short(`<p>${'word '.repeat(270)}</p>`), contentful: true }))?.reason).toBe('bot_detected_generic')
    expect(classifyGate(res({ body: short(`<p>${'word '.repeat(310)}</p>`), contentful: true }))).toBeNull()
    // A character whose lowercase is longer ("İ") does not shift where the reader finds the page's tags.
    expect(classifyGate(res({ body: short('<p>İstanbul mağazası</p>').replace('<title>Notice</title>', '<title>İ Notice</title>'), contentful: true }))?.reason).toBe('bot_detected_generic')
    expect(classifyGate(res({ body: `<html><head><title>İ</title></head><BODY><H1>Unusual activity</H1><SCRIPT>var a = "${'x'.repeat(3_000)}"</SCRIPT><P>No automated traffic.</P></BODY></html>`, contentful: true }))?.reason).toBe('bot_detected_generic')
    // Entities, hexadecimal and named, are read as what they show.
    expect(classifyGate(res({ body: '<html><body><h1>Error</h1><p>Reference&#x20;&#x23;18&#x2e;2f1d3e17&#x2e;1791543951&#x2e;6a0b2c</p></body></html>', contentful: true }))?.signals).toContain('akamai_reference')
    expect(classifyGate(res({ body: '<html><body><h1>Unusual&nbsp;activity</h1><p>No automated requests, please.</p></body></html>', contentful: true }))?.reason).toBe('bot_detected_generic')
  })

  it('takes the wording in each of its forms: a title or any heading, traffic or activity, and each kind of automation', () => {
    const page = (head: string, h: string, copy: string) => `<html><head><title>${head}</title></head><body>${h}<p>${copy}</p></body></html>`
    for (const [head, h, copy] of [
      ['Suspicious activity', '', 'We block automated access to this site.'],
      ['Shop', '<h2>Unusual traffic detected</h2>', 'Our systems noticed automated requests.'],
      ['Shop', '<h3>Suspicious traffic</h3>', 'We do not serve automated queries.'],
      ['Shop', '<h1>Unusual activity</h1>', 'Automated browsing is not allowed.'],
    ] as const) expect(classifyGate(res({ body: page(head, h, copy), contentful: true }))?.reason, h || head).toBe('bot_detected_generic')
    // The wording in the copy alone, not in a heading, is not enough.
    expect(classifyGate(res({ body: page('Shop', '<h1>Shop</h1>', 'We saw unusual activity and block automated traffic.'), contentful: true }))).toBeNull()
  })

  it('names Akamai only by a reference in its own shape, and only on a page answered with a 2xx', () => {
    for (const ref of ['See the reference: Version 18.90ac3017.1791543951.f255f62e', 'Reference #18.2f1d3e17.17915.6a0b2c', 'Reference #18.zzzzzzzz.1791543951.6a0b2c']) {
      expect(classifyGate(res({ body: `<html><body><h1>Notes</h1><p>${ref}</p></body></html>`, contentful: true })), ref).toBeNull()
    }
    // Akamai prints the same reference on its error pages, which are the page's own answer.
    const gatewayTimeout = '<HTML><HEAD><TITLE>Gateway Timeout</TITLE></HEAD><BODY><H1>Gateway Timeout</H1>The proxy server did not receive a timely response from the upstream server.<P>Reference&#32;&#35;1&#46;ad5732b8&#46;1524839189&#46;5bb6380</BODY></HTML>'
    for (const status of [400, 404, 500, 503, 504]) {
      for (const contentful of [true, false]) expect(classifyGate(res({ status, body: gatewayTimeout, contentful })), `${status}`).toBeNull()
    }
    // Any 2xx answer, not only a 200.
    expect(classifyGate(res({ status: 203, body: akamai, contentful: true }))?.signals).toContain('akamai_reference')
  })

  it('names a short page whose shown text is a refusal or a browser check, read as content or not', () => {
    // eBay's check, served with 200 and read as content in the PA 4 Steel run (T021).
    const ebay = '<html><head><title>Security Measure</title></head><body><h1>Checking your browser before you access eBay.</h1><p>Your browser will redirect to your requested content shortly.</p><p>Please wait...</p><p><b>Reference ID:</b> c47472ca-dfd0-4932-9b1c-f9186444a034</p></body></html>'
    expect(classifyGate(res({ body: ebay, contentful: true }))).toEqual({ reason: 'bot_detected_generic', signals: ['weak_please_wait', 'weak_checking_your_browser', 'short_page'] })
    const pardon = '<html><body><h1>Pardon Our Interruption</h1><p>As you were browsing something about your browser made us think you were a bot.</p></body></html>'
    expect(classifyGate(res({ body: pardon, contentful: true }))).toEqual({ reason: 'bot_detected_generic', signals: ['text_pardon_our_interruption', 'short_page'] })
    // Every refusal named in a heading, each page holding no other word the scan is drawn to.
    for (const [heading, signal] of [
      ['You have been blocked', 'text_you_have_been_blocked'],
      ['Pardon our interruption', 'text_pardon_our_interruption'],
      ['Request unsuccessful. Incapsula incident ID 1234', 'text_incapsula_incident'],
      ['Unusual traffic from your computer network', 'text_unusual_traffic'],
      ['Automated queries', 'text_automated_queries'],
      ['Are you a robot?', 'text_are_you_a_robot'],
      ['Verify you are human', 'text_verify_you_are_human'],
      ['Bot detected', 'text_bot_detected'],
      ['Humans only', 'text_humans_only'],
    ]) {
      const page = `<html><body><h1>${heading}</h1><p>Complete the form below to continue to the site.</p></body></html>`
      expect(classifyGate(res({ body: page, contentful: true })), heading).toEqual({ reason: 'bot_detected_generic', signals: [signal, 'short_page'] })
    }
    // Two signs of a check that share their one word.
    expect(classifyGate(res({ body: '<html><body><h1>Access denied</h1><p>Access to this page has been denied.</p></body></html>', contentful: true }))).toEqual({ reason: 'bot_detected_generic', signals: ['weak_access_denied', 'weak_access_to_page_denied', 'short_page'] })
    // One weak sign is not enough; a script-built page asking for JavaScript is a shell, not a wall; a long page quoting a check is content.
    expect(classifyGate(res({ body: '<html><body><h1>Your account</h1><p>Please wait while we load your orders.</p></body></html>', contentful: true }))).toBeNull()
    expect(classifyGate(res({ body: '<html><body><div id="root"><p>Please enable JavaScript to use this app. Please wait while it loads.</p></div></body></html>', contentful: true }))).toBeNull()
    expect(classifyGate(res({ body: `<html><body><article><h1>Bot walls</h1><p>Sites ask you to verify you are human.</p>${'<p>An ordinary paragraph of a long article about the web.</p>'.repeat(40)}</article></body></html>`, contentful: true }))).toBeNull()
    // One weak sign in a heading is not enough, and a heading asking for JavaScript is a shell's, not a check's.
    expect(classifyGate(res({ body: '<html><body><h1>Security check</h1><p>Review the devices signed in to your account.</p></body></html>', contentful: true }))).toBeNull()
    expect(classifyGate(res({ body: '<html><body><h1>Please enable JavaScript</h1><p>Please wait while the app loads.</p></body></html>', contentful: true }))).toBeNull()
    expect(classifyGate(res({ body: '<html><body><h1>Enable JavaScript and cookies to continue</h1><p>Please wait while the app loads.</p></body></html>', contentful: true }))).toBeNull()
    // A refusal quoted in a short article's prose, not in a heading, does not make it a wall.
    expect(classifyGate(res({ body: '<html><body><h1>Field notes</h1><p>One site asked me to verify you are human, then let me in. Please wait for it, I thought, and checking your browser is what it did.</p></body></html>', contentful: true }))).toBeNull()
    // The words in a script are not what the page shows.
    expect(classifyGate(res({ body: '<html><body><h1>Shop</h1><p>Our new arrivals are in.</p><script>var msg = "checking your browser, please wait"</script></body></html>', contentful: true }))).toBeNull()
  })

  it('leaves a captcha or a login form on such a page to the gate a person can get through', () => {
    const captcha = '<html><body><h1>Unusual traffic detected</h1><p>Our systems detected automated requests from your network. Complete the check below to continue.</p><form><div class="g-recaptcha" data-sitekey="6Lc"></div></form></body></html>'
    expect(classifyGate(res({ body: captcha }))?.reason).toBe('captcha')
    const login = '<html><body><h1>We noticed suspicious activity</h1><p>To protect your account from automated access, please sign in to continue.</p><form><input type="password"></form></body></html>'
    expect(classifyGate(res({ body: login }))?.reason).toBe('login_wall')
    // A wall cut off mid-page is still read up to where it ends.
    expect(classifyGate(res({ body: '<html><body><h1>Unusual activity</h1><p>No automated traffic.</p><script>var never = "closed', contentful: true }))?.reason).toBe('bot_detected_generic')
  })

  it('leaves long pages, and short ones with half the evidence, to the rest of the classifier', () => {
    const long = (inner: string) => `<html><body><article>${inner}${'<p>A long article goes on about traffic, security and the web at length, paragraph after paragraph.</p>'.repeat(30)}</article></body></html>`
    // An article about bot walls quotes both the heading and the copy, and an Akamai reference.
    expect(classifyGate(res({ body: long('<h2>We have noticed some unusual activity</h2><p>Sites refuse automated traffic.</p><p>Reference #18.2f1d3e17.1791543951.6a0b2c</p>'), contentful: true }))).toBeNull()
    // A short notice about unusual activity on an account, with no word on automation.
    expect(classifyGate(res({ body: '<html><body><h1>Unusual activity on your account</h1><p>We sent a code to your phone to confirm it is you.</p></body></html>', contentful: true }))).toBeNull()
    // A short page that speaks of automated traffic without reporting unusual activity.
    expect(classifyGate(res({ body: '<html><body><h1>Data API</h1><p>Automated traffic is welcome through our API: see the API reference and ask for a key.</p></body></html>', contentful: true }))).toBeNull()
    // Entities past Unicode's range do not break the reading.
    expect(classifyGate(res({ body: '<html><body><h1>Unusual activity</h1><p>&#99999999; &#x110000; no automation here</p></body></html>', contentful: true }))).toBeNull()
    // A short page with a dotted number that is not a reference.
    expect(classifyGate(res({ body: '<html><body><h1>Release notes</h1><p>Version 18.90ac3017.1791543951.f255f62e is out.</p></body></html>', contentful: true }))).toBeNull()
  })
})

describe('classifyGate — negatives that must stay negative', () => {
  it('returns null for a bare 403 with no gate evidence', () => {
    // The whole honesty rule in one test: 403 alone is indistinguishable from
    // an ordinary permission error, so the caller keeps reporting http_error.
    expect(classifyGate(res({ status: 403, body: '<h1>403 Forbidden</h1><hr>nginx' }))).toBeNull()
  })

  it('returns null for a 500', () => {
    expect(classifyGate(res({ status: 500, body: '<h1>Internal Server Error</h1>' }))).toBeNull()
  })

  it('returns null for a 404', () => {
    expect(classifyGate(res({ status: 404, body: '<h1>Not Found</h1>' }))).toBeNull()
  })

  it('returns null for an ordinary article', () => {
    expect(classifyGate(res({ status: 200, body: ARTICLE }))).toBeNull()
  })

  it('returns null when there was no response at all', () => {
    expect(classifyGate(res({ status: null, body: '' }))).toBeNull()
  })

  it('returns null for an empty 200', () => {
    expect(classifyGate(res({ status: 200, body: '' }))).toBeNull()
  })
})

describe('every declared BlockReason is reachable', () => {
  // The regression guard for the defect this change fixes: a vocabulary that
  // declares reasons the code cannot emit. If a reason is added without a
  // classification path, this fails.
  const REACHED: ReadonlyArray<readonly [GateBlockReason, GateResponse]> = [
    ['rate_limit', res({ status: 429 })],
    ['geo_restricted', res({ status: 451 })],
    ['login_wall', res({ status: 401 })],
    ['cloudflare_challenge', withHeaders({ 'cf-mitigated': 'challenge' }, { status: 403 })],
    ['captcha', res({ status: 403, body: '<div class="g-recaptcha"></div>' })],
    ['bot_detected_generic', res({ status: 403, body: '<h1>You have been blocked</h1>' })],
  ]

  it.each(REACHED.map(([reason, input]) => [reason, input] as const))(
    'emits %s from a real response shape',
    (reason, input) => {
      expect(classifyGate(input)?.reason).toBe(reason)
    },
  )

  it('covers every reason the classifier can name', () => {
    expect([...REACHED.map(([r]) => r)].sort()).toEqual([...ALL_REASONS].sort())
  })

  it('never returns an empty signal list', () => {
    for (const [, input] of REACHED) {
      expect(classifyGate(input)!.signals.length).toBeGreaterThan(0)
    }
  })
})

describe('escalationForBlock — legitimate paths only', () => {
  it('offers the browser lane for an http-lane interstitial', () => {
    expect(escalationForBlock('cloudflare_challenge', 'http')).toEqual({
      from: 'http',
      to: 'browser_local',
      trigger: 'blocked:cloudflare_challenge',
    })
  })

  it('offers the user-owned proxy once the browser lane is already blocked', () => {
    expect(escalationForBlock('cloudflare_challenge', 'browser_local')?.to).toBe('browser_proxy')
  })

  it('offers a human handoff for a captcha rather than solving it', () => {
    expect(escalationForBlock('captcha', 'http')?.to).toBe('browser_local_authed')
  })

  it('offers a human handoff for a login wall', () => {
    expect(escalationForBlock('login_wall', 'browser_local')?.to).toBe('browser_local_authed')
  })

  it('offers the user-owned proxy for a geo block', () => {
    expect(escalationForBlock('geo_restricted', 'http')?.to).toBe('browser_proxy')
  })

  it('offers NOTHING for a rate limit — slowing down is the fix, not a lane', () => {
    for (const lane of ['http', 'browser_local', 'browser_proxy'] as GateLane[]) {
      expect(escalationForBlock('rate_limit', lane)).toBeNull()
    }
  })

  it('stops offering escalations once the last lane is exhausted', () => {
    expect(escalationForBlock('cloudflare_challenge', 'browser_proxy')).toBeNull()
    expect(escalationForBlock('captcha', 'browser_local_authed')).toBeNull()
    expect(escalationForBlock('geo_restricted', 'browser_proxy')).toBeNull()
  })

  it('never routes an escalation through defeating the gate', () => {
    // Every target must be a lane we legitimately have: more capability of our
    // own, the user's session, or the user's network. No provider-solves-captcha
    // path, no fingerprint-patching lane.
    const targets = new Set<GateLane>()
    for (const reason of ALL_REASONS) {
      for (const lane of ['http', 'browser_local', 'browser_proxy', 'browser_local_authed'] as GateLane[]) {
        const e = escalationForBlock(reason, lane)
        if (e) targets.add(e.to)
      }
    }
    expect([...targets].sort()).toEqual(['browser_local', 'browser_local_authed', 'browser_proxy'])
  })
})
