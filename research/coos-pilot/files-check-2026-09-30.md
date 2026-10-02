# Seed-user sources: file download and PDF text check (2026-09-30)

First live check of the S1 file work ([ROADMAP](../../ROADMAP.md), S1) on five PDFs from the seed user's source list ([urls.txt](urls.txt)), through the local MCP service at commit `8467e8e` (the commit that adds file download and PDF text), from the cloud session, each URL fetched once (the Equinix URL twice: the second call with `debug: true` to record the refusal's trace). Every call went through the session's `HTTPS_PROXY`.

| Source | Result | Pages / with text | Bytes | SHA-256 | Text chars | Wall | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OVHcloud `kpis_fy25.pdf` (line 52) | `success` | 3 / 3 | 267,398 | `facf8c6699f72ebb…` | 1,173 | 1019 ms | PUE/WUE/REF table rows come out as lines: `Roubaix – France 1.30 2 0.29 1 100%` |
| AirTrunk Green Financing Framework (line 38) | `success` | 12 / 12 | 342,998 | `dfa24a3fe9f8c87b…` | 22,042 | 1560 ms | every page has a text layer; `Date April 2025`, `A$24 billion` present |
| Nebius 2025 Sustainability Report (line 54) | `success` | 72 / 72 | 4,878,004 | `38a7d1750df525cd…` | 217,226 | 1979 ms | 72 pages read in under 2 s wall including the 4.9 MB download; `Highlights 2025` table pages present |
| Equinix 2025 Data Summary (line 21) | `failed` / `policy_denied` | – | – | – | – | 571 ms | host `delivery-p112322-e1154416.adobeaemcloud.com` serves `User-agent: * / Disallow: /`; trace `robots_disallowed {pattern: "/"}`; no page request was made |
| Google 2025 Environmental Report (line 71) | `failed` / `policy_denied` | – | – | – | – | 163 ms | host `www.gstatic.com` allows only listed paths and ends with `Disallow: /`; `/gumdrop/…` is not listed; no page request was made |

## What the successful results carry

- `file`: kind `pdf`, `contentType application/pdf`, the size as received, the SHA-256 of the bytes, the saved path under `.w2l/api/files/<hash prefix>/<hash>.pdf` (git-ignored), and the filename from the URL or Content-Disposition.
- `markdown`: the text layer with a `<!-- page N -->` line before each page, so a number can be cited to its page; `file.pdf` counts pages and pages with text. The OVH table page keeps one row per line, which is what `check-observations.py` needs to find the values.
- No browser attempt: `channelsTried: ['http']` on every call.

## Finding for the seed user

Two of the five sources are hosted on CDN hosts whose robots.txt disallows every path (Adobe AEM asset delivery, gstatic). W2L honours robots.txt and reports these as `failed` / `policy_denied` with the applied rule in the trace; it does not fetch them. The publishers link these reports from their own pages, but the file hosts say no to crawlers. `ignoreRobotsTxt` stays in the roadmap's Paused table; whether to offer an explicit, recorded override for a researcher's own use is a product decision, not something this slice changes. Until then, these two files have to be downloaded by hand (their URLs and hashes can still be recorded in the manifest).

## Fetch count

ovhcloud.com 1, airtrunk.com 1, assets.nebius.com 1, adobeaemcloud.com 2 robots.txt reads and no page request, gstatic.com 1 robots.txt read and no page request; three `curl -I` header probes (OVH, Equinix, Google) before the run to read sizes.

## Not done here

The 72-URL manifest re-run and `check-observations.py` wait for the manifest freeze (the two suspect links). A scanned PDF (`ocr_required`) and the CSV/XLSX paths are covered by the unit tests only; no such file was among the five sources checked.
