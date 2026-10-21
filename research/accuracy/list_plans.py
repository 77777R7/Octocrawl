"""Write dev-plan-list.v1.json and reserved-plan-list.v2.json: the json/verify plans (json_plans.py) with, for each
list or table case, the `list` format of list_selectors.v1.json added beside its json format (PA K1, list records).

With a `list` format that names an itemSelector, the json format is filled from the selected records
(packages/api/src/structured.ts, selectedListJson): the schema's one array (`records`) gets one object per selected item,
each field from its own selector. Top-level fields of such a case are not filled on that path. Every other part of a
request, the verify contract and each non-list case are byte-for-byte the json plan's. A case whose selectors entry is
null keeps the json plan's request and is named in the plan's `listCases.unselected`.

Usage: python research/accuracy/list_plans.py
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
SEL = json.loads((HERE / 'list_selectors.v1.json').read_text())

def with_lists(src, dst, name):
    plan = json.loads((HERE / src).read_text())
    selected, unselected = [], []
    for case in plan['cases']:
        entry = SEL['cases'].get(case['id'])
        if not case.get('records') or entry is None:
            continue
        if entry.get('list') is None:
            unselected.append(case['id']); continue
        case['request']['formats'] = [*case['request']['formats'], entry['list']]
        selected.append(case['id'])
    plan['name'] = name
    plan['scope'] = plan['scope'] + ' K1 variant: list and table cases also send the list format of list_selectors.v1.json, so their records come from the selected items.'
    plan['listCases'] = {'selectors': 'research/accuracy/list_selectors.v1.json', 'selected': selected, 'unselected': unselected}
    (HERE / dst).write_text(json.dumps(plan, indent=1, ensure_ascii=False) + '\n')
    print(dst, len(selected), 'selected,', len(unselected), 'unselected')

with_lists('dev-plan-json.v1.json', 'dev-plan-list.v1.json', 'dev, json/verify with itemSelector')
with_lists('reserved-plan-json.v2.json', 'reserved-plan-list.v2.json', 'reserved-v2, json/verify with itemSelector')
