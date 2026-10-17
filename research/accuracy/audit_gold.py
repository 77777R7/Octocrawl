"""Audit frozen field annotations against retained raw sources; never run a product candidate."""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, re
from collections import Counter
from decimal import Decimal
from html import unescape
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs
from source_dom import Document

STATES={'known','unknown','not_applicable'}
MONTHS={m.lower():i for i,m in enumerate(['January','February','March','April','May','June','July','August','September','October','November','December'],1)}

def norm_decimal(value: str, locale='en') -> str:
    text=re.sub(r'[^0-9, .+−-]','',value).replace('−','-').replace(' ','')
    if locale=='de':text=text.replace('.','').replace(',','.')
    else:text=text.replace(',','')
    return str(Decimal(text))

def read_proof(source: str, proof: dict) -> str:
    start,end=proof['start'],proof['end']
    assert isinstance(start,int) and isinstance(end,int) and 0<=start<end<=len(source),'invalid source span'
    fragment=source[start:end]
    assert fragment==proof['quote'],'source quote differs'
    assert len(source[:start].encode('utf-8'))==proof['byteStart'] and len(source[:end].encode('utf-8'))==proof['byteEnd'],'raw byte offset mismatch'
    mode=proof.get('mode','text')
    if mode=='literal':return unescape(fragment)
    doc=Document(fragment)
    if mode=='attribute':
        nodes=doc.root.all()
        assert nodes and proof['attribute'] in nodes[0].attrs,'missing source attribute'
        return nodes[0].attrs[proof['attribute']] or ''
    assert mode=='text','unsupported proof mode'
    return doc.root.text()

def derive(source: str, value: dict) -> str:
    parts=[read_proof(source,p) for p in value['evidence']]
    assert parts,'known value lacks evidence'
    rule=value.get('normalization','text');text=parts[0]
    if rule=='text':return text
    if rule=='literal':return text
    if rule=='decimal_en':return norm_decimal(text)
    if rule=='decimal_de':return norm_decimal(text,'de')
    if rule=='integer':return str(int(text.replace(',','').replace(' ','')))
    if rule=='url':return urljoin(value['baseUrl'],text)
    if rule=='currency_symbol':return {'€':'EUR','£':'GBP'}[text]
    if rule=='query':return parse_qs(urlparse(text).query)[value['parameter']][0]
    if rule=='date_url':
        raw=re.search(r'/([0-9]{8})(?:\?|$)',text)
        assert raw,'URL does not declare a full date'
        return dt.datetime.strptime(raw[1],'%Y%m%d').date().isoformat()
    if rule=='date_us':return dt.datetime.strptime(text,'%m/%d/%Y').date().isoformat()
    if rule=='date_iso':return dt.date.fromisoformat(text[:10]).isoformat()
    if rule=='month_iso':
        assert re.fullmatch(r'\d{4}-\d{2}',text)
        dt.date.fromisoformat(text+'-01');return text
    if rule=='date_en':
        m=re.search(r'([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})',text)
        assert m,'no explicit English calendar date'
        return dt.date(int(m[3]),MONTHS[m[1].lower()],int(m[2])).isoformat()
    if rule=='date_day_month_year_context':
        m=re.fullmatch(r'(\d{1,2})\s+([A-Za-z]+)',text)
        year=re.search(r'\b(20\d{2})\b',parts[1]);assert m and year
        return dt.date(int(year[1]),MONTHS[m[2].lower()],int(m[1])).isoformat()
    if rule=='regex':
        m=re.search(value['pattern'],text);assert m,'source pattern absent';return m[value.get('group',1)]
    if rule=='power10':
        assert re.fullmatch(r'-?\d+',text)
        return '10^'+str(int(text))
    if rule=='signed_percent':
        assert '%' in text and len(parts)>=2
        number=norm_decimal(text);sort=Decimal(parts[1]);display=Decimal(number)
        if display==0:return number+'%'
        assert sort!=0 and len(parts)>=3,'source direction unavailable'
        assert ('gecko-down' if sort<0 else 'gecko-up') in parts[2].split(),'source direction conflict'
        return ('-' if sort<0 else '')+number.lstrip('+-')+'%'
    raise AssertionError('unknown normalization '+rule)

