"""Synthetic controls for the reserved-v2 mappings. No reserved label or product output is loaded."""
import unittest
from holdout_score import score_case
from reserved_map import RESERVED_CASES,vdate

O='http://127.0.0.1:8863'
def field(cid,eid,name,value,dtype='text',date='na',unit='na',period=None):
 return {'id':f'{cid}/{eid}/{name}','entityId':eid,'name':name,'value':value,'dataType':dtype,'required':True,'unitRef':unit,'dateRef':date,'periodRef':period,'evidence':[]}
def case(cid,url,fields,dates=None,units=None):
 return {'id':cid,'url':url,'rawSha256':'a'*64,'units':{'na':{'state':'not_applicable','value':None},**(units or {})},'dates':{'na':{'state':'not_applicable','value':None},**(dates or {})},'periods':{},'fields':fields}
def doc(md,tables=None,meta=None):return {'status':'success','markdown':md,'tables':tables or [],'metadata':meta or {},'evidenceRecord':{'rawSha256':'a'*64}}

class ReservedMappings(unittest.TestCase):
 def test_dates_need_a_stated_day(self):
  for raw,iso in [('Oct. 1, 2026','2026-10-01'),('18 Apr, 2011','2011-04-18'),('05-Jul-2001','2001-07-05'),('2019/02/10','2019-02-10'),('Tuesday, October 06, 2026','2026-10-06')]:self.assertEqual(vdate(raw),iso)
  for raw in ['Tuesday 20 Oct.','2 hours ago','June 2022']:self.assertIsNone(vdate(raw))
 def test_article_byline_after_title(self):
  c=case('V01','https://example.org/blog/post',[field('V01','article','title','A post'),field('V01','article','author_1','Ann Lee'),field('V01','article','author_2','Bo Ray'),field('V01','article','published','2026-01-02','iso_date','p')],{'p':{'state':'known','value':'2026-01-02'}})
  r=score_case(c,doc('# [Site blog](/blog/)\n\n# A post\n\nAnn Lee and Bo Ray  \n2 January 2026\n\nBody.'),O)
  self.assertTrue(r['taskAccepted']);self.assertEqual(r['totals']['datePreserved'],1)
 def test_list_records_are_positional_and_keep_their_own_dates(self):
  fs=[field('V20',f'post-{k}',n,v,'iso_date' if n=='posted' else 'url' if n=='url' else 'text',f'd{k}' if n=='posted' else 'na') for k,(t,a,d) in enumerate([('One','amy','2026-01-03'),('Two','ben','2026-01-01')],1) for n,v in [('title',t),('url',f'https://example.org/en/news/{d[:4]}/{d[5:7]}/{d[8:]}/{t.lower()}/'),('author',a),('posted',d)]]
  c=case('V20','https://example.org/en/news/',fs,{f'd{k}':{'state':'known','value':d} for k,d in [(1,'2026-01-03'),(2,'2026-01-01')]})
  md='### [One](http://127.0.0.1:8863/en/news/2026/01/03/one/)\n\nText.\n\nPosted by **amy** on 3 Jan 2026\n\n### [Two](http://127.0.0.1:8863/en/news/2026/01/01/two/)\n\nPosted by **ben** on 1 Jan 2026\n'
  r=score_case(c,doc(md),O);self.assertTrue(r['taskAccepted'])
  swapped=md.replace('amy','tmp').replace('ben','amy').replace('tmp','ben');r=score_case(c,doc(swapped),O)
  self.assertFalse(r['taskAccepted']);self.assertEqual(r['totals']['wrongRecord'],2)
 def test_table_unit_and_period_come_from_headers(self):
  fs=[field('V24','country-1','country','Aland'),field('V24','country-1','population','1000','integer',period='y'),field('V24','country-1','yearly_change','-0.5','decimal',unit='pct'),field('V24','country-1','land_area','20','integer',unit='km')]
  c=case('V24','https://example.org/pop',fs,units={'pct':{'state':'known','value':'%'},'km':{'state':'known','value':'Km²'}});c['periods']={'y':{'state':'known','value':'2026'}}
  t=[{'rows':[['#','Country (or dependency)','Population 2026','Yearly Change','Land Area (Km²)'],['1','Aland','1,000','−0.5 %','20']]}]
  r=score_case(c,doc('',t),O);self.assertTrue(r['taskAccepted'])
  t[0]['rows'][0][4]='Land Area';self.assertFalse(score_case(c,doc('',t),O)['taskAccepted'])
 def test_dollar_alone_is_not_a_currency(self):
  fs=[field('V08','product','name','Widget'),field('V08','product','price','6.95','decimal',unit='usd')]
  c=case('V08','https://example.org/product/1',fs,units={'usd':{'state':'known','value':'USD'}})
  r=score_case(c,doc('# Widget\n\nProduct ID: 1\n\n$6.95\n\nIn stock'),O);self.assertEqual(r['totals']['valueCorrect'],2);self.assertFalse(r['taskAccepted'])
 def test_every_reserved_case_maps_an_empty_or_unrelated_output(self):
  for cid in sorted(RESERVED_CASES):
   c=case(cid,'https://example.org/x',[field(cid,'doc','title','x'),field(cid,'item-1','name','y'),field(cid,'issue','last_update','2026-01-01','iso_date')])
   for d in [{},doc('# x\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n[l](http://127.0.0.1:8863/incidents/abc)',[{'rows':[['Version','Date'],['1','2026-01-01']]}])]:
    r=score_case(c,d,O);self.assertEqual(r['totals']['fieldSlots'],3)

 def obs(self,cid,names,md,tables=None):
  from holdout_score import mapped
  c=case(cid,'https://example.org/x',[field(cid,e,n,'x') for e,n in names]);out,_,_=mapped(c,doc(md,tables),O)
  return {k.split('/',1)[1]:v['observed'] for k,v in out.items()}
 def test_review_repros(self):
  o=self.obs('V15',[('advisory-1','advisory_id')],'posted to the [list](https://lists.debian.org/debian-security-announce/) list.\n\n`[18 Oct 2026]` **[DSA-1-1 xen](https://lists.debian.org/debian-security-announce/2026/msg00486.html)**')
  self.assertEqual(o['advisory-1/advisory_id'],'DSA-1-1')
  o=self.obs('V31',[('entry-1','title'),('entry-1','state')],'[KTM (Kathmandu) on 2026-10-19\n\nCompleted Oct 20, 2026, 01:01 UTC](http://127.0.0.1:8863/incidents/x00)')
  self.assertEqual(o['entry-1/title'],'KTM (Kathmandu) on 2026-10-19');self.assertEqual(o['entry-1/state'],'Completed')
  o=self.obs('V40',[('doc','doi')],'# Report\n\nDOI: [https://doi.org/10.2172/1](https://doi.org/10.2172/1)· OSTI ID: 1');self.assertEqual(o['doc/doi'],'10.2172/1')
  o=self.obs('V42',[('doc','journal'),('doc','volume')],'# A\n\n[*Nature*](https://www.nature.com/) **volume 585**, pages 1–2');self.assertEqual((o['doc/journal'],o['doc/volume']),('Nature','585'))
  o=self.obs('V41',[('doc','title'),('doc','primary_subject')],'# Computer Science > Language\n\n# Title:A paper\n\n| Subjects: | Language (cs.CL) |');self.assertEqual((o['doc/title'],o['doc/primary_subject']),('A paper','Language (cs.CL)'))
  o=self.obs('V13',[('product','product_number')],'Product number: AB-1\n\n# Board\n\n€9.00');self.assertEqual(o['product/product_number'],'AB-1')
  o=self.obs('V14',[('product','ebook_price'),('product','ebook_list_price')],'# Book\n\nfree eBook with pBook. $2.99 per month $1.99 per month\n\neBook pdf, ePub $5.99 $3.99');self.assertEqual((o['product/ebook_price'],o['product/ebook_list_price']),('3.99','5.99'))
  o=self.obs('V17',[('news-1','title')],'October 15: [Banner](http://127.0.0.1:8863/about/news/banner-1/)\n\n## [Item](http://127.0.0.1:8863/about/news/item-2/)\n\nPosted on **2026-10-18** by me');self.assertEqual(o['news-1/title'],'Item')

if __name__=='__main__':unittest.main()
