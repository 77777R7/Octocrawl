# Real-site run 2026-09-29

Command: `node research/parity/run-sites.mjs --only J01,J02,J03,J04,J05,L01,S02,E04,A33,F14 --record research/parity/runs/2026-09-29-json-numbers.md`
Source commit: `f50da4dd92acffd951f0f0a567a1235cdd52b044`
Run: 2026-09-29T15:14:54.151Z → 2026-09-29T15:15:24.820Z against http://127.0.0.1:8900
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 9 of 10 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 10/10; checks passing: 82/82.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| S02 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 4/4 | — |
| L01 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 10/10 | — |
| E04 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 8/8 | — |
| A33 | https://books.toscrape.com/ | 6/6 | — |
| J01 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 15/15 | — |
| J02 | https://catalog.data.gov/dataset/electric-vehicle-population-data | 15/15 | — |
| J03 | https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | 3/3 | — |
| F14 | https://assets.sttelemediagdc.com/sttgdc/global_en/public/2024-08/STT_GDC_Sustainability-Linked_Financing_Framework_2024.pdf | 9/9 | — |
| J04 | https://www.jpc.de/jpcng/books/detail/-/art/die-augenheilkunde/hnum/11617379 | 8/8 | — |
| J05 | https://demoshop.oxid-esales.com/Merchandise/Uhren/Gold-Spirit.html | 4/4 | — |

Recorded values:

- E04 evidenceSchema: valid (http, success)

Notes:

- API: `W2L_TASK_ROOT=.w2l/api node --import tsx packages/api/src/cli.ts --port 8900` (local mode, with `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` from the environment, `127.0.0.1:7890`), started with an empty task root just before this run; the runner had `W2L_API_URL=http://127.0.0.1:8900`. None of these cases needs a hosted-mode API. No request failed on the network. J03 is the case without a proxy in its response: it is refused with HTTP 400 before any fetch.
- The source commit `f50da4d` is the three changes of this branch (`06ba5bd` JSON numbers, `e4a3d48` evidence for empty product lists, `1269560` `pattern` docs) plus the cases J04 and J05 (`f50da4d`), on `af2ce96`.
- J04 (jpc.de, shows `EUR 399,99*`): `complete`, price 399.99 read from the JSON-LD value `"399.99"`, with the evidence entry `{ "path": "/price", "source": "jsonld", "text": "399.99" }`. On the code before this branch the price check would pass too; the evidence check would not, as entries had no `text`.
- J05 (OXID demo shop, shows only `499,00 €`): W2L routed the page as `article`: it declares no structured data, and the product's `div.price-label` has seven recommendation price elements beside it. So no product price was read and `/price` is `missing_required`, the second branch the case accepts. The number reader was not reached on this page, so neither J04 nor J05 exercises reading a comma-decimal text; that is covered by local fixtures only (`packages/api/test/structured.test.ts`, `packages/api/test/app.test.ts`).
- Pages looked at before choosing J04 and J05, with a robots.txt request and one or two page requests per site: sandbox.oxylabs.io (shows `91,99 €`, title in an `h2`, routed as `collection`), reclam.de (one edition's JSON-LD does not parse and an `h2` sits between the `h1` and the price, so it is routed as `article`; another edition declares `5.8`), suhrkamp.de (declares `299.00`), bpb.de (shop listing built by script), scrapingsandbox.com (US dollars) and snocks.com (answered 301). jpc.de and the OXID demo shop had the same requests plus a category page (OXID) and one scrape each through this API before the run. Of the German shop pages that W2L routes as products, every one declared its price in JSON-LD with a decimal point.
- L01, J01 and E04 read `£51.77` as 51.77 as before; `json.evidence` now also quotes `"£51.77"` (and `"0"` for `numberOfReviews`). The Evidence Record's `fieldEvidence` keeps `{ source, locator }`, which J01 and E04 check.
