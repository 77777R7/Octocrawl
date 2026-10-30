"""Score scrape-evals runs over all dataset rows and print the record's tables.

  .w2l/pyenv/bin/python research/benchmarks/scrape_evals/report.py --harness <dir> --dataset <csv> \
      --arm <name>=<run dir>/<engine>_quality[:<raw dir with <sha1(url)>.md to score instead>] ... [--json out.json]

Every row of the dataset is in every denominator: a row an arm did not answer counts as a failure with F1 0. Each row is
scored with the harness's own QualityAnalyzer (success = its Nov-2025 coverage, best-window F1). Added here:
- cov_jan: the Jan-2026 definition as we read it: at least 10% of the row's unique truth words appear in the content
  (rows with no truth words never count);
- hollow: of the rows the harness counts as a success, the share whose content holds none of the truth words.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path


def tokens(text: str) -> list[str]:
    """The harness's smart_tokenize (evals/analysis/quality_analyzer.py)."""
    return re.findall(r"\d+/\d+|[\w'-]+", (text or "").lower())


def truth_share(content_text: str, truth: str) -> float | None:
    """Share of the truth snippet's unique words found anywhere in the content; None when the snippet has none."""
    want = set(tokens(truth))
    if not want:
        return None
    return len(want & set(tokens(content_text))) / len(want)


def outcome(scrape: dict | None, success: bool) -> str:
    """The row's status bucket for the per-status table."""
    if scrape is None:
        return "no answer recorded"
    if success:
        return "success"
    err = str(scrape.get("error") or "")
    code = scrape.get("status_code")
    if err.split(":")[0] in {"blocked", "failed", "partial"}:  # Octocrawl's own status, with its reason
        return err[:60]
    low = err.lower()
    if "timeout" in low or "timed out" in low:
        return "timeout"
    if isinstance(code, int) and code >= 400:
        return f"http {code // 100}xx"
    if err:
        return "error: " + re.sub(r"[:(].*", "", err)[:40]
    if not scrape.get("content"):
        return "empty content"
    return "not success (block-page text or no truth/lie snippet)"


def summarize(rows: list[dict]) -> dict:
    """rows: {success: bool, f1: float, share: float|None, flagged: bool}. Denominators are len(rows) and its subsets."""
    def view(rs: list[dict]) -> dict:
        n = len(rs)
        succ = [r for r in rs if r["success"]]
        hollow = [r for r in succ if r["share"] is not None and r["share"] == 0]
        with_truth = [r for r in succ if r["share"] is not None]
        return {
            "n": n,
            "cov_nov": sum(r["success"] for r in rs) / n if n else None,
            "cov_jan": sum(1 for r in rs if r["share"] is not None and r["share"] >= 0.10) / n if n else None,
            "f1": sum(r["f1"] for r in rs) / n if n else None,
            "hollow": len(hollow) / len(with_truth) if with_truth else None,
            "successes": len(succ),
        }
    return {"all": view(rows), "unflagged": view([r for r in rows if not r["flagged"]]), "flagged": view([r for r in rows if r["flagged"]])}


def score_arm(task_dir: Path, md_dir: Path | None, dataset: list[dict], analyzer, Task, ScrapeOutput) -> tuple[list[dict], Counter]:
    rows, statuses = [], Counter()
    for d in dataset:
        p = task_dir / str(d["id"]) / "scrape_output.json"
        scrape = json.loads(p.read_text()) if p.exists() else None
        task = Task(id=str(d["id"]), url=d["url"], truth_text=d["truth_text"], lie_text=d["lie_text"])
        if scrape is not None and md_dir is not None:
            mp = md_dir / (hashlib.sha1(d["url"].encode()).hexdigest() + ".md")
            md = mp.read_text() if mp.exists() else None
            scrape = {**scrape, "format": "markdown", "content": md or None, "content_size": len(md.encode()) if md else 0}
        if scrape is None:
            success, f1, text = False, 0.0, ""
        else:
            out = ScrapeOutput(scraper=str(scrape.get("scraper")), url=d["url"], status_code=scrape.get("status_code"),
                               error=scrape.get("error"), created_at=scrape.get("created_at"), format=scrape.get("format"),
                               content_size=scrape.get("content_size"), content=scrape.get("content"))
            a = analyzer.analyze_one(task, out)
            success, f1, text = bool(a.success), float(a.f1), scrape.get("content") or ""
        # cov_jan and hollow read only what the harness counted as delivered content: a failed row's text is not credited
        share = truth_share(text, d["truth_text"]) if scrape is not None and not scrape.get("error") else (None if not tokens(d["truth_text"]) else 0.0)
        rows.append({"success": success, "f1": f1, "share": share, "flagged": bool(d["error"].strip())})
        statuses[(bool(d["error"].strip()), outcome(scrape, success))] += 1
    return rows, statuses


def pct(x):
    return "unknown" if x is None else f"{100 * x:.1f}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--harness", required=True)
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--arm", action="append", required=True)
    ap.add_argument("--json")
    a = ap.parse_args()
    sys.path.insert(0, str(Path(a.harness).resolve()))
    from evals.analysis.quality_analyzer import QualityAnalyzer
    from evals.suites.types import ScrapeOutput, Task

    with open(a.dataset, newline="") as f:
        dataset = list(csv.DictReader(f))
    analyzer, out = QualityAnalyzer(), {}
    print("| Arm | View | n | Coverage Nov-2025 % | Coverage Jan-2026 (≥10% truth words) % | F1 | Hollow successes % |")
    print("|---|---|---:|---:|---:|---:|---:|")
    for spec in a.arm:
        name, rest = spec.split("=", 1)
        parts = rest.split(":", 1)
        rows, statuses = score_arm(Path(parts[0]), Path(parts[1]) if len(parts) > 1 else None, dataset, analyzer, Task, ScrapeOutput)
        s = summarize(rows)
        out[name] = {"summary": s, "statuses": {f"{'flagged' if k[0] else 'unflagged'}|{k[1]}": v for k, v in statuses.items()}}
        for view, label in (("all", "all 1,000"), ("unflagged", "excl. 133 dataset-flagged"), ("flagged", "only the 133 flagged")):
            v = s[view]
            print(f"| {name} | {label} | {v['n']} | {pct(v['cov_nov'])} | {pct(v['cov_jan'])} | {v['f1']:.3f} | {pct(v['hollow'])} |")
    for name, o in out.items():
        print(f"\n**{name}** per status (dataset flag | outcome: rows)\n")
        for k, v in sorted(o["statuses"].items(), key=lambda kv: (-kv[1], kv[0])):
            print(f"- {k}: {v}")
    if a.json:
        Path(a.json).write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
