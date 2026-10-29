# WebMainBench: Octocrawl's extractor and Markdown converter, 2026-10-30

A record of one run. WebMainBench (opendatalab) stores each page's HTML, so this measures only what Octocrawl does
with a page it already has: its main-content extractor and its Markdown converter. Fetching, the browser lanes, honest
statuses and the Evidence Record play no part. No network request was made by the scoring; no paid service and no LLM
was used.

## What ran

- Octocrawl source commit: `2aaad1f4` (main). Engine build: up to date (`tsc --build --dry` against this checkout's
  `packages/*/dist`, 2026-10-29 18:18Z and 19:06:42Z). The bridge `research/benchmarks/webmainbench/octocrawl-convert.mjs`
  loads `packages/extract-tf/dist` and runs, per page, `extractTf.extract(html, { url })` and `htmlToMarkdown` of the
  region it found, as a successful HTTP read does. When the extractor asks to escalate or answers only as a last resort
  (192 of 7,809 pages), a live read would try the browser; here the whole page is converted instead, and the tables
  below also give the score with those pages counted as 0.
- Dataset: HF `opendatalab/WebMainBench`, revision `5da0972e9b58d0c7891ae75053ced97c268f52e3`; `webmainbench.jsonl`
  (7,809 pages) sha256 `85765fe798f07c14eb1c92945046eaa56e0da59663f70b9c498647d7dfd78884`; `WebMainBench_545.jsonl`
  sha256 `0efaa4b49a45e320a27fe6e5a0b6aad5b57259fc3321ac3448519cacc74c537e`.
- Octocrawl's glue: `research/benchmarks/webmainbench/` at `e3fd73c7`.
- Full-set scorer: the authors' `eval_baselines` from github.com/opendatalab/MinerU-HTML at
  `73cf266690befd209cae7e6fdff9716d5b31a976` (`calc_rouge_n_score`: ROUGE-N F1, N=5, jieba tokens;
  `html_to_text_func`: html2text with links and images ignored, a new converter per page).
- 545-subset scorer: the toolkit github.com/opendatalab/WebMainBench at `9d991bdc00c57b57521499494d96be85c31317ba`,
  `Evaluator` with `use_llm: False`.
- Python 3.12.13 in `.w2l/pyenv`: trafilatura 2.0.0, magic-html 0.1.5, resiliparse 1.1.0 (the authors' table names
  0.14.5), html2text 2025.4.15, jieba 0.42.1, rouge-score 0.1.2, numpy 1.26.4.
- Network: none needed; the shell had `HTTPS_PROXY=http://127.0.0.1:7890` set, and nothing in these runs fetched.

Commands (from the repository root; `W=.w2l/benchmarks/runs/wmb-2026-10-30`, `B=.w2l/benchmarks/data/wmb`,
`M=~/Code/w2l/.w2l/benchmarks/src/MinerU-HTML`, `T=~/Code/w2l/.w2l/benchmarks/src/WebMainBench`):

```bash
npx tsc --build
python3 -c "import json,sys
for l in open('$B/webmainbench.jsonl'):
    d=json.loads(l); print(json.dumps({'track_id':d['track_id'],'html':d['html'],'url':d['url']}))" \
  | node research/benchmarks/webmainbench/octocrawl-convert.mjs > $W/octocrawl-full.jsonl
.w2l/pyenv/bin/python research/benchmarks/webmainbench/score_full.py --mineru $M --bench $B/webmainbench.jsonl --octocrawl $W/octocrawl-full.jsonl --trafilatura --out $W/full --procs 6
.w2l/pyenv/bin/python research/benchmarks/webmainbench/run_545.py --wmb $T --bench $B/WebMainBench_545.jsonl --dump-input \
  | node research/benchmarks/webmainbench/octocrawl-convert.mjs > $W/octocrawl-545.jsonl
.w2l/pyenv/bin/python research/benchmarks/webmainbench/run_545.py --wmb $T --bench $B/WebMainBench_545.jsonl --octocrawl $W/octocrawl-545.jsonl --out $W/545-baseline --with trafilatura,trafilatura_txt,resiliparse,magic-html
```

Conversion of the 7,809 pages took 2 min 57 s on one core; 2 pages threw in the extractor and score 0.

## Full set: ROUGE-N F1 (N=5), 7,809 pages

| Extractor, view | All | Simple (2,353) | Mid (3,127) | Hard (2,329) |
|---|---:|---:|---:|---:|
| Octocrawl, main HTML through the authors' html2text ("Html+MD", the table's mode) | **0.7169** | 0.8148 | 0.7151 | 0.6205 |
| the same, the 192 escalated pages counted as 0 | 0.7011 | 0.7854 | 0.7053 | 0.6103 |
| Octocrawl's own Markdown, link targets and images dropped | 0.6156 | 0.7332 | 0.6160 | 0.4961 |
| Octocrawl's own Markdown as it is delivered | 0.4864 | 0.6415 | 0.4720 | 0.3490 |
| Trafilatura, the authors' baseline, run here | 0.6402 | 0.7309 | 0.6417 | 0.5466 |

