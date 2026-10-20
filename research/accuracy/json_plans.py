"""Write dev-plan-json.v1.json and reserved-plan-json.v2.json: the dev and reserved-v2 plans with a json schema and a
verify contract per case.

Each case's schema and checks come from its frozen task definition only: the field names, data types, required flags
and record grouping its gold.json declares, plus the word "currency" in the task text. No value, unit or date of a
label is read. The schema lists the task's fields; verify checks that json is complete, that each required field is
present and that the task's number of records exists. Numbers are typed by the schema itself (a value that breaks it
makes json invalid or incomplete), since a verify `field` check has no type test.

Usage: python research/accuracy/json_plans.py <dev dataset dir> <reserved-v2 dataset dir>
"""
import json,sys
from pathlib import Path

HERE=Path(__file__).parent
NUMERIC={'integer','decimal'}  # a percent stays the page's text (sign and % kept), as the task asks for the visible change
MODEL_NOTE=('modelFallback is false on both sides: no extraction model (W2L_EXTRACT_BASE_URL, W2L_EXTRACT_MODEL) is '
 'configured where the pair runs, so the deterministic path is measured and F2 (model values kept only where the page '
 'states them) is not.')

def grouping(gold):
 """(top-level fields, record entities in label order with their fields). An entity is a record when it shares a field
 name with another entity (the task's repeated records); an entity whose fields no other has (a page, registry,
 boundary or issue) sits at the top level."""
 names={}
 for f in gold['fields']:names.setdefault(f['entityId'],[]).append(f)
 sets={e:{f['name'] for f in fs} for e,fs in names.items()}
 recs=[e for e in names if any(sets[e]&sets[o] for o in names if o!=e)] if len(names)>1 else []
 top=[f for f in gold['fields'] if f['entityId'] not in recs]
 return top,[(e,names[e]) for e in recs]

def prop(f):
 return {'type':'number'} if f['dataType'] in NUMERIC else {'type':'string'}

def plan_case(gold):
 top,recs=grouping(gold);currency='currency' in gold['task'].lower() and 'currency' not in {f['name'] for f in gold['fields']}
 props={};required=[];checks=[{'type':'field','path':'json.status','equals':'complete'}]
 for f in top:
  if f['name'] in props:continue
  props[f['name']]=prop(f)
  if f['required']:required.append(f['name']);checks.append({'type':'field','path':'json.data.'+f['name'],'present':True})
 if currency and not recs:
  props['currency']={'type':'string'};required.append('currency');checks.append({'type':'field','path':'json.data.currency','present':True})
 if recs:
  item={'type':'object','properties':{},'required':[]}
  for _,fs in recs:
   for f in fs:item['properties'].setdefault(f['name'],prop(f))
  item['required']=[n for n in item['properties'] if all(any(f['name']==n and f['required'] for f in fs) for _,fs in recs)]
  if currency:item['properties']['currency']={'type':'string'};item['required'].append('currency')
  props['records']={'type':'array','items':item};required.append('records')
  for k,(_,fs) in enumerate(recs):
   for n in [f['name'] for f in fs if f['required']]+(['currency'] if currency else []):checks.append({'type':'field','path':f'json.data.records.{k}.{n}','present':True})
 assert len(checks)<=32,(gold['id'],len(checks))
 schema={'type':'object','properties':props,'required':required}
 return {'json':{'type':'json','schema':schema,'modelFallback':False},'verify':{'checks':checks},'recordEntities':[e for e,_ in recs]}

def write(base,dataset,out,name):
 plan=json.loads((HERE/base).read_text());cases=[]
 for c in plan['cases']:
  gold=json.loads((Path(dataset)/'cases'/c['id']/'gold.json').read_text());p=plan_case(gold)
  cases.append({'id':c['id'],'group':c['group'],'url':c['url'],'checkNeedle':None,'recordEntities':p['recordEntities'],
   'request':{'formats':[*plan['request']['formats'],p['json']],'verify':p['verify']}})
 new={**{k:v for k,v in plan.items() if k!='cases'},'schema':'octocrawl.field-run-plan-json/1','name':name,
  'scope':plan['scope']+' Each case adds a json format with a schema and a verify contract derived from its task (json_plans.py); the Markdown, tables and links request is otherwise unchanged.',
  'verify':'Per case: json.status equals complete, every required field present, and the task\'s records present by index. A success result is status success with verification not failed.',
  'modelFallback':MODEL_NOTE,'mappings':'research/accuracy/json_map.py','cases':cases}
 (HERE/out).write_text(json.dumps(new,indent=1,ensure_ascii=False)+'\n')

if __name__=='__main__':
 dev,reserved=sys.argv[1:3]
 write('dev-plan.v1.json',dev,'dev-plan-json.v1.json','dev and regression sets, json/verify')
 write('reserved-plan.v2.json',reserved,'reserved-plan-json.v2.json','reserved-v2, json/verify')
