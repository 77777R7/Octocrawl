# Real-site run 2026-10-04: sitemap requests and Crawl-delay

What it shows: the crawl's and the map's sitemap reader (`HttpSitemapSource`) keeps the Crawl-delay of a file's host between its own requests to that host. https://www.cbs.nl/robots.txt declares `Crawl-delay: 1` in its `User-agent: *` group and one sitemap, `/sitemap.xml`, an index. The script reads it with the reader, at most three files, and records when the origin scheduler let each file's request go.

Source commit: `0c631534c20949f1550f00eb0e89d40442982e6d` (branch `claude/sitemap-crawl-delay`). Compared with `main` at `4db2cf176f272f98433842ead235d2b3413f2fbf`: the same script with `sitemapSource.ts` and `originScheduler.ts` from `main`, run at 2026-10-04T11:31Z on an uncommitted working tree whose only change was those two files.
Run: 2026-10-04, ending 2026-10-04T11:43:21Z, from Howard's Mac.
Network: each run twice, `direct` (`localNetworkPolicy()`; every file record `proxyUsed: false`) and `proxied` (`withEnvironmentProxy(localNetworkPolicy(), process.env)` with `HTTPS_PROXY=http://127.0.0.1:7890`; every file record `proxyUsed: true`).

Command, from the repository root, with the script below saved as `packages/bench/cbs.tmp.ts` (deleted after the run): `npx tsx packages/bench/cbs.tmp.ts direct`, then `npx tsx packages/bench/cbs.tmp.ts proxied`.

Files read, the same in all four runs: `/sitemap.xml` (index, 200), `/nl-nl/sitemaps/sitemap` (urlset, 200), `/en-gb/sitemaps/sitemap` (urlset, 200), each with robots `allowed`.

| Version | Network | Index → first file | First file → second file |
| --- | --- | --- | --- |
| `0c63153` | direct | 1,000 ms | 13,281 ms |
| `0c63153` | proxied | 1,001 ms | 5,683 ms |
| `main` | direct | 251 ms | 6,513 ms |
| `main` | proxied | 288 ms | 6,185 ms |

The time between two requests the scheduler let go, by `performance.now()` after its `beforeRequest`. The reader waits the Crawl-delay after its own last request to the host, before it asks the scheduler for its turn. The policy's own interval is 250 ms. On `main` the first file followed the index after that interval; on `0c63153` after the host's Crawl-delay. The second gap is longer than a second in every run because the first file took several seconds to download, so it does not tell the two apart.

Not shown live: the page requests after the files. They are paced by the crawl's frontier, as before; the Crawl-delay the reader found is not passed on to the scheduler the whole process shares. Two earlier versions on this branch did: the first kept it on the scheduler for every later request to the host (a review found it slowed or timed out later jobs), the second asked the scheduler for it on the reader's own requests, counted from the host's last request by any job (a review found that another job's steady requests to the host kept the reader waiting). Both were run live on 2026-10-04; their records were drafted and replaced by this one, so their runs are listed here.

Earlier runs on this branch, same machine and day:

- `2a622fd` (the delay kept on the shared scheduler), with a script that read https://www.ecb.europa.eu/'s sitemap (robots.txt: `User-agent: *` … `Crawl-delay: 5`; one urlset, `/sitemap.xml`, 200, robots `allowed`) and then measured how long the scheduler made the host's next request wait: 2,850 ms (direct, `localNetworkPolicy()`), then 2,757 ms direct and 4,561 ms proxied, ending 2026-10-04T11:18:09Z; with `main`'s two files, 0 ms direct and 0 ms proxied. The policy's interval was 250 ms; the wait counted from the start of the file's request, so what was left of the 5 s after the download.
- `73dd331` (the delay asked of the scheduler on the reader's own requests), with this record's script on www.cbs.nl: index → first file 1,001 ms direct and 1,003 ms proxied, first → second file 9,277 ms and 5,480 ms, ending 2026-10-04T11:32:09Z. The same code uncommitted on `2a622fd` at 11:31Z: 1,002 ms and 13,416 ms direct, 1,001 ms and 5,703 ms proxied.

Script:

```ts
// Reads https://www.cbs.nl/'s sitemap index (robots.txt: `User-agent: *` … `Crawl-delay: 1`) with the crawl's reader,
// three files at most, and reports when each file's request was let go by the origin scheduler.
import { localNetworkPolicy, withEnvironmentProxy } from '@w2l/contracts'
import { HttpSitemapSource } from './src/sitemapSource.js'
import { OriginScheduler } from './src/subjects/originScheduler.js'
const policy = process.argv[2] === 'proxied' ? withEnvironmentProxy(localNetworkPolicy(), process.env) : localNetworkPolicy()
const started: number[] = []
class Timed extends OriginScheduler {
  override async beforeRequest(...args: Parameters<OriginScheduler['beforeRequest']>): Promise<void> {
    await super.beforeRequest(...args)
    started.push(performance.now())
  }
}
const source = new HttpSitemapSource({ networkPolicy: policy, scheduler: new Timed(policy) })
const loaded = await source.load({ seedUrl: 'https://www.cbs.nl/', maxUrls: 100_000, maxFiles: 3 })
console.log(JSON.stringify({
  files: loaded.files.map((f) => ({ url: f.url, kind: f.kind, status: f.status, robots: f.robots, proxyUsed: f.proxyUsed })),
  gapsMs: started.slice(1).map((t, i) => Math.round(t - started[i]!)),
}))
await source.close()
```