The Trafilatura row matches the authors' published row to the fourth decimal (0.6402 / 0.7309 / 0.6417 / 0.5466), so
the scorer as run here is theirs.

Published by the authors (README of the toolkit at `9d991bdc`, not run by us; * an LLM):

| Extractor | Mode | All | Simple | Mid | Hard |
|---|---|---:|---:|---:|---:|
| DeepSeek-V3.2* | Html+MD | 0.9098 | 0.9415 | 0.9104 | 0.8771 |
| GPT-5* | Html+MD | 0.9024 | 0.9382 | 0.9042 | 0.8638 |
| Gemini-2.5-Pro* | Html+MD | 0.8979 | 0.9345 | 0.8978 | 0.8610 |
| Dripper_fallback | Html+MD | 0.8925 | 0.9325 | 0.8958 | 0.8477 |
| Dripper (0.6B) | Html+MD | 0.8779 | 0.9205 | 0.8804 | 0.8313 |
| magic-html | Html+MD | 0.7138 | 0.7857 | 0.7121 | 0.6434 |
| Readability | Html+MD | 0.6543 | 0.7415 | 0.6550 | 0.5652 |
| Trafilatura | Html+MD | 0.6402 | 0.7309 | 0.6417 | 0.5466 |
| Resiliparse | TEXT | 0.6290 | 0.7140 | 0.6323 | 0.5388 |

Read in the table's own mode, Octocrawl's region selection scores 0.7169 (0.7011 with escalated pages at 0): about
level with magic-html, above Readability, Trafilatura and Resiliparse, and well below the model-based extractors.

Why its own Markdown scores lower: the ground truth is html2text output with no link targets and no images. Dropping
Octocrawl's link targets and images alone moves 0.4864 to 0.6156; what remains between that and 0.7169 is the same
regions written by a different converter (tables, lists, emphasis and spacing as Octocrawl writes them), which ROUGE-5
over jieba tokens counts as different text.

## 545-page subset: fine-grained metrics, no LLM

The authors' published table split formulas, tables and code with an LLM (`gpt-5-chat-latest` in their example). No
LLM was used here (`use_llm: False`), so every extractor below was run again under that same setting; the published
numbers are not comparable column for column (formula_edit above all).

| Extractor (run here, `use_llm: False`) | overall | text_edit | code_edit | formula_edit | table_edit | table_TEDS |
|---|---:|---:|---:|---:|---:|---:|
| Octocrawl Markdown as delivered | **0.5147** | 0.5709 | 0.8064 | 0.2422 | 0.3467 | 0.6075 |
| Octocrawl Markdown, link targets and images dropped | 0.5591 | 0.7213 | 0.8022 | 0.2443 | 0.4182 | 0.6097 |
| magic-html 0.1.5 | 0.4305 | 0.7800 | 0.4150 | 0.2930 | 0.2638 | 0.4006 |
| trafilatura 2.0.0 (md) | 0.3481 | 0.7868 | 0.1801 | 0.2910 | 0.1694 | 0.3129 |
| trafilatura 2.0.0 (txt) | 0.3116 | 0.7858 | 0.0000 | 0.2836 | 0.1751 | 0.3136 |
| resiliparse 1.1.0 | 0.2171 | 0.7435 | 0.0422 | 0.2997 | 0.0000 | 0.0000 |

Published by the authors (with the LLM split; not run by us): mineru-html 4.1.1 0.8256 overall (text 0.8621, code
0.9093, formula 0.9399, table 0.6780, TEDS 0.7388); magic-html 0.4996; trafilatura (md) 0.4013; trafilatura (txt) 0.3718;
resiliparse 0.2898. The columns that do not depend on the LLM reproduce here (magic-html text 0.7800, code 0.4150,
TEDS 0.4006; trafilatura code 0.1801); formula_edit does not (0.29 here against 0.62–0.66 published).

Octocrawl leads the rule-based extractors on code, tables and table structure, and trails all of them on text_edit,
which its link targets cost most (0.5709 to 0.7213 without them).

## Notes

- The Octocrawl input for the 545 subset is each page after the toolkit's `clean_browser_annotation_artifacts`, the
  HTML every other extractor in the toolkit receives (the bridge's `--dump-input`). A first scoring pass that looked the
  Markdown up by the hash of the uncleaned HTML found none of it and scored Octocrawl 0 on every page; it is not a result.
- A first full-set pass of the Html+MD view reused one html2text converter per worker process; html2text keeps state
  between pages, and the view's score moved between runs (0.45 and 0.51). The scorer now calls the authors'
  `html_to_text_func`, which makes a converter per page, as their `MainHTMLExtractor` does; the other views did not move.
- Raw outputs: `.w2l/benchmarks/runs/wmb-2026-10-30/` on Howard's Mac (not committed).
