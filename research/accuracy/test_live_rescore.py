"""Synthetic controls for live_rescore.py's same-day scoring and cause labels. No reserved label or product output is loaded."""
import json,os,tempfile,unittest
from holdout_score import score_case
from live_rescore import LIVE_ORIGIN,label_case,perfect_answer,sameday_section,tally

def field(eid,name,value,dtype='text',unit='na',date='na',freshness='static'):
 return {'id':f'V99/{eid}/{name}','entityId':eid,'name':name,'value':value,'dataType':dtype,'required':True,'unitRef':unit,'dateRef':date,'evidence':[{'quote':value,'role':'value'}],'freshness':freshness}
def rates(r1,r2,day):
 """Two records of a rate table whose unit and date the page states but the request schema does not ask for."""
 return {'id':'V99','url':'https://example.org/rates','rawSha256':'a'*64,'completeness':{'expectedRecords':2},
  'units':{'na':{'state':'not_applicable','value':None},'u':{'state':'known','value':'per AUD'}},'dates':{'na':{'state':'not_applicable','value':None},'d':{'state':'known','value':day}},'periods':{},
  'fields':[field('c-1','currency','USD'),field('c-1','rate',r1,'decimal','u','d','daily'),field('c-2','currency','JPY'),field('c-2','rate',r2,'decimal','u','d','daily')]}
def posts(t1,t2,points='live'):
 return {'id':'V99','url':'https://example.org/news','rawSha256':'a'*64,'completeness':{'expectedRecords':2},'units':{'na':{'state':'not_applicable','value':None}},'dates':{'na':{'state':'not_applicable','value':None}},'periods':{},
  'fields':[field('p-1','title',t1[0]),field('p-1','points',t1[1],'integer',freshness=points),field('p-2','title',t2[0]),field('p-2','points',t2[1],'integer',freshness=points)]}
SCHEMA_RATES={'properties':{'records':{'type':'array','items':{'properties':{'currency':{},'rate':{}}}}}}
SCHEMA_POSTS={'properties':{'records':{'type':'array','items':{'properties':{'title':{},'points':{}}}}}}
def answer(records):return {'status':'success','json':{'status':'complete','data':{'records':records}},'verification':{'status':'passed'}}
def label(arm,gold,ref_gold,doc,schema,arms=None,seen=frozenset()):
 rg=score_case(gold,doc,LIVE_ORIGIN,'json');rg['oneSubject']=False
 rr=score_case(ref_gold,doc,LIVE_ORIGIN,'json') if ref_gold else None
 rp=score_case(ref_gold or gold,perfect_answer(ref_gold or gold,schema),LIVE_ORIGIN,'json')
 ref={'gold':ref_gold,'arms':arms or {'standard':'reference'}} if ref_gold else None
 return label_case(arm,rg,rr,rp,ref,set(seen),None,{f['id']:f['freshness'] for f in gold['fields']})

