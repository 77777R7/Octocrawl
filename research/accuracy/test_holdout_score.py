"""Synthetic scorer controls only. No reserved product output is loaded."""
import unittest
from copy import deepcopy
from holdout_score import markdown_report,date_of,equal,power_of_ten,rebase_url,score_case,section,summarize,upper95

class ScoreControls(unittest.TestCase):
 def case(self):
  return {'id':'H03','url':'https://example.org/constants','rawSha256':'a'*64,'units':{'na':{'state':'not_applicable','value':None},'s':{'state':'known','value':'s'}},'dates':{'na':{'state':'not_applicable','value':None}},'periods':{},'fields':[{'id':'H03/day/value','entityId':'day','name':'value','value':'86400','dataType':'decimal','required':True,'unitRef':'s','dateRef':'na','evidence':[]}]}
 def output(self,value='86400 s'):
  return {'status':'success','evidenceRecord':{'rawSha256':'a'*64},'tables':[{'caption':'Constants','rows':[['Quantity','Symbol','Value'],['day','d',value]]}],'verification':{'status':'passed'}}
 def test_correct_record_and_unit(self):self.assertTrue(score_case(self.case(),self.output(),'http://127.0.0.1:8862')['taskAccepted'])
 def test_wrong_value_fails_despite_passed(self):self.assertFalse(score_case(self.case(),self.output('86399 s'),'http://127.0.0.1:8862')['taskAccepted'])
 def test_wrong_unit_is_not_value_success(self):
  r=score_case(self.case(),self.output('86400 d'),'http://127.0.0.1:8862');self.assertEqual(r['totals']['valueCorrect'],1);self.assertFalse(r['taskAccepted'])
 def test_wrong_entity_does_not_supply_value(self):
  d=self.output();d['tables'][0]['rows'][1][0]='Julian year';self.assertEqual(score_case(self.case(),d,'http://127.0.0.1:8862')['totals']['observedFields'],0)
 def test_duplicates_fail_task_without_doublecounting_fields(self):
  d=self.output();d['tables'][0]['rows'].append(d['tables'][0]['rows'][1]);r=score_case(self.case(),d,'http://127.0.0.1:8862');self.assertEqual(r['totals']['fullyCorrect'],1);self.assertEqual(r['totals']['duplicateSelectedRecords'],1);self.assertFalse(r['taskAccepted'])
 def test_source_mismatch_fails(self):
  d=self.output();d['evidenceRecord']['rawSha256']='b'*64;self.assertFalse(score_case(self.case(),d,'http://127.0.0.1:8862')['taskAccepted'])
 def test_missing_date_context_is_not_filled_from_capture(self):
  c=self.case();c['dates']['date']={'state':'known','value':'2026-10-17'};c['fields'][0]['dateRef']='date';d=self.output();d['evidenceRecord']['fetchedAt']='2026-10-17T00:00:00Z';self.assertFalse(score_case(c,d,'http://127.0.0.1:8862')['taskAccepted'])
 def test_absent_output_retains_denominator(self):
  r=score_case(self.case(),{},'http://127.0.0.1:8862');self.assertEqual(r['totals']['fieldSlots'],1);self.assertEqual(r['totals']['fullyCorrect'],0)
 def test_dates_preserve_precision_and_calendar_day(self):
  self.assertEqual(date_of('12 December 2024'),'2024-12-12');self.assertEqual(date_of('Jul 12, 2026'),'2026-07-12');self.assertEqual(date_of('June 2022',True),'2022-06');self.assertIsNone(date_of('June 2022'));self.assertIsNone(date_of('31 February 2026'))
 def test_factor_does_not_repair_concatenated_exponent(self):
  self.assertEqual(power_of_ten('10^-30'),'10^-30');self.assertEqual(power_of_ten('10⁻³⁰'),'10^-30');self.assertEqual(power_of_ten('1030'),'1030');self.assertEqual(power_of_ten('1000'),'10^3')
 def test_url_rebase_is_restricted_to_fixture_origin(self):
  self.assertEqual(rebase_url('http://127.0.0.1:8862/ebooks/1','https://example.org/top','http://127.0.0.1:8862'),'https://example.org/ebooks/1');self.assertEqual(rebase_url('https://other.test/ebooks/1','https://example.org/top','http://127.0.0.1:8862'),'https://other.test/ebooks/1')
 def test_section_does_not_select_navigation_link(self):
  md='- [Parameters](#parameters)\n## Parameters\ncallbackFn\n## Return value\nAn array.';s,_=section(md,'Parameters');self.assertEqual(s,'callbackFn')
 def test_unit_symbols_preserve_case(self):
  c=self.case();c['units']['s']['value']='S';r=score_case(c,self.output(),'http://127.0.0.1:8862');self.assertFalse(r['rows'][0]['checks']['unit'])
 def test_javascript_parameter_case_is_not_repaired(self):
  c=self.case();c['id']='H08';c['fields'][0].update(id='H08/map/parameter_thisArg',entityId='map',name='parameter_thisArg',value='thisArg',dataType='text',unitRef='na')
  d=self.output();d['markdown']='# Array.prototype.map()\n## Parameters\nthisarg\n## Return value\nAn array.'
  r=score_case(c,d,'http://127.0.0.1:8862');self.assertEqual(r['totals']['observedFields'],0)
 def test_false_does_not_equal_zero(self):self.assertFalse(equal('false','0','integer'))

