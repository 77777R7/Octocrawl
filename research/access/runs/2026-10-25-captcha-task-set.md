# CAPTCHA and DataDome task set, frozen 2026-10-25

The frozen task set for the CAPTCHA and DataDome work (ROADMAP PA item 6, ADR 0005 `third_party_captcha_solver`), and how it was built. Howard made this work the top priority on 2026-10-25. No measurement is reported here: the set and its harness come before the first run.

- Task file: `research/access/captcha-tasks.v1.json`, 56 tasks, manifest SHA-256 `39942eebdac5ded01766a0f72f6b3f5dbbad94ff9a80934484962d74bd8d43bc` (SHA-256 of `JSON.stringify(tasks)`). From now on no task is dropped, replaced or edited; run-set.mjs refuses the file when its tasks no longer hash to it. A wrong task goes into a new version (v2) with a dated record.
- Built from main `169ebeb6` (the commit adding the file has the same `packages/`). No paid call was made: no CapSolver, Steel or Firecrawl.
- Network: every request in this record went through Clash at `http://127.0.0.1:7890` (proxied), between 11:11 and 11:30 UTC on 2026-10-25.

## 1. Candidates from saved runs

Sources, read only:
- K1: `~/Code/w2l/.w2l/access/archive/2026-10-23-k1/access/runs/` (88 run directories);
- the weekly reruns: the `pa-weekly` worktree's `.w2l/access/runs/` (5);
- the combined-grant window 1: the raw run directories behind `~/Code/w2l/.w2l/access/combined-hold/runs/`, in the `vigilant-poincare-a52edb` worktree's `.w2l/access/runs/` (31).

Rule: a task is a candidate when, in any of these runs, an Octocrawl attempt ended `blocked` with `captcha`, `bot_detected_generic` or `cloudflare_challenge`, or its trace's `gate_detected` events carried a DataDome, PerimeterX or Kasada signal. T007, T037 and T042 are added: before #712 they ended `rate_limit`, and #712 showed each to be a vendor challenge sent with 429. The scan found 41 tasks, 38 of them by the rule.

Columns:
- **blockReason** and **gate signals** count the saved blocked attempts. The signal names are `packages/http-core/src/gate.ts`'s; the four most frequent signals are shown, and the task file keeps all of them.
- **Arms** are named by each run's grant capabilities:
  - standard: no grant;
  - installed_chrome: that capability alone;
  - steel: the Steel grant, compatible_transport + vendor_remote_browser + vendor_stealth;
  - combined: installed_chrome with the Steel grant;
  - "enhanced (grant not recorded)": weekly runs from before the grant line.
- **Lanes** are those of the `gate_detected` events. "provider" is the Steel rung.
- **Type** is the type the saved runs showed most often; the probe's when no run named one. The probe column is one plain GET on 2026-10-25 (curl through the proxy with a desktop Chrome user agent, no cookies). It is shown beside the type, not instead of it.

