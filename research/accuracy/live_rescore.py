"""Rescore a live reserved-v2 run (k1_live_v2.mjs outputs scored by holdout_score.py) without the same-source check.

holdout_score.py counts a field fully correct only when the answer's rawSha256 equals the sealed capture's; a live page never
does. This keeps every other check under the scorer's own rule (value and entity must hold; a unit, date or period check
the scorer leaves None, because the gold states that context as unknown, is not scored), then counts per version: required
fields correct, tasks accepted (every required field correct, no duplicates, nothing fabricated), success claims (status
success and a verify that did not fail) and false successes (a claim not accepted), with exact one-sided 95% upper bounds.

With --gold and --sameday, the json answers are also scored against a same-day reference set (a dated annotation of the
run-day pages, such as .w2l/field-gold/sameday-v2-2026-10-24/): each case the set covers is scored against its same-day
annotation, every other case against the 2026-10-20 gold again, so all 42 cases stay in both denominators. Both scores are
reported side by side, and every false success against the gold gets a cause label (CAUSES) read from evidence:
- drift: the answer is correct against the same-day annotation of the page;
- schema_scope: what still fails is a unit, date or period check that an answer giving every requested property exactly
  right would fail too (the request never asked for it);
- extraction: a value the page stated on the run day (same-day annotation from this arm's own source, from a source that
  agrees with it, a value unchanged since the gold, or a record whose other fields the answer matches; without a same-day
  annotation, the gold value another arm returned in this run) and the answer did not deliver; also duplicate records.
  For a value that can change within minutes (FAST), only the arm's own source shows what its page stated;
- access: the arm's own kept page is not the page (its same-day block did not run on it);
- unknown: none of the above can be shown, for example a right value whose unit is given as the page writes it (€) where
  the gold normalises it (EUR), or a changed value on a page whose run-day source this arm did not keep.
A case's label is the first of access, extraction, unknown, schema_scope, drift among its failing required fields.

Usage: python3 research/accuracy/live_rescore.py <run dir with field-results-json.json and field-results-md.json>
         [--gold <reserved-v2 dir> --sameday <same-day set dir>]
"""
import argparse,json,math,os,sys
CAUSES=['access','extraction','unknown','schema_scope','drift']
FAST={'live','hourly','volatile'}  # freshness classes that can change between two arms' fetches of the same minute
LIVE_ORIGIN='http://127.0.0.1:1'
def up(k,n):
  if n==0: return None
  if k==0: return 1-0.05**(1/n)
  lo,hi=k/n,1.0
  cdf=lambda p: sum(math.comb(n,i)*p**i*(1-p)**(n-i) for i in range(k+1))
  for _ in range(60):
    mid=(lo+hi)/2
    if cdf(mid)>0.05: lo=mid
    else: hi=mid
  return hi
def ok(x): return all(c is not False for kk,c in x['checks'].items() if kk!='sameSource') and x['availability']=='captured'
def accepted(r): return r['totals']['requiredNotCaptured']==0 and all(ok(x) for x in r['rows'] if x['required']) and not r['totals']['duplicateSelectedRecords'] and not r['totals']['fabricated']
def claim(r): return r['status']=='success' and r['configuredVerification']!='failed'
def tally(rows):
  req=rc=val=0; acc=succ=fs=0; tasks=[]
  for r in rows:
    cap=[x for x in r['rows'] if x['availability']=='captured']
    rq=[x for x in cap if x['required']]; req+=len(rq); rc+=sum(ok(x) for x in rq); val+=sum(bool(x['checks']['value'] and x['checks']['entity']) for x in r['rows'])
    a=accepted(r); s=claim(r)
    acc+=a; succ+=s; fs+=(s and not a); tasks.append((r['id'],a,s))
  return dict(requiredLiveCorrect=f'{rc}/{req}',valueCorrect=val,accepted=acc,success=succ,fs=fs,fsDelivered=f'{fs}/{succ} ({(up(fs,succ) or 0)*100:.1f}%)',fsAll=f'{fs}/{len(rows)} ({up(fs,len(rows))*100:.1f}%)',acceptedIds=[t for t,a,s in tasks if a],falseSuccessIds=[t for t,a,s in tasks if s and not a])

