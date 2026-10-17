"""Synthetic scorer controls only. No reserved product output is loaded."""
import unittest
from copy import deepcopy
from holdout_score import date_of,equal,power_of_ten,rebase_url,score_case,section

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

if __name__=='__main__':unittest.main()
