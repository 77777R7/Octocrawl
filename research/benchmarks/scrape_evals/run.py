"""Run the scrape-evals harness (github.com/martynasoxylabs/scrape-evals) with this directory's engines added.

  .w2l/pyenv/bin/python research/benchmarks/scrape_evals/run.py <harness dir> -- <run_eval.py arguments>

The harness is used unmodified: its own engines stay importable, and the files under ./engines are added to its
`engines` package path, so `--scrape_engine octocrawl_local` resolves here.
"""
import sys
from pathlib import Path

harness = Path(sys.argv[1]).resolve()
args = sys.argv[sys.argv.index("--") + 1:]
sys.path.insert(0, str(harness))

import engines  # noqa: E402  (the harness's package)

engines.__path__.append(str(Path(__file__).resolve().parent / "engines"))

import run_eval  # noqa: E402

sys.argv = ["run_eval.py", *args]
run_eval.app()
