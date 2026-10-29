"""ROUGE-N F1 (N=5, jieba) on WebMainBench's full set, with the scorer of the authors' MinerU-HTML eval_baselines.

  .w2l/pyenv/bin/python research/benchmarks/webmainbench/score_full.py --mineru <MinerU-HTML dir> \
      --bench webmainbench.jsonl --octocrawl <octocrawl-convert.mjs output> [--trafilatura] --out <dir>

Views:
- octocrawl-md       Octocrawl's own Markdown (links and images kept, as the product returns it);
- octocrawl-md-nolinks the same Markdown with link targets and images dropped (a link keeps its text), as the authors'
                     html2text wrapper drops them for every extractor in their table and their ground truth has none;
- octocrawl-html-md  Octocrawl's extracted main HTML through the authors' html2text wrapper, the "Html+MD" mode of their
                     table (links and images dropped by the wrapper);
- trafilatura-html-md the authors' own Trafilatura baseline, run here to check this scorer against their table.
Unlike eval_baselines.py, a page whose extraction failed scores 0 and stays in the mean (theirs leaves error rows out).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from itertools import zip_longest
from multiprocessing import Pool
from pathlib import Path

ARGS = None


def _init(mineru: str, traf: bool) -> None:
    global ARGS
    sys.path.insert(0, mineru)
    from eval_baselines.utils import calc_rouge_n_score
    from eval_baselines.baselines.base import HTML2TextWrapper
    ARGS = {"rouge": calc_rouge_n_score, "h2t": HTML2TextWrapper(), "traf": None}
    if traf:
        from eval_baselines.baselines.trafilatura import Trafilatura_HTML_MD_Extractor
        ARGS["traf"] = Trafilatura_HTML_MD_Extractor()


def level_of(meta) -> str:
    if isinstance(meta, str):
        import ast
        meta = ast.literal_eval(meta)
    return (meta or {}).get("level") or "unknown"


MD_IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
MD_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")


def without_links(markdown: str) -> str:
    """Markdown with images dropped and each link reduced to its text."""
    return MD_LINK.sub(r"\1", MD_IMAGE.sub("", markdown))


def score_line(pair: tuple[str, str | None]) -> dict:
    d, o = json.loads(pair[0]), json.loads(pair[1]) if pair[1] else None
    gt, out = d["convert_main_content"], {"track_id": d["track_id"], "level": level_of(d.get("meta"))}
    if o is not None and o["track_id"] != d["track_id"]:
        raise ValueError(f"octocrawl output out of order at {d['track_id']}")
    if o is None or o.get("error"):
        out["octocrawl-md"] = out["octocrawl-md-nolinks"] = out["octocrawl-html-md"] = 0.0
        out["octocrawl_error"] = "missing" if o is None else o["error"]
    else:
        out["octocrawl-md"] = ARGS["rouge"](gt, o["markdown"])["f1"]
        out["octocrawl-md-nolinks"] = ARGS["rouge"](gt, without_links(o["markdown"]))["f1"]
        out["octocrawl-html-md"] = ARGS["rouge"](gt, ARGS["h2t"](o["mainHtml"] or "", d["url"]) if o["mainHtml"] else "")["f1"]
        out["fallback"] = o["fallback"]
    if ARGS["traf"] is not None:
        try:
            _, content = ARGS["traf"].extract(d["html"], d["url"])
            out["trafilatura-html-md"] = ARGS["rouge"](gt, content or "")["f1"]
        except Exception as e:  # kept as 0, in the mean
            out["trafilatura-html-md"], out["trafilatura_error"] = 0.0, str(e)[:200]
    return out


def means(rows: list[dict], keys: list[str]) -> dict:
    groups = defaultdict(list)
    for r in rows:
        groups["all"].append(r)
        groups[r["level"]].append(r)
    return {g: {"n": len(rs), **{k: sum(r[k] for r in rs) / len(rs) for k in keys}} for g, rs in groups.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mineru", required=True)
    ap.add_argument("--bench", required=True)
    ap.add_argument("--octocrawl", required=True)
    ap.add_argument("--trafilatura", action="store_true")
    ap.add_argument("--out", required=True)
    ap.add_argument("--procs", type=int, default=6)
    a = ap.parse_args()
    # octocrawl-convert.mjs writes one line per input line, in order
    with open(a.bench) as f, open(a.octocrawl) as g, Pool(a.procs, _init, (str(Path(a.mineru).resolve()), a.trafilatura)) as pool:
        rows = list(pool.imap(score_line, zip_longest(f, g), chunksize=8))
    keys = ["octocrawl-md", "octocrawl-md-nolinks", "octocrawl-html-md"] + (["trafilatura-html-md"] if a.trafilatura else [])
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "rows.jsonl", "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    m = means(rows, keys)
    m["octocrawl_errors"] = sum(1 for r in rows if "octocrawl_error" in r)
    m["octocrawl_fallback"] = sum(1 for r in rows if r.get("fallback"))
    (out / "summary.json").write_text(json.dumps(m, indent=1))
    print(json.dumps(m, indent=1))


if __name__ == "__main__":
    main()
