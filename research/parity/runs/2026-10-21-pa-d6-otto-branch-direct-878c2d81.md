# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only J08 --record research/parity/runs/2026-10-21-pa-d6-otto-branch-direct-878c2d81.md`
Source commit: `878c2d8199c1d0a239a2fbfb26bb9e0bbbf5737b` (working tree had uncommitted changes: the J08 case in `sites.md`/`sites.v1.json` and the earlier main records, not the engine)
Engine: the API on 8787 ran this checkout, the PA D6 branch at `878c2d81` (`extract-tf/34`), started with the proxy variables removed.
Run: 2026-10-21T03:58:03.576Z → 2026-10-21T03:58:04.940Z against http://127.0.0.1:8787
Network: NO_PROXY set in the runner's environment; 0 of 1 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 0/1; checks passing: 1/6.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| J08 | https://www.otto.de/p/lenovo-loq-17irx10-rtx-5050-5060-5070-gaming-notebook-43-9-cm-17-3-zoll-intel-core-i7-13650hx-geforce-rtx-5060-32-gb-1000-gb-ssd-1996119966/?variationId=1996119866 | 1/6 | field status (FS); field json.status (scrape-formats.json); field json.data.name (scrape-formats.json); field json.data.currency (scrape-formats.json); fieldType json.data.price (scrape-formats.json) |

Failed checks with the observed value:

- J08 [FS] field `status`: failed
- J08 [scrape-formats.json] field `json.status`: incomplete
- J08 [scrape-formats.json] field `json.data.name`: absent
- J08 [scrape-formats.json] field `json.data.currency`: absent
- J08 [scrape-formats.json] fieldType `json.data.price`: undefined

Note (written with the run): J08 answered `failed` / `http_error` with HTTP 400 on the `http` channel, the only one tried; the response kept no Markdown. A plain `curl` of the same URL the same morning, proxied and direct, got the same HTTP 400 with an 883-byte Kasada bot-check page (`KPSDK`) as its body. The OTTO page refused the request, so this run says nothing about the variant or price rule; the rule is tested by the fixtures in `packages/extract-tf/test/product.test.ts`.
