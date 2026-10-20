"""Offline controls for the audit itself. Synthetic controls are not real gold-set cases."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from audit_gold import audit_case, derive, norm_decimal, read_proof
from source_dom import Document


class AuditControls(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def fixture(self, *, reserved=False, percent=None, direction='gecko-down'):
        html = '<html>\r\n<span>USD</span><time datetime="2027-01-01">2027-01-01</time>'
        html += '<article id="a"><b>Alpha</b><i>0</i></article><article id="b"><b>Beta</b><i>9</i></article>'
        if percent is not None:
            html += '<table><tr><th>Coin</th><th>1h</th><th>24h</th></tr><tr><td>Alpha</td>'
            html += f'<td data-sort="-0.08989"><span class="{direction}">{percent}</span></td><td>0.2%</td></tr></table>'
        html += '</html>'
        data = html.encode('utf-8')
        (self.root/'source.html').write_bytes(data)
        sha = hashlib.sha256(data).hexdigest()
        capture = {'caseId':'H01' if reserved else 'D01','split':'reserved' if reserved else 'development','sourceFile':'source.html','rawSha256':sha,'candidateRun':None,'candidateOutputGenerated':False}
        (self.root/'capture.json').write_text(json.dumps(capture))
        doc = Document(html)
        def proof(node, attr=None):
            start=node.start;end=html.find('>',start)+1 if attr else node.end
            return {'start':start,'end':end,'byteStart':len(html[:start].encode()),'byteEnd':len(html[:end].encode()),'quote':html[start:end],'mode':'attribute' if attr else 'text',**({'attribute':attr} if attr else {})}
        def context(node, attr=None, normalization='text'):
            item={'state':'known','value':None,'evidence':[proof(node,attr)],'normalization':normalization}
            item['value']=derive(html,item);return item
        articles=doc.root.all('article')
        case={'id':capture['caseId'],'split':capture['split'],'rawSha256':sha,'nonAuthorReview':None,'exposure':{'usedForTuning':False,'candidateEvaluated':False},'entities':[{'id':n.attrs['id'],'span':[n.start,n.end]} for n in articles],'units':{'usd':context(doc.root.all('span')[0]),'na':{'state':'not_applicable','value':None,'reason':'Identifier, not a quantity.'}},'dates':{'day':context(doc.root.all('time')[0],'datetime','date_iso')},'periods':{},'fields':[{'id':'price','entityId':'a','name':'price','dataType':'decimal','required':True,'availability':'captured','value':'0','unitRef':'usd','dateRef':'day','evidence':[proof(articles[0].all('i')[0])],'normalization':'decimal_en'}]}
        if percent is not None:
            table=doc.root.all('table')[0];row=table.all('tr')[1];cell=row.all('td')[1];span=cell.all('span')[0]
            case['entities'].append({'id':'coin','span':[row.start,row.end]})
            for i,key in enumerate(['1h','24h'],1):case['periods'][key]=context(table.all('th')[i])
            start=html.index('%');case['units']['pct']={'state':'known','value':'%','evidence':[{'start':start,'end':start+1,'byteStart':len(html[:start].encode()),'byteEnd':len(html[:start+1].encode()),'quote':'%','mode':'literal'}],'normalization':'literal'}
            case['fields']=[{'id':'change','entityId':'coin','name':'change','dataType':'percent','required':True,'availability':'captured','value':'0.0%' if percent=='0.0%' else '-0.1%','unitRef':'pct','dateRef':'day','periodRef':'1h','directionState':'unknown_rounded_zero' if percent=='0.0%' else 'signed_source_sort','evidence':[proof(cell),proof(cell,'data-sort'),proof(span,'class')],'normalization':'signed_percent'}]
        return case, capture

    def test_zero_is_a_captured_value(self):
        case,_=self.fixture()
        self.assertEqual(audit_case(self.root,case)['capturedFields'],1)
        self.assertEqual(norm_decimal('0,00 €','de'),'0.00')

    def test_rejects_changed_value(self):
        case,_=self.fixture();case['fields'][0]['value']='9'
        with self.assertRaisesRegex(AssertionError,'differs from source'):audit_case(self.root,case)

    def test_rejects_cross_record_field(self):
        case,_=self.fixture();case['fields'][0]['entityId']='b'
        with self.assertRaisesRegex(AssertionError,'association'):audit_case(self.root,case)

    def test_rejects_wrong_currency(self):
        case,_=self.fixture();case['units']['usd']['value']='EUR'
        with self.assertRaisesRegex(AssertionError,'context mismatch'):audit_case(self.root,case)

    def test_quantity_cannot_hide_unit_assessment(self):
        case,_=self.fixture();case['fields'][0]['unitRef']='na'
        with self.assertRaisesRegex(AssertionError,'unit assessment'):audit_case(self.root,case)

    def test_rejects_wrong_context_year(self):
        case,_=self.fixture();case['dates']['day']['value']='2026-01-01'
        with self.assertRaisesRegex(AssertionError,'context mismatch'):audit_case(self.root,case)

    def test_missing_is_not_zero(self):
        case,_=self.fixture();case['fields'][0].update(availability='not_captured',value=0,reason='No target')
        with self.assertRaisesRegex(AssertionError,'missing value'):audit_case(self.root,case)
        case['fields'][0]['value']=None
        self.assertEqual(audit_case(self.root,case)['requiredNotCaptured'],1)

    def test_rejects_wrong_source_hash(self):
        case,_=self.fixture();case['rawSha256']='0'*64
        with self.assertRaisesRegex(AssertionError,'another source'):audit_case(self.root,case)

    def test_rejects_bad_byte_offset(self):
        case,_=self.fixture();case['fields'][0]['evidence'][0]['byteStart']+=1
        with self.assertRaisesRegex(AssertionError,'byte offset'):audit_case(self.root,case)

    def test_rejects_duplicate_field_id(self):
        case,_=self.fixture();case['fields'].append(deepcopy(case['fields'][0]))
        with self.assertRaisesRegex(AssertionError,'duplicate field'):audit_case(self.root,case)

    def test_reserved_tuning_exposure_is_rejected(self):
        case,_=self.fixture(reserved=True);case['exposure']['usedForTuning']=True
        with self.assertRaisesRegex(AssertionError,'reserved leakage'):audit_case(self.root,case)

    def test_reserved_candidate_output_is_rejected(self):
        case,capture=self.fixture(reserved=True);capture['candidateOutputGenerated']=True
        (self.root/'capture.json').write_text(json.dumps(capture))
        with self.assertRaisesRegex(AssertionError,'reserved sample'):audit_case(self.root,case)

    def test_percent_keeps_direction_and_header(self):
        case,_=self.fixture(percent='0.1%')
        self.assertEqual(audit_case(self.root,case)['capturedFields'],1)
        case['fields'][0]['periodRef']='24h'
        with self.assertRaisesRegex(AssertionError,'period/column'):audit_case(self.root,case)

    def test_conflicting_source_direction_is_not_a_gold_value(self):
        case,_=self.fixture(percent='0.1%',direction='gecko-up')
        with self.assertRaisesRegex(AssertionError,'direction conflict'):audit_case(self.root,case)

    def test_rounded_zero_has_unknown_direction(self):
        case,_=self.fixture(percent='0.0%')
        self.assertEqual(audit_case(self.root,case)['capturedFields'],1)
        case['fields'][0]['directionState']='signed_source_sort'
        with self.assertRaisesRegex(AssertionError,'direction overclaimed'):audit_case(self.root,case)

    def test_inline_text_decodes_entities_once(self):
        self.assertEqual(Document('<p>£<strong>2</strong>.<sup>99</sup>&amp;lt;</p>').root.text(),'£2.99&lt;')

    def test_decimal_separator_is_not_a_rounding_rule(self):
        self.assertEqual(norm_decimal('1.799,00 €','de'),'1799.00')
        self.assertEqual(norm_decimal('$348.1499'),'348.1499')

    def test_fixed_plan_has_distinct_tasks_and_disjoint_groups(self):
        plan=json.loads((Path(__file__).parent/'field-gold-plan.v1.json').read_text())
        self.assertEqual(len(plan['cases']),18)
        self.assertEqual(len({c['url'] for c in plan['cases']}),18)
        self.assertEqual(sum(c['split']=='reserved' for c in plan['cases']),8)
        self.assertEqual(sum(c['split']=='development' for c in plan['cases']),10)
        self.assertEqual(plan['candidateFrozen'],'ca94fdd5e2fd28e892418ba6fa7938b94eeeb3aa')

if __name__=='__main__':unittest.main()
