"""Frozen source-snapshot field review. Reads final SDK JSON; never runs the product."""
from __future__ import annotations
import argparse,datetime as dt,hashlib,html,json,re
from collections import Counter
from decimal import Decimal,InvalidOperation
from pathlib import Path
from urllib.parse import urlparse,urlunparse

MONTHS={name.lower():i for i,name in enumerate(['January','February','March','April','May','June','July','August','September','October','November','December'],1)}
MONTHS.update({k[:3]:v for k,v in list(MONTHS.items())})
LINK=re.compile(r'\[([^\]]*)\]\((<?[^\s)]+>?)(?:\s+"[^"]*")?\)')
def plain(s):
 s=LINK.sub(lambda m:m[1],str(s or ''));s=re.sub(r'<[^>]*>','',s)
 s=re.sub(r'\\([\\`*_{}\[\]()#+.!|>-])',r'\1',s)
 return html.unescape(s).replace('`','').replace('**','').replace('’',"'").replace('−','-').replace('\u00a0',' ')
def norm(s):return ' '.join(plain(s).split())
def scalar(s):return None if s is None else norm(s)
def date_of(s,month_only=False):
 text=norm(s)
 iso=re.search(r'\b(\d{4}-\d{2}(?:-\d{2})?)\b',text)
 if iso:
  v=iso[1]
  try:dt.date.fromisoformat(v+'-01' if len(v)==7 else v)
  except ValueError:return None
  return v[:7] if month_only else (v if len(v)==10 else None)
 m=re.search(r'\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b',text)
 if m and m[2].lower() in MONTHS:
  year,month,day=int(m[3]),MONTHS[m[2].lower()],int(m[1])
 else:
  m=re.search(r'\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b',text)
  if m and m[1].lower() in MONTHS:year,month,day=int(m[3]),MONTHS[m[1].lower()],int(m[2])
  elif month_only:
   m=re.search(r'\b([A-Za-z]+)\s+(\d{4})\b',text)
   if not m or m[1].lower() not in MONTHS:return None
   year,month,day=int(m[2]),MONTHS[m[1].lower()],1
  else:return None
 try:d=dt.date(year,month,day)
 except ValueError:return None
 return d.isoformat()[:7] if month_only else d.isoformat()

def power_of_ten(s):
 t=norm(s);m=re.fullmatch(r'10\s*(?:\^|\*\*)\s*\(?\s*([+-]?\d+)\s*\)?',t)
 if m:return '10^'+str(int(m[1]))
 chars=str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺','0123456789-+')
 if re.fullmatch(r'10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+',t):return '10^'+str(int(t[2:].translate(chars)))
 try:
  d=Decimal(t)
  if d>0 and d.normalize().as_tuple().digits==(1,):return '10^'+str(d.adjusted())
 except InvalidOperation:pass
 return t

def section(md,title,stop=None):
 lines=md.splitlines();start=None;level=None
 for i,line in enumerate(lines):
  h=re.match(r'^(#{1,6})\s+(.+)$',line.strip())
  content=norm(h[2] if h else line)
  if re.fullmatch(title,content,re.I):start=i+1;level=len(h[1]) if h else 6;break
 if start is None:return '',None
 end=len(lines)
 for i in range(start,len(lines)):
  h=re.match(r'^(#{1,6})\s+(.+)$',lines[i].strip())
  if h and (len(h[1])<=level or stop and re.fullmatch(stop,norm(h[2]),re.I)):end=i;break
 return '\n'.join(lines[start:end]),f'markdown.lines[{start}:{end}]'

def table_views(doc):
 tables=[]
 for i,t in enumerate(doc.get('tables') or []):
  rows=t.get('rows') or []
  if rows:tables.append({'caption':norm(t.get('caption')),'rows':[[norm(c) for c in row] for row in rows],'ref':f'tables[{i}]'})
 if tables:return tables
 # Predetermined fallback only when the requested table array has no nonempty tables.
 lines=(doc.get('markdown') or '').splitlines();i=0
 while i<len(lines):
  if lines[i].strip().startswith('|'):
   start=i;rows=[]
   while i<len(lines) and lines[i].strip().startswith('|'):
    cells=[norm(c) for c in re.split(r'(?<!\\)\|',lines[i].strip().strip('|'))]
    if not all(re.fullmatch(r':?-+:?',c.strip()) for c in cells):rows.append(cells)
    i+=1
   tables.append({'caption':norm(' '.join(lines[max(0,start-5):start])),'rows':rows,'ref':f'markdown.lines[{start}:{i}]'})
  else:i+=1
 return tables

