"""python -m unittest research/benchmarks/webmainbench/test_score_full.py (from the repository root, in .w2l/pyenv)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from score_full import without_links  # noqa: E402


class WithoutLinksTest(unittest.TestCase):
    def test_keeps_link_text_and_drops_targets_and_images(self):
        md = "Read [the guide](https://example.com/guide) first.\n\n![Diagram](/img/a.png)\n\n- [Home](/)"
        self.assertEqual(without_links(md), "Read the guide first.\n\n\n\n- Home")

    def test_leaves_other_markdown_alone(self):
        md = "# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n`code [x](y)` stays a link in code too"
        self.assertEqual(without_links(md), "# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n`code x` stays a link in code too")


if __name__ == "__main__":
    unittest.main()
