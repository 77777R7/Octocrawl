"""Count the tokens of what run.mjs saved, page by page and arm by arm, and check what Octocrawl's Markdown kept.

Usage: .w2l/pyenv/bin/python research/benchmarks/token_cost/count.py <run dir> [--json out.json]
Tokens are tiktoken's o200k_base (an OpenAI tokenizer): Claude's tokenizer gives other counts, so read the ratios.

Arms (tokens to read the whole page):
  raw_html        body of a plain HTTP GET
  rendered_html   document outerHTML after load
  fetch_mcp       every answer of the reference Fetch MCP server (Markdown), paged to the end
  playwright      browser_navigate answer + the snapshot file it names (the agent reads it to see the page)
  octocrawl       every scrape answer (first, then markdownOffset pages until not cut), envelope included
  octocrawl_first the first scrape answer only
  octocrawl_md    the page's Markdown alone, all pages joined

Retention: paragraphs and list items of 60+ characters in the Playwright snapshot (the page as the browser shows it,
navigation included) found in Octocrawl's Markdown after both are reduced to letters and digits. A snapshot paragraph
the Markdown lacks is either chrome Octocrawl dropped on purpose or content it lost: low values are read by hand.
"""
import json
import os
import re
import statistics
import sys

import tiktoken

ENC = tiktoken.get_encoding('o200k_base')


def tokens(text):
    return len(ENC.encode(text, disallowed_special=()))


def read(path):
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            return f.read()
    except FileNotFoundError:
        return None


def squash(text):
    return re.sub(r'[^0-9a-z]+', '', text.lower())


def snapshot_paragraphs(snapshot):
    out = []
    for line in snapshot.splitlines():
        m = re.match(r'\s*- (?:paragraph|listitem|text|cell|definition|blockquote)(?: \[[^\]]*\])*: (.+)$', line)
        if m:
            t = m.group(1).strip().strip('"')
            if len(t) >= 60:
                out.append(t)
    return out


def main():
    run_dir = sys.argv[1]
    meta = json.load(open(os.path.join(run_dir, 'run.json')))
    rows = []
    for r in meta['urls']:
        d = os.path.join(run_dir, r['id'])
        raw, dom = read(os.path.join(d, 'raw_html.txt')), read(os.path.join(d, 'rendered_html.txt'))
        nav, snap = read(os.path.join(d, 'playwright_mcp.txt')), read(os.path.join(d, 'playwright_snapshot.txt'))
        fm = read(os.path.join(d, 'fetch_mcp.txt'))
        oc, first, md = read(os.path.join(d, 'octocrawl_mcp.txt')), read(os.path.join(d, 'octocrawl_mcp_first.txt')), read(os.path.join(d, 'octocrawl_markdown.txt'))
        row = {'id': r['id'], 'url': r['url'], 'ok': {k: v.get('ok') for k, v in r['arms'].items()}}
        row['tokens'] = {
            'raw_html': tokens(raw) if raw else None,
            'rendered_html': tokens(dom) if dom else None,
            'fetch_mcp': tokens(fm) if fm else None,
            'playwright': tokens((nav or '') + '\n' + snap) if snap else None,
            'octocrawl': tokens(oc) if oc else None,
            'octocrawl_first': tokens(first) if first else None,
            'octocrawl_md': tokens(md) if md else None,
        }
        row['octocrawl_answers'] = r['arms']['octocrawl_mcp'].get('answers')
        row['fetch_answers'] = r['arms'].get('fetch_mcp', {}).get('answers')
        row['fetch_ok'] = r['arms'].get('fetch_mcp', {}).get('ok')
        paras = snapshot_paragraphs(snap or '')
        hay = squash(md or '')
        found = [p for p in paras if squash(p)[:120] in hay]
        row['retention'] = {'snapshot_paragraphs': len(paras), 'found_in_markdown': len(found), 'share': round(len(found) / len(paras), 3) if paras else None}
        row['missing_examples'] = [p[:140] for p in paras if p not in found][:5]
        rows.append(row)

    arms = ['raw_html', 'rendered_html', 'fetch_mcp', 'playwright', 'octocrawl', 'octocrawl_first', 'octocrawl_md']
    summary = {}
    for a in arms:
        vals = [x['tokens'][a] for x in rows if x['tokens'][a] is not None]
        summary[a] = {'pages': len(vals), 'sum': sum(vals), 'median': statistics.median(vals) if vals else None}
    ratios = {}
    for base in ['raw_html', 'rendered_html', 'fetch_mcp', 'playwright']:
        both = [x for x in rows if x['tokens']['octocrawl'] and x['tokens'][base] and (base != 'fetch_mcp' or x['fetch_ok'])]
        per = [x['tokens']['octocrawl'] / x['tokens'][base] for x in both]
        ratios[f'octocrawl_vs_{base}'] = {
            'pages': len(per),
            'sum_ratio': round(sum(x['tokens']['octocrawl'] for x in both) / sum(x['tokens'][base] for x in both), 3),
            'median_page_ratio': round(statistics.median(per), 3),
            'min_page_ratio': round(min(per), 3),
            'max_page_ratio': round(max(per), 3),
        }
    shares = [x['retention']['share'] for x in rows if x['retention']['share'] is not None]
    out = {'run': {k: meta.get(k) for k in ('startedAt', 'endedAt', 'proxy', 'playwrightMcp', 'fetchMcp', 'node')}, 'tokenizer': 'tiktoken o200k_base ' + tiktoken.__version__,
           'summary': summary, 'ratios': ratios, 'retention_median': statistics.median(shares) if shares else None, 'rows': rows}
    if '--json' in sys.argv:
        json.dump(out, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1, ensure_ascii=False)
    print('| # | Page | Raw HTML | Rendered HTML | Fetch MCP | Playwright MCP | Octocrawl (all answers) | answers | Octocrawl Markdown | Kept |')
    print('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
    for x in rows:
        t = x['tokens']; ret = x['retention']
        host = re.sub(r'^https?://', '', x['url'])[:60]
        fmt = lambda v: f'{v:,}' if v is not None else 'none'
        kept = f"{ret['found_in_markdown']}/{ret['snapshot_paragraphs']}" if ret['snapshot_paragraphs'] else 'n/a'
        print(f"| {x['id']} | {host} | {fmt(t['raw_html'])} | {fmt(t['rendered_html'])} | {fmt(t['fetch_mcp']) if x['fetch_ok'] else 'failed'} | {fmt(t['playwright'])} | {fmt(t['octocrawl'])} | {x['octocrawl_answers']} | {fmt(t['octocrawl_md'])} | {kept} |")
    print()
    print(json.dumps({'summary': summary, 'ratios': ratios, 'retention_median': out['retention_median']}, indent=1))


if __name__ == '__main__':
    main()