def perfect_answer(case,schema):
  """The answer that gives every property the request schema asks for exactly as the reference states it (a price's
  currency from its unit). Whatever this answer still fails is outside the request."""
  from json_plans import grouping
  top,recs=grouping(case);props=(schema or {}).get('properties') or {}
  def obj(fields,names):
    o={f['name']:f['value'] for f in fields if f['name'] in names and f['value'] is not None}
    if 'currency' in names and 'currency' not in o:
      u=next((case['units'].get(f['unitRef'],{}).get('value') for f in fields if 'price' in f['name']),None)
      if u is not None:o['currency']=u
    return o
  data=obj(top,set(props))
  if 'records' in props:data['records']=[obj(fs,set(props['records'].get('items',{}).get('properties') or {})) for _,fs in recs]
  return {'status':'success','json':{'status':'complete','data':data},'verification':{'status':'passed'}}

def as_page(row,dims):
  """Only the unit fails, the value is right, and the delivered unit is the page's own text of it (a symbol the gold normalises)."""
  ctx=row['contextEvidence'].get('units') or {}
  return dims==['unit'] and row['checks']['value'] and row.get('unit') is not None and any(e.get('quote','').strip()==str(row['unit']).strip() for e in ctx.get('evidence') or [])

def field_cause(arm,row,ref_row,perfect_row,ref,seen_live,own_quote,same_record=False,fast=False):
  """Cause of one failing required field against the gold. ref_row is the same field scored against the same-day
  annotation (None when the case has none), perfect_row the perfect answer's row against the same reference; same_record
  says another field of the same record is correct against the same-day annotation (the arm read that record); fast says
  the field's freshness is in FAST, so only this arm's own source can show which value the page stated when it read it
  (a requested unit or date delivered wrongly with the right value is still extraction)."""
  if ref_row is not None:
    if ok(ref_row): return 'drift','correct against the same-day annotation'
    dims=[k for k,c in ref_row['checks'].items() if c is False and k not in ('sameSource','relation')]
    beyond={k for k,c in perfect_row['checks'].items() if c is False and k not in ('sameSource','relation')}
    if dims and set(dims)<=beyond: return 'schema_scope',f'{",".join(dims)} not requested; '+('value correct against the same-day annotation' if ref_row['checks']['value'] else 'value as the gold')
    if as_page(ref_row,dims): return 'unknown','the answer gives the unit as the page writes it; the gold normalises it (for example € to EUR)'
    dims=[k for k in dims if k not in beyond]
    own=ref['arms'].get(arm)=='reference' or ref['arms'].get(arm)=='agree'
    stable=ref_row['expected']==row['expected']
    if own or (stable or same_record) and not (fast and 'value' in dims):
      why='the same-day annotation of this arm\'s own source' if own else 'the value is unchanged since the gold' if stable else 'the same-day annotation of the record whose other fields this answer matches'
      return 'extraction',f'{why} states {"/".join(dims)} the answer did not deliver'
    return 'unknown','the value can change between fetches and this arm\'s run-day source was not kept' if fast and 'value' in dims else 'the value changed since the gold, this arm\'s run-day source was not kept, and no other field of the record matches'
  dims=[k for k,c in row['checks'].items() if c is False and k not in ('sameSource','relation')]
  beyond={k for k,c in perfect_row['checks'].items() if c is False and k not in ('sameSource','relation')}
  if dims and set(dims)<=beyond: return 'schema_scope',f'{",".join(dims)} not requested'
  if as_page(row,dims): return 'unknown','the answer gives the unit as the page writes it; the gold normalises it (for example € to EUR)'
  if seen_live and not fast: return 'extraction','another arm returned the gold value in this run'
  if own_quote: return 'extraction','the gold quote is in this arm\'s own run-day source (one-subject page)'
  return 'unknown','no same-day annotation, and no arm returned the gold value'