ORIGIN='http://127.0.0.1:8862'
def gold(cid,url,fields,units=None,dates=None,periods=None):
 base={'na':{'state':'not_applicable','value':None},'missing':{'state':'unknown','value':None}}
 return {'id':cid,'url':url,'rawSha256':'a'*64,'units':{**base,**(units or {})},'dates':{**base,**(dates or {})},'periods':periods or {},'fields':fields}
def field(cid,entity,name,value,dtype='text',required=True,unit='na',date='na',period=None,availability='captured'):
 f={'id':f'{cid}/{entity}/{name}','entityId':entity,'name':name,'value':value,'dataType':dtype,'required':required,'availability':availability,'unitRef':unit,'dateRef':date,'evidence':[]}
 if period:f['periodRef']=period
 return f
def doc(markdown='',tables=None,status='success'):
 return {'status':status,'evidenceRecord':{'rawSha256':'a'*64},'markdown':markdown,'tables':tables or [],'verification':{'status':'not_requested'}}

class DimensionScores(unittest.TestCase):
 """R3: subject, field relation, unit and date retention are counted apart."""
 def h03(self):
  return gold('H03','https://example.org/constants',[field('H03','day','value','86400','decimal',unit='s'),field('H03','Julian_year','value','365.25','decimal',unit='d')],units={'s':{'state':'known','value':'s'},'d':{'state':'known','value':'d'}})
 def test_dimension_totals_are_separate(self):
  d=doc(tables=[{'caption':'Constants','rows':[['Quantity','Symbol','Value'],['day','d','86400 s'],['Julian year','','365.25']]}])
  t=score_case(self.h03(),d,ORIGIN)['totals']
  self.assertEqual((t['entityMatched'],t['relationCorrect'],t['unitKnown'],t['unitPreserved']),(2,2,2,1))
 def test_value_from_another_record_counts_as_wrong_record(self):
  d=doc(tables=[{'caption':'Constants','rows':[['Quantity','Symbol','Value'],['day','d','365.25 d'],['Julian year','a','86400 s']]}])
  r=score_case(self.h03(),d,ORIGIN);t=r['totals']
  self.assertEqual((t['valueCorrect'],t['relationCorrect'],t['wrongRecord']),(0,0,2))
 def test_value_present_without_its_subject_is_unbound(self):
  d=doc(markdown='The day lasts 86400 s.',tables=[])
  t=score_case(self.h03(),d,ORIGIN)['totals']
  self.assertEqual((t['entityMatched'],t['unboundValuePresent']),(0,1))
 def test_date_retention_is_counted_where_known(self):
  c=gold('D04','https://www.nasdaq.com/market-activity/stocks/aapl/historical',[field('D04','AAPL/10/15/2026','close','342.00','decimal',date='d1')],dates={'d1':{'state':'known','value':'2026-10-15'}})
  ok=doc(tables=[{'caption':'','rows':[['Date','Close/Last','Volume','Open','High','Low'],['10/15/2026','$342.00','39,767,260','$346.95','$347.85','$341.60']]}])
  t=score_case(c,ok,ORIGIN)['totals'];self.assertEqual((t['dateKnown'],t['datePreserved'],t['fullyCorrect']),(1,1,1))
  moved=doc(tables=[{'caption':'','rows':[['Date','Close/Last','Volume','Open','High','Low'],['10/14/2026','$342.00','1','1','1','1']]}])
  t=score_case(c,moved,ORIGIN)['totals'];self.assertEqual((t['entityMatched'],t['datePreserved']),(0,0))

