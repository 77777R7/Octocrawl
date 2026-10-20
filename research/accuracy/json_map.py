"""Output-to-field mapping for the json/verify plans (dev-plan-json.v1.json, reserved-plan-json.v2.json), committed
before any run of them.

Values come only from the delivered `json.data`: a top-level field from the property of its name, a record field from
`json.data.records[k]`, where record k serves the k-th record entity of the task in label order (json_plans.grouping,
the same rule that wrote the schema). A price-like number takes its unit from the `currency` property the schema asks
for (never from a symbol). A date field's business date is the date its value states; any other field whose date the
source states takes the date of its own object's first date field. Periods and non-currency units are not in this
output and stay None. Nothing is read from Markdown, tables, links, the retained source or the labels.
"""
import re
import holdout_score as hs
from json_plans import grouping
from reserved_map import vdate

DATES={'iso_date'}
def evidence_ref(js,pointer):
 for i,e in enumerate(js.get('evidence') or []):
  if isinstance(e,dict) and e.get('path')==pointer:return f'json.evidence[{i}]'
 return 'json.data'+pointer.replace('/','.')

def value_of(v):
 if v is None or isinstance(v,(dict,list)):return None
 if isinstance(v,bool):return str(v).lower()
 return str(v)

def json_mapped(case,doc,put,duplicates):
 js=doc.get('json') if isinstance(doc.get('json'),dict) else {};data=js.get('data') if isinstance(js.get('data'),dict) else None
 top,recs=grouping(case);order={e:k for k,(e,_) in enumerate(recs)}
 records=data.get('records') if data and isinstance(data.get('records'),list) else []
 for f in case['fields']:
  if f['entityId'] in order:
   k=order[f['entityId']];obj=records[k] if k<len(records) and isinstance(records[k],dict) else None;pointer=f'/records/{k}/{f["name"]}'
  else:obj=data;pointer='/'+f['name']
  if obj is None:put(f,None,None,entity=False);continue
  v=value_of(obj.get(f['name']))
  unit=value_of(obj.get('currency')) if 'price' in f['name'] else None
  dt=f['dataType'];date=(vdate(v) or (v if v and re.fullmatch(r'\d{4}-\d{2}-\d{2}',v) else None)) if dt in DATES and v else hs.month_only(v) if dt=='year_month' and v else v if dt=='year' else None
  if dt=='text' and v and case['dates'].get(f.get('dateRef'),{}).get('state')=='known':date=v if hs.month_only(v) else vdate(v)
  if dt in DATES and date:v=date  # a stated day is compared as ISO, as the Markdown mappings deliver it
  if date is None and case['dates'].get(f.get('dateRef'),{}).get('state')=='known':
   # A value without its own date (a price, a close) takes the date its own object states, first date-typed field.
   sib=next((g for g in case['fields'] if g['entityId']==f['entityId'] and g['dataType'] in DATES and g is not f),None)
   sv=value_of(obj.get(sib['name'])) if sib else None;date=vdate(sv) if sv else None
  if dt=='year_month' and date:v=date
  put(f,v,evidence_ref(js,pointer) if v is not None else None,unit=unit,date=date,entity=True)
