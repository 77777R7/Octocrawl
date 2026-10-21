# Brief: hosted-crawl-and-batch-jobs

- **Kind:** a launch post for hosted crawl and batch jobs (ROADMAP PH stage H2), not written for a search query. No SERP research was done for it.
- **Primary task:** a reader whose agent already uses Octocrawl, or might, learns that it can now crawl a site section or read a URL list on the hosted server, what that costs, and how to start.
- **content_boundary:** what the jobs are and their limits, one real Claude Code run with its tool calls, why Markdown matters, the Evidence Record per page, cost, when to run locally, setup.
- **must_not_cover** (link instead): every client's setup (→ /docs/connect-mcp/#crawl-and-batch-jobs), finding every URL of a site (→ find-all-pages-on-a-website), a URL list with its failures kept (→ scrape-list-of-urls).
- **Messaging:** leads with Markdown the agent can read in fewer tokens, then the Evidence Record. It does not lead with blocked or failed pages.

## The run in the post

- **When:** 2026-10-21 19:01:57 to 19:02:28 UTC (the session), and 19:02:02.234 to 19:02:11.815 UTC (the job).
- **Client:** `claude -p` (Claude Code 2.1.301, model `claude-opus-5-5`).
  - Flags: `--strict-mcp-config`, with an MCP config naming `https://mcp.octocrawl.dev/mcp` and an `Authorization: Bearer ${OCTO_BLOG_KEY}` header.
  - Allowed tools: `mcp__octocrawl__crawl,wait_crawl,get_crawl,get_crawl_pages`.
  - Disallowed tools: `WebFetch,WebSearch,Bash,Read,Write,Edit,Glob,Grep,Agent`.
  - Output: stream-json.
- **Key:** issued for Howard's account for the run (`scripts/hosted/issue-key.mjs`, digest `4c3faad5…`), HTTP lane only, and revoked after it. The key does not appear in the saved transcript.
- **Server:** API revision `octocrawl-api-cursor-f7708b3` (tag `h37cursor`, main `f7708b3c`) and worker `octocrawl-jobs-w10-54272e8`.
- **Prompt:** as quoted in the post.
- **Tool calls:**
  - `crawl` with `{url: …/server/, maxPages: 15, fastMode: true, idempotencyKey: "mcp-spec-server-2025-11-25-crawl15"}` returned task `2964ff7d-31f7-4b64-b1c6-3a9d3dfa6f9a`, `running`.
  - `wait_crawl` with `{timeoutMs: 90000}` returned `completed`, 7 pages, 7 succeeded, 0 failed, 7 credits.
  - `get_crawl_pages` with `{maxResults: 100, includeDuplicates: true}` returned 4 items with `stoppedBy: size` and `hasMore: true`.
  - `get_crawl_pages` with the returned cursor returned 3 items with `stoppedBy: end`.
- **Result:** 6 turns and 30,162 ms for the session. The answer's table is quoted in the post with the page titles shortened. Claude's note that `resources/unsubscribe` appears on none of the pages is left out of the post.

## Measurements behind the post

- **Markdown per page (characters):** `/server` 1,086, `/server/prompts` 6,862, `/server/resources` 9,519, `/server/tools` 13,772, `/server/utilities/pagination` 2,276, `/server/utilities/completion` 4,545, `/server/utilities/logging` 3,194. The total is 41,254.
- **HTML as served:** fetched with `curl -sL` and a desktop Chrome User-Agent on 2026-10-21 at about 19:02:55 UTC, over the Mac's proxy. In bytes: 288,604, 500,352, 618,993, 704,967, 339,201, 419,954 and 368,385, a total of 3,240,456 bytes. These are separate fetches made right after the job, not the job's own reads.
- **Evidence Record quoted in the post:** the Tools page, with `finalUrl` …/server/tools, `fetchedAt` 2026-10-21T19:02:10.360Z, `httpStatus` 200, `robotsDecision` allowed and lane `http`.

## Two runs before this one (not in the post)

- **18:20 UTC, a crawl of `/specification/2025-11-25/` with maxPages 25:**
  - The crawl read 25 pages.
  - `get_crawl_pages` stopped at 4 pages for size, and the cursor it returned was refused (`cursor is not one this API issued`).
  - That is the bug #674 fixed. Deployed as `h37cursor` before the run above.
- **19:00 UTC, the same prompt after the fix:**
  - Claude reused its idempotency key, so the start replayed the 18:20 job instead of starting a new one.
  - It then read all 25 pages over 11 `get_crawl_pages` calls.
  - Its notes found that `/architecture/index` and `/basic/index` were crawled as pages apart from `/architecture` and `/basic`, with the same content. That is a follow-up for the crawl's URL folding.
