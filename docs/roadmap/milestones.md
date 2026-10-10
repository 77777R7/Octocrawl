# Milestone checklist

This checklist was in the README until 2026-10-10. The current plan is in [ROADMAP.md](../../ROADMAP.md).

- [x] Contracts and ground-truth schema
- [x] Fixture server with 56 ground-truth cases
- [x] robots.txt ReDoS fix (token-based glob matcher)
- [x] Benchmark pipeline with bare HTTP baseline
- [x] extract-tf + HTML→Markdown after extract
- [x] Browser lane (Playwright) and HTTP → browser → vendor ladder
- [x] Honest identity bundle (UA / hints / locale / viewport must agree)
- [x] `octocrawl` product CLI (`@octocrawl/cli`, `octocrawl`): `scrape`, `crawl`, `batch`, `map` and `serve`, every API option as a flag
- [x] `octocrawl crawl` + SQLite checkpoint resume
- [x] REST API + TypeScript SDK (`POST /v1/scrape`, `POST /v1/crawl`, `GET /v1/crawl/:id`, paginated crawl pages/errors, cancel)
- [x] MCP server (`scrape`, `crawl`, `get_crawl`, paginated pages/errors, and cancel over REST)
- [x] Compact MCP scrape responses, direct structured JSON/JSON Schema extraction, and Amazon subject adapter/baseline
- [x] Firecrawl `/scrape` `/crawl` migration shim (snapshot 2026-09-18; not a compatibility layer)
- [x] Task-level ladder accounting, preserved per-channel attempts, and honest unknown cost/evidence fields
- [x] Bounded multi-page workers, shared host scheduling, conditional browser settling, and runtime resource reuse
- [x] Phase 1 Local Reliability Gate: Chromium-backed full test suite and GitHub Actions
- [x] Phase 2 L0-L2 quality benchmark: Octocrawl ladder, verified completion, false-success, P95, escalation, and tiered reports
- [x] Phase A4 real-task harness: AI knowledge and product-info manifests, field assertions, repeat consistency, holdout and cost/evidence records
- [ ] Phase A4 real-task gate: 100-200 permitted pages, human correction time, repeated task evidence, and complete failure taxonomy
- [x] Phase A4 diagnostic expansion: 20 real tasks, 11 domains, 40 repeated runs, and holdout results
- [x] A6 scale slice: 100 pages, 10 domains, two runs; labeled holdout is not independent
- [x] A6 recovery/install evidence recorded: interrupt-resume lost 0 URLs; same-machine clean-clone first task; historical 18-minute correction record lacks human confirmation; billed USD unknown
- [x] A6 deferred exceptions recorded: second-developer install is deferred, not passed; billed USD is unknown, not zero
- [ ] A6 unconditional pass still needs a second human install
- [x] A5/A6 gate report: conditional alpha; billed USD remains unknown
- [x] Gate 2 execution contract, actual process recovery, controlled changes/cache and Monitor isolation
- [x] Gate 3 durable HTTPS delivery, same-event retry, deduplication and restart recovery
- [x] Gate 4 SDK, docs, examples and agent clean installation
- [ ] Gate 4 independent non-author human installation and full workflow
- [x] C2 Monitor/Delivery MCP and local conversational first-use flow
- [ ] C2 n8n and narrow task UI
- [x] C3 unified single-instance process and authenticated Streamable HTTP implementation
- [ ] C3 hosted MCP: deployment, sign-in acceptance and hosted restart drill (experimental code; setup archived in docs/archive/hosted-mcp-pilot.md; hosting is a P5 item)
- [ ] Gate 5 two external trial users, two weeks, repeat use and real downstream consumption
- [x] Phase 3 Benchmark Gate harness: fixed Octocrawl run, comparator evidence, and blocked-until-real-comparators decision
- [ ] Hosted Egress Gate: browser subresource policy enforcement and DNS-to-connection binding

See [ROADMAP.md](../../ROADMAP.md) for the current phase plan; the Section A/B/C roadmap is archived in [docs/roadmap/sections-abc-roadmap-2026-09-28.md](sections-abc-roadmap-2026-09-28.md). [PRODUCT_PLAN_V2.md](../archive/PRODUCT_PLAN_V2.md) remains the historical detailed plan.