def rebase_url(value,source_url,fixture_origin):
 if not value:return None
 p=urlparse(value.strip('<>'));fixture=urlparse(fixture_origin)
 if (p.scheme,p.netloc)==(fixture.scheme,fixture.netloc):p=p._replace(scheme=urlparse(source_url).scheme,netloc=urlparse(source_url).netloc)
 return urlunparse(p)

def mapped(case,doc,fixture_origin):
 """Named scopes and column mappings are frozen before candidate output exists."""
 cid=case['id'];md=doc.get('markdown') or '';text=plain(md);meta=doc.get('metadata') or {};tables=table_views(doc)
 out={};duplicates={};notes=[]
 def put(f,value,ref,unit=None,date=None,period=None,entity=True):
  out[f['id']]={'observed':scalar(value),'outputLocation':ref,'unit':unit,'businessDate':date,'period':period,'entityMatched':entity}
 def regex(pattern,scope=text,group=1,flags=re.I):
  m=re.search(pattern,scope,flags);return (norm(m[group]),f'markdown.chars[{m.start()}:{m.end()}]') if m else (None,None)
 def explicit_date(label):
  raw,ref=regex(label+r'[\s:#*\-]*([^\n]+)');v=date_of(raw) if raw else None
  if not v and meta.get('modifiedTime'):return date_of(meta['modifiedTime']),'metadata.modifiedTime'
  return v,ref
 if cid=='H01':
  stop=re.search(r'^#{0,6}\s*(?:Abstract|Status of This Memo|Table of Contents)\s*$',text,re.M|re.I)
  head=text[:stop.start()] if stop else text[:8000]
  ident,iref=regex(r'\b(RFC\s+\d+)\b',head+'\n'+str(meta.get('title') or ''))
  title=None;tref=None
  for i,line in enumerate(md.splitlines()):
   h=re.match(r'^#{1,6}\s+(.+)$',line)
   if h and norm(h[1]).startswith('HTTP Semantics'):title=norm(h[1]);tref=f'markdown.line[{i}]';break
  if title is None and meta.get('title'):
   title=re.sub(r'^RFC\s+\d+\s*:\s*','',norm(meta['title']));tref='metadata.title'
  category,cref=regex(r'\b(Standards Track|Informational|Experimental|Best Current Practice|Historic)\b',head)
  raw,pref=regex(r'\b([A-Za-z]+\s+20\d{2})\b',head);date=date_of(raw,True) if raw else None
  authors=list(re.finditer(r'\b[A-Z]\.\s+[A-Z][A-Za-z\-\x27]+(?:,\s*Ed\.)?',head))
  for f in case['fields']:
   n=f['name'];value,ref=(ident,iref) if n=='document_id' else (title,tref) if n=='title' else (category,cref) if n=='category' else (date,pref)
   if n.startswith('author_'):
    i=int(n.rsplit('_',1)[1])-1;m=authors[i] if i<len(authors) else None;value,ref=(m[0],f'markdown.header.chars[{m.start()}:{m.end()}]') if m else (None,None)
   put(f,value,ref,date=date,entity=ident=='RFC 9110')
 elif cid=='H02':
  body,bref=section(md,r'Top 100 EBooks yesterday');records=[]
  for m in LINK.finditer(body):
   url=rebase_url(m[2],case['url'],fixture_origin);idmatch=re.search(r'/ebooks/(\d+)(?:$|[/?#])',url or '')
   label=norm(m[1]);parts=re.fullmatch(r'(.*?)\s+by\s+(.+?)\s+\(([\d,]+)\)',label)
   if idmatch and parts:records.append({'id':idmatch[1],'title':parts[1],'author':parts[2],'download_count':parts[3].replace(',',''),'url':url,'ref':bref+f'.chars[{m.start()}:{m.end()}]'})
  day=None
  for table in tables:
   for row in table['rows']:
    if row and re.fullmatch(r'\d{4}-\d{2}-\d{2}',row[0]):day=row[0];break
   if day:break
  if day is None:
   raw,_=regex(r'\b(\d{4}-\d{2}-\d{2})\b');day=raw
  unit='downloads' if re.search(r'\bdownloads\b',text,re.I) else None
  for f in case['fields']:
   key=f['entityId'].removeprefix('ebook-');found=[r for r in records if r['id']==key];duplicates[f['entityId']]=max(0,len(found)-1)
   r=found[0] if found else {};value=r.get('id' if f['name']=='ebook_id' else f['name'])
   put(f,value,r.get('ref'),unit=unit,date=day,period='Top 100 EBooks yesterday' if bref else None,entity=bool(found))
 elif cid in ['H03','H04','H05','H06']:
  date,dref=(explicit_date('Updated') if cid=='H05' else explicit_date('Last Updated')) if cid in ['H05','H06'] else (None,None)
  for f in case['fields']:
   name=f['name'];entity=f['entityId'];matches=[]
   if name in ['page_updated','registry_updated']:put(f,date,dref,date=date);continue
   for table in tables:
    if cid=='H04' and not (re.search(r'England and Wales',table['caption'],re.I) and re.search(r'\b2027\b',table['caption'])):continue
    for ri,row in enumerate(table['rows']):
     idx=None
     if cid=='H03' and row and row[0]==entity.replace('_',' '):idx=0
     if cid=='H04' and row and row[0]==entity.split('/',1)[1]:idx=0
     if cid=='H05' and entity in row:idx=row.index(entity)
     if cid=='H06' and row and row[0]==entity.removeprefix('http-status-'):idx=0
     if idx is not None:matches.append((row,idx,table,f'{table["ref"]}.rows[{ri}]'))
   duplicates[entity]=max(0,len(matches)-1)
   if not matches:put(f,None,None,date=date,entity=False);continue
   row,idx,table,ref=matches[0];value=None;unit=None;period=None;business=date
   def cell(i):return row[i] if i<len(row) else None
   if cid=='H03':
    raw=cell(2);m=re.fullmatch(r'([+-]?[\d,]+(?:\.\d+)?)\s*([a-z/]+)',raw or '')
    value=cell(0) if name=='quantity' else cell(1) if name=='symbol' else (m[1].replace(',','') if m else raw)
    unit=m[2] if m else None
   elif cid=='H04':
    year=re.search(r'\b(20\d{2})\b',table['caption']);business=date_of((cell(0) or '')+' '+year[1]) if year else None;period=table['caption']
    value=business if name=='date' else cell(1) if name=='weekday' else cell(2)
   elif cid=='H05':value=cell(idx) if name=='prefix' else cell(idx+1) if name=='symbol' else power_of_ten(cell(idx+2))
   else:value=cell(0) if name=='code' else cell(1) if name=='description' else cell(2)
   put(f,value,ref,unit=unit,date=business,period=period)
 elif cid=='H07':
  header=text[:8000];raw,ref=regex(r'(W3C Recommendation[^\n]*(?:\n[^\n]+){0,2})',header);date=date_of(raw) if raw else None
  if not date and meta.get('publishedTime'):date=date_of(meta['publishedTime'])
  title,tref=regex(r'(Web Content Accessibility Guidelines \(WCAG\) 2\.2)',header+'\n'+str(meta.get('title') or ''))
  for f in case['fields']:
   n=f['name'];v,r=(title,tref) if n=='title' else ('W3C Recommendation' if raw else None,ref) if n=='status' else (date,ref)
   if n.startswith('conformance_level_'):
    level='Level '+('A'*int(n.rsplit('_',1)[1]));v,r=regex(r'For\s+('+level+r')\s+conformance\b')
   put(f,v,r,date=date,entity=title is not None)
 elif cid=='H08':
  params,pref=section(md,r'Parameters');ret,rref=section(md,r'Return value');date,dref=explicit_date(r'last modified(?: on)?')
  method,mref=regex(r'(Array\.prototype\.map\(\))',text[:8000]+'\n'+str(meta.get('title') or ''))
  paragraphs=[norm(x) for x in re.split(r'\n\s*\n',ret) if norm(x)]
  for f in case['fields']:
   n=f['name'];v,r=(method,mref) if n=='method' else (date,dref) if n=='last_modified' else ((paragraphs[0] if paragraphs else None),rref)
   if n.startswith('parameter_'):
    key=n.removeprefix('parameter_');v=None;r=None
    for i,line in enumerate(params.splitlines()):
     if re.fullmatch(r'(?:[-*]\s*)?'+re.escape(key)+r'(?:\s+Optional)?',norm(line)):v=key;r=pref+f'.line[{i}]';break
   put(f,v,r,date=date,entity=method is not None)
 else:raise ValueError('Unsupported frozen case '+cid)
 return out,duplicates,notes

