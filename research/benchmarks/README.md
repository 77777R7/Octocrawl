# Third-party benchmarks

Glue for running Octocrawl and its comparators on benchmarks other people built. Raw outputs, datasets and harness
checkouts stay under `.w2l/benchmarks/` (git-ignored); the dated records here say what was run, from which commits, and
what came out.

## Firecrawl Scrape Content Dataset v1 (`scrape_evals/`)

The dataset (HF `firecrawl/scrape-content-dataset-v1`, 1,000 live URLs) is scored with the deterministic scorer of
scrape-evals. Firecrawl withdrew its repository; the copy used is github.com/martynasoxylabs/scrape-evals, unmodified.

- `run.py <harness dir> -- <run_eval.py arguments>` runs the harness with this directory's engines added to its
  `engines` package.
- `engines/octocrawl_local.py` posts to a local API (`OCTO_API`, default `http://127.0.0.1:8787`; `OCTO_ACCESS` sets the
  request's `access`) and keeps each answer under `OCTO_RAW_DIR`. Any status but `success` is an error to the harness.
- `engines/jina_reader.py` reads `https://r.jina.ai/<url>` with no key, paced to the keyless rate limit (`JINA_RPM`).
- `engines/crawl4ai_proxied.py` and `engines/playwright_proxied.py` are the harness's own Crawl4AI and Playwright
  engines with the browser sent through `BENCH_PROXY`, so every arm shares one network path. The Crawl4AI engine also
  keeps Crawl4AI's Markdown beside the HTML the harness scores.
- `report.py` scores every row of the dataset with the harness's analyzer and prints the record's tables: three views
  (all rows, the rows the dataset does not flag with `error`, the flagged rows), both coverage definitions, F1, the
  share of "hollow" successes (no truth word in the content) and a per-status breakdown. Rows an arm did not answer stay
  in the denominator as failures.

```bash
.w2l/pyenv/bin/python -m unittest research/benchmarks/scrape_evals/test_report.py
```

## WebMainBench (`webmainbench/`)

Frozen HTML (HF `opendatalab/WebMainBench`), so only Octocrawl's extractor and Markdown converter are measured.

- `octocrawl-convert.mjs` runs the compiled `packages/extract-tf/dist` on JSONL lines of `{track_id, html, url}`.
- `score_full.py` scores the 7,809-page set with ROUGE-N F1 (N=5) from the authors' MinerU-HTML `eval_baselines`, with
  the authors' Trafilatura baseline beside it as a check of the scorer.
- `run_545.py` runs the toolkit's fine-grained metrics on the 545-page subset with the LLM splitting off.