def audit_case(folder: Path, case: dict) -> dict:
    capture=json.loads((folder/'capture.json').read_text())
    assert capture['caseId']==case['id'] and capture['split']==case['split'],'case/split mismatch'
    source=(folder/capture['sourceFile']).read_bytes().decode('utf-8')
    assert hashlib.sha256((folder/capture['sourceFile']).read_bytes()).hexdigest()==capture['rawSha256'],'source hash mismatch'
    assert case['rawSha256']==capture['rawSha256'],'annotation refers to another source'
    assert case['nonAuthorReview'] is None or isinstance(case['nonAuthorReview'],dict)
    if case['split']=='reserved':
        assert capture.get('candidateRun') is None and capture.get('candidateOutputGenerated') is False,'reserved sample was evaluated'
        assert not case['exposure']['usedForTuning'] and not case['exposure']['candidateEvaluated'],'reserved leakage'
    parsed=Document(source) if any(f.get('periodRef') and f.get('dataType')=='percent' for f in case['fields']) else None
    by_start={n.start:n for n in parsed.root.all()} if parsed is not None else {}
    entities={e['id']:e for e in case['entities']};assert len(entities)==len(case['entities']),'duplicate entity key'
    ids=set();counts=Counter()
    for kind in ['units','dates','periods']:
        for key,item in case[kind].items():
            assert item['state'] in STATES
            if item['state']=='known':assert derive(source,item)==item['value'],kind+' source/context mismatch: '+key
            else:assert item['value'] is None and item.get('reason'),kind+' unknown is not null'
    for field in case['fields']:
        assert field['id'] not in ids,'duplicate field ID';ids.add(field['id'])
        assert field['entityId'] in entities,'unknown entity'
        assert field['unitRef'] in case['units'] and field['dateRef'] in case['dates'],'missing field context'
        assert field['availability'] in ['captured','not_captured','unknown']
        if field['availability']!='captured':
            assert field['value'] is None and field.get('reason'),'missing value filled or unexplained'
            counts['requiredNotCaptured' if field['required'] else 'unknownOptional']+=1;continue
        assert field['value'] is not None,'captured value is null'
        assert derive(source,field)==field['value'],'field differs from source: '+field['id']
        entity=entities[field['entityId']];span=entity.get('span')
        assert span is not None,'captured field has no source record'
        for proof in field['evidence']:
            if proof.get('role','value')=='value':assert span[0]<=proof['start']<proof['end']<=span[1],'field/record association mismatch'
        counts['capturedFields']+=1
        counts['requiredCaptured' if field['required'] else 'optionalCaptured']+=1
        counts['unit_'+case['units'][field['unitRef']]['state']]+=1
        counts['date_'+case['dates'][field['dateRef']]['state']]+=1
        if field['dataType'] in ['decimal','integer','percent']:
            assert case['units'][field['unitRef']]['state']!='not_applicable','quantity lacks unit assessment'
        if field['dataType']=='iso_date':
            assert case['dates'][field['dateRef']]['state']=='known' and case['dates'][field['dateRef']]['value']==field['value'],'date context differs from date field'
        if field.get('periodRef'):assert field['periodRef'] in case['periods']
        if field['dataType']=='percent':
            assert case['units'][field['unitRef']]['value']=='%','percentage unit differs'
            zero=Decimal(field['value'].rstrip('%'))==0
            assert field['directionState']==('unknown_rounded_zero' if zero else 'signed_source_sort'),'percentage direction overclaimed'
            cell=by_start[field['evidence'][0]['start']]
            header=by_start[case['periods'][field['periodRef']]['evidence'][0]['start']]
            assert cell.tag=='td' and header.tag=='th' and cell.ancestor('table') is header.ancestor('table'),'period not from same table'
            col=[n for n in cell.parent.children if n.tag in ['td','th']].index(cell)
            hcol=[n for n in header.parent.children if n.tag in ['td','th']].index(header)
            assert col==hcol,'percentage period/column association mismatch'
    assert ids,'case has no field annotations'
    return {'id':case['id'],'split':case['split'],'sourceChecked':True,'fieldSlots':len(case['fields']),**dict(counts)}

def audit_dataset(root: Path) -> dict:
    plan=json.loads((root/'plan.json').read_text());rows=[]
    if (root/'seal.json').exists():
        seal=json.loads((root/'seal.json').read_text())
        assert hashlib.sha256((root/'plan.json').read_bytes()).hexdigest()==seal['planSha256'],'sealed plan differs'
        for path,digest in seal['files'].items():
            assert hashlib.sha256((root/path).read_bytes()).hexdigest()==digest,'sealed source/annotation differs: '+path
    assert len(plan['cases'])==18 and len({c['url'] for c in plan['cases']})==18,'task universe changed'
    for definition in plan['cases']:
        folder=root/'cases'/definition['id'];case=json.loads((folder/'gold.json').read_text())
        assert case['task']==definition['task'] and case['url']==definition['url'],'task changed after planning'
        rows.append(audit_case(folder,case))
    total=Counter()
    for row in rows:
        for k,v in row.items():
            if isinstance(v,int) and not isinstance(v,bool):total[k]+=v
    return {'schema':'octocrawl.field-gold-audit/1','caseCount':len(rows),'development':sum(r['split']=='development' for r in rows),'reserved':sum(r['split']=='reserved' for r in rows),'totals':dict(total),'rows':rows,'candidateAccuracy':None,'nonAuthorAccuracyAccepted':False,'scope':'Checks frozen engineering annotations against source bytes and record/context evidence; not product evaluation or independent economic truth.'}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('dataset',type=Path);parser.add_argument('--output',type=Path);args=parser.parse_args()
    report=audit_dataset(args.dataset)
    text=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if args.output:args.output.write_text(text)
    print(text)
if __name__=='__main__':main()
