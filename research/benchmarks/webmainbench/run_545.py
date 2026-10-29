"""WebMainBench's fine-grained metrics on the 545-page subset, with an Octocrawl extractor and the LLM splitting off.

  .w2l/pyenv/bin/python research/benchmarks/webmainbench/run_545.py --wmb <WebMainBench dir> \
      --bench WebMainBench_545.jsonl --octocrawl <octocrawl-convert.mjs output> --out <dir> [--with trafilatura,...]

The `octocrawl` extractor returns the Markdown octocrawl-convert.mjs made from the same stored HTML (matched by URL, which
is unique in the subset), so the toolkit scores exactly what Octocrawl's converter produced. Feed the converter the HTML
after the toolkit's clean_browser_annotation_artifacts, as every other extractor receives it (--dump-input writes that).
`octocrawl-nolinks` scores the same Markdown with link targets and images dropped, as score_full.py's view of that name.

The authors' published table used an LLM to split formulas, tables and code; no paid service is used here (use_llm
False), so the extractors named in --with are run under the same setting as a reference, and the published numbers are
quoted apart.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from score_full import without_links

METRICS = ["overall", "text_edit", "code_edit", "formula_edit", "table_edit", "table_TEDS"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wmb", required=True)
    ap.add_argument("--bench", required=True)
    ap.add_argument("--octocrawl")
    ap.add_argument("--dump-input", action="store_true")
    ap.add_argument("--out")
    ap.add_argument("--with", dest="others", default="trafilatura")
    a = ap.parse_args()
    sys.path.insert(0, str(Path(a.wmb).resolve()))
    from webmainbench import DataLoader, Evaluator
    from webmainbench.extractors.base import BaseExtractor, ExtractionResult
    from webmainbench.extractors.factory import extractor

    if a.dump_input:
        from webmainbench.utils.html_cleaner import clean_browser_annotation_artifacts
        with open(a.bench) as b:
            for line in b:
                d = json.loads(line)
                print(json.dumps({"track_id": d["track_id"], "url": d["url"], "html": clean_browser_annotation_artifacts(d["html"])}))
        return
    by_url = {}
    with open(a.bench) as b, open(a.octocrawl) as o:
        for bl, ol in zip(b, o):
            d, r = json.loads(bl), json.loads(ol)
            assert d["track_id"] == r["track_id"], "octocrawl output out of order"
            assert d["url"] not in by_url, "duplicate URL"
            by_url[d["url"]] = r

    @extractor("octocrawl")
    class OctocrawlExtractor(BaseExtractor):
        version = "precomputed"
        description = "Octocrawl main-content extractor and Markdown converter (research/benchmarks/webmainbench)"

        def _setup(self) -> None:
            pass

        def _extract_content(self, html: str, url: str = None) -> ExtractionResult:
            r = by_url.get(url)
            if r is None or r.get("error"):
                # an empty answer, scored as one: the page stays in the mean
                return ExtractionResult(content="", content_list=[], success=True)
            return ExtractionResult(content=r["markdown"], content_list=[], success=True)

    @extractor("octocrawl-nolinks")
    class OctocrawlNoLinksExtractor(OctocrawlExtractor):
        description = "The same Markdown with link targets and images dropped (score_full.py's octocrawl-md-nolinks)"

        def _extract_content(self, html: str, url: str = None) -> ExtractionResult:
            result = super()._extract_content(html, url)
            result.content = without_links(result.content)
            return result

    cfg = {"use_llm": False}
    dataset = DataLoader.load_jsonl(a.bench)
    results = Evaluator(llm_config=cfg, metric_config=cfg).compare_extractors(dataset, ["octocrawl", "octocrawl-nolinks", *[x for x in a.others.split(",") if x]])
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    table = {}
    for name, res in results.items():
        table[name] = {m: res.overall_metrics.get(m) for m in METRICS}
        table[name]["samples"] = len(res.sample_results) if getattr(res, "sample_results", None) is not None else None
        table[name]["extraction_errors"] = (res.error_analysis or {}).get("total_errors")
    (out / "summary-545.json").write_text(json.dumps(table, indent=1))
    print("| Extractor | " + " | ".join(METRICS) + " |")
    print("|---|" + "|".join(["---:"] * len(METRICS)) + "|")
    for name, row in table.items():
        print(f"| {name} | " + " | ".join("unknown" if row[m] is None else f"{row[m]:.4f}" for m in METRICS) + " |")


if __name__ == "__main__":
    main()
