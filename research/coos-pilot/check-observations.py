#!/usr/bin/env python3
"""Check the seed user's recorded numbers against what W2L captured.

For every row of the workbook's Observations sheet, find the W2L batch item for
its source and look for the recorded Raw_Value in the captured text. The result
says whether the number can be found in W2L's capture, not whether it is right.

Usage:
  python3 research/coos-pilot/check-observations.py \
      --workbook .w2l/coos-pilot/dataset.xlsx \
      --batch .w2l/coos-pilot/<run>/batch-items.json

Writes observations-check.csv and observations-summary.json next to the batch
file (or to --out). Keep the workbook and outputs under .w2l/: they contain the
seed user's data and must not be committed. Requires openpyxl
(`pip install openpyxl`).

Result values:
  found                 Raw_Value appears in the captured text
  not_found             source captured, value not present in the captured text
  source_not_captured   the batch item for the source did not succeed
  source_not_in_batch   no batch item for any URL of the source

Page numbers are reported but not checked: W2L output has no page boundaries
yet. A `found` on a short number (under three significant digits) or a year is
marked `weak` because such numbers also occur by chance.
"""
import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

CAPTURED = {'success', 'partial'}


def norm_url(url):
    parts = urlsplit(url.strip())
    path = parts.path.rstrip('/') or '/'
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, parts.query, ''))


def norm_text(text):
    for ch in '    ':
        text = text.replace(ch, ' ')
    return text.replace('−', '-').replace('–', '-')


def group(int_part, sep):
    return f'{int(int_part):,}'.replace(',', sep)


def number_forms(value):
    """Spellings of a recorded number as a publisher might print it."""
    negative = value < 0
    value = abs(value)
    forms = set()
    if isinstance(value, int) or float(value).is_integer():
        bases = [(str(int(value)), '')]
    else:
        bases = []
        for decimals in range(1, 5):
            text = f'{value:.{decimals}f}'
            if float(text) == value:
                int_part, frac = text.split('.')
                bases.append((int_part, '.' + frac))
    for int_part, frac in bases:
        forms.add(int_part + frac)
        if len(int_part) > 3:
            for sep in (',', ' '):
                forms.add(group(int_part, sep) + frac)
    if negative:
        forms = {'-' + f for f in forms} | {f'({f})' for f in forms}
    return sorted(forms, key=len, reverse=True)


def significant_digits(value):
    text = repr(abs(value))
    if text.endswith('.0'):
        text = text[:-2]
    digits = re.sub(r'\D', '', text).lstrip('0')
    return len(digits if '.' in text else digits.rstrip('0'))


def find_value(text, value):
    hits = 0
    first = None
    for form in number_forms(value):
        pattern = r'(?<![\d.,])' + re.escape(form) + r'(?![\d]|[.,]\d)'
        found = re.findall(pattern, text)
        if found:
            hits += len(found)
            first = first or form
    return hits, first


