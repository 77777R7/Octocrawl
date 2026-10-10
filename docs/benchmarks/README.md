# Benchmarks

Two benchmarks run from this repository: the fixture suite, which measures false successes, and the throughput run, which measures pages per minute and crash recovery.

## The fixture suite

Run the full fixture suite against the bare HTTP baseline:

```bash
npm run bench
```

Expected output:
```
Subject: bare-http
  Cases: 30
  Status matches: 17/30
  Contentful: 20
  False successes: 12
  False success rate: 60.0%
```

The bare HTTP baseline intentionally has a high false-success rate (no content extraction, no challenge detection, no redirect handling). A production subject should beat these numbers.

## Throughput and crash recovery

`npm run bench:throughput` measures pages per minute and per-page time through the API process on a loopback site of 20 hosts: the HTTP lane with 32 workers over 1,000 URLs, and the browser lane with 8 over 200. The first results, with what they leave out, are in [docs/benchmarks/2026-10-03-throughput.md](2026-10-03-throughput.md). `npm run verify:batch-crash-1000` kills the API with `kill -9` partway through a batch of 1,000 URLs over 20 hosts, starts it again on the same task root and checks that the resumed batch loses no URL and records none twice. `npm run verify:serve-smoke` starts `octocrawl serve`, scrapes a page and a PDF, stops the server partway through a batch, starts it again and checks that the batch completes. CI runs the crash test on Linux and the serve test on Windows. All three need the compiled packages (`npx tsc -b`).

The API's engine runs `W2L_WORKER_COUNT` pages at once, an integer from 1 to 64 (default 4). That bound sits above the per-host limits: `W2L_PER_HOST_CONCURRENCY` and `W2L_PER_HOST_MIN_DELAY_MS` still apply to each host, so more workers help only across hosts. A crawl's `maxConcurrency` may go up to the worker count.
