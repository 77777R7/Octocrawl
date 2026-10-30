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

  it.each([
    [{ 'x-datadome': 'protected' }, 403, 'header_x_datadome'],
    [{ 'x-datadome-cid': 'example' }, 403, 'header_x_datadome_cid'],
    [{ 'x-datadome': 'protected', 'x-datadome-cid': 'example' }, 403, 'header_x_datadome'],
    [{ 'x-datadome-cid': 'example' }, 200, 'header_x_datadome_cid'],
  ] as const)('refines DataDome headers %j on %i with the actual captcha', (headers, status, signal) => {
    // T038/T046: the header named the vendor before the classifier reached its captcha iframe.
    const body = '<html><body><iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=example"></iframe></body></html>'
    expect(classifyGate(withHeaders(headers, { status, body, contentful: true }))).toEqual({
      reason: 'captcha', signals: [signal, 'datadome_captcha'],
    })
  })

  it.each([
    '<iframe src="https://geo.captcha-delivery.com/interstitial/?initialCid=example"></iframe>',
    '<iframe src="https://geo.notcaptcha-delivery.com/captcha/"></iframe>',
    '<script src="https://ct.captcha-delivery.com/c.js"></script>',
    '<link rel="preconnect" href="https://geo.captcha-delivery.com/captcha/">',
  ])('does not infer a DataDome captcha from other evidence: %s', (body) => {
    expect(classifyGate(withHeaders({ 'x-datadome': 'protected' }, { status: 403, body, contentful: true }))).toEqual({
      reason: 'bot_detected_generic', signals: ['header_x_datadome'],
    })
  })

  it('keeps rate limits and explicit Cloudflare challenges ahead of DataDome refinement', () => {
    const body = '<iframe src="https://geo.captcha-delivery.com/captcha/"></iframe>'
    expect(classifyGate(withHeaders({ 'x-datadome': 'protected' }, { status: 429, body }))).toEqual({
      reason: 'rate_limit', signals: ['status_429'],
    })
    expect(classifyGate(withHeaders({ 'cf-mitigated': 'challenge', 'x-datadome': 'protected' }, { status: 403, body }))).toEqual({
      reason: 'cloudflare_challenge', signals: ['header_cf_mitigated'],
    })
  })

  it('does not take x-datadome alone on a success for a block: DataDome sends it on the pages it lets through', () => {
    expect(classifyGate(withHeaders({ 'x-datadome': 'protected' }, { status: 200, body: `<html><body><article>${ARTICLE}</article></body></html>` }))).toBeNull()
    // Its block names itself: a 403, or its id header, or its challenge in the body.
    expect(classifyGate(withHeaders({ 'x-datadome': 'protected', 'x-datadome-cid': 'AHrl' }, { status: 200 }))?.signals).toContain('header_x_datadome_cid')
    expect(classifyGate(withHeaders({ 'x-datadome': 'protected' }, { status: 200, body: `<iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=x"></iframe>` }))?.reason).toBe('captcha')
    expect(classifyGate(withHeaders({ 'x-datadome': 'protected' }, { status: 202, body: '' }))?.reason).toBe('bot_detected_generic')
  })

  it('does not take x-iinfo alone on a success for a block: Imperva sends it on the pages it lets through', () => {
    // in-n-out.com, aaii.com, lizearle.com and info.buy.nsw.gov.au in the browser lane (Firecrawl scrape-content set,
    // 2026-10-30): each page rendered in full with Imperva's x-iinfo header and its injected _Incapsula_Resource script.
    const page = ARTICLE.replace('</head>', '<script src="/_Incapsula_Resource?SWJIYLWA=719d34d31c8e3a6e6fffd425f7e032f3&ns=1"></script></head>')
    expect(classifyGate(withHeaders({ 'x-iinfo': '48-101238498-0 0NNN RT(1793301371027 129)' }, { status: 200, body: page, contentful: true }))).toBeNull()
    expect(classifyGate(withHeaders({ 'x-iinfo': '48-101238498-0 0NNN RT(1793301371027 129)' }, { status: 200, body: page }))).toBeNull()
    // Its JS interstitial is a page of nothing but its script, answered with 200: that is still the gate.
    const interstitial = '<html><head><META NAME="robots" CONTENT="noindex,nofollow"><script src="/_Incapsula_Resource?SWJIYLWA=5074a744e2e3d891814e9a2dace20bd4,719d34d31c8e3a6e6fffd425f7e032f3"></script><body></body></html>'
    expect(classifyGate(withHeaders({ 'x-iinfo': '48-101238498-0 0NNN' }, { status: 200, body: interstitial, contentful: true }))).toEqual({
      reason: 'bot_detected_generic', signals: ['header_x_iinfo_imperva', 'incapsula_resource_script', 'short_page'],
    })
    // A refusal is no success: the header stays decisive on it.
    expect(classifyGate(withHeaders({ 'x-iinfo': '48-101238498-0 0NNN' }, { status: 403 }))).toEqual({ reason: 'bot_detected_generic', signals: ['header_x_iinfo_imperva'] })
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
    // Its precursor script, also on the page past the challenge, is no challenge either.
    const precursor = page.replace('/scripts/jsd/main.js', '/scripts/precursor/main.js')
    expect(classifyGate(res({ status: 200, body: precursor }))).toBeNull()
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

  it('does not take a widget guarding a form on a page with plenty of text, or widgets named in a script\'s code, for a captcha wall', () => {
    // Two pages whose extractor found no main content, read as captcha walls in the 2026-10-30 run of Firecrawl's set.
    // social27.com/ai-solutions: Google's script in the head and a reCAPTCHA in the contact form, among some 14,000
    // characters of text (the extractor dropped the <aside> the whole page sits in).
    const section = (n: number) => `<section><h2>Consulting ${n}</h2><p>Design and implement tailored strategies that drive a business's digital transformation.</p></section>`
    const guarded = '<html><head><title>AI Solutions</title><script src="https://www.google.com/recaptcha/api.js" type="text/javascript"></script></head>' +
      `<body><aside class="page-wrapper"><main>${Array.from({ length: 20 }, (_, n) => section(n)).join('')}<form id="wf-form-Contact" method="get">` +
      '<input name="Company-Email" placeholder="Company Email" type="text"><div data-sitekey="6Ld9" class="w-form-formrecaptcha g-recaptcha g-recaptcha-error g-recaptcha-disabled"></div>' +
      '<input type="submit" data-wait="Please wait..." value="Submit"></form></main></aside></body></html>'
    expect(classifyGate(res({ body: guarded }))).toBeNull()
    // pastificioboulder.com/pages/contact: a short contact page whose store script lists the widgets' response fields in
    // its code, with no widget on the page.
    const listed = '<html><head><title>Contact</title><script>(()=>{const i=\'password\',u=\'form_key\',d=[\'recaptcha-v3-token\',\'g-recaptcha-response\',\'h-captcha-response\',i]})()</script></head>' +
      '<body><header><a href="/">Pastificio</a> <a href="/pages/contact">Contact</a> <a href="/account/login">Login</a></header><main><h1>Contact</h1>' +
      '<form method="post" action="/contact#contact_form"><input type="hidden" name="form_type" value="contact"><label>Name</label><input type="text" name="contact[name]">' +
      '<label>E-mail</label><input type="email" name="contact[email]"><label>Message</label><textarea name="contact[body]"></textarea><button type="submit">Send message</button></form>' +
      '<p>Wholesale inquiries: orders@pastificio.test</p></main></body></html>'
    expect(classifyGate(res({ body: listed }))).toBeNull()
    // A widget on a short page is still the check, named by the markup that carries it, not by a script's code.
    const wall = listed.replace(/<main>.*<\/main>/, '<main><h1>One more step</h1><div class="h-captcha" data-sitekey="k"></div></main>')
    expect(classifyGate(res({ body: wall }))).toEqual({ reason: 'captcha', signals: ['widget_hcaptcha_class', 'widget_sitekey'] })
  })

  it('classifies a captcha the site serves itself, by its own widget script and its ask, as captcha', () => {
    // As studylib.net's "Security Check" (2026-10-15): a 403 past Cloudflare's challenge, the site's own widget.
    const page = (script: string, text: string) => `<html><head><title>Security Check</title>${script}</head><body><h1>${text}</h1>` +
      '<p>We have detected unusual traffic from your network. Please complete the security check to continue.</p><div id="captcha"></div></body></html>'
    const script = '<script src="https://site.test/captcha/assets/widget.js"></script>'
    expect(classifyGate(res({ status: 403, body: page(script, 'Please Verify You Are Human') }))).toEqual({
      reason: 'captcha', signals: ['site_captcha_script', 'text_verify_you_are_human', 'text_complete_the_security_check'],
    })
    // The ask without the site's widget stays a bot gate; the widget's script without an ask is no captcha page.
    expect(classifyGate(res({ status: 403, body: page('', 'Please Verify You Are Human') }))?.reason).toBe('bot_detected_generic')
    expect(classifyGate(res({ status: 403, body: `<html><head>${script}</head><body><h1>Contact us</h1></body></html>` }))?.reason).not.toBe('captcha')
    // Judged as the challenge wait judges (decisive evidence only), it is unchanged.
    expect(classifyGate(res({ status: 403, body: page(script, 'Please Verify You Are Human'), contentful: true }))).toBeNull()
  })

  it('finds the site captcha script by the src of the script tag that loads it', () => {
    const page = (script: string) => `<html><head><title>Security Check</title>${script}</head><body><h1>Please Verify You Are Human</h1></body></html>`
    // The src however the tag spells it: after other attributes, quoted either way or not, spaced around `=`, in
    // capitals, or named after a `/` or a closing quote, as a browser reads the tag.
    for (const script of [
      '<script async type="text/javascript" src="/captcha/widget.js"></script>',
      "<SCRIPT SRC = '/CAPTCHA/widget.js'></SCRIPT>",
      '<script src=/captcha/widget.js></script>',
      '<script/src="/captcha/widget.js"></script>',
      '<script type="module"src="/captcha/widget.js"></script>',
    ]) expect(classifyGate(res({ status: 403, body: page(script) }))?.reason, script).toBe('captcha')
    // The path anywhere else loads no widget: in the script's own text, in another tag, in an attribute other than src
    // (data-src is one: a browser does not load it).
    for (const script of [
      '<script>var widget = "/captcha/widget.js"</script>',
      '<img src="/captcha/widget.png">',
      '<script src="/js/app.js" data-endpoint="/captcha/verify"></script>',
      '<script data-src="/captcha/widget.js"></script>',
    ]) expect(classifyGate(res({ status: 403, body: page(script) }))?.reason, script).toBe('bot_detected_generic')
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

describe('classifyGate — DataDome challenge laid over a page', () => {
  // StubHub's home read from a Singapore exit on 2026-10-11: the page rendered, its events empty, and DataDome laid
  // its interstitial over the whole viewport past 90 KB of markup. The local browser answered success with the
  // navigation alone (T073). The challenge's iframe is decisive wherever it sits on the page.
  const page = (extra: string) => `<html><head><title>Buy sports, concert and theater tickets on StubHub!</title></head><body>
<header><a href="/sell">Sell Tickets</a> <a href="/secure/myaccount">My Tickets</a></header><main><h2>Popular events</h2></main>
${'<script>window.__app = "' + 'x'.repeat(70_000) + '"</script>'}${extra}</body></html>`
  const overlay = (kind: string) => `<div id="ddChallengeContainer1791739251676" style="height: 100vh; width: 100%; position: fixed; top: 0px; left: 0px; z-index: 2147483647"><iframe src="https://geo.captcha-delivery.com/${kind}/?initialCid=AHrlqAAAAAMA&amp;hash=AF5D&amp;cid=wrNQ" title="DataDome Device Check" width="100%" height="100%"></iframe></div>`

  it('names the interstitial a bot check past the page head, even once extraction found a body', () => {
    expect(classifyGate(res({ body: page(overlay('interstitial')), contentful: true }))).toEqual({ reason: 'bot_detected_generic', signals: ['datadome_interstitial'] })
  })

  it('names its captcha variant a captcha, from another subdomain of captcha-delivery.com too', () => {
    expect(classifyGate(res({ body: page(overlay('captcha')), contentful: true }))).toEqual({ reason: 'captcha', signals: ['datadome_captcha'] })
    const ct = page(overlay('captcha').replace('https://geo.captcha-delivery.com', 'https://ct.captcha-delivery.com'))
    expect(classifyGate(res({ body: ct, contentful: true }))).toEqual({ reason: 'captcha', signals: ['datadome_captcha'] })
    // Another host that only ends in the name is not DataDome's.
    const lookalike = page(overlay('captcha').replace('https://geo.captcha-delivery.com', 'https://geo.notcaptcha-delivery.com'))
    expect(classifyGate(res({ body: lookalike, contentful: true }))).toBeNull()
  })

  it('leaves a page that only loads DataDome\'s tag as content', () => {
    const tagged = page('<script src="https://js.datadome.co/tags.js" async></script><script>window.ddjskey = "ABC"</script>')
    expect(classifyGate(res({ body: tagged, contentful: true }))).toBeNull()
  })
})

describe('classifyGate — Anubis proof-of-work check', () => {
  // proforto.nl answered a product page with Anubis's check (Hypernode's build of 1.28.1) and HTTP 200 on 2026-10-29 and
  // 2026-10-30, and both lanes returned it as success: the http lane the page as served, the bundled Chromium the page
  // its script was still calculating on. A browser clears the check by running that script, so it is a bot check.
  const served = `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Human verification</title>
        <link rel="stylesheet" href="/.within.website/x/cmd/anubis/static/css/botstopper.css" />
        <script id="anubis_version" type="application/json">"1.28.1+hypernode1"
</script><script id="anubis_challenge" type="application/json">{"rules":{"algorithm":"fast","difficulty":2},"challenge":{"issuedAt":"2026-10-30T07:33:23.738849726Z","metadata":{"Referer":"","User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36","X-Real-IP":"203.0.113.7"},"id":"01a18bba-489a-7cee-9ffe-bbfaa2d3da68","method":"fast","randomData":"402ff1c521b82d27b9c275f1cc672d617803b30ed2055d8bbceab68ed9137cbc","policyRuleHash":"8a70f4a00fe5d250","difficulty":2,"spent":false,"extensions":null}}
</script><script id="anubis_base_prefix" type="application/json">""
</script><script id="anubis_public_url" type="application/json">""
</script>
    </head>
    <body>
        <div class="page-content-wrapper">
            <div class="page-content">
                <img width="137" height="17" src="/.within.website/x/cmd/anubis/static/img/logo.svg" />
                <div class="content">
                    <h2>Checking if you're human</h2>
                    <p>We are running a quick security check to protect this site from bots. This should only take a few seconds.</p>
                    <div class="centered-div"><p id="status">Loading...</p><p id="anubis-script-error" style="display:none;">Anubis could not load its JavaScript. The server may be overloaded. Please reload the page to try again.</p><script id="anubis-main" defer type="module" src="/.within.website/x/cmd/anubis/static/js/main.mjs?cacheBuster=1.28.1+hypernode1"></script><script>(()=>{let e=document.getElementById("anubis-main");if(!e)return;e.onerror=()=>setTimeout(()=>document.head.appendChild(Object.assign(document.createElement("script"),{type:"module",src:e.getAttribute("src")+"&anubisRetry=1"})),750)})();</script><div id="progress" role="progressbar" aria-labelledby="status"><div class="bar-inner"></div></div><div id="testarea"></div></div>
                    <img width="48" height="48" class="loader" src="/.within.website/x/cmd/anubis/static/img/loader.png" alt="Checking your browser" />
                    <p class="loader-alt">Checking your browser...</p>
                    <p>If this takes more than 30 seconds, try refreshing the page.</p>
                    <p>Need help? <a href="mailto:support@hypernode.com">Contact support</a></p>
                </div>
            </div>
        </div>
    </body>
</html>`
  const rendered = served.replace('<p id="status">Loading...</p>', '<p id="status">Calculating...<br>Difficulty: 2, Speed: 0kH/s</p>')
  const check = { reason: 'bot_detected_generic', signals: ['anubis_challenge', 'anubis_assets', 'short_page'] }

  it('names the check by its challenge and its assets, served or rendered, read as content or not', () => {
    for (const body of [served, rendered]) {
      expect(classifyGate(res({ body, contentful: true }))).toEqual(check)
      expect(classifyGate(res({ body }))).toEqual(check)
    }
    // A site may answer the check with another status (403 in Anubis's documentation).
    expect(classifyGate(res({ status: 403, body: served }))).toEqual(check)
    // Anubis's longer explanation of v1.21 to v1.27 runs to about 1,600 characters in French.
    const explained = served.replace('</h2>', `</h2><details><p>${'Votre navigateur calcule une preuve de travail avant de charger la page. '.repeat(22)}</p></details>`)
    expect(classifyGate(res({ body: explained, contentful: true }))).toEqual(check)
  })

  it('leaves an article about Anubis, a long page that carries its challenge, and its error page to the rest of the classifier', () => {
    // Its markup quoted as code and its mascot shown from its assets: no challenge on the page.
    const article = `<!doctype html><html><head><title>Anubis, the toll on scrapers</title></head><body><article><h1>Anubis, the toll on scrapers</h1>
<p>Anubis answers a visitor with a proof-of-work page and lets the browser in once its script has calculated a hash. The page keeps the
challenge in <code>&lt;script id="anubis_challenge" type="application/json"&gt;</code> and its assets under <code>/.within.website/x/cmd/anubis/</code>.</p>
<img src="https://anubis.techaro.lol/.within.website/x/cmd/anubis/static/img/happy.webp" alt="Anubis's mascot"></article></body></html>`
    expect(classifyGate(res({ body: article }))).toBeNull()
    expect(classifyGate(res({ body: article, contentful: true }))).toBeNull()
    const long = served.replace('<div class="content">', `<div class="content">${'<p>An ordinary paragraph of a long page about work shoes and their soles.</p>'.repeat(60)}`)
    expect(classifyGate(res({ body: long, contentful: true }))).toBeNull()
    // Anubis's error and refusal pages, as v1.28.2's templates render them, hold null where the challenge would be.
    const refused = `<!DOCTYPE html><html lang="en"><head><title>Oh noes!</title><link rel="stylesheet" href="/.within.website/x/xess/xess.min.css?cachebuster=v1.28.2"/>
<script id="anubis_version" type="application/json">"v1.28.2"
</script><script id="anubis_challenge" type="application/json">null
</script></head><body id="top"><main><h1 id="title" class="centered-div">Oh noes!</h1><div class="centered-div">
<img id="image" alt="Sad Anubis" style="width:100%;max-width:256px;" src="/.within.website/x/cmd/anubis/static/img/reject.webp?cacheBuster=v1.28.2"/>
<p>Access Denied: error code 8a70f4a00fe5d250.</p><p><a href="/">Go home</a></p></div><footer><div class="centered-div">
<p>Protected by <a href="https://github.com/TecharoHQ/anubis">Anubis</a> From <a href="https://techaro.lol">Techaro</a>. Made with ❤️ in 🇨🇦.</p>
<p>This website is running Anubis version <code>v1.28.2</code>.</p></div></footer></main></body></html>`
    for (const contentful of [false, true]) expect(classifyGate(res({ body: refused, contentful }))?.signals ?? []).not.toContain('anubis_challenge')
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

  it.each([
    // K1's frozen tasks, 2026-10-21 to 2026-10-25: each answered every run with 429, no Retry-After, and these headers
    // (read live on 2026-10-25). A browser can run the challenge; waiting does not clear it.
    ['Vercel\'s checkpoint (ironmountain.com, T007)', { 'x-vercel-mitigated': 'challenge' }, { reason: 'bot_detected_generic', signals: ['header_x_vercel_mitigated', 'status_429'] }],
    ['Kasada (realtor.com, T042)', { 'x-kpsdk-ct': '01bieInQz9wE', 'x-kpsdk-r': '1-AA' }, { reason: 'bot_detected_generic', signals: ['header_x_kpsdk_ct', 'status_429'] }],
    ['Expedia\'s challenge handler (expedia.com, T037)', { 'x-page-id': 'wildcard-challenge-handler' }, { reason: 'captcha', signals: ['header_expedia_challenge_handler', 'status_429'] }],
  ] as const)('names a 429 answered by %s a challenge, not a rate limit', (_site, headers, want) => {
    expect(classifyGate(withHeaders(headers, { status: 429, body: '<title>Security Checkpoint</title>' }))).toEqual(want)
    expect(classifyGate(withHeaders({ ...headers, 'retry-after': '30' }, { status: 429, body: '' }))).toEqual(want)
  })

  it('keeps a 429 rate_limit when those headers do not name a challenge', () => {
    const rateLimit = { reason: 'rate_limit', signals: ['status_429'] }
    expect(classifyGate(withHeaders({ 'x-vercel-mitigated': 'deny' }, { status: 429, body: '' }))).toEqual(rateLimit)
    expect(classifyGate(withHeaders({ 'x-page-id': 'hotel-search' }, { status: 429, body: '' }))).toEqual(rateLimit)
    expect(classifyGate(withHeaders({ 'x-kpsdk-ct': '' }, { status: 429, body: '' }))).toEqual(rateLimit)
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

describe('classifyGate — refusals other vendors serve with 403, named by what only each one carries', () => {
  // The bundled Chromium's 403s in the Firecrawl scrape-content run (2026-10-30), each reported as failed: http_error,
  // as it rendered them: CloudFront's page for a request its WAF blocked (abcauto.com, jcsc.org, oc.eco.br,
  // similarweb.com, soundpure.com) and for its geographic restriction (soundpure.com, direct), Vercel's deny page
  // (superatv.com), Real Geeks' (fbrealestateco.com), a WAF's country block behind Cloudflare (orthazone.com) and
  // vzkoo.com's restriction, whose link leads to a slider a person completes.
  const cloudfront = (line: string) => `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd"><html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
<title>ERROR: The request could not be satisfied</title>
</head><body>
<h1>403 ERROR</h1>
<h2>The request could not be satisfied.</h2>
<hr noshade="" size="1px">
${line}
We can't connect to the server for this app or website at this time. There might be too much traffic or a configuration error. Try again later, or contact the app or website owner.
<br clear="all">
If you provide content to customers through CloudFront, you can find steps to troubleshoot and help prevent this error by reviewing the CloudFront documentation.
<br clear="all">
<hr noshade="" size="1px">
<pre>Generated by cloudfront (CloudFront)
Request ID: QOXfVIiYVzzlF7MhW_Mg8t4tvrxh-eGORuys3TppQeCWtDgvTkaAhQ==
</pre>
<address>
</address>
</body></html>`
  const cloudfrontWaf = cloudfront('Request blocked.')
  const cloudfrontGeo = cloudfront('The Amazon CloudFront distribution is configured to block access from your country.')
  const vercel = `<!DOCTYPE html><html lang="en"><head>
    <meta charset="utf-8">
    <title>403: Forbidden</title>
    <style>:root { color-scheme: dark; } main { display: grid; place-items: center; }</style>
  </head>
  <body>
      <main>
        <section class="error-page" aria-labelledby="error-title">
          <h1 id="error-title">This request was blocked</h1>
          <div class="metadata" aria-label="HTTP status, error code, and request ID">
            <p>403 Forbidden</p>
            <p>sin1::ndc2g-1793343683243-5f3602af290d</p>
          </div>
        </section>
      </main>
</body></html>`
  const realGeeks = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>Request Blocked</title>
<style>.card { max-width: 28rem; text-align: center; }</style>
</head>
<body>
  <div class="card">
    <span class="status">403 Forbidden</span>
    <h1>This request was blocked</h1>
    <p>
      Our security systems blocked this request on purpose. This usually
      happens because of the visitor's location, an automated bot, or a
      known bad address.
    </p>
    <p>
      If you believe this is a mistake, contact Real Geeks Support for
      assistance.
    </p>
  </div>
</body></html>`
  const countryBlock = '<html><head><meta name="color-scheme" content="light dark"></head><body><pre style="word-wrap: break-word; white-space: pre-wrap;">Request blocked by WAF. Reason: country_block</pre></body></html>'
  const vzkoo = `<html><head></head><body><small>访问受限</small>
<a href="https://aq.vzkoo.com/html/check.php?source=https://www.vzkoo.com/read/202411278d2caccf6ed25d3e757c348c.html">点击验证解封</a>
</body></html>`
  const refused = (signal: string, ...more: string[]) => ({ reason: 'bot_detected_generic', signals: [signal, ...more, 'status_403', 'short_page'] })

  it('names CloudFront\'s page for a request its WAF blocked a refusal, and its geographic restriction a geo block', () => {
    expect(classifyGate(res({ status: 403, body: cloudfrontWaf }))).toEqual(refused('cloudfront_request_blocked'))
    expect(classifyGate(res({ status: 403, body: cloudfrontGeo }))).toEqual({ reason: 'geo_restricted', signals: ['cloudfront_geo_restriction', 'status_403', 'short_page'] })
  })

  it('names Vercel\'s deny by its header, and its page by the heading with Vercel\'s request id', () => {
    expect(classifyGate(withHeaders({ 'x-vercel-mitigated': 'deny' }, { status: 403, body: '' }))).toEqual({ reason: 'bot_detected_generic', signals: ['header_x_vercel_mitigated_deny', 'status_403'] })
    expect(classifyGate(res({ status: 403, body: vercel }))).toEqual(refused('heading_request_blocked', 'vercel_request_id'))
  })

  it('names Real Geeks\' page by the heading with its copy', () => {
    expect(classifyGate(res({ status: 403, body: realGeeks }))).toEqual(refused('heading_request_blocked', 'text_blocked_on_purpose'))
  })

  it('names a WAF\'s country block a geo block', () => {
    expect(classifyGate(res({ status: 403, body: countryBlock }))).toEqual({ reason: 'geo_restricted', signals: ['text_waf_country_block', 'status_403', 'short_page'] })
  })

  it('names vzkoo.com\'s restriction, which a person lifts by completing its check, a captcha', () => {
    expect(classifyGate(res({ status: 403, body: vzkoo }))).toEqual({ reason: 'captcha', signals: ['text_verify_to_unblock', 'status_403', 'short_page'] })
  })

  it('leaves CloudFront\'s other 403s, half the evidence, other statuses, pages read as content and long pages as they were', () => {
    // CloudFront's page for a host it is not set up to serve is a configuration error, not a refusal.
    expect(classifyGate(res({ status: 403, body: cloudfront('Bad request.') }))).toBeNull()
    // The line without CloudFront's signature, and the signature without the line.
    expect(classifyGate(res({ status: 403, body: '<html><body><h1>Error</h1><p>Request blocked.</p></body></html>' }))).toBeNull()
    expect(classifyGate(res({ status: 403, body: '<html><body><h1>Error</h1><p>configured to block access from your country</p></body></html>' }))).toBeNull()
    // The heading without Vercel's request id or Real Geeks' copy, and the id without the heading.
    expect(classifyGate(res({ status: 403, body: '<html><head><title>403</title></head><body><h1>This request was blocked</h1><p>403 Forbidden</p></body></html>' }))).toBeNull()
    expect(classifyGate(res({ status: 403, body: '<html><head><title>403: Forbidden</title></head><body><h1>Forbidden</h1><p>sin1::ndc2g-1793343683243-5f3602af290d</p></body></html>' }))).toBeNull()
    // Vercel's header names only a deny.
    expect(classifyGate(withHeaders({ 'x-vercel-mitigated': 'none' }, { status: 403, body: '' }))).toBeNull()
    // A WAF's block for a reason other than a country, and the restriction without the way to lift it.
    expect(classifyGate(res({ status: 403, body: countryBlock.replace('country_block', 'ip_block') }))).toBeNull()
    expect(classifyGate(res({ status: 403, body: '<html><body><small>访问受限</small></body></html>' }))).toBeNull()
    for (const body of [cloudfrontWaf, cloudfrontGeo, vercel, realGeeks, countryBlock, vzkoo]) {
      // A 403 page is a refusal; the same copy with another status is that page's own answer.
      for (const status of [200, 404, 500, 503]) expect(classifyGate(res({ status, body })), `${status}`).toBeNull()
      // A refusal does not clear by itself: the installed Chrome's wait for a check, which reads pages as content, does not wait on it.
      expect(classifyGate(res({ status: 403, body, contentful: true }))).toBeNull()
      // An article quoting the page is long.
      expect(classifyGate(res({ status: 403, body: `<html><body><article>${body}${'<p>A long article goes on about errors, firewalls and the web at length, paragraph after paragraph.</p>'.repeat(30)}</article></body></html>` }))).toBeNull()
    }
    expect(classifyGate(withHeaders({ 'x-vercel-mitigated': 'deny' }, { status: 403, body: '', contentful: true }))).toBeNull()
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
  // Akamai's bot check, which the installed Chrome read in place of three articles (businesswire.com, money.usnews.com,
  // lequipe.fr) with HTTP 200 in the 2026-10-30 run of Firecrawl's set, as Chrome for Testing 152 rendered
  // businesswire.com's that day: its scripts' paths and tokens shortened. Its script reloads the page once the check's
  // request is answered.
  const behavioral = `<html><head></head><body><script type="text/javascript" src="/AAxJAU13aQzB/rL5mhmQir57Q?v=fc7afe4f&amp;t=152967617"></script>
<div id="sec-if-cpt-container" role="main" style="display: none"><div class="behavioral-content"><div id="sec-bc-text-container"></div>
<div id="sec-bc-tile-parent"><div id="sec-bc-tile-container"></div></div><div class="sec-bc-button-parent"><div class="behavioral-button progress-btn-disabled">
<div class="btn" id="progress-button" role="button" tabindex="0" disabled=""></div><div class="progress"></div></div></div>
<div class="scf-akamai-logo-sec-abc"><div class="scf-akamai-logo-msg"><p class="scf-akamai-protected-by">Powered and protected by</p></div>
<div class="scf-akamai-logo-img"><img src="https://www.akamai.com/site/ko/images/logo/akamai-logo1.svg" class="scf-akamai-logo" loading="lazy" alt="Akamai"></div>
<div class="akamai-privacy"><a href="https://www.akamai.com/privacy" target="_blank">Privacy<span class="_hidden"></span></a></div></div></div></div>
<script>(function() { var chlgeId = ''; var context = 't'; /* … */ if (context === 't') { location.reload(true); } })();</script>
<noscript><img src="https://www.example.test/akam/13/pixel_7eaca161?a=dD0x" style="visibility: hidden; position: absolute; left: -999px; top: -999px;" /></noscript>
</body></html>`

  it('names an Akamai refusal by its reference number on a short page, read as content or not', () => {
    for (const contentful of [true, false]) {
      expect(classifyGate(res({ body: akamai, contentful }))).toEqual({ reason: 'bot_detected_generic', signals: ['akamai_reference', 'short_page'] })
    }
    expect(classifyGate(res({ body: accessDenied, contentful: true }))?.signals).toContain('akamai_reference')
  })

  it('names Akamai\'s bot check by the line and the logo it shows on a short page, read as content or not', () => {
    const want = { reason: 'bot_detected_generic', signals: ['text_powered_and_protected_by', 'akamai_logo', 'short_page'] }
    for (const contentful of [true, false]) expect(classifyGate(res({ body: behavioral, contentful }))).toEqual(want)
    // The logo by its source or by its name.
    expect(classifyGate(res({ body: behavioral.replace(' alt="Akamai"', ' alt=""') }))).toEqual(want)
    expect(classifyGate(res({ body: behavioral.replace('https://www.akamai.com/site/ko/images/logo/akamai-logo1.svg', '/akam/logo.svg') }))).toEqual(want)
    // The line beside another logo, Akamai's logo without the line, either in a script, and both in a long page's footer are no check.
    expect(classifyGate(res({ body: behavioral.replace(/<img src="https:\/\/www\.akamai\.com[^>]*>/, '<img src="/badge.svg" alt="Example CDN">') }))).toBeNull()
    expect(classifyGate(res({ body: behavioral.replace('Powered and protected by', 'Our network partner') }))).toBeNull()
    const footer = '<p>Powered and protected by</p><img src="https://www.akamai.com/site/en/images/logo/akamai-logo1.svg" alt="Akamai">'
    expect(classifyGate(res({ body: `<html><body><h1>Shop</h1><script>var footer = '${footer}'</script></body></html>` }))).toBeNull()
    const article = `<html><body><article>${'<p>An ordinary paragraph of a long article about the web and its checks.</p>'.repeat(30)}</article><footer>${footer}</footer></body></html>`
    for (const contentful of [true, false]) expect(classifyGate(res({ body: article, contentful }))).toBeNull()
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

  it('names Akamai only by a reference in its own shape, and not on the error pages that print it too', () => {
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
    // Two signs of a check, and no other word the scan is drawn to.
    for (const [page, signs] of [
      ['<h1>Checking your browser</h1><p>Please wait.</p>', ['weak_please_wait', 'weak_checking_your_browser']],
      ['<h1>Just a moment...</h1><p>DDoS protection by the site.</p>', ['weak_just_a_moment', 'weak_ddos_protection']],
      ['<h1>Security check</h1><p>Please wait.</p>', ['weak_please_wait', 'weak_security_check']],
    ] as const) {
      expect(classifyGate(res({ body: `<html><body>${page}</body></html>`, contentful: true })), page).toEqual({ reason: 'bot_detected_generic', signals: [...signs, 'short_page'] })
    }
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

describe('classifyGate — Akamai\'s refusal served with 403 as a site words it', () => {
  // The bundled Chromium's 403s on money.usnews.com, businesswire.com and ebay.com (2026-10-30), which the Firecrawl
  // scrape-content run reported as failed: http_error: each site's own deny page, carrying Akamai's reference to the
  // refused request under the site's own label or none, and Akamai's sensor script. The installed Chrome got Akamai's bot
  // check on the first two, and eBay's page for the ended listing (a 404) on the third.
  const usnews = `<!DOCTYPE html><html><head>
    <title>Blocked</title>
    <style type="text/css">body { text-align: Center; padding: 100px; }h1 { font-size: 24px; }</style>
</head>
<body>
    <div id="error">
    <h1>Our company keeps high security standards and one of our security tools has flagged this request as exhibiting automated behavior. To protect our platform's integrity, we restrict programmatic access from unauthorized commercial tools.</h1>
    <div>
        <hr>
        <p>If you believe this is an error, please contact Helpdesk or use this <a href="https://www.usnews.com/info/features/contact" target="_blank">form</a>.
          <br><br>Please provide the URL you were trying, your <a href="https://whatismyipaddress.com/" target="_blank">public IP</a> and this error code:<br>0.d154b17.1793341933.a0e31b33</p>
    </div>
    </div>
<script type="text/javascript" src="/20XJQ49AQ7xJd25Nc6St/zr5hDhY33ha5/Ph5ncAkbBg/I2EKLi/QuEyBUAQ?v=901bca94-7149-18d7-1c76-2c189efc174b" defer=""></script>
</body></html>`
  const businesswire = `<!DOCTYPE html><html class=""><head>
<title>Page Unavailable</title>
<style type="text/css">body { text-align: center; padding: 150px; }h1 { font-size: 40px; }</style>
</head>
<body>
<div id="error">
<h1>Page Unavailable</h1>
<div>
<hr>
<p>Please be advised that this page is unavailable.</p>
<p>Call +1.800.555.0100 for our Web Support team or <a href="mailto:websupport@example.com">open a support ticket</a> if you need further assistance. </p>
<p>Reference Error ID: <code>0.c6753617.1793341935.8c7cebc3</code> </p>
<p>Client IP: <ip>203.0.113.7</ip></p>
</div>
</div>
<script type="text/javascript" src="/AAxJAU13aQzBLmfNBsUDYBh7/rL5mhmQir57Q/MkJJAQ/clMHCW/8TQXpTAQ?v=81551f85-91d0-92f4-270b-a3f331f01736" defer=""></script>
</body></html>`
  const ebay = `<!DOCTYPE html><html lang="en" class=""><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>Error Page | eBay</title></head><body><main class="main-content"><div class="status--container"><div class="error-header"><div class="error-header__text-block"><p class="error-header__headline">SORRY</p><div id="error-info"><p>Something went wrong on our end</p><hr><p class="reference-id">0.3f283417.1793343654.44812c88</p><hr><p>Please go back and try again.</p></div></div></div></div></main><footer id="glbfooter"><p>Copyright © 1995-2026 eBay Inc. All Rights Reserved.</p></footer><script type="text/javascript" src="/fO3gIU/T/E/df6KpxvpAw/pk1tkw7QtO1X/JXtmXmhnIQk/Fk/EEeTR5NDxUAQ?v=7260b7c5-4162-c48c-9dee-af8a91281734" defer=""></script></body></html>`
  const refused = { reason: 'bot_detected_generic', signals: ['akamai_reference', 'status_403', 'short_page'] }

  it('names each page by the Akamai reference it carries', () => {
    expect(classifyGate(res({ status: 403, body: usnews }))).toEqual(refused)
    expect(classifyGate(res({ status: 403, body: businesswire }))).toEqual(refused)
    expect(classifyGate(res({ status: 403, body: ebay }))).toEqual(refused)
  })

  it('takes the reference under any label or none, and only in its own shape', () => {
    const page = (line: string) => `<html><head><title>Unavailable</title></head><body><h1>Sorry</h1><p>${line}</p></body></html>`
    for (const line of ['Reference #18.2f1d3e17.1791543951.6a0b2c', 'Reference&#32;&#35;18&#46;2f1d3e17&#46;1791543951&#46;6a0b2c', 'Incident Number: 18.90ac3017.1791543951.f255f62e', 'Error code: 0.d154b17.1793341933.a0e31b33', 'Error ID 0.c6753617.1793341935.8c7cebc3', '0.3f283417.1793343654.44812c88']) {
      expect(classifyGate(res({ status: 403, body: page(line) })), line).toEqual(refused)
    }
    // A dotted number like it in any other shape: a short time, a group that is not hexadecimal, a longer first group, a missing id.
    for (const line of ['Error code: 0.c6753617.17933.8c7cebc3', 'Error code: 0.zz753617.1793341935.8c7cebc3', 'Error code: 1234.c6753617.1793341935.8c7cebc3', 'Order 0.c6753617.1793341935']) {
      expect(classifyGate(res({ status: 403, body: page(line) })), line).toBeNull()
    }
  })

  it('leaves a 403 without the reference, another status, a page read as content and a long page as they were', () => {
    // Without the reference the page is a 403 like any other.
    expect(classifyGate(res({ status: 403, body: businesswire.replace('0.c6753617.1793341935.8c7cebc3', '') }))).toBeNull()
    // Akamai prints its reference on the error pages that are a page's own answer, too.
    for (const status of [400, 404, 500, 503]) expect(classifyGate(res({ status, body: businesswire })), `${status}`).toBeNull()
    // A refusal does not clear by itself: the installed Chrome's wait for a check, which reads pages as content, does not wait on it.
    expect(classifyGate(res({ status: 403, body: usnews, contentful: true }))).toBeNull()
    // A long page that prints a reference is a page of its own.
    expect(classifyGate(res({ status: 403, body: businesswire.replace('<hr>', `<hr>${'<p>An ordinary paragraph of a long page about the company and its news.</p>'.repeat(30)}`) }))).toBeNull()
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
