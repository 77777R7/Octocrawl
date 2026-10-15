# SEO-08 AI answer baseline — 16 October 2026

## Sampling conditions and result

The frozen **12 questions were all answered once in Google AI Mode**, model picker **Auto**, signed in, Web AI search, English `hl=en`, requested US `gl=us`. Observed at 16 October 2026 **03:47:32–03:53:57 Asia/Shanghai** (15 October 19:47:32–19:53:57 UTC). Each question used a fresh AI Mode URL/new question, no follow-up or answer regeneration. Browser egress/actual geographic audience was not established. Google offered “Try without personalization” in some answers; account personalization was not disabled or audited. This is a signed-in snapshot, not a region-controlled or depersonalized benchmark. No account/search setting was changed.

All 12 showed “AI Mode response is ready” and rendered substantive answers. **Six mention the Octocrawl name in the answer body; zero have an inline citation to an Octocrawl official site/repository.** The six generic questions S2/S3/T1/T2/T3/T4 had no Octocrawl mention. Two of the six name mentions (B2,C2) explicitly confuse a different entity; other brand answers also have material errors below. Name occurrence is not an accurate recommendation. These counts describe these 12 observed Google answers only; they are not market share, ranking, growth or a stable citation rate.

GSC's separately observed 2 Generative AI impressions remain a different aggregate with no known question/model attribution. These manual answers cannot be linked to those impressions, conversion, or the unpublished local changes. The browser task did not open the cited destination pages; extracted destination URLs prove the answer linked them, not that every cited page is live, correct or has been independently audited.

## Per-question record

Each source list below includes unique **inline answer hyperlinks** visible in the accessibility answer before the `Copy text` control, resolved to actual DOM `href`s. Later related-result cards and additional hidden anchors are retained raw but excluded from inline citation counts. A source outside Octocrawl can be authoritative for its own product; “third party” here means it is not an Octocrawl official source.

### B1 — What is Octocrawl and who is it for?