def equal(value,expected,datatype):
 if value is None:return False
 if datatype in ['integer','decimal']:
  try:return Decimal(value.replace(',',''))==Decimal(expected)
  except InvalidOperation:return False
 return norm(value)==norm(expected)

def score_case(case,doc,fixture_origin):
 observed,duplicates,notes=mapped(case,doc,fixture_origin)
 er=doc.get('evidenceRecord') or {};rawsha=er.get('rawSha256');same_source=rawsha==case['rawSha256'];rows=[]
 for f in case['fields']:
  o=observed.get(f['id'],{});value_ok=equal(o.get('observed'),f['value'],f['dataType'])
  checks={'value':value_ok,'entity':o.get('entityMatched',False),'sameSource':same_source}
  for label,collection,refkey,obskey in [('unit','units','unitRef','unit'),('date','dates','dateRef','businessDate'),('period','periods','periodRef','period')]:
   context=case[collection].get(f.get(refkey))
   checks[label]=True if not context or context['state']=='not_applicable' else None if context['state']=='unknown' else (norm(o.get(obskey) or '').casefold()==norm(context['value']).casefold() if label=='period' else norm(o.get(obskey) or '')==norm(context['value']))
  complete=all(v is True for v in checks.values());locatable=value_ok and checks['entity'] and same_source and bool(o.get('outputLocation'))
  rows.append({'fieldId':f['id'],'entityId':f['entityId'],'field':f['name'],'required':f['required'],'expected':f['value'],**o,'checks':checks,'fullyCorrect':complete,'independentlySourceLocatable':locatable,'sourceEvidence':f['evidence'],'contextEvidence':{k:case[k].get(f.get(ref)) for k,ref in [('units','unitRef'),('dates','dateRef'),('periods','periodRef')]}})
 totals={'fieldSlots':len(rows),'requiredFields':sum(f['required'] for f in rows),'observedFields':sum(r.get('observed') is not None for r in rows),'valueCorrect':sum(r['checks']['value'] and r['checks']['entity'] for r in rows),'fullyCorrect':sum(r['fullyCorrect'] for r in rows),'requiredFullyCorrect':sum(r['required'] and r['fullyCorrect'] for r in rows),'sourceLocatable':sum(r['independentlySourceLocatable'] for r in rows),'duplicateSelectedRecords':sum(duplicates.values())}
 return {'id':case['id'],'sameSource':same_source,'status':doc.get('status'),'configuredVerification':(doc.get('verification') or {}).get('status'),'readiness':(doc.get('readiness') or {}).get('state'),'totals':totals,'taskAccepted':all(r['fullyCorrect'] for r in rows if r['required']) and not totals['duplicateSelectedRecords'],'duplicateKeys':duplicates,'rows':rows,'notes':notes,'explicitProductFieldCitation':None,'nonAuthorReview':None}

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('dataset',type=Path);p.add_argument('outputs',type=Path);p.add_argument('--fixture-origin',required=True);p.add_argument('--out',required=True,type=Path);args=p.parse_args();results=[]
 for version in ['candidate','control']:
  for cid in [f'H{i:02}' for i in range(1,9)]:
   case=json.loads((args.dataset/'cases'/cid/'gold.json').read_text());path=args.outputs/version/(cid+'.json');saved=json.loads(path.read_text()) if path.exists() else {};doc=saved.get('response') or {};r=score_case(case,doc,args.fixture_origin);r['version']=version;r['runError']=saved.get('error');results.append(r)
 report={'schema':'octocrawl.field-acceptance/1','scope':'Eight retained source snapshots, one fixed SDK call per version/case; no live access or independent human acceptance.','rows':results,'summaries':{}}
 for version in ['candidate','control']:
  subset=[r for r in results if r['version']==version];totals=Counter()
  for row in subset:totals.update(row['totals'])
  report['summaries'][version]={'cases':8,'accepted':sum(r['taskAccepted'] for r in subset),'configuredPassed':sum(r['configuredVerification']=='passed' for r in subset),'configuredPassButFieldIncomplete':sum(r['configuredVerification']=='passed' and not r['taskAccepted'] for r in subset),**dict(totals)}
 args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report['summaries'],indent=2))
if __name__=='__main__':main()
