# One-line install with a page that needs the browser, 2026-10-13

The P1 item "One-line install" asks that `npx octocrawl@latest scrape <url>` give a result within 5 minutes on clean macOS and Windows. The record of 2026-10-05 ([2026-10-05-one-line-install-90ab8ac.md](2026-10-05-one-line-install-90ab8ac.md)) used example.com, which the HTTP lane answers, so a clean machine's missing browser was never met. This record checks a page that needs the browser.

## How it was run

- Script: `scripts/install-check-browser.mjs`, at commit `23046c4f` (branch `claude/install-check-browser`). It runs in an empty directory, with an empty npm cache and `PLAYWRIGHT_BROWSERS_PATH` on an empty directory, timed from the first `npx`:
  1. `npx -y octocrawl@latest scrape https://quotes.toscrape.com/js/`;
  2. `npx -y playwright install chromium`;
  3. the same scrape again, which must be `success` on a browser lane with "Einstein" in its Markdown.
- The first answer's `browser_not_installed` warning and its hint are checked only from 0.4.2. The published 0.4.1 predates #479 and was not checked for them.
- Package: `octocrawl@0.4.1`, the latest on npm. It resolved `playwright` to 1.64.0, the same version the plain `npx -y playwright` fetched.

## Results

| Where | Network | Node | First answer | Install | Second answer | Time from `npx` to the second answer |
| --- | --- | --- | --- | --- | --- | --- |
| GitHub Actions macos-latest (arm64), [run 38377086942](https://github.com/77777R7/Octocrawl/actions/runs/38377086942) | direct | v22.23.2 | `failed` on http | exit 0 | `success` on `browser_local`, text found | 30.6 s |
| GitHub Actions ubuntu-latest (x64), same run | direct | v22.23.3 | `failed` on http | exit 0 | `success` on `browser_local`, text found | 24.2 s |
| GitHub Actions windows-latest (x64), same run | direct | v22.23.3 | `failed` on http | exit 0 | `success` on `browser_local`, text found | 87.7 s |
| Howard's Mac (arm64) | proxied | v26.8.1 | `failed` on http | exit 0 | `success` on `browser_local`, text found | 60.8 s |

- **The run started** at 2026-10-13T09:32:47Z. The same run's `npx` (example.com) and `pip` jobs passed on all three runners.
- **Before the fix:** on 0.4.1 the first answer was `failed`/`empty_unverified` on the http lane, and it did not name the missing browser. Run locally with `--hint-since 0.4.1`, the check failed for that reason, as it should.
- **Ubuntu:** the plain `npx playwright install chromium`, without `--with-deps`, was enough on the GitHub runner. A desktop Linux without Chromium's system libraries may still need `--with-deps`; that is not shown here.

## Not shown

- The hint itself on a published package: it ships in the first version after 0.4.1 (#479). The weekly run checks it from 0.4.2 on.
- A person's own clean machine outside CI.
- Node 24.
- Windows ARM and Linux ARM.