def label_case(arm,r_gold,r_ref,r_perfect,ref,seen,own_source,gold_fresh=None):
  """Cause labels for one false success: per failing required field, then the case's first label in CAUSES order."""
  if ref and ref['arms'].get(arm)=='block_did_not_run':
    return {'cause':'access','fields':{},'note':'this arm\'s own kept page did not carry the task structure (same-day block did not run on it)'}
  fields={}
  rr={x['fieldId']:x for x in r_ref['rows']} if r_ref else {}
  pp={x['fieldId']:x for x in r_perfect['rows']}
  read={x['entityId'] for x in rr.values() if ok(x)}  # records this answer matches somewhere on the run-day page
  fresh={f['id']:f.get('freshness') for f in ref['gold']['fields']} if ref else gold_fresh or {}
  for x in r_gold['rows']:
    if not x['required'] or ok(x):continue
    quote=bool(own_source) and r_gold.get('oneSubject') and all(e['quote'] in own_source for e in x['sourceEvidence'] if e.get('role','value')=='value') and bool(x['sourceEvidence'])
    fast=fresh.get(x['fieldId']) in FAST
    fields[x['fieldId']]=field_cause(arm,x,rr.get(x['fieldId']),pp[x['fieldId']],ref,x['fieldId'] in seen,quote,x['entityId'] in read,fast)
  labels={c for c,_ in fields.values()}
  if r_gold['totals']['duplicateSelectedRecords']:labels.add('extraction');fields['(duplicates)']=('extraction','duplicate selected records')
  if r_gold['totals']['fabricated']:
    labels.add('unknown');fields['(fabricated)']=('unknown','a value for a field the gold capture did not state')
  cause=next((c for c in CAUSES if c in labels),'unknown')
  return {'cause':cause,'fields':{k:{'cause':c,'evidence':e} for k,(c,e) in fields.items()}}

