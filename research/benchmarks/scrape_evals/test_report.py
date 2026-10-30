"""python -m unittest research/benchmarks/scrape_evals/test_report.py (from the repository root, in .w2l/pyenv)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from report import outcome, summarize, truth_share  # noqa: E402


class ReportTest(unittest.TestCase):
    def test_truth_share_counts_unique_truth_words(self):
        self.assertEqual(truth_share("the Quick fox", "quick brown fox jumps"), 0.5)
        self.assertIsNone(truth_share("anything", ""))

    def test_every_row_stays_in_the_denominator(self):
        rows = [
            {"success": True, "f1": 0.8, "share": 0.9, "flagged": False},
            {"success": True, "f1": 0.0, "share": 0.0, "flagged": False},  # hollow: a success with none of the truth
            {"success": False, "f1": 0.0, "share": 0.0, "flagged": True},
            {"success": False, "f1": 0.0, "share": None, "flagged": True},
        ]
        s = summarize(rows)
        self.assertEqual(s["all"]["n"], 4)
        self.assertEqual(s["all"]["cov_nov"], 0.5)
        self.assertEqual(s["all"]["cov_jan"], 0.25)
        self.assertEqual(s["all"]["f1"], 0.2)
        self.assertEqual(s["all"]["hollow"], 0.5)
        self.assertEqual(s["unflagged"]["n"], 2)
        self.assertIsNone(s["flagged"]["hollow"])  # no successes: unknown, not zero

    def test_outcome_keeps_octocrawl_status(self):
        self.assertEqual(outcome({"error": "blocked: cloudflare_challenge", "status_code": 403}, False), "blocked: cloudflare_challenge")
        self.assertEqual(outcome(None, False), "no answer recorded")
        self.assertEqual(outcome({"error": "HTTP error: 404", "status_code": 404}, False), "http 4xx")


if __name__ == "__main__":
    unittest.main()
