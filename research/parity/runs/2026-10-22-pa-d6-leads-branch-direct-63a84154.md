# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M18 --record research/parity/runs/2026-10-22-pa-d6-leads-branch-direct-63a84154.md`
Source commit: `63a841544563329b544e695714b8a8f07217a639`
Engine: the API on 8793 ran this checkout, the PA D6 collection-leads branch at `63a84154` (`extract-tf/37`), after `npx tsc --build`, started with the proxy variables removed. Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T18:06:13.419Z → 2026-10-21T18:06:13.888Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 0 of 1 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 0/1; checks passing: 0/2.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M18 | https://www.ft.com/technology | 0/2 | field status (FS); markdownCountMin (scrape-formats.only-main-content) |

Failed checks with the observed value:

- M18 [FS] field `status`: failed
- M18 [scrape-formats.only-main-content] markdownCountMin `https://www\.ft\.com/content/[0-9a-f-]{36}`: 0

Note (written with the run): `failed`/`connection_error` on both channels, as on `main` direct: www.ft.com could not be reached direct from this network on 2026-10-22. This run says nothing about the extraction; M18 is read proxied.
