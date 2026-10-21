"""Rescore a live reserved-v2 run (k1_live_v2.mjs outputs scored by holdout_score.py) without the same-source check.

holdout_score.py counts a field fully correct only when the answer's rawSha256 equals the sealed capture's; a live page never
does. This keeps every other check under the scorer's own rule (value and entity must hold; a unit, date or period check
the scorer leaves None, because the gold states that context as unknown, is not scored), then counts per version: required
fields correct, tasks accepted (every required field correct, no duplicates, nothing fabricated), success claims (status
success and a verify that did not fail) and false successes (a claim not accepted), with exact one-sided 95% upper bounds.

Usage: python3 research/accuracy/live_rescore.py <run dir with field-results-json.json and field-results-md.json>
"""
import json,sys,math
R=sys.argv[1]
def up(k,n):
  if n==0: return None
  if k==0: return 1-0.05**(1/n)
  lo,hi=k/n,1.0
  from math import comb
  cdf=lambda p: sum(comb(n,i)*p**i*(1-p)**(n-i) for i in range(k+1))
  for _ in range(60):
    mid=(lo+hi)/2
    if cdf(mid)>0.05: lo=mid
    else: hi=mid
  return hi
out={}
for k in ['json','md']:
  j=json.load(open(f'{R}/field-results-{k}.json'))
  by={}
  for r in j['rows']: by.setdefault(r['version'],[]).append(r)
  for v,rows in by.items():
    req=rc=val=0; acc=succ=fs=0; tasks=[]
    for r in rows:
      cap=[x for x in r['rows'] if x['availability']=='captured']
      ok=lambda x: all(c is not False for kk,c in x['checks'].items() if kk!='sameSource') and x['availability']=='captured'
      rq=[x for x in cap if x['required']]; req+=len(rq); rc+=sum(ok(x) for x in rq); val+=sum(bool(x['checks']['value'] and x['checks']['entity']) for x in r['rows'])
      deliverable=r['totals']['requiredNotCaptured']==0
      a=deliverable and all(ok(x) for x in r['rows'] if x['required']) and not r['totals']['duplicateSelectedRecords'] and not r['totals']['fabricated']
      s=r['status']=='success' and r['configuredVerification']!='failed'
      acc+=a; succ+=s; fs+=(s and not a); tasks.append((r['id'],a,s))
    out[(k,v)]=dict(requiredLiveCorrect=f'{rc}/{req}',valueCorrect=val,accepted=acc,success=succ,fs=fs,fsDelivered=f'{fs}/{succ} ({(up(fs,succ) or 0)*100:.1f}%)',fsAll=f'{fs}/42 ({up(fs,42)*100:.1f}%)',acceptedIds=[t for t,a,s in tasks if a])
for (k,v),d in out.items(): print(k,v,{x:y for x,y in d.items() if x!='acceptedIds'}, d['acceptedIds'])
json.dump({f'{k}:{v}':d for (k,v),d in out.items()},open(f'{R}/live-rescore.json','w'),indent=1)
