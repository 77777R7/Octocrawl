# Real-site run 2026-10-05: card-grid routing at `0e9e415`

Follows [2026-10-05-card-grid-routing-proxied-8bc5090.md](2026-10-05-card-grid-routing-proxied-8bc5090.md).

## Why this rerun

A clean-context review of `8bc5090` found a false positive in local fixtures: an article routed as `collection` when it had any of these:
- a comment list of 8 comments, each leading with its author's link;
- a Wikipedia-style list of 25 references.

Commit `0e9e415` adds that failing test and stops counting groups named for comments, replies, references, citations or footnotes as cards. This record repeats the 8bc5090 checks at `0e9e415`.

## Setup

- **Source commit:** `0e9e415` (branch `claude/card-grid-routing`).
- **Network:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890). Every API response below records `evidence.envProxy: 127.0.0.1:7890`. No direct run was made.
- **When:** 15:20 to 15:30 UTC on 2026-10-05.
- **Raw responses:** `.w2l/parity/2026-10-05-card-grid/0e9e415/` (git-ignored).

## Offline survey

The 27 captures from the 8bc5090 record were read again by `extractTf.extract` at `0e9e415`:
- Every page has the page type and strategy it had at `8bc5090`.
- Every page's `mainHtml` has the same length as at `dfae31f`.

## API runs

| URL | Scrape | Status, lane | Page type / strategy / confidence | Markdown |
| --- | --- | --- | --- | --- |
| https://sandbox.oxylabs.io/products | `475fce06-e597-4ddc-b773-d7582eb81fb3` | `success`, http | collection / article / 0.75 | 24262 |
| https://web-scraping.dev/products | `f079cc11-4931-46b2-a58f-dd7dfc84b164` | `success`, http | collection / article / 0.75 | 2489 |
| https://www.newegg.com/p/pl?N=100006740 | `2130128a-2075-428f-b4e3-f60f6d69c378` | `success`, http | collection / article / 0.75 | 77724 |
| https://github.com/trending | `63da7774-7ace-4dbc-8203-820faafd8ac6` | `success`, http | collection / article / 0.75 | 76162 |
| https://www.gymshark.com/collections/all-products | `0698f783-b1d5-4fc2-bcfa-8b0a7b149440` | `success`, http | collection / article / 0.75 | 38512 |
| https://en.wikipedia.org/wiki/Octopus | `dbb5ee20-75d6-4d51-8e4f-c113eba4c9d3` | `success`, http | article / article / 1 | 191587 |
| https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a | `72f055ae-7e00-4688-be22-79a2ab4552f9` | `success`, http | article / article / 1 | 29722 |
| https://blog.cloudflare.com/the-road-to-quic/ | `aed888c7-7d1f-42a2-b2bf-4591b9dd8a4f` | `success`, browser_local | article / article / 1 | 20881 |
| https://overreacted.io/a-complete-guide-to-useeffect/ | `078a1773-9e87-4453-a66a-df9a0a3c5cde` | `success`, http | article / article / 1 | 70359 |
| https://martinfowler.com/articles/microservices.html | `75349536-7219-40e4-9161-8926405482ab` | `success`, http | article / article / 1 | 50171 |
| https://css-tricks.com/snippets/css/a-guide-to-flexbox/ | `e23bf4b3-5b02-46ef-ab3d-f33e4f795bee` | `success`, http | article / article / 1 | 30276 |

**How the runs were made:**
- API: `npm run api` on port 8787.
- Request: `curl --noproxy '*' -X POST localhost:8787/v1/scrape -d '{"url":"<url>","debug":true}'`, run at 15:25 UTC.
- The page type is read from the last `extract` event in the response's trace.

css-tricks.com, an article with a comment section, was added to the runs at `8bc5090`.

## Regression batch

`node research/parity/run-sites.mjs --batch lists --record research/parity/runs/2026-10-05-lists-proxied-0e9e415.md`, proxied, at `0e9e415`, passed 8/8 cases and 34/34 checks. Each case's page type and strategy match the batch's runs at `3e5d62f` and `8bc5090`.