- Observed: `2026-10-16T03:47:32+08:00`; answer present; name mentioned: **yes**; Octocrawl official inline citation: **no**.
- Answer assessment: **partial / overclaim**. Identifies the API/MCP product, but describes unrestricted browsing and no strict daily limits without hosted/local bounds.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-B1.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [socket.dev/pypi/package/octocrawl-client/overview/0.4.1](https://socket.dev/pypi/package/octocrawl-client/overview/0.4.1), [mcpservers.org/de/servers/77777r7/octocrawl](https://mcpservers.org/de/servers/77777r7/octocrawl).

### B2 — What does Octocrawl verification.status mean?

- Observed: `2026-10-16T03:48:01+08:00`; answer present; name mentioned: **yes**; Octocrawl official inline citation: **no**.
- Answer assessment: **incorrect entity**. Treats Octocrawl as a Python reconnaissance crawler, denies the actual verification.status field and substitutes CAPTCHA/node verification.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-B2.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [github.com/b3rt1ng](https://github.com/b3rt1ng), [dnscale.eu/learning/what-is-a-captcha-challenge-response](https://dnscale.eu/learning/what-is-a-captcha-challenge-response), [docs.octa.space/verification](https://docs.octa.space/verification).

### B3 — Can hosted Octocrawl crawl a whole website?

- Observed: `2026-10-16T03:48:18+08:00`; answer present; name mentioned: **yes**; Octocrawl official inline citation: **no**.
- Answer assessment: **incorrect capability**. Says hosted supports whole-site crawl and batch; the hosted gate/docs exclude both.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-B3.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [socket.dev/pypi/package/octocrawl-client/overview/0.4.1](https://socket.dev/pypi/package/octocrawl-client/overview/0.4.1), [github.com/groktopus/groktocrawl](https://github.com/groktopus/groktocrawl).

### S1 — How do I add Octocrawl MCP to Claude Code?

- Observed: `2026-10-16T03:48:48+08:00`; answer present; name mentioned: **yes**; Octocrawl official inline citation: **no**.
- Answer assessment: **incorrect setup**. Gives https://octocrawl.com and @octocrawl/mcp-server; these differ from the actual hosted MCP URL and @octocrawl/mcp package.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-S1.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [code.claude.com/docs/en/mcp-quickstart](https://code.claude.com/docs/en/mcp-quickstart), [www.reddit.com/r/ClaudeAI/comments/1jf4hnt/setting_up_mcp_servers_in_claude_code_a_tech/](https://www.reddit.com/r/ClaudeAI/comments/1jf4hnt/setting_up_mcp_servers_in_claude_code_a_tech/), [www.youtube.com/shorts/Q4lkqtNa7t8](https://www.youtube.com/shorts/Q4lkqtNa7t8), [octolens.com/docs/ai-assistants/claude-code](https://octolens.com/docs/ai-assistants/claude-code), [codingnomads.com/claude-code-mcp-installation-configuration](https://codingnomads.com/claude-code-mcp-installation-configuration).

### S2 — How do I connect a web scraping MCP server to Codex?

- Observed: `2026-10-16T03:49:47+08:00`; answer present; name mentioned: **no**; Octocrawl official inline citation: **no**.
- Answer assessment: **not graded / generic**. Names other scraping providers; no Octocrawl recommendation or citation. Generic Codex instructions were not executed or endorsed.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-S2.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [www.youtube.com/watch](https://www.youtube.com/watch?v=gaSLGiaq5nk), [docs.brightdata.com/products/mcp-server/integrations/codex](https://docs.brightdata.com/products/mcp-server/integrations/codex), [webclaw.io/integrations/codex](https://webclaw.io/integrations/codex), [brightdata.com/blog/ai/codex-cli-with-web-mcp](https://brightdata.com/blog/ai/codex-cli-with-web-mcp), [scrapegraphai.com/blog/scrapegraphai-mcp-codex](https://scrapegraphai.com/blog/scrapegraphai-mcp-codex), [composio.dev/toolkits/webscraper_io/framework/codex](https://composio.dev/toolkits/webscraper_io/framework/codex), [www.youtube.com/watch](https://www.youtube.com/watch?v=lX5ttFJFMQM&vl=en&t=11), [www.youtube.com/watch](https://www.youtube.com/watch?v=jm8MnvdZDPw).

### S3 — What should I check after my MCP scraper returns HTTP 200?

- Observed: `2026-10-16T03:50:01+08:00`; answer present; name mentioned: **no**; Octocrawl official inline citation: **no**.
- Answer assessment: **not graded / generic**. Distinguishes HTTP transport from content checks; no Octocrawl mention/citation. Its MCP error-code/checklist examples were not validated here.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-S3.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [www.firecrawl.dev/glossary/web-scraping-apis/what-is-200-status-code](https://www.firecrawl.dev/glossary/web-scraping-apis/what-is-200-status-code), [perlod.com/tutorials/mcp-server-troubleshooting-guide/](https://perlod.com/tutorials/mcp-server-troubleshooting-guide/), [www.firecrawl.dev/glossary/web-scraping-apis/what-are-http-status-codes-web-scraping](https://www.firecrawl.dev/glossary/web-scraping-apis/what-are-http-status-codes-web-scraping), [www.scrapingbee.com/blog/wigolo-web-scraping-ai-agent/](https://www.scrapingbee.com/blog/wigolo-web-scraping-ai-agent/).

### T1 — How do I convert a public URL to Markdown and keep its links?

- Observed: `2026-10-16T03:50:28+08:00`; answer present; name mentioned: **no**; Octocrawl official inline citation: **no**.
- Answer assessment: **not graded / generic**. Recommends other converters; no Octocrawl mention/citation. Jina prefix and other product claims are model output, not endorsed instructions.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-T1.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [www.firecrawl.dev/tools/website-to-markdown](https://www.firecrawl.dev/tools/website-to-markdown), [markdownme.com/tools/url-to-markdown](https://markdownme.com/tools/url-to-markdown), [www.youtube.com/watch](https://www.youtube.com/watch?v=haP0tnH8oDQ), [web2md.org/url-to-markdown](https://web2md.org/url-to-markdown), [chromewebstore.google.com/detail/webpage-to-markdown/ajeinonckioeekcfanjndliandidilid](https://chromewebstore.google.com/detail/webpage-to-markdown/ajeinonckioeekcfanjndliandidilid), [trevorfox.com/tools/developer/url-to-markdown/](https://trevorfox.com/tools/developer/url-to-markdown/).

### T2 — How can I extract a web page as plain text without link addresses?

- Observed: `2026-10-16T03:50:55+08:00`; answer present; name mentioned: **no**; Octocrawl official inline citation: **no**.
- Answer assessment: **not graded / generic**. Names other text tools and a Python approach; no Octocrawl mention/citation. Suggested tools and code were not tested.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-T2.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [www.reddit.com/r/googledocs/comments/1nknpzm/magical_way_to_to_copy_plaintext_from_a_site_but/](https://www.reddit.com/r/googledocs/comments/1nknpzm/magical_way_to_to_copy_plaintext_from_a_site_but/), [ultimatewebscraper.com/tools/website-to-text](https://ultimatewebscraper.com/tools/website-to-text), [www.firecrawl.dev/tools/website-to-text](https://www.firecrawl.dev/tools/website-to-text), [ultimatewebscraper.com/chrome-extension/page-text-extractor](https://ultimatewebscraper.com/chrome-extension/page-text-extractor), [www.linkedin.com/videos/timothybbramlett_tools-you-should-know-about-part-3-this-activity-7410497806584639488-54ru](https://www.linkedin.com/videos/timothybbramlett_tools-you-should-know-about-part-3-this-activity-7410497806584639488-54ru), [stackoverflow.com/questions/78716562/how-to-get-only-plain-text-from-a-webpage](https://stackoverflow.com/questions/78716562/how-to-get-only-plain-text-from-a-webpage).

### T3 — How do I find a website's pages if its sitemap is incomplete?

- Observed: `2026-10-16T03:51:55+08:00`; answer present; name mentioned: **no**; Octocrawl official inline citation: **no**.
- Answer assessment: **not graded / generic**. Names crawl/search/CMS/archive methods; no Octocrawl mention/citation. Completeness and orphan-page claims were not verified.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-T3.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [exa.ai/blog/how-to-find-all-pages-on-a-website](https://exa.ai/blog/how-to-find-all-pages-on-a-website), [jetoctopus.com/how-to-identify-and-fix-broken-pages-in-xml-sitemaps/](https://jetoctopus.com/how-to-identify-and-fix-broken-pages-in-xml-sitemaps/), [www.allianceinteractive.com/blog/how-to-find-your-sitemap/](https://www.allianceinteractive.com/blog/how-to-find-your-sitemap/), [www.youtube.com/watch](https://www.youtube.com/watch?v=DNB7pUyKW1U&t=21), [help.accessibilitychecker.org/en/articles/12355261-how-to-find-your-website-s-sitemap](https://help.accessibilitychecker.org/en/articles/12355261-how-to-find-your-website-s-sitemap), [www.youtube.com/watch](https://www.youtube.com/watch?v=IcBjZQ-76vs&t=13), [www.reddit.com/r/TechSEO/comments/jkpxzq/how_to_access_the_hidden_pages_of_a_site/](https://www.reddit.com/r/TechSEO/comments/jkpxzq/how_to_access_the_hidden_pages_of_a_site/).

### T4 — How can I scrape pages for RAG while keeping source URLs and hashes?

- Observed: `2026-10-16T03:52:17+08:00`; answer present; name mentioned: **no**; Octocrawl official inline citation: **no**.
- Answer assessment: **not graded / generic**. Proposes source_url/content_hash metadata and chunking, naming other products. No Octocrawl mention/citation; generated Python was not executed.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-T4.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [www.browserless.io/blog/web-scraping-for-rag](https://www.browserless.io/blog/web-scraping-for-rag), [www.firecrawl.dev/glossary/web-scraping-apis/what-is-web-scraping-for-rag](https://www.firecrawl.dev/glossary/web-scraping-apis/what-is-web-scraping-for-rag), [webscraper.io/blog/fresh-web-data-pipeline-for-rag](https://webscraper.io/blog/fresh-web-data-pipeline-for-rag), [zackproser.com/blog/web-scraping-for-rag-pipelines](https://zackproser.com/blog/web-scraping-for-rag-pipelines), [www.reddit.com/r/Rag/comments/1jwmrz8/how_to_scrape_websites_into_an_inhouse_db_for_rag/](https://www.reddit.com/r/Rag/comments/1jwmrz8/how_to_scrape_websites_into_an_inhouse_db_for_rag/).

### C1 — Can I replace a Firecrawl v2 client with Octocrawl's local v1 shim?

- Observed: `2026-10-16T03:53:16+08:00`; answer present; name mentioned: **yes**; Octocrawl official inline citation: **no**.
- Answer assessment: **partial / wrong endpoint scope**. Correctly warns against v2 drop-in migration, but incorrectly includes /v1/search in the shim and omits the /fc namespace.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-C1.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [odel.app/modules/77777r7/octocrawl](https://odel.app/modules/77777r7/octocrawl), [fastcrw.com/alternatives/firecrawl](https://fastcrw.com/alternatives/firecrawl), [docs.firecrawl.dev/features/crawl](https://docs.firecrawl.dev/features/crawl), [www.firecrawl.dev/changelog](https://www.firecrawl.dev/changelog).

### C2 — When should I choose Octocrawl instead of Firecrawl?

- Observed: `2026-10-16T03:53:57+08:00`; answer present; name mentioned: **yes**; Octocrawl official inline citation: **no**.
- Answer assessment: **incorrect entity**. Explicitly equates Octocrawl with Octoparse and compares Octoparse features against Firecrawl.
- Full rendered answer / question / links: `.w2l/seo-20261016/followup/ai/google-C2.json`; matching `.ax.txt` and `.dom.txt`.
- Actual inline URLs: [www.octoparse.com/blog/firecrawl-alternatives](https://www.octoparse.com/blog/firecrawl-alternatives), [www.octoparse.com/blog/openclaw-for-web-scraping](https://www.octoparse.com/blog/openclaw-for-web-scraping), [www.youtube.com/watch](https://www.youtube.com/watch?v=_kr3ujCg_IM), [www.youtube.com/watch](https://www.youtube.com/watch?v=pzr-5765vE8&t=8), [www.octoparse.com/](https://www.octoparse.com/), [www.youtube.com/watch](https://www.youtube.com/watch?v=MSKl1qObfSA), [www.firecrawl.dev/alternatives/firecrawl-vs-crawl4ai](https://www.firecrawl.dev/alternatives/firecrawl-vs-crawl4ai).

## Other platform attempts, retained separately

| Platform | Actual attempt | Result | Remaining 11 questions |
| --- | --- | --- | --- |
| ChatGPT, signed in | B1, Web search, Temporary chat, **Unpersonalized**; picker showed Medium power without a model ID | `Model not found`; no answer/citation observation | not_tested; do not count them as absent citations |
| Perplexity, signed out | B1, Search checked, default/undisclosed model | `Sign up and repeat your request.`; no substantive answer | not_tested; no account created or subscription purchased |

Evidence: `ai/chatgpt-B1-blocked.ax.txt`/`.png`, `ai/perplexity-B1-gated.ax.txt`/`.png`, `ai/platform-limits.json`. ChatGPT's temporary Unpersonalized choice was confined to the task's chat; no persistent personalization/account settings were changed. Google was the available full sampling surface. The three-platform matrix therefore has 12 answered cells, 2 attempted-but-blocked cells and 22 unattempted cells. No unattempted cell has a fabricated answer, model, timestamp, brand/citation false or URL. This is not a complete three-platform baseline.

## Accuracy checks and next work

- B2: actual Octocrawl `verification.status` distinguishes not_requested/passed/failed; it is not CAPTCHA or another project's node verification. Compare `packages/contracts/src/verify.ts` and existing `apps/public-web/content/limits.md`/`connect-mcp.md`.
- B3/B1: hosted/native modes and quotas are distinct. Hosted crawl/batch are refused, as documented in `content/limits.md`/`reference.md` and mounted hosted gates. No new hosted capability is implied.
- S1: the published MCP URL is `https://mcp.octocrawl.dev/mcp`; local package is `@octocrawl/mcp`. The sampled answer's URL/package are wrong. The current connection document already supplies the actual values.
- C1: shim source and actual SDK requests in [SEO-06 check](firecrawl-client-verification.md) establish the /fc/v1 boundary and lack of search support. The migration draft was not public during sampling.
- C2: Octocrawl and Octoparse are different products; this answer is not an Octocrawl feature comparison.

No generated installation commands/code were executed. Generic third-party product claims in answers are unvalidated, not new recommendations. Existing Octocrawl owning source was used to assess its claims; there was no attempt to manufacture a better baseline by rewriting/retrying failed questions.

The actionable priorities are now **entity clarity, exact setup values, hosted/local limits and exposing verification semantics in existing discoverable content**, plus the separately observed BIC refusals. The existing local SEO changes already address part of this. Do not attribute an individual answer error to Cloudflare without platform fetch evidence. No additional keyword pages or special schema were created from this one sample.

A second independent run must preserve these 12 exact questions and the stated settings on a later date, label any login/model/personalization/region differences, retain blocked cells, and compare matched surfaces only. This task did not schedule that run or claim repeatability across dates.