class NotCapturedAndOutcomes(unittest.TestCase):
 def boundary(self):
  return gold('D07','https://www.aliexpress.com/category/702/laptops.html',[field('D07','boundary','heading','Register/Sign in',required=False),*[field('D07','required-slot-1',n,None,t,unit='missing',date='missing',availability='not_captured') for n,t in [('name','text'),('url','url'),('price','decimal')]]])
 def test_non_success_on_page_without_targets_is_correct(self):
  r=score_case(self.boundary(),doc('# Register/Sign in',status='blocked'),ORIGIN)
  self.assertFalse(r['deliverable']);self.assertEqual(r['outcome'],'correct_non_success');self.assertEqual(r['totals']['requiredNotCaptured'],3)
 def test_success_on_page_without_targets_is_no_target_false_success(self):
  r=score_case(self.boundary(),doc('# Register/Sign in'),ORIGIN);self.assertEqual((r['outcome'],r['falseSuccessKind']),('false_success','no_target'))
 def test_invented_record_counts_as_fabricated(self):
  r=score_case(self.boundary(),doc('# Register/Sign in\n\n[Gaming Laptop 15](https://www.aliexpress.com/item/1.html) US $499.00'),ORIGIN)
  self.assertEqual(r['totals']['fabricated'],3)
 def test_field_error_under_success_is_field_error_false_success(self):
  c=gold('H03','https://example.org/c',[field('H03','day','value','86400','decimal')])
  r=score_case(c,doc(tables=[{'caption':'','rows':[['Quantity','Symbol','Value'],['day','d','86399']]}]),ORIGIN)
  self.assertEqual((r['outcome'],r['falseSuccessKind']),('false_success','field_error'))
 def test_failed_verification_is_not_a_success_result(self):
  c=gold('H03','https://example.org/c',[field('H03','day','value','86400','decimal')]);d=doc(tables=[]);d['verification']={'status':'failed'}
  self.assertEqual(score_case(c,d,ORIGIN)['outcome'],'missed')

class Summary(unittest.TestCase):
 def test_zero_false_success_bound(self):
  self.assertAlmostEqual(upper95(0,40),1-0.05**(1/40));self.assertAlmostEqual(upper95(0,40),0.0722,places=4);self.assertIsNone(upper95(0,0))
 def test_nonzero_bound_is_clopper_pearson(self):self.assertAlmostEqual(upper95(1,10),0.3942,places=4)
 def test_success_and_request_denominators_are_reported_apart(self):
  rows=[{'outcome':o,'falseSuccessKind':k,'totals':{}} for o,k in [('correct_success',None),('false_success','field_error'),('false_success','no_target'),('correct_non_success',None),('missed',None)]]
  s=summarize(rows)
  self.assertEqual((s['requests'],s['successResults'],s['falseSuccess']),(5,3,2))
  self.assertEqual((s['errorAmongSuccess']['k'],s['errorAmongSuccess']['n']),(2,3));self.assertEqual((s['falseSuccessPerRequest']['k'],s['falseSuccessPerRequest']['n']),(2,5))
  self.assertEqual(s['falseSuccessByKind'],{'field_error':1,'no_target':1})

