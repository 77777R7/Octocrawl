# Hosted release with the NASA mega-menu fix (2026-10-17)

The fix for the false `empty_unverified` in `research/hosted/2026-10-17-scrape-page-demos-e1e128d4.md` ("Harder pages"), live on the hosted API.

- Source: main `ea3b0d7d` (#574 merged; main CI green on it). Built from a clean detached worktree of that commit: Cloud Build `b1b19217`, image `hosted-api:ea3b0d7d…`, digest `sha256:b4f28893…6423a2ac`.
- Revision `octocrawl-api-nasa-ea3b0d7`, tag `h22nasa`. It was deployed with `--no-traffic` and smoke-tested on the tag URL, then given 100% of traffic at about 15:51 UTC. The rollback is `h21fields` (`octocrawl-api-fields-e1e128d`).
- Changes since `h21fields` (`e1e128d4`): #574 (extract-tf/29), plus #568, #569, #570, #572, #573 and #576 (MCP tool descriptions, the Claude Code plugin, docs and research).
- The hosted server fetches directly: Evidence Record `access.egress.source: "direct"`. The calls from this Mac went through the shell's proxy.

## Checks

On the tag URL: `/health` ok, crawl 403, bad key 401. A keyless NASA scrape was `success` on http, extractor `extract-tf/29` commit `ea3b0d7d`.

On the live domains:

| Call | Response time (UTC) | Status | Lane | fetchedAt | Markdown SHA-256 | Notes |
|---|---|---|---|---|---|---|
| keyless `POST https://api.octocrawl.dev/v1/scrape` `{"url":<NASA>,"formats":["markdown"]}` | 15:51:16 | success, HTTP 200 | http | 2026-10-17T15:51:15.629Z | `d358fab3…845c23c3d` | readiness ready; the article, not the menu |
| hosted MCP `scrape` through Howard's `/mcp-oauth` connection, `formats: ["markdown"]`, `waitFor: 1500` | — | success, HTTP 200 | browser_local | 2026-10-17T15:51:33.740Z | `d358fab3…845c23c3d` | rawSha256 `71413398…f7b3103`; 1,623 content tokens; a browser page costs 5 credits |
| keyless `POST https://api.octocrawl.dev/v1/scrape` `{"url":"https://www.google.com/search?q=octocrawl","formats":["markdown"]}` | 15:51:17 | failed, `policy_denied` | http | null | null | Evidence Record present: robots `disallowed`, robotsSha256 `1aba570a…9538cf2c` |

NASA: <https://www.nasa.gov/blogs/missions/2026/10/07/nasa-releases-artemis-ii-lunar-science-data-images/>. The Markdown hash is the one the local run on `5bc53e51` gave (`research/parity/runs/2026-10-17-nasa-mega-menu-direct-5bc53e51.md`), on both lanes.

`gcloud logging read` (severity ERROR or higher, revision `octocrawl-api-nasa-ea3b0d7`, last 30 minutes) returned nothing.
