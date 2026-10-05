# One-line install, 2026-10-05: the published packages on clean machines

The P1 item "One-line install": `npx …@latest scrape <url>` gives a result within 5 minutes on clean macOS and Windows.

- **What ran:** the `Install check` workflow (`.github/workflows/install-check.yml`). It runs `scripts/install-check.mjs`, at commit `90ab8ac` on branch `claude/install-check`.
- **Run:** [37275243941](https://github.com/77777R7/Octocrawl/actions/runs/37275243941), started 2026-10-05T06:59:26Z on GitHub-hosted runners.
- **How:** the script runs `npx -y octocrawl@latest scrape https://example.com` in an empty directory with an empty npm cache. It times the run from the `npx` call to the answer.
- **Network:** **direct**. GitHub's runners have no proxy.
- **Package:** `octocrawl@0.3.0`, published 2026-10-05 from `4f02e64`.

| Runner | Node | Answer | Time from `npx` to answer |
| --- | --- | --- | --- |
| macos-latest (arm64) | v22.23.2 | `success`, exit 0 | 9.5 s |
| ubuntu-latest (x64) | v22.23.3 | `success`, exit 0 | 6.3 s |
| windows-latest (x64) | v22.23.3 | `success`, exit 0 | 49.5 s |

`pip install "octocrawl-client[pandas]"` and `import octocrawl_client` also succeeded on all three runners, with Python 3.12, in the same run.

**The same check on Howard's Mac, proxied:** `node scripts/install-check.mjs` reached `octocrawl@0.3.0` and answered `success` from a cold cache in 11.6 s.

## Not shown

- A person's own clean machine outside CI.
- Node 24.
- A page that needs the browser lane: example.com is answered by the HTTP lane, so Chromium is never installed or launched.
- Windows ARM and Linux ARM.
