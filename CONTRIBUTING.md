# Contributing to Octocrawl

Thank you for your interest in contributing to Octocrawl!

## Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin (DCO)](https://developercertificate.org/) to ensure contributors have the right to submit their code. Every commit must include a `Signed-off-by` line.

### How to Sign Off

Add `-s` when committing:

```bash
git commit -s -m "fix: handle redirect loops in bare HTTP subject"
```

This adds the following line to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

### What the DCO Means

By signing off, you certify that:

1. The contribution is your original work, OR
2. You have the right to submit it under the project's license, AND
3. You understand it will be distributed under AGPL-3.0

Full DCO text: https://developercertificate.org/

## Before You Contribute

1. **Check existing issues** — someone may already be working on it
2. **Open an issue first** for non-trivial changes — discuss the approach before writing code
3. **Read the engineering notes** — [docs/archive/PHASE1_ENGINEERING_NOTES.md](docs/archive/PHASE1_ENGINEERING_NOTES.md) explains the design decisions

## Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/w2l.git
cd w2l
npm install
npm run typecheck
npm test
```

## Contribution Workflow

1. **Fork and branch** — create a feature branch from `main`
2. **Write tests** — new features need tests; bug fixes need a regression test
3. **Run the benchmark** — `npm run bench` to verify you didn't break ground-truth cases
4. **Commit with DCO** — every commit needs `git commit -s`
5. **Open a PR** — include:
   - What the change does
   - Which issue it fixes (if any)
   - Benchmark output (if relevant)
   - Test coverage (if relevant)

## Releasing

The packages are released together, at one version: `octocrawl` and `@octocrawl/cli` (the CLI), `@octocrawl/sdk`, `@octocrawl/mcp` and the Python client `octocrawl-client`.

1. `node scripts/release-version.mjs set X.Y.Z` writes the version everywhere it lives (the three package manifests, the CLI's, MCP server's and SDK's version constants, the Python client's two) and updates the lockfile; `check` confirms they agree.
2. Add the CHANGELOG entry, merge through a PR as usual, then tag the merge: `git tag -s vX.Y.Z` and push the tag.
3. The `Release` workflow (`.github/workflows/release.yml`) checks that every version says X.Y.Z, runs the type check and the tests, packs the npm packages and installs them in a new project (`scripts/check-packages.mjs`), installs the CLI on Linux, Windows and macOS and scrapes over its native modules, better-sqlite3 and impit (`scripts/check-native-deps.mjs`; the `Native dependencies` workflow runs the same on a pull request that changes what is installed), builds and checks the Python client, then publishes to npm and PyPI through trusted publishing. No token is stored; npm records each package's provenance. A version already published is skipped, so a failed run can be run again.

Set up once, by a maintainer:
- On npmjs.com, for each of `octocrawl`, `@octocrawl/cli`, `@octocrawl/sdk` and `@octocrawl/mcp`: Settings → Trusted publishing → GitHub Actions, repository `77777R7/Octocrawl`, workflow `release.yml`, environment `release`.
- On pypi.org, for `octocrawl-client`: Manage → Publishing → add a GitHub publisher with the same repository, workflow and environment.
- On GitHub: Settings → Environments → `release`, with the maintainer as a required reviewer, so nothing is published without their approval.

## Code Standards

- **TypeScript strict mode** — no `any`, no unchecked indexed access
- **Match existing style** — follow the patterns in the codebase
- **Write tests** — unit tests in `packages/*/test/*.test.ts`
- **Document contracts** — update `packages/contracts` if you change the schema
- **Commit messages** — use conventional commits (`fix:`, `feat:`, `docs:`, etc.)

## Testing

```bash
# Run all tests
npm test

# Run tests for one package
npm test -- packages/http-core

# Run the tests that call live websites (needs the network)
npm run test:live

# Run benchmark
npm run bench
```

Test files run in parallel, except two groups that run after the rest, so that no other file shares the machine with them (see `vitest.config.ts`):

- **A test that bounds the time of a piece of code** (a page converted in under so many seconds, or a cost that grows linearly) goes in a `*.perf.test.ts` file next to the module's test file. These files run last, one at a time. On CI the files run side by side on a few cores, and such bounds failed there whenever a heavy file ran beside them. Even then, measure against a reference run at the same moment (as `detectList.perf.test.ts` measures against parsing the page) rather than against a fixed number of milliseconds.
- **A test that calls a live website** is named `*.live.test.ts`. `npm test` leaves these out, so that it passes offline and is not failed by a site's own changes; `npm run test:live` runs them.
- **A test file that drives a real browser or real HTTP and bounds how long a wait or a cancellation takes** is named `*.integration.test.ts` or listed in `TIMED` in `vitest.config.ts`. These files run after the parallel ones, two at a time.

## License Gate (CI)

**依赖白名单**（与 MIT SDK 兼容）：MIT / Apache-2.0 / BSD-2 / BSD-3 / ISC / MPL-2.0（MPL 文件须保持未修改、独立成文件）。

**禁止引入**（作为依赖或作为代码阅读/移植来源，写入 review checklist）：

- `crawl4ai` 及其 markdown 路径、Python `html2text`——crawl4ai 宣称 Apache-2.0 但完整内嵌 GPL-3.0-or-later 的 html2text 且零 GPL 声明，任何移植都有衍生作品争议
- Firecrawl scraper 根、`nodesig`——AGPL-3.0
- `CycleTLS`——GPL-3.0
- GPL-3.0-only 过滤列表数据（uAssets、IDCAC、ISDCAC）
- MinerU-HTML v1.1（腾讯 Hunyuan 社区许可）、ReaderLM-v2 免费权重（CC-BY-NC-4.0）

**澄清**：trafilatura 自 v2.2.0 起是 Apache-2.0（jusText BSD-2-Clause），阅读与重实现其算法无 copyleft 风险；自托管 Firecrawl / Crawl4AI 只可用于 benchmark 对比，不可链接。

## Questions?

Open an issue with the `question` label.
