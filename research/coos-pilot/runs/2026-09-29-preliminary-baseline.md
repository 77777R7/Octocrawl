# Seed-user sources: preliminary baseline, 2026-09-29

Command: `W2L_API_URL=http://127.0.0.1:8797 node research/coos-pilot/run-baseline.mjs` against `npm run api` (local mode)
Source commit: `de6f41ec27ca6f06ed12fe9ef61d31a13426f9cd`
Run: 2026-09-29, batch of the 72 URLs in `urls.txt`, `formats: ["markdown"]`
Network: this machine resolves some hosts to unusable addresses and reaches them only through an HTTP proxy that W2L does not use; results for those hosts depend on the network, not only on W2L.

Preliminary: the manifest is not frozen yet (the two suspect links still need the seed user's answer), and this run checks capture status only, not the recorded values. Raw items stay under `.w2l/coos-pilot/` (git-ignored).

## Result

72 of 72 URLs attempted; the batch completed. An earlier run on `5ce2dc8`, before the robots.txt and per-URL isolation fixes, ended `failed` after 1 of 72 because one origin's robots.txt did not answer.

| Status | URLs |
| --- | --- |
| success | 54 (75.0%) |
| failed: connection_error | 9 |
| failed: policy_denied | 6 |
| failed: http_error | 1 |
| blocked: rate_limit | 1 |
| blocked: cloudflare_challenge | 1 |

## Non-success by the capability that would fix it

| Capability | URLs | Hosts | Observed |
| --- | --- | --- | --- |
| Large response headers | 5 | services.global.ntt | `HeadersOverflowError` from the HTTP client's default header-size limit: a W2L bug |
| File download and PDF text | 3 | airtrunk.com, sustainability.atmeta.com, www.ovhcloud.com | The PDF reaches the browser lane, which reports `Download is starting` as `connection_error` |
| Network path (proxy, DNS) | 4 | delivery-p112322-e1154416.adobeaemcloud.com (3), datacenters.google | The host does not resolve on this network, reported as an egress-policy denial (`ssrf_denied`); a connect timeout |
| robots.txt disallows, honestly reported | 3 | aka.ms, go2.digitalrealty.com, www.gstatic.com | `robots_disallowed` (`/`, `/rs/`, `/`); fetching them needs an explicit per-domain override with a recorded reason |
| Declared research User-Agent | 1 | www.sec.gov | HTTP 403; SEC asks automated clients to declare a contact in the User-Agent |
| Rate limit, honestly reported | 1 | www.ironmountain.com | HTTP 429 |
| Anti-bot challenge, honestly reported | 1 | studylib.net | Cloudflare challenge, HTTP 403 in the browser lane |

Eight of the failing URLs are PDF links. Five of them fail before any PDF handling is reached (three on the network path, two on robots.txt); once reached, they need file download and PDF text as well.

By the P0 decision rule (70% or more over HTTP plus the local browser keeps the extension in P3), this preliminary run is above the line. PDFs are the largest source type among the failures, and the ROADMAP places PDF text in P2.