class SameDayCauses(unittest.TestCase):
 def test_moved_list_is_drift_and_scores_against_the_same_day_annotation(self):
  gold=posts(('Old A','5'),('Old B','7'),'static');today=posts(('New A','9'),('New B','3'),'static');doc=answer([{'title':'New A','points':9},{'title':'New B','points':3}])
  l=label('standard',gold,today,doc,SCHEMA_POSTS);self.assertEqual(l['cause'],'drift')
  self.assertEqual(tally([score_case(today,doc,LIVE_ORIGIN,'json')])['accepted'],1);self.assertEqual(tally([score_case(gold,doc,LIVE_ORIGIN,'json')])['accepted'],0)
 def test_unrequested_unit_and_date_are_schema_scope_even_when_the_rate_moved(self):
  doc=answer([{'currency':'USD','rate':0.71},{'currency':'JPY','rate':110.5}])
  l=label('standard',rates('0.70','110.2','2026-10-19'),rates('0.71','110.5','2026-10-23'),doc,SCHEMA_RATES)
  self.assertEqual(l['cause'],'schema_scope');self.assertEqual({x['cause'] for x in l['fields'].values()},{'schema_scope'})
 def test_a_wrong_value_on_the_arms_own_source_is_extraction(self):
  gold=posts(('Old A','5'),('Old B','7'));today=posts(('New A','9'),('New B','3'))
  l=label('standard',gold,today,answer([{'title':'New A','points':9},{'title':'Wrong','points':3}]),SCHEMA_POSTS)
  self.assertEqual(l['cause'],'extraction');self.assertEqual(l['fields']['V99/p-2/title']['cause'],'extraction')
 def test_a_wrong_unit_the_answer_states_in_its_evidence_is_not_schema_scope(self):
  doc=answer([{'currency':'USD','rate':0.71},{'currency':'JPY','rate':110.5}])
  doc['json']['evidence']=[{'path':f'/records/{k}/rate','context':{'unit':'per USD','date':'2026-10-23'}} for k in (0,1)]
  l=label('standard',rates('0.70','110.2','2026-10-19'),rates('0.71','110.5','2026-10-23'),doc,SCHEMA_RATES)
  self.assertEqual(l['cause'],'extraction')
 def test_a_live_value_from_another_fetch_is_unknown_not_extraction(self):
  gold=posts(('Old A','5'),('Old B','7'));today=posts(('New A','9'),('New B','3'));doc=answer([{'title':'New A','points':10},{'title':'New B','points':3}])
  self.assertEqual(label('firecrawl',gold,today,doc,SCHEMA_POSTS)['fields']['V99/p-1/points']['cause'],'unknown')
  self.assertEqual(label('standard',gold,today,doc,SCHEMA_POSTS)['fields']['V99/p-1/points']['cause'],'extraction')
 def test_a_volatile_price_with_the_right_value_and_a_wrong_currency_is_extraction(self):
  g={'id':'V99','url':'https://example.org/p','rawSha256':'a'*64,'completeness':{'expectedRecords':1},'units':{'na':{'state':'not_applicable','value':None},'eur':{'state':'known','value':'EUR'}},'dates':{'na':{'state':'not_applicable','value':None}},'periods':{},
   'fields':[field('product','name','Kit'),field('product','price','9.50','decimal','eur',freshness='volatile')]}
  schema={'properties':{'name':{},'price':{},'currency':{}}};wrong=lambda price,cur:{'status':'success','json':{'status':'complete','data':{'name':'Kit','price':price,'currency':cur}},'verification':{'status':'passed'}}
  self.assertEqual(label('firecrawl',g,g,wrong(9.5,'USD'),schema)['cause'],'extraction')
  g['units']['eur']['evidence']=[{'quote':'€'}]  # the page writes the symbol; the gold normalises it to EUR
  self.assertEqual(label('firecrawl',g,g,wrong(9.5,'€'),schema)['cause'],'unknown')
  self.assertEqual(label('firecrawl',g,g,wrong(9.9,'EUR'),schema)['cause'],'unknown')
 def test_a_static_field_of_a_record_read_elsewhere_is_extraction(self):
  gold=posts(('Old A','5'),('Old B','7'),'static');today=posts(('New A','9'),('New B','3'),'static')
  l=label('firecrawl',gold,today,answer([{'title':'New A','points':1},{'title':'New B','points':3}]),SCHEMA_POSTS)
  self.assertEqual(l['fields']['V99/p-1/points']['cause'],'extraction')
 def test_without_a_same_day_annotation_only_a_value_seen_live_shows_extraction(self):
  gold=posts(('A','5'),('B','7'),'static');doc=answer([{'title':'A','points':5},{'title':'X','points':7}])
  self.assertEqual(label('firecrawl',gold,None,doc,SCHEMA_POSTS)['cause'],'unknown')
  self.assertEqual(label('firecrawl',gold,None,doc,SCHEMA_POSTS,seen={'V99/p-2/title'})['cause'],'extraction')
 def test_a_kept_page_without_the_task_structure_is_access(self):
  gold=posts(('A','5'),('B','7'));doc=answer([])
  self.assertEqual(label('model',gold,posts(('A','5'),('B','7')),doc,SCHEMA_POSTS,{'standard':'reference','model':'block_did_not_run'})['cause'],'access')
 def test_perfect_answer_fills_a_price_currency_from_its_unit(self):
  g={'id':'V99','fields':[field('product','name','Kit'),field('product','price','9.50','decimal','usd')],'units':{'na':{'state':'not_applicable','value':None},'usd':{'state':'known','value':'USD'}}}
  self.assertEqual(perfect_answer(g,{'properties':{'name':{},'price':{},'currency':{}}})['json']['data'],{'name':'Kit','price':'9.50','currency':'USD'})

def stated(records,unit='per AUD',day='2026-10-23',sha=None):
 """A json answer that states each rate's unit and date (json.evidence context, #704), read from the page whose sha is given."""
 doc=answer(records);doc['json']['evidence']=[{'path':f'/records/{k}/rate','context':{'unit':unit,'date':day}} for k in range(len(records))]
 if sha:doc['evidenceRecord']={'rawSha256':sha}
 return doc
