"""Cross-check W2L's `tables` format against pandas.read_html on the same HTML.

Usage (in a virtualenv with pandas and lxml, e.g. .w2l/pyenv):
    python research/parity/tables-crosscheck.py <run dir> <case id>...

<run dir> is a run-sites.mjs output directory (`.w2l/parity/<timestamp>/`);
each case's response must carry `tables` and `rawHtml` (the page as the
answering lane received it). For every W2L table, the pandas table of the
same raw HTML with the most equal cells is its counterpart: pandas reads
every <table> independently (colspan and rowspan repeated, as W2L does), so
a shifted or dropped cell in W2L's rows shows up as a shape difference or as
unequal cells. pandas' lxml table reader is used before read_html's text
parser, so cells stay strings as written. Cells are compared after NFKC, whitespace removal and
lower-casing; the unequal ones are listed for review, since a footnote mark
or a hidden element can differ without any misalignment. Prints one JSON
object per table and a summary line per case.
"""

import io
import json
import re
import sys
import unicodedata
from pathlib import Path

import pandas.io.html as pdhtml


def norm(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(value))).lower()


def pandas_tables(html: str) -> list[list[list[str]]]:
    # pandas' own lxml table reader, the one read_html uses, before its text parser
    # infers types: each table's header, body and footer rows as the cell text,
    # colspan and rowspan repeated, so "1,200" and "4.20" stay as written.
    parser = pdhtml._LxmlFrameParser(io.StringIO(html), re.compile(".+"), None, None, True, None)
    try:
        tables = parser.parse_tables()
    except ValueError:
        return []
    return [[[("" if cell is None else str(cell)) for cell in row] for row in [*head, *body, *foot]] for head, body, foot in tables]


def compare(ours: list[list[str]], theirs: list[list[str]]) -> tuple[int, int, list[tuple[int, int, str, str]]]:
    rows = min(len(ours), len(theirs))
    equal = compared = 0
    diffs = []
    for r in range(rows):
        cols = min(len(ours[r]), len(theirs[r]))
        for c in range(cols):
            compared += 1
            if norm(ours[r][c]) == norm(theirs[r][c]):
                equal += 1
            else:
                diffs.append((r, c, ours[r][c][:60], theirs[r][c][:60]))
    return equal, compared, diffs


def main() -> None:
    run = Path(sys.argv[1])
    for case in sys.argv[2:]:
        response = json.loads((run / f"{case}.json").read_text())
        body = response.get("json", response)
        tables = body.get("tables") or []
        candidates = pandas_tables(body.get("rawHtml") or "")
        exact = 0
        for table in tables:
            ours = [list(row) for row in table["rows"]]
            best = None
            for index, theirs in enumerate(candidates):
                equal, compared, diffs = compare(ours, theirs)
                key = (equal, -abs(len(theirs) - len(ours)))
                if best is None or key > best[0]:
                    best = (key, index, theirs, equal, compared, diffs)
            if best is None:
                print(json.dumps({"case": case, "tableIndex": table["tableIndex"], "pandasMatch": None}))
                continue
            _, index, theirs, equal, compared, diffs = best
            same_shape = len(theirs) == len(ours) and all(len(a) == len(b) for a, b in zip(ours, theirs))
            total = sum(len(row) for row in ours)
            if same_shape and equal == total:
                exact += 1
            print(json.dumps({
                "case": case, "tableIndex": table["tableIndex"], "rows": len(ours), "columns": table["columns"],
                "pandasTable": index, "pandasShape": [len(theirs), max((len(r) for r in theirs), default=0)],
                "sameShape": same_shape, "cellsEqual": equal, "cells": total, "diffs": diffs[:5],
            }, ensure_ascii=False))
        print(json.dumps({"case": case, "summary": {"w2lTables": len(tables), "pandasTables": len(candidates), "exactMatches": exact}}))


if __name__ == "__main__":
    main()