def sameday_section(R,gold_dir,sameday_dir,json_rows):
  import holdout_score as hs
  cases={c:json.load(open(f'{gold_dir}/cases/{c}/gold.json')) for c in sorted({r['id'] for r in json_rows})}
  ref={};plan=json.load(open(f'{sameday_dir}/plan.json'))
  man_path=f'{sameday_dir}/agreement-model.json';agree=json.load(open(man_path)) if os.path.exists(man_path) else {}
  for c in plan['cases']:
    g=json.load(open(f'{sameday_dir}/cases/{c["id"]}/gold.json'));cap=json.load(open(f'{sameday_dir}/cases/{c["id"]}/capture.json'))
    arms={cap['referenceArm']:'reference'}
    for arm,a in (cap.get('arms') or {}).items():
      if arm in arms or not a:continue
      v=agree.get(c['id']) if arm=='model' else None
      arms[arm]='block_did_not_run' if v and 'blockError' in v else 'agree' if v and all(v.get(f['id'])==f['value'] for f in g['fields']) else 'disagree' if v else 'not_checked'
    ref[c['id']]={'gold':g,'arms':arms}
  versions=sorted({r['version'] for r in json_rows})
  docs={(v,c):(json.load(open(f'{R}/{v}/{c}.json')).get('response') or {}) for v in versions for c in cases if os.path.exists(f'{R}/{v}/{c}.json')}
  schema={}
  for c in cases:
    for v in versions:
      req=json.load(open(f'{R}/{v}/{c}.json')).get('request') or {}
      js=next((f for f in req.get('formats') or [] if isinstance(f,dict) and f.get('type')=='json'),None)
      if js:schema[c]=js['schema'];break
  gold_rows={(r['version'],r['id']):r for r in json_rows}
  # The gold value of a field, seen in any arm's live answer: the page still stated it on the run day.
  seen={c:{x['fieldId'] for v in versions for x in gold_rows[(v,c)]['rows'] if x['checks']['value'] and x['checks']['entity']} for c in cases}
  out={}
  for v in versions:
    rows_ref=[];labels={}
    for c in cases:
      rg=gold_rows[(v,c)];rg['oneSubject']=(cases[c].get('completeness') or {}).get('expectedRecords')==1
      ref_case=ref[c]['gold'] if c in ref else None
      r_ref=hs.score_case(ref_case,docs.get((v,c),{}),LIVE_ORIGIN,'json') if ref_case else None
      if r_ref:r_ref['version']=v
      rows_ref.append(r_ref or rg)
      if claim(rg) and not accepted(rg):
        r_perfect=hs.score_case(ref_case or cases[c],perfect_answer(ref_case or cases[c],schema.get(c)),LIVE_ORIGIN,'json')
        src=(docs.get((v,c)) or {}).get('rawHtml')
        labels[c]=label_case(v,rg,r_ref,r_perfect,ref.get(c),seen[c]-{x['fieldId'] for x in rg['rows'] if x['checks']['value'] and x['checks']['entity']},src,{f['id']:f.get('freshness') for f in cases[c]['fields']})
    covered=[r for r in rows_ref if r['id'] in ref];covered_gold=[gold_rows[(v,r['id'])] for r in covered]
    out[v]={'againstGold':tally([gold_rows[(v,c)] for c in cases]),'againstSameDay':tally(rows_ref),
      'coveredCases':sorted(ref),'coveredAgainstGold':tally(covered_gold),'coveredAgainstSameDay':tally(covered),
      'perCase':{r['id']:{'reference':'same-day' if r['id'] in ref else 'gold','requiredGold':sum(ok(x) for x in gold_rows[(v,r['id'])]['rows'] if x['required']),'requiredSameDay':sum(ok(x) for x in r['rows'] if x['required']),'required':sum(x['required'] for x in r['rows']),'acceptedGold':accepted(gold_rows[(v,r['id'])]),'acceptedSameDay':accepted(r),'claim':claim(r)} for r in rows_ref},
      'falseSuccessCauses':labels,'causeCounts':{k:sum(l['cause']==k for l in labels.values()) for k in CAUSES}}
  return {'set':os.path.basename(os.path.normpath(sameday_dir)),'planSha256':__import__('hashlib').sha256(open(f'{sameday_dir}/plan.json','rb').read()).hexdigest(),'notAnnotated':plan.get('notAnnotated'),'versions':out}

def main():
  p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter);p.add_argument('run');p.add_argument('--gold');p.add_argument('--sameday')
  a=p.parse_args();R=a.run;out={};rows_by={}
  for k in ['json','md']:
    j=json.load(open(f'{R}/field-results-{k}.json'));rows_by[k]=j['rows']
    by={}
    for r in j['rows']: by.setdefault(r['version'],[]).append(r)
    for v,rows in by.items():
      d=tally(rows);d.pop('falseSuccessIds');d['fsAll']=f"{d['fs']}/42 ({up(d['fs'],42)*100:.1f}%)";out[(k,v)]=d
  for (k,v),d in out.items(): print(k,v,{x:y for x,y in d.items() if x!='acceptedIds'}, d['acceptedIds'])
  res={f'{k}:{v}':d for (k,v),d in out.items()}
  if a.sameday:
    if not a.gold:p.error('--sameday needs --gold')
    sd=sameday_section(R,a.gold,a.sameday,rows_by['json']);res['sameday']=sd
    for v,d in sd['versions'].items():
      g,s=d['againstGold'],d['againstSameDay']
      print(f"json {v}: required {g['requiredLiveCorrect']} gold / {s['requiredLiveCorrect']} same-day; accepted {g['accepted']} / {s['accepted']}; false success {g['fs']} / {s['fs']} of 42; causes {d['causeCounts']}")
      for c,l in d['falseSuccessCauses'].items():print(f'  {c}: {l["cause"]}',{f.split("/",1)[-1]:x['cause'] for f,x in l['fields'].items()})
  json.dump(res,open(f'{R}/live-rescore.json','w'),indent=1)
if __name__=='__main__':
  sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)));main()
