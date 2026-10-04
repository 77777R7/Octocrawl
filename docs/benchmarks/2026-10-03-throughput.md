# Throughput, 2026-10-03

Both lanes meet the P2 targets on a controlled site, in two runs. The site is on loopback, so the network itself is not part of these numbers; read them as what W2L's engine does when the site answers in 80 to 300 ms.

Source commit: `80997b9`. Command: `npx tsc -b && node scripts/reliability/throughput.mjs --record docs/benchmarks/2026-10-03-throughput-run<n>.json` (`npm run bench:throughput`). The script and its method are in [scripts/reliability/throughput.mjs](../../scripts/reliability/throughput.mjs). The records are [run 1](2026-10-03-throughput-run1.json) and [run 2](2026-10-03-throughput-run2.json).

## Results

| Lane | Target | Run 1 | Run 2 |
| --- | --- | --- | --- |
| HTTP, 32 workers, 1,000 URLs over 20 hosts | ≥ 500 pages/min, p50 < 800 ms | 3,460 pages/min; p50 460 ms, p95 802 ms, max 1,030 ms; 17.3 s | 1,880 pages/min; p50 715 ms, p95 1,191 ms, max 1,490 ms; 31.9 s |
| Browser, 8 workers (8 contexts), 200 URLs over 20 hosts | ≥ 60 pages/min, p95 < 8 s | 523 pages/min; p50 889 ms, p95 987 ms, max 1,018 ms; 22.9 s | 525 pages/min; p50 878 ms, p95 983 ms, max 992 ms; 22.9 s |

In every run, every page succeeded: 1,000 of 1,000 on the `http` lane and 200 of 200 on `browser_local`.

The two HTTP runs differ by almost half. The machine was not idle, since other sessions of the same repository were running, and the HTTP lane uses this process's CPU for extraction at 32 pages at once. Both runs still meet the target. The browser lane, at 8 pages at once, varied little.

## Method

- **Machine.** Apple M5 Pro, 15 cores, 48 GB, macOS (Darwin 25.6.0, arm64), Node.js v26.8.1, Chromium from Playwright 1.62.1.
- **Site.** One loopback server answers as 20 hosts, `h01.localhost` to `h20.localhost`. W2L schedules by host name, so each counts as its own host.
  - Every response waits 80 to 300 ms before it is sent, spread evenly by page number.
  - Every page is 31,896 bytes of HTML: 24 sections of paragraphs and links, plus a 40-row table.
  - `robots.txt` allows everything.
- **W2L.** The compiled API (`packages/api/dist/cli.js`) runs in its own process, with `W2L_WORKER_COUNT` set to 32 for the HTTP lane and 8 for the browser lane. Per-host politeness is left at the defaults: 2 requests at once per host, 250 ms between starts on a host. One batch is submitted with `formats: ["markdown"]`.
  - The HTTP lane's pages answered on the `http` rung.
  - The browser lane's batch sets `waitFor: 1`, which starts each page at the browser rung. Each page gets its own browser context, so 8 workers means 8 contexts at once.
- **Measures.**
  - Pages per minute is the batch's completed URLs divided by the time from its submission to its `completed` status.
  - Per-page time is each item's `usage.wallMs`. That covers the fetch from the moment a worker takes the URL, and includes any wait for the host's turn.

## What these numbers do not show

- **The network.** Real sites add DNS, TLS and transfer time, and many answer slower than 300 ms. The HTTP lane's pace on real sites is bounded by politeness more than by the engine: at the defaults, a host gets at most about 4 starts per second, so 500 pages/min needs at least 3 hosts answering fast.
- **Larger and heavier pages.** Pages that are larger, script-heavy (for the browser lane) or slower are not represented.
- **Other machines.** Windows and Linux were not measured, and neither was a machine without other load.