def read_sheet(workbook, name):
    rows = workbook[name].iter_rows(values_only=True)
    header = next(rows)
    return [dict(zip(header, row)) for row in rows]


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--workbook', required=True, type=Path)
    parser.add_argument('--batch', required=True, type=Path, help='batch-items.json from run-baseline.mjs')
    parser.add_argument('--links', type=Path, default=Path(__file__).with_name('coos-links.csv'))
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()

    try:
        import openpyxl
    except ImportError:
        sys.exit('openpyxl is required: pip install openpyxl')

    workbook = openpyxl.load_workbook(args.workbook, read_only=True)
    observations = read_sheet(workbook, 'Observations')
    sources = {row['Source_ID']: row for row in read_sheet(workbook, 'Sources') if row['Source_ID']}

    batch = json.loads(args.batch.read_text())
    items = {}
    for item in batch['items']:
        for url in (item.get('url'), item.get('canonicalUrl')):
            if url:
                items.setdefault(norm_url(url), item)

    formats = {}
    if args.links.exists():
        with args.links.open() as handle:
            formats = {row['source_id']: row['expected_format'] for row in csv.DictReader(handle)}

    text_cache = {}
    results = []
    for obs in observations:
        if obs['Observation_ID'] is None:
            continue
        source = sources.get(obs['Source_ID'], {})
        candidates = [obs.get('Source_URL'), source.get('Source_URL'), source.get('Canonical_URL')]
        candidates = [u for u in dict.fromkeys(candidates) if isinstance(u, str) and u.startswith('http')]
        matched = [(url, items[norm_url(url)]) for url in candidates if norm_url(url) in items]
        captured = [(url, item) for url, item in matched if item.get('status') in CAPTURED and item.get('markdown')]

        value = obs['Raw_Value']
        row = {
            'observation_id': obs['Observation_ID'],
            'source_id': obs['Source_ID'],
            'expected_format': formats.get(obs['Source_ID'], ''),
            'metric': obs['Metric'],
            'reporting_year': obs['Reporting_Year'],
            'raw_value': value,
            'raw_unit': obs['Raw_Unit'],
            'qualifier': obs['Value_Qualifier'],
            'page_cited': obs['Page_Number'],
            'derived_standardized_value': obs['Derived_Value_Flag'],
            'source_conflict': obs['Source_Conflict'],
            'checked_url': '',
            'capture_status': '',
            'capture_reason': '',
            'raw_body_sha256': '',
            'result': '',
            'occurrences': 0,
            'matched_text': '',
            'strength': '',
        }
        if not matched:
            row['result'] = 'source_not_in_batch'
        elif not captured:
            url, item = matched[0]
            row.update(checked_url=url, capture_status=item.get('status'),
                       capture_reason=item.get('failureReason') or item.get('blockReason') or '',
                       result='source_not_captured')
        else:
            best = None
            for url, item in captured:
                key = id(item)
                if key not in text_cache:
                    text_cache[key] = norm_text(item['markdown'])
                hits, form = find_value(text_cache[key], value) if isinstance(value, (int, float)) else (0, None)
                if best is None or hits > best[2]:
                    best = (url, item, hits, form)
            url, item, hits, form = best
            evidence = item.get('evidence') or {}
            row.update(checked_url=url, capture_status=item.get('status'),
                       raw_body_sha256=evidence.get('rawBodySha256') or item.get('contentHash') or '',
                       result='found' if hits else 'not_found', occurrences=hits, matched_text=form or '')
            if hits:
                weak = significant_digits(value) < 3 or obs['Raw_Unit'] == 'year'
                row['strength'] = 'weak' if weak else 'strong'
        results.append(row)

    out_dir = args.out or args.batch.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / 'observations-check.csv').open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(results[0]))
        writer.writeheader()
        writer.writerows(results)

    def tally(rows):
        counts = Counter(r['result'] for r in rows)
        strong = sum(1 for r in rows if r['strength'] == 'strong')
        checked = counts['found'] + counts['not_found']
        return {
            'observations': len(rows),
            **{k: counts[k] for k in ('found', 'not_found', 'source_not_captured', 'source_not_in_batch')},
            'found_strong': strong,
            'found_weak': counts['found'] - strong,
            'recall_of_captured': round(counts['found'] / checked, 4) if checked else None,
            'recall_of_all': round(counts['found'] / len(rows), 4) if rows else None,
        }

    by_format = defaultdict(list)
    by_source = defaultdict(list)
    for r in results:
        by_format[r['expected_format'] or 'unknown'].append(r)
        by_source[r['source_id']].append(r)
    summary = {
        'workbook': args.workbook.name,
        'batchTaskId': batch.get('taskId'),
        'operatorCheckoutCommit': batch.get('operatorCheckoutCommit'),
        'pagesChecked': False,
        'overall': tally(results),
        'byExpectedFormat': {k: tally(v) for k, v in sorted(by_format.items())},
        'bySource': {k: tally(v) for k, v in sorted(by_source.items(), key=lambda kv: -len(kv[1]))},
    }
    (out_dir / 'observations-summary.json').write_text(json.dumps(summary, indent=2))

    overall = summary['overall']
    print(f"{overall['observations']} observations: found {overall['found']} "
          f"(strong {overall['found_strong']}, weak {overall['found_weak']}), not found {overall['not_found']}, "
          f"source not captured {overall['source_not_captured']}, source not in batch {overall['source_not_in_batch']}")
    print(f"recall of captured sources: {overall['recall_of_captured']}; recall of all: {overall['recall_of_all']}")
    for name, stats in summary['byExpectedFormat'].items():
        print(f"  {name:28} n={stats['observations']:4}  found={stats['found']:4}  not_found={stats['not_found']:4}  "
              f"not_captured={stats['source_not_captured']:4}")
    print(f"wrote {out_dir / 'observations-check.csv'} and observations-summary.json")


if __name__ == '__main__':
    main()