| Task | Host | blockReason (saved blocked attempts) | Gate signals (count) | Type | Vendor / widget | Arms blocked (blocked/attempts) | Lanes | Probe 2026-10-25 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | studylib.net | cloudflare_challenge 13, captcha 9 | header_cf_mitigated 13, site_captcha_script 9, text_verify_you_are_human 9, text_complete_the_security_check 9 | cloudflare_challenge | Cloudflare, then the site's own captcha: Cloudflare challenge in most runs; the site's own captcha (/captcha/ script, "Studylib Security Check") in others and today | installed_chrome 6/10; standard 8/8; steel 8/12 | browser_local, provider | 403, “Studylib Security Check” |
| T002 | ember-energy.org | cloudflare_challenge 8 | header_cf_mitigated 8 | cloudflare_challenge | Cloudflare: managed challenge | standard 8/8 | browser_local | 403, “Just a moment...”, cf-mitigated: challenge, cType managed |
| T003 | demoshop.oxid-esales.com | cloudflare_challenge 8 | header_cf_mitigated 8 | cloudflare_challenge | Cloudflare: non-interactive challenge | standard 8/8 | browser_local | 403, “Just a moment...”, cf-mitigated: challenge, cType non-interactive |
| T005 | www.etsy.com | bot_detected_generic 5, captcha 4 | header_x_datadome 9, datadome_captcha 4 | datadome | DataDome: captcha (rt=c) | installed_chrome 1/9; standard 7/8; steel 1/7 | browser_local, provider | 403, “etsy.com”, x-datadome: protected, rt c |
| T007 | www.ironmountain.com | rate_limit (before #712, a vendor challenge sent with 429) 13 | none recorded | vercel_checkpoint | Vercel: Security Checkpoint sent with 429 | installed_chrome 6/6; standard 7/8 | http | 429, “Vercel Security Checkpoint”, x-vercel-mitigated: challenge |
| T012 | www.walmart.com | captcha 7 | px_captcha_script 7, px_app_id 7, px_captcha_container 7 | perimeterx | PerimeterX (HUMAN): px captcha | installed_chrome 2/6; steel 5/8 | browser_local, provider | 200 |
| T014 | www.homedepot.com | bot_detected_generic 13 | weak_access_denied 13, status_403 13 | akamai | Akamai: Access Denied 403, no widget | installed_chrome 6/6; standard 7/8 | browser_local | 403, “Access Denied” |
| T018 | www.wayfair.com | captcha 13 | px_captcha_script 13, px_app_id 13, status_429 13 | perimeterx | PerimeterX (HUMAN): px captcha sent with 429 | installed_chrome 6/6; standard 7/8 | http | 200, “Sofas &amp; Couches \| Living Room Furniture &amp; ” |
| T020 | www.newegg.com | cloudflare_challenge 2 | header_cf_mitigated 2 | cloudflare_challenge | Cloudflare: interactive challenge | standard 2/8 | browser_local | 403, “Just a moment...”, cf-mitigated: challenge, cType interactive |
| T021 | www.ebay.com | bot_detected_generic 1 | text_pardon_our_interruption 1, short_page 1 | unknown | eBay (own page) behind Akamai: "Pardon Our Interruption" | standard 1/8 | browser_local | 403, “Error Page \| eBay” |
| T023 | www.sephora.com | bot_detected_generic 7 | weak_access_denied 7, status_403 7 | akamai | Akamai: Access Denied 403, no widget | standard 6/8; steel 1/6 | browser_local, provider | 403, “Access Denied” |
| T025 | www.nordstrom.com | bot_detected_generic 6 | heading_unusual_activity 6, text_automated_traffic 6, short_page 6 | unknown | unknown: "unusual activity" page | standard 6/6 | browser_local | 200 |
| T031 | www.temu.com | captcha 6 | verification_url 6, heading_security_verification 6, object_count_instruction 6, interactive_image 6 | site_captcha | Temu (own): object-count image puzzle | installed_chrome 3/5; standard 3/6 | browser_local | 200 |
| T034 | www.etsy.com | captcha 3 | header_x_datadome 3, datadome_captcha 3 | datadome | DataDome: captcha (rt=c) | installed_chrome 1/9; standard 2/4 | browser_local | 403, “etsy.com”, x-datadome: protected, rt c |
| T037 | www.expedia.com | rate_limit (before #712, a vendor challenge sent with 429) 20 | none recorded | arkose | Arkose Labs (FunCaptcha) on Expedia's challenge handler: "Bot or Not?" sent with 429 | combined 2/2; installed_chrome 6/6; standard 4/5; steel 8/8 | http | 429, “Bot or Not?”, x-page-id: wildcard-challenge-handler |
| T038 | www.tripadvisor.com | captcha 8, bot_detected_generic 11 | header_x_datadome 19, datadome_captcha 8 | datadome | DataDome: interstitial (rt=i) today; captcha in some runs | enhanced (grant not recorded) 4/8; installed_chrome 4/9; standard 6/6; steel 5/9 | browser_local, provider | 403, “tripadvisor.com”, x-datadome: protected, rt i |
| T039 | www.skyscanner.net | captcha 3 | skyscanner_challenge_url 3, heading_person_or_robot 3, px_captcha_container 3, px_challenge_loader 3 | perimeterx | PerimeterX (HUMAN): captcha-v2 page (/sttc/px/captcha-v2/) | standard 3/6 | browser_local | 307, “307 Temporary Redirect” |
| T042 | www.realtor.com | rate_limit (before #712, a vendor challenge sent with 429) 22 | none recorded | kasada | Kasada: challenge sent with 429 (x-kpsdk-ct) | combined 2/2; installed_chrome 6/6; standard 6/6; steel 8/8 | http | 429, “realtor.com” |
| T043 | www.redfin.com | bot_detected_generic 15 | weak_enable_javascript 15, weak_security_check 15 | aws_waf | AWS WAF: captcha (405, x-amzn-waf-action: captcha) | installed_chrome 6/6; standard 6/6; steel 3/8 | browser_local, provider | 405, “Human Verification”, x-amzn-waf-action: captcha |
| T045 | www.idealista.com | captcha 31 | header_x_datadome 31, datadome_captcha 31 | datadome | DataDome: captcha (rt=c) | combined 2/2; enhanced (grant not recorded) 8/8; installed_chrome 9/11; standard 6/6; steel 6/9 | browser_local, provider | 403, “idealista.com”, x-datadome: protected, rt c |
| T046 | www.g2.com | captcha 16, bot_detected_generic 7 | header_x_datadome 23, datadome_captcha 16 | datadome | DataDome behind Cloudflare: interstitial (rt=i) today; captcha in most runs | enhanced (grant not recorded) 3/8; installed_chrome 7/10; standard 6/6; steel 7/9 | browser_local, provider | 403, “g2.com”, x-datadome: protected, rt i |
| T047 | www.capterra.com | cloudflare_challenge 18 | header_cf_mitigated 16 | cloudflare_challenge | Cloudflare: challenge in runs; a block ("Sorry, you have been blocked") to the probe | standard 6/6; steel 12/16 | browser_local, provider | 403, “Attention Required! \| Cloudflare” |
| T048 | www.crunchbase.com | cloudflare_challenge 25 | cf_attention_required 14, header_cf_mitigated 10 | cloudflare_block | Cloudflare: "Attention Required" block in most runs | combined 1/2; installed_chrome 7/10; standard 6/6; steel 11/12 | browser_local, provider | 403, “Attention Required! \| Cloudflare” |
| T049 | www.yelp.com | bot_detected_generic 16 | header_x_datadome 16 | datadome | DataDome: captcha (rt=c) | installed_chrome 1/8; standard 6/6; steel 9/9 | browser_local | 403, “yelp.com”, x-datadome: protected, rt c |
| T050 | www.similarweb.com | bot_detected_generic 1 | weak_enable_javascript 1, weak_security_check 1 | unknown | AWS CloudFront: 403 "request could not be satisfied" to the probe; a "security check, enable JavaScript" page in the browser | installed_chrome 1/6 | browser_local | 403, “ERROR: The request could not be satisfied” |
| T051 | www.indeed.com | cloudflare_challenge 3 | header_cf_mitigated 3 | cloudflare_challenge | Cloudflare: managed challenge ("Security Check - Indeed.com") | installed_chrome 1/4; standard 2/7 | browser_local | 403, “Security Check - Indeed.com”, cf-mitigated: challenge, cType managed |
| T052 | www.census.gov | cloudflare_challenge 12 | cf_attention_required 10, header_cf_mitigated 2 | cloudflare_block | Cloudflare: "Attention Required" block | installed_chrome 2/5; standard 7/8; steel 3/9 | browser_local, provider | 403, “Attention Required! \| Cloudflare” |
| T053 | www.imf.org | bot_detected_generic 16 | weak_access_denied 16, status_403 16 | akamai | Akamai: Access Denied 403, no widget | enhanced (grant not recorded) 1/8; standard 6/6; steel 9/12 | browser_local, provider | 403, “Access Denied” |
| T059 | www.marketwatch.com | captcha 1 | status_401 1, datadome_captcha 1 | datadome | DataDome: captcha served with 401 | standard 1/7 | browser_local | 200, “AAPL Stock Price \| Apple Inc. Stock Quote (U.S.: N” |
| T065 | www.bloomberg.com | captcha 5 | px_captcha_script 5, px_app_id 5, px_captcha_container 5 | perimeterx | PerimeterX (HUMAN): px captcha ("Are you a robot?") | installed_chrome 2/4; standard 2/4; steel 1/6 | browser_local, provider | 403, “Bloomberg - Are you a robot?” |
| T067 | www.ft.com | cloudflare_challenge 1 | header_cf_mitigated 1 | cloudflare_challenge | Cloudflare: managed challenge | standard 1/5 | browser_local | 403, “Security Verification”, cf-mitigated: challenge, cType managed |
| T068 | www.economist.com | bot_detected_generic 21, cloudflare_challenge 6 | header_x_datadome 21, header_cf_mitigated 6 | datadome | DataDome, also Cloudflare: DataDome bot check in most runs; a Cloudflare managed challenge in others and today | enhanced (grant not recorded) 7/8; installed_chrome 9/11; standard 6/6; steel 5/9 | browser_local, provider | 403, “Just a moment...”, cf-mitigated: challenge, cType managed |
| T069 | www.carvana.com | cloudflare_challenge 20 | cf_attention_required 10, header_cf_mitigated 9 | cloudflare_block | Cloudflare: "Attention Required" in most runs; a managed challenge in others and today | combined 2/2; installed_chrome 6/6; standard 6/6; standard+installed_chrome grant 1/1; steel 5/9 | browser_local, provider | 403, “Just a moment...”, cf-mitigated: challenge, cType managed |
| T070 | www.autotrader.com | bot_detected_generic 10 | akamai_reference 9, short_page 9 | akamai | Akamai: "page unavailable" short page | standard 6/6; standard+installed_chrome grant 1/1; steel 3/8 | browser_local, provider | 200, “Autotrader - page unavailable” |
| T071 | www.cars.com | cloudflare_challenge 9 | header_cf_mitigated 9 | cloudflare_challenge | Cloudflare: challenge in runs; a block to the probe | standard 6/6; steel 3/9 | browser_local, provider | 403, “Attention Required! \| Cloudflare” |
| T073 | www.stubhub.com | bot_detected_generic 8 | datadome_interstitial 4, header_x_datadome 4 | datadome | DataDome: interstitial in runs; captcha (rt=c) today | standard 6/6; steel 2/6 | browser_local, provider | 403, “stubhub.com”, x-datadome: protected, rt c |
| T076 | stackoverflow.com | cloudflare_challenge 7 | header_cf_mitigated 7 | cloudflare_challenge | Cloudflare: managed challenge | standard 6/6; steel 1/8 | browser_local, provider | 403, “Just a moment...”, cf-mitigated: challenge, cType managed |
| B001 | www.bhphotovideo.com | cloudflare_challenge 8, bot_detected_generic 3 | header_cf_mitigated 8, text_you_have_been_blocked 3 | cloudflare_challenge | Cloudflare: managed challenge (cType managed today); a Cloudflare block page ("you have been blocked") on the Steel provider lane | standard 6/6; steel 5/9 | browser_local, provider | 403, “Just a moment...”, cf-mitigated: challenge, cType managed |
| B003 | www.tesla.com | bot_detected_generic 7 | weak_access_denied 7, status_403 7 | akamai | Akamai: Access Denied 403, no widget | combined 1/2; standard 6/6 | browser_local, provider | 403, “Access Denied” |
| B004 | www.apartments.com | bot_detected_generic 7 | weak_access_denied 6, status_403 6, akamai_reference 1, short_page 1 | akamai | Akamai: Access Denied 403, no widget | standard 6/6; steel 1/7 | browser_local, provider | 403, “Access Denied” |
| B008 | www.imdb.com | bot_detected_generic 15 | weak_enable_javascript 15, weak_security_check 15 | aws_waf | AWS WAF: challenge (202, x-amzn-waf-action: challenge) | standard 6/6; steel 9/9 | browser_local | 202, x-amzn-waf-action: challenge |

Notes:
- T018 and T059 got the real page in today's probe (200), and their contracts pass on its text. T012 got a 200 page whose contract passes on its raw HTML but not on its text. The other 38 probe bodies fail their task's contract, on the text and on the raw HTML.
- T047 and T071 met a Cloudflare **block** ("Sorry, you have been blocked") in the probe but a challenge in the runs, so their type follows the runs.
- A blocked answer carries no rawHtml (the runner saves rawHtml only on success), so the widget type in a blocked run cannot be read from saved pages. It comes from the gate signals and from today's probe. Where neither names it, the type is `unknown` (T021, T025, T050).

Not candidates:
- T008 and T078 ended `rate_limit` with no vendor signal and were not part of #712.
- T004 and T013 are `geo_restricted`.
- T030, T059 (its 401) and T064 met login walls. T059 is a candidate anyway, for its DataDome captcha served with 401.

## 2. Pages added

The task file's `contract` field gives, for each added task, what must appear once the challenge is passed and why the challenge page fails it.

Rules:
- Public pages only.
- Each URL's robots.txt (`User-agent: *`) was read once and allows the path.
- One GET per page on 2026-10-25, 11:22–11:30 UTC.

The scout's search behind them looked in research/parity/sites.md, tasks.v1.json, docs/evidence and research/, then the web. In the repo it found no saved run that showed Turnstile, reCAPTCHA, hCaptcha, GeeTest or AWS WAF. AWS WAF was then found on real pages by this check: the probe met it on sae.org and immobilienscout24.de, and on the candidates B008 and T043.

| Task | URL | Origin | Type | Vendor / widget | Probe 2026-10-25 | Contract (predicates) |
| --- | --- | --- | --- | --- | --- | --- |
| C001 | https://www.alltrails.com/trail/us/california/half-dome-trail | real | datadome | DataDome: interstitial (rt=i) | 403, “alltrails.com”, x-datadome: protected, rt i | markdownMatches `Half Dome`; markdownMatches `elevation gain` |
| C002 | https://www.seloger.com/immobilier/achat/immo-paris-75/ | real | datadome | DataDome: interstitial (rt=i) | 403, “seloger.com”, x-datadome: protected, rt i | markdownMatches `Paris`; markdownCountMin `\d[\d\s  .]*\s?€` ≥ 5 |
| C003 | https://allegro.pl/kategoria/laptopy-491 | real | datadome | DataDome: interstitial (rt=i) | 403, “allegro.pl”, rt i | markdownMatches `laptop`; markdownCountMin `\d[\d\s ]*,\d{2}\s?zł` ≥ 5 |
| C004 | https://www.fiverr.com/categories/graphics-design | real | perimeterx | PerimeterX (HUMAN): press-and-hold ("It needs a human touch", 403) | 403, “It needs a human touch” | markdownMatches `Logo Design`; markdownMatches `Graphics` |
| C005 | https://www.sae.org/standards/ | real | aws_waf | AWS WAF: challenge (202, x-amzn-waf-action: challenge) | 202, x-amzn-waf-action: challenge | markdownMatches `standards`; markdownMatches `\b(?:J\d{3,4}\|AS\d{3,5}\|ARP\d{3,5}\|AMS\d{3,5})\b` |
| C006 | https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten | real | aws_waf | AWS WAF: captcha ("Ich bin kein Roboter", 401, AwsWafIntegration) | 401, “Ich bin kein Roboter - ImmobilienScout24” | markdownMatches `Wohnung`; markdownCountMin `\d[\d.]*(?:,\d{2})?\s?€` ≥ 5 |
| C007 | https://www.ssense.com/en-us/men/sneakers | real | cloudflare_challenge | Cloudflare: managed challenge (cType managed) | 403, “Just a moment...”, cf-mitigated: challenge, cType managed | markdownMatches `sneakers`; markdownCountMin `\$\s?\d{2,5}` ≥ 5 |
| C008 | https://www.scrapingcourse.com/cloudflare-challenge | vendor_demo | cloudflare_challenge | Cloudflare (a scraping-practice page): managed challenge (cType managed) | 403, “Just a moment...”, cf-mitigated: challenge, cType managed | markdownMatches `bypassed` |
| C009 | https://2captcha.com/demo/cloudflare-turnstile | vendor_demo | turnstile | Cloudflare Turnstile (2captcha demo form): Turnstile widget in a form | 200, “Cloudflare Turnstile demo: Sample Form with Cloudf” | markdownMatches `passed successfully` |
| C010 | https://2captcha.com/demo/recaptcha-v2 | vendor_demo | recaptcha_v2 | Google reCAPTCHA v2 (2captcha demo form): reCAPTCHA v2 checkbox in a form | 200, “Google reCAPTCHA v2 demo: Sample Form with Google ” | markdownMatches `passed successfully` |
| C011 | https://www.google.com/recaptcha/api2/demo | vendor_demo | recaptcha_v2 | Google reCAPTCHA v2 (Google's demo): reCAPTCHA v2 checkbox in a form | 200, “ReCAPTCHA demo” | markdownMatches `Verification Success` |
| C012 | https://2captcha.com/demo/recaptcha-v3 | vendor_demo | recaptcha_v3 | Google reCAPTCHA v3 (2captcha demo form): reCAPTCHA v3 score, no widget | 200, “Google reCAPTCHA v3 demo: Sample Form with Google ” | markdownMatches `passed successfully` |
| C013 | https://accounts.hcaptcha.com/demo | vendor_demo | hcaptcha | hCaptcha (its own demo form): hCaptcha checkbox in a form | 200, “hCAPTCHA Demo” | markdownMatches `\bsuccess` |
| C014 | https://2captcha.com/demo/geetest | vendor_demo | geetest | GeeTest v3 (2captcha demo form): GeeTest slide in a form | 200, “GeeTest captcha demo: Sample Form with GeeTest cap” | markdownMatches `passed successfully` |
| C015 | https://2captcha.com/demo/geetest-v4 | vendor_demo | geetest | GeeTest v4 (2captcha demo form): GeeTest v4 in a form | 200, “GeeTest captcha v4 demo: Sample Form with GeeTest ” | markdownMatches `passed successfully` |

The `real` pages were challenged in today's probe, so the text a passed page shows was not seen. Their contracts ask for the shape such a page must have: its subject and several prices or standard numbers. Each one fails on the captured challenge page.

The `vendor_demo` pages are the only pages found for Turnstile, reCAPTCHA v2/v3, hCaptcha and GeeTest. They are test pages, like nowsecure.nl, which tasks.v1.json excluded. captcha-report.mjs counts them in their own table, never in the real-page numbers. Their contract is the message a solved and submitted form shows:
- 2captcha's own message string `captcha_passed_message` ("Captcha is passed successfully!") is in a script on each 2captcha demo, not in the page text before the solve. The page's code samples say "Captcha solved", so that phrase is not the contract.
- Google's "Verification Success" is widely cited but was not seen in this check.
- For hCaptcha's result, only its stylesheet (`.hcaptcha-success`) was seen.

A solver arm that only reads, without submitting the form, will not pass them. That is a result to report, not a fault of the task.

Probed and not added:

| URL | Why not |
| --- | --- |
| leboncoin.fr/recherche, hermes.com/us/en, vinted.fr/catalog, zillow.com/homes (robots disallows it as well), bilibili.com/v/popular/all, jianshu.com, booking.com/city/fr/paris, priceline.com, soundcloud.com/discover, ticketmaster.co.uk, wellfound.com, footlocker.co.uk, neimanmarcus.com | 200 with the real page today; no challenge to measure |
| reddit.com/r/datascience | robots.txt disallows everything for `*`; today it served a JS verification page, not a captcha |
| cargurus.com, kiva.org | 406 with an empty body; vendor unknown |
| footlocker.com | 429 with an empty body; vendor unknown |
| stockx.com/sneakers, cdiscount.com | 403 "Error" (Cloudflare) and a small script page; the type could not be told from one GET |
| realtor.ca | a Cloudflare block ("Sorry, you have been blocked"), not a challenge |
| scrapingcourse.com/antibot-challenge | the same Cloudflare managed challenge as C008 |
| 2captcha.com/demo/hcaptcha | redirects to / (the demo is gone) |
| nopecha.com/captcha/{awscaptcha, perimeterx, turnstile, hcaptcha, geetest} | script-only shells: what a passed page shows is not known, so no contract could be written that proves it |

## 3. Type breakdown

| Type | saved_run | real (added) | vendor_demo | Total |
| --- | --- | --- | --- | --- |
| cloudflare_challenge | 10 | 1 | 1 | 12 |
| datadome | 9 | 3 | 0 | 12 |
| akamai | 6 | 0 | 0 | 6 |
| perimeterx | 4 | 1 | 0 | 5 |
| aws_waf | 2 | 2 | 0 | 4 |
| unknown | 3 | 0 | 0 | 3 |
| cloudflare_block | 3 | 0 | 0 | 3 |
| recaptcha_v2 | 0 | 0 | 2 | 2 |
| geetest | 0 | 0 | 2 | 2 |
| vercel_checkpoint | 1 | 0 | 0 | 1 |
| site_captcha | 1 | 0 | 0 | 1 |
| arkose | 1 | 0 | 0 | 1 |
| kasada | 1 | 0 | 0 | 1 |
| turnstile | 0 | 0 | 1 | 1 |
| recaptcha_v3 | 0 | 0 | 1 | 1 |
| hcaptcha | 0 | 0 | 1 | 1 |
| **all** | 41 | 7 | 8 | 56 |


Of the 56 tasks, 41 come from saved runs and 15 were added (7 real pages, 8 vendor demos). Two thirds of the real-page tasks are DataDome, Cloudflare and PerimeterX:
- **Not solver-facing, but in the denominator:** akamai (an "Access Denied" 403, no widget), cloudflare_block, vercel_checkpoint and unknown. Every task stays in the denominator, so a solver arm's result on these types will show it.
- **No real page found:** Turnstile, reCAPTCHA, hCaptcha and GeeTest have only vendor demos in this set.

## 4. Harness

- `run-set.mjs` gains three options:
  - `--tasks <file>`, which refuses a file whose tasks no longer hash to its `manifestSha256`;
  - `--arm <name>`, a label;
  - `--solver-providers`, default `capsolver`.

  Each attempt now records its `challengeType` and `solver`. `solver` holds the solver's calls from `evidenceRecord.access.paidCalls[]`: solves attempted and succeeded, the solver's own USD (apart from the ledger's charge), and solve ms. It is null when the answer says nothing of paid calls. With a typed task file, the record adds a table by challenge type.
- `captcha-window.mjs` runs one window over these arms: standard, installed_chrome, the combined installed_chrome + Steel grant, and each of them `+solver`.
  - A solver arm needs `--solver-grants <arm>+solver=<file>` (a grant that lists `third_party_captcha_solver`) and `--solver-env`.
  - Until those exist, the arm is not started, and the manifest names why.
- `captcha-report.mjs` reports per arm and per type, real pages and demos apart, unknown where not measured:
  - verified and false success;
  - solves attempted and succeeded;
  - solver-reported USD and USD per solve;
  - the ledger's charge;
  - reported solve ms, plus the median added wall ms against the same arm without the solver;
  - planned, attempted and not run.

  Its logic is in `captchaReport.mjs`, tested by `packages/runtime/test/captchaReport.test.ts`.
- The field names the harness reads from a solver call (`solveAttempts`, `solves`, `reportedCostUsd`/`costUsd`, `solveMs`/`durationMs`) are a proposal to the adapter session. If the adapter names them differently, change the lists in `captchaReport.mjs`.

## Commands

- Candidates: a read-only Python scan of the three sources above (attempts.jsonl, responses/, summary.json), kept outside the repository.
- Probe: `curl -s -x http://127.0.0.1:7890 --compressed -m 25 -A '<Chrome 141 desktop UA>' -H 'Accept: text/html,…' -H 'Accept-Language: en-US,en;q=0.9' -D <h> -o <body> <url>`, once per URL, plus one `robots.txt` per host. The bodies stay outside the repository.
- Harness check (standard arm only, no grant, $0): `node research/access/captcha-window.mjs --window 9 --date 2026-10-25-smoke --arms standard --only T002,C001,C011 --ports 8849 --blocks 1`. All three ended blocked (cloudflare_challenge, bot_detected_generic, captcha). This is a check of the driver, not a measurement, and it is not counted anywhere.