def with_sha(case,sha):return {**case,'rawSha256':sha}
def run_labels(gold,ref,docs,own=()):
 """sameday_section on a one-case run written to a temporary folder: gold, a same-day set whose reference arm is
 `standard`, each arm's answer and, optionally, annotations of pages this run fetched. Returns each arm's label."""
 with tempfile.TemporaryDirectory() as t:
  def put(p,o):os.makedirs(os.path.dirname(f'{t}/{p}'),exist_ok=True);json.dump(o,open(f'{t}/{p}','w'))
  put('gold/cases/V99/gold.json',gold);put('sd/plan.json',{'cases':[{'id':'V99'}]});put('sd/cases/V99/gold.json',ref)
  put('sd/cases/V99/capture.json',{'referenceArm':'standard','rawSha256':ref['rawSha256'],'arms':{'standard':{'rawSha256':ref['rawSha256']}}})
  for arm,doc in docs.items():put(f'run/{arm}/V99.json',{'request':{'formats':[{'type':'json','schema':SCHEMA_RATES}]},'response':doc})
  for k,g in enumerate(own):put(f'own/{k}/cases/V99/gold.json',g)
  rows=[{**score_case(gold,doc,LIVE_ORIGIN,'json'),'version':arm} for arm,doc in docs.items()]
  out=sameday_section(f'{t}/run',f'{t}/gold',f'{t}/sd',rows,[f'{t}/own/{k}' for k in range(len(own))])
 return {v:d['falseSuccessCauses'].get('V99') for v,d in out['versions'].items()}

class SourceByHash(unittest.TestCase):
 """The reference is an arm's own page only when the arm's answer was read from the same bytes (evidenceRecord.rawSha256)."""
 GOLD=with_sha(rates('0.70','110.2','2026-10-19'),'0'*64)
 REF=with_sha(rates('0.71','110.5','2026-10-23'),'b'*64)  # the reference fetch
 LATER=with_sha(rates('0.72','110.5','2026-10-23'),'c'*64)  # a later fetch of the same page, where the rate moved
 READ=[{'currency':'USD','rate':0.72},{'currency':'JPY','rate':110.5}]
 def test_an_arm_named_like_the_reference_that_read_a_later_fetch_is_not_on_its_own_source(self):
  l=run_labels(self.GOLD,self.REF,{'standard':stated(self.READ,sha='c'*64)})['standard']
  self.assertEqual(l['fields']['V99/c-1/rate']['cause'],'unknown');self.assertEqual(l['cause'],'unknown')
 def test_a_later_fetch_with_its_own_annotation_is_drift_where_the_value_moved(self):
  l=run_labels(self.GOLD,self.REF,{'standard':stated(self.READ,sha='c'*64)},[self.LATER])['standard']
  self.assertEqual(l['cause'],'drift');self.assertIn('own',l['fields']['V99/c-1/rate']['evidence'])
 def test_an_arm_that_read_the_reference_bytes_is_on_its_own_source(self):
  l=run_labels(self.GOLD,self.REF,{'standard':stated(self.READ,sha='b'*64)})['standard']
  self.assertEqual(l['fields']['V99/c-1/rate']['cause'],'extraction')
 def test_an_arm_without_a_hash_is_never_on_its_own_source(self):
  l=run_labels(self.GOLD,self.REF,{'standard':stated(self.READ)})['standard']
  self.assertEqual(l['fields']['V99/c-1/rate']['cause'],'unknown')
 def test_an_arm_without_a_source_uses_a_page_this_run_read(self):
  fc=stated(self.READ);fc['json'].pop('evidence')  # Firecrawl keeps no source and states no context
  same=run_labels(self.GOLD,self.REF,{'firecrawl':fc,'standard':stated(self.READ,sha='b'*64)})['firecrawl']
  self.assertEqual(same['fields']['V99/c-1/rate']['cause'],'extraction')  # the reference is a page of this run (as in #701)
  later=run_labels(self.GOLD,self.REF,{'firecrawl':fc,'standard':stated(self.READ,sha='c'*64)})['firecrawl']
  self.assertEqual(later['fields']['V99/c-1/rate']['cause'],'unknown')  # no page this run read is annotated
  own=run_labels(self.GOLD,self.REF,{'firecrawl':fc,'standard':stated(self.READ,sha='c'*64)},[self.LATER])['firecrawl']
  self.assertEqual(own['fields']['V99/c-1/rate']['cause'],'schema_scope')  # right value on this run's page; unit and date not requested

if __name__=='__main__':unittest.main()