class DevelopmentMappings(unittest.TestCase):
 """Mappings for D01-D10 read the delivered output, never the labels."""
 def test_d01_vintage_and_population_from_row(self):
  c=gold('D01','https://www.census.gov/quickfacts/fact/table/US/PST045224',[field('D01','US/PST045225','population','341784857','integer',date='day'),field('D01','US/PST045225','vintage','V2025',date='day'),field('D01','US/PST045225','geography','United States',date='day')],dates={'day':{'state':'known','value':'2025-07-01'}})
  d=doc(tables=[{'caption':'','rows':[['Fact','United States'],['Population estimates, July 1, 2025, (V2025)','341,784,857'],['Population estimates, July 1, 2024, (V2024)','340,110,988']]}])
  self.assertEqual(score_case(c,d,ORIGIN)['totals']['fullyCorrect'],3)
 def test_d05_german_price_and_euro(self):
  c=gold('D05','https://www.otto.de/technik/laptop/',[field('D05','1996119966/1996119866','price','1799.00','decimal',unit='eur'),field('D05','1996119966/1996119866','url','https://www.otto.de/p/lenovo-1996119966/','url')],units={'eur':{'state':'known','value':'EUR'}})
  d=doc('[Lenovo LOQ](http://127.0.0.1:8862/p/lenovo-1996119966/)\n\n1.799,00 €\n\n[Apple](http://127.0.0.1:8862/p/apple-2085076160/)\n\n699,00 €')
  self.assertEqual(score_case(c,d,ORIGIN)['totals']['fullyCorrect'],2)
 def test_d09_lost_sign_fails_value_but_keeps_period(self):
  c=gold('D09','https://www.coingecko.com/',[field('D09','coin-1','change_1h','-0.1%','percent',unit='pct',period='p1')],units={'pct':{'state':'known','value':'%'}},periods={'p1':{'state':'known','value':'1h'}})
  d=doc(tables=[{'caption':'','rows':[['#','Coin','Price','1h','24h'],['1','Bitcoin BTC','$82,096.72','0.1%','0.9%']]}])
  row=score_case(c,d,ORIGIN)['rows'][0];self.assertFalse(row['checks']['value']);self.assertTrue(row['checks']['period']);self.assertTrue(row['checks']['entity'])
 def test_d03_offer_by_flight_link(self):
  url='https://www.skyscanner.net/transport/flights/SEN/CDG/20270107?currency=GBP'
  c=gold('D03','https://www.skyscanner.net/routes/lond/pari/london-to-paris.html',[field('D03','offer-1','url',url,'url'),field('D03','offer-1','starting_price','20','decimal',unit='gbp',date='dep'),field('D03','offer-1','departure_iso','2027-01-07','iso_date',date='dep')],units={'gbp':{'state':'known','value':'GBP'}},dates={'dep':{'state':'known','value':'2027-01-07'}})
  d=doc('[![easyJet](http://x/e.png) Thu, 7 Jan SEN - CDG with easyJet from £20](http://127.0.0.1:8862/transport/flights/SEN/CDG/20270107?currency=GBP)')
  self.assertEqual(score_case(c,d,ORIGIN)['totals']['fullyCorrect'],3)

 def test_d06_header_without_rows_is_not_history(self):
  c=gold('D06','https://finance.yahoo.com/quote/AAPL/history/',[field('D06','historical_table_boundary','date_header','Date',required=False),*[field('D06','required-slot-1',n,None,t,unit='missing',date='missing',availability='not_captured') for n,t in [('date','iso_date'),('open','decimal')]]])
  r=score_case(c,doc(tables=[{'caption':'','rows':[['Date','Open','High'],['There are no in the selected time period.']]}],status='blocked'),ORIGIN)
  self.assertEqual((r['totals']['fullyCorrect'],r['totals']['fabricated'],r['outcome']),(1,0,'correct_non_success'))
  r=score_case(c,doc(tables=[{'caption':'','rows':[['Date','Open','High'],['Oct 15, 2026','346.95','347.85']]}]),ORIGIN)
  self.assertEqual(r['totals']['fabricated'],2)

 def test_unknown_context_is_not_scored(self):
  c=gold('D02','https://www.newegg.com/p/pl?d=laptop',[field('D02','1TS-000A-15W75','price','319.99','decimal',date='quote')],dates={'quote':{'state':'unknown','value':None}})
  d=doc('[Dell Latitude](https://www.newegg.com/dell/p/1TS-000A-15W75)\n\n$319.99\n\n[More options from $319.99](https://www.newegg.com/dell/p/1TS-000A-15W75?Item=1TS-000A-15W75#moreBuyOptions)\n\n[HP](https://www.newegg.com/hp/p/1TS-000D-1TE80)')
  r=score_case(c,d,ORIGIN);self.assertEqual((r['totals']['fullyCorrect'],r['totals']['dateKnown'],r['totals']['duplicateSelectedRecords']),(1,0,0))
 def test_same_item_later_in_the_page_is_a_duplicate(self):
  c=gold('D02','https://www.newegg.com/p/pl?d=laptop',[field('D02','1TS-000A-15W75','price','319.99','decimal')])
  d=doc('[Dell](https://www.newegg.com/dell/p/1TS-000A-15W75)\n\n$319.99\n\n[HP](https://www.newegg.com/hp/p/1TS-000D-1TE80)\n\n$279.99\n\n[Dell](https://www.newegg.com/dell/p/1TS-000A-15W75)\n\n$319.99')
  self.assertEqual(score_case(c,d,ORIGIN)['totals']['duplicateSelectedRecords'],1)


class Report(unittest.TestCase):
 def test_markdown_leaves_values_out_by_default(self):
  c=gold('H03','https://example.org/c',[field('H03','day','value','86400','decimal')])
  r=score_case(c,doc(tables=[{'caption':'','rows':[['Quantity','Symbol','Value'],['day','d','86399']]}]),ORIGIN);rep={'rows':[r]}
  self.assertNotIn('86399',markdown_report(rep));self.assertNotIn('86400',markdown_report(rep));self.assertIn('86399',markdown_report(rep,True))

if __name__=='__main__':unittest.main()
