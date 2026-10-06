# Library-level probe, 2026-10-05

Label: `library_probe`. Three single requests per URL through the same egress, to form hypotheses for the `suspected` field. This is not the product path and decides nothing about a task: a route that works in a library is not proof of why a site refused, and the product adds robots.txt, pacing, identity checks and extraction on top.

- Input: the 55 candidate tasks of `runs/2026-10-05-window1-29e77ed.md` that were not verified cold when the probe ran (the blind set was not probed, so no routing table can be built from it). Three of them were dropped from the task file afterwards: MediaMarkt, SHEIN and Statista (see `excluded` in tasks.v1.json); their rows stay below.
- Command: `HTTPS_PROXY=http://127.0.0.1:7890 node research/access/probe.mjs <input.json> <out.json>`, from a scratch folder with `impit@0.14.5` and `undici@7` installed (impit is not a repository dependency).
- Network: proxied through the local proxy (HTTPS_PROXY=http://127.0.0.1:7890); the exit address was not recorded (pages answered with Singapore variants). Impit arms finished 2026-10-05T13:17:49.056Z.
- The first pass's undici arm failed on every URL: it passed `maxRedirections`, which undici 7 removed. That arm was re-run alone at 2026-10-05T13:20:25.600Z with a redirect interceptor and merged; the impit arms were not re-run. `research/access/probe.mjs` in this commit is the corrected script.
- Arms: undici with Octocrawl's standard-mode User-Agent (Chrome/128); impit's `chrome` profile with its own headers; impit's `chrome125` profile with Octocrawl's User-Agent. A pass is HTTP 200, more than 2,000 bytes and no challenge wording; the wording check is crude.

| undici / impit chrome / impit + Octocrawl UA | Tasks |
| --- | --- |
| fail / fail / fail | 42 |
| pass / pass / pass | 7 |
| fail / pass / pass | 4 |
| fail / pass / fail | 1 |
| pass / fail / pass | 1 |

Hypotheses this supports, none isolated:

- Where every arm fails (the largest group), a browser-compatible TLS stack alone does not change the answer from this exit.
- Where undici fails and both impit arms pass (Iron Mountain, FRED, Best Buy, Zalando), the client's transport fingerprint is a likely factor; these are the first hosts for G1 to test.
- Where every arm gets the HTML, the product fails later, in rendering or extraction, not at access.
- Bloomberg passed only with impit's own headers, so header and User-Agent consistency may matter as well as TLS.

| Task URL | Window 1 status / reason | undici | impit chrome | impit + Octocrawl UA |
| --- | --- | --- | --- | --- |
| https://studylib.net/doc/28545749/google-2025-environmental-report | blocked / cloudflare_challenge | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://ember-energy.org/data/electricity-data-explorer/ | blocked / cloudflare_challenge | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://demoshop.oxid-esales.com/Merchandise/Uhren/Gold-Spirit.html | blocked / cloudflare_challenge | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.jpc.de/jpcng/books/detail/-/art/die-augenheilkunde/hnum/11617379 | failed / connection_error | Error | ConnectError | ConnectError |
| https://www.etsy.com/ | blocked / bot_detected_generic | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.amazon.com/ | success /  | 202 | 202 | 202 |
| https://www.ironmountain.com/data-centers/colocation | blocked / rate_limit | 429 | 200 | 200 |
| https://fred.stlouisfed.org/series/UNRATE | failed / timeout | HeadersTimeoutError | 200 | 200 |
| https://data-explorer.oecd.org/s/1xl | failed / empty_unverified | 200 (challenge wording) | 200 (challenge wording) | 200 (challenge wording) |
| https://www.tiktok.com/ | failed / empty_unverified | 200 | 200 | 200 (challenge wording) |
| https://www.walmart.com/browse/electronics/laptops/3944_3951_1089430_132960 | success /  | 200 (challenge wording) | 200 (challenge wording) | 200 (challenge wording) |
| https://www.bestbuy.com/site/searchpage.jsp?st=laptop | failed / timeout | HeadersTimeoutError | 200 | 200 |
| https://www.homedepot.com/b/Tools-Power-Tools-Drills/N-5yc1vZc27f | blocked / bot_detected_generic | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www2.hm.com/en_us/men/products/shirts.html | success /  | 403 (challenge wording) | 200 (challenge wording) | 200 (challenge wording) |
| https://www.wayfair.com/furniture/sb0/sofas-c413892.html | blocked / rate_limit | 200 (challenge wording) | 200 (challenge wording) | 429 (challenge wording) |
| https://www.costco.com/laptops.html | success /  | 200 (challenge wording) | 200 (challenge wording) | 200 (challenge wording) |
| https://www.ebay.com/b/Laptops-Netbooks/175672/bn_1648276 | failed / http_error | 403 | 403 | 403 |
| https://www.ikea.com/us/en/cat/sofas-fu003/ | success /  | 200 | 200 | 200 |
| https://www.sephora.com/shop/moisturizing-cream-oils-mists | blocked / bot_detected_generic | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.nordstrom.com/browse/women/clothing/dresses | failed / empty_unverified | 200 | 200 | 200 |
| https://www.zalando.de/herrenschuhe/ | failed / timeout | 403 | 200 | 200 |
| https://www.mediamarkt.de/de/category/notebooks-27.html | failed / empty_unverified | 403 (challenge wording) | 403 (challenge wording) | 200 (challenge wording) |
| https://www.idealo.de/preisvergleich/ProductCategory/3751.html | failed / http_error | 403 | 200 (challenge wording) | 200 (challenge wording) |
| https://www.aliexpress.com/category/702/laptops.html | failed / empty_unverified | 200 | 200 | 200 |
| https://www.temu.com/ | failed / empty_unverified | 200 | 200 | 200 |
| https://www.shein.com/ | failed / empty_unverified | 200 (challenge wording) | 200 (challenge wording) | 200 (challenge wording) |
| https://www.etsy.com/c/jewelry/necklaces | blocked / bot_detected_generic | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.expedia.com/Paris-Hotels.d179898.Travel-Guide-Hotels | blocked / rate_limit | 429 | 429 (challenge wording) | 429 (challenge wording) |
| https://www.tripadvisor.com/Hotels-g187147-Paris_Ile_de_France-Hotels.html | blocked / bot_detected_generic | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.realtor.com/realestateandhomes-search/Seattle_WA | blocked / rate_limit | 429 | 429 | 429 |
| https://www.redfin.com/city/16163/WA/Seattle | failed / http_error | 405 (challenge wording) | 405 (challenge wording) | 405 (challenge wording) |
| https://www.idealista.com/venta-viviendas/madrid-madrid/ | blocked / bot_detected_generic | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.g2.com/categories/crm | blocked / bot_detected_generic | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.capterra.com/customer-relationship-management-software/ | blocked / cloudflare_challenge | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.crunchbase.com/organization/openai | blocked / cloudflare_challenge | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.yelp.com/search?find_desc=coffee&find_loc=San+Francisco%2C+CA | blocked / bot_detected_generic | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.similarweb.com/website/wikipedia.org/ | blocked / bot_detected_generic | 403 | 202 | 202 |
| https://www.imf.org/en/Publications/WEO | blocked / bot_detected_generic | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.statista.com/statistics/262966/number-of-apple-iphones-sold/ | success /  | 200 (challenge wording) | 200 (challenge wording) | 200 (challenge wording) |
| https://ec.europa.eu/eurostat/databrowser/view/tps00001/default/table | failed / empty_unverified | 200 | 200 | 200 |
| https://data.worldbank.org/indicator/NY.GDP.MKTP.CD | success /  | 200 | 200 | 200 |
| https://www.investing.com/indices/us-spx-500-historical-data | failed / http_error | 403 | 403 | 403 |
| https://www.nasdaq.com/market-activity/stocks/aapl/historical | success /  | 200 | 200 | 200 |
| https://www.reuters.com/markets/ | blocked / login_wall | 401 (challenge wording) | 401 (challenge wording) | 401 (challenge wording) |
| https://www.bloomberg.com/markets/stocks | blocked / bot_detected_generic | 403 (challenge wording) | 200 | 403 (challenge wording) |
| https://www.wsj.com/market-data/stocks | success /  | 200 (challenge wording) | 200 (challenge wording) | 200 (challenge wording) |
| https://www.economist.com/finance-and-economics | blocked / bot_detected_generic | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.carvana.com/cars | blocked / cloudflare_challenge | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.autotrader.com/cars-for-sale/all-cars/seattle-wa | success /  | 200 (challenge wording) | 200 (challenge wording) | 200 (challenge wording) |
| https://www.cars.com/shopping/results/?stock_type=used&zip=98101 | blocked / cloudflare_challenge | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.stubhub.com/ | blocked / bot_detected_generic | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.reddit.com/r/datascience/ | failed / http_error | 200 | 200 (challenge wording) | 200 |
| https://stackoverflow.com/questions/tagged/web-scraping | blocked / cloudflare_challenge | 403 (challenge wording) | 403 (challenge wording) | 403 (challenge wording) |
| https://www.instagram.com/nasa/ | blocked / rate_limit | 429 | 429 | 429 |
| https://www.facebook.com/NASA/ | failed / http_error | 400 | 200 (challenge wording) | 200 (challenge wording) |
