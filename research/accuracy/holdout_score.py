"""Frozen source-snapshot field review. Reads final SDK JSON; never runs the product."""
from __future__ import annotations
import argparse,datetime as dt,hashlib,html,json,math,re
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
 elif cid in DEV_CASES:
  d_mapped(case,md,text,meta,tables,fixture_origin,put,duplicates)
 else:raise ValueError('Unsupported frozen case '+cid)
 return out,duplicates,notes

# Development set D01-D10 (R3). Same rules as the H mappings: entity keys, record regions and
# column headers come from the frozen task and entity IDs; values come only from the delivered output.
DEV_CASES={f'D{i:02}' for i in range(1,11)}
COINS={'coin-1':('Bitcoin','BTC'),'coin-2':('Ethereum','ETH'),'coin-3':('Tether','USDT')}  # named in D09's task text
BOUNDARY={'D07':{'heading':r'Register/Sign in','boundary_instruction':r'Passkey'},'D08':{'heading':r'Security Verification','boundary_instruction':r'Fill each box with the required number of objects indicated'},
 'D10':{'error_type':r'\bFATAL\b','status_code':r'\bPOLARIS_\d+\b','status_message':r'\bINVALID_CAT_ID\b'}}  # optional boundary fields; never in task acceptance
MDTARGET=re.compile(r'\]\((<?[^\s)]+>?)(?:\s+"[^"]*")?\)')
IMAGE=re.compile(r'!\[([^\]]*)\]\([^)]*\)')
WEEKDAY=r'(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)'

def signed_percent(s):
 m=re.fullmatch(r'([+-]?)\s*(\d+(?:\.\d+)?)\s*%',norm(s or ''))
 if not m:return None
 return Decimal(m[1]+m[2]) if m[1]=='-' else Decimal(m[2])

def amount(raw,german=False):
 """Displayed money/number text to a plain decimal string, without rounding."""
 t=re.sub(r'\s+','',raw or '')
 t=t.replace('.','').replace(',','.') if german else t.replace(',','')
 try:Decimal(t)
 except InvalidOperation:return None
 return t

def link_open(md,close):
 """Index of the '[' that opens the link text ending at md[close] (']'), nested images allowed."""
 depth=0
 for i in range(close,-1,-1):
  if md[i]==']':depth+=1
  elif md[i]=='[':
   depth-=1
   if depth==0:return i-1 if i and md[i-1]=='!' else i
 return close

def link_records(md,pattern,source_url,fixture_origin,inside=False):
 """Markdown links whose URL matches pattern, one record per run of adjacent links to the same item
 (the pattern's first group, else the whole URL); the record keeps the first link's URL.
 inside=True: the card is the link, so a record's region ends at its URL. Otherwise it runs to the next record."""
 hits=[]
 for m in MDTARGET.finditer(md):
  url=rebase_url(m[1],source_url,fixture_origin)
  hit=re.search(pattern,url) if url else None
  if hit:
   open_=link_open(md,m.start());hits.append({'url':url,'key':hit[1] if hit.groups() else url,'open':open_,'end':m.end(),'text':md[open_:m.start()+1]})
 records=[]
 for h in hits:
  if records and records[-1]['key']==h['key']:records[-1]['texts'].append(h['text']);records[-1]['end']=h['end'];continue
  records.append({'url':h['url'],'key':h['key'],'open':h['open'],'end':h['end'],'texts':[h['text']]})
 for i,r in enumerate(records):
  start=records[i-1]['end'] if inside and i else r['open'];stop=r['end'] if inside else (records[i+1]['open'] if i+1<len(records) else len(md))
  r['region']=md[start:stop];r['ref']=f'markdown.chars[{start}:{stop}]'
  names=[norm(IMAGE.sub('',t).lstrip('![').rstrip(']')) for t in r['texts']]
  r['name']=max(names,key=len) if names else None
 return records

def first_price_records(md,source_url,fixture_origin):
 """Any link followed by a displayed price before the next link: what a product card would look like."""
 out=[]
 for r in link_records(md,r'^https?://',source_url,fixture_origin):
  m=re.search(r'(?:US\s*)?([$€£])\s*([\d.,]+)',plain(r['region']))
  if m and r['name']:out.append({**r,'price':amount(m[2])})
 return out

def header_index(header,names):
 for i,c in enumerate(header):
  if norm(c).casefold() in names:return i
 return None

def d_mapped(case,md,text,meta,tables,fixture_origin,put,duplicates):
 cid=case['id'];src=case['url'];fields=case['fields']
 if cid=='D01':
  hit=None
  for table in tables:
   for ri,row in enumerate(table['rows']):
    m=re.search(r'Population estimates, (July 1, \d{4}), \((V\d{4})\)',row[0] if row else '')
    if m and m[2]=='V20'+fields[0]['entityId'][-2:] and len(row)>1:
     header=table['rows'][0];hit=(m,row[1],header[1] if len(header)>1 and header is not row else None,f'{table["ref"]}.rows[{ri}]');break
   if hit:break
  if not hit:
   m=re.search(r'Population estimates, (July 1, \d{4}), \((V\d{4})\)[^\d\n]{0,40}([\d,]{5,})',text)
   if m and m[2]=='V20'+fields[0]['entityId'][-2:]:hit=(m,m[3],None,f'markdown.chars[{m.start()}:{m.end()}]')
  mnemonic,_=re.search(r'\b(PST\d{6})\b',text) and (re.search(r'\b(PST\d{6})\b',text)[1],None) or (None,None)
  unit='ABS' if re.search(r'\bABS\b',text) else None
  for f in fields:
   if not hit:put(f,None,None,entity=False);continue
   m,value,geo,ref=hit;n=f['name']
   v=geo if n=='geography' else m[0] if n=='measure' else mnemonic if n=='mnemonic' else value if n=='population' else m[2]
   put(f,v,ref,unit=unit if n=='population' else None,date=date_of(m[1]))
 elif cid in ['D02','D05']:
  german=cid=='D05'
  pattern=r'^https://www\.newegg\.com/.+/p/([^/?#]+)' if cid=='D02' else r'^https://www\.otto\.de/p/[^?#]*-(\d{6,})/?(?:[?#]|$)'
  records=link_records(md,pattern,src,fixture_origin)
  for f in fields:
   eid=f['entityId']
   if cid=='D02':key=lambda r:(lambda t:t==eid or t.endswith(eid.replace('-','')))(re.search(pattern,r['url'])[1])
   else:key=lambda r:re.search(pattern,r['url'])[1]==eid.split('/')[0]
   found=[r for r in records if key(r)];duplicates[eid]=max(0,len(found)-1)
   if not found:put(f,None,None,entity=False);continue
   r=found[0];region=plain(IMAGE.sub(lambda m:m[1],r['region']));n=f['name'];unit=None
   if n=='price':
    if german:
     m=re.search(r'(\d{1,3}(?:\.\d{3})*,\d{2})\s*(€|EUR)',region);v=amount(m[1],True) if m else None;unit='EUR' if m else None
    else:
     cut=re.sub(r'Save:?\s*\$\s*[\d,.]+\s*(?:\(\d+%\))?','',region);m=re.search(r'\$\s*([\d,]+)\s*(\.\s*\d{2})?',cut)
     v=amount(m[1]+(m[2] or '')) if m else None;unit='USD' if m and (re.search(r'\bUSD\b',region) or re.search(r'\bUSD\b',text)) else None
   elif n=='url':v=r['url']
   elif n=='name':v=r['name']
   elif n=='sku':
    m=re.search(r'Item\s*#\s*:?\s*([\w-]+)',region);v=m[1] if m else (eid if re.search(r'(?<![\w-])'+re.escape(eid)+r'(?![\w-])',region) else None)
   elif n=='product_id':v=re.search(pattern,r['url'])[1]
   elif n=='variation_id':m=re.search(r'variationId=(\d+)',r['url']);v=m[1] if m else None
   else:v=None
   put(f,v,r['ref'],unit=unit)
 elif cid=='D03':
  records=link_records(md,r'/transport/flights/[A-Z]{3}/[A-Z]{3}/\d{8}',src,fixture_origin,inside=True)
  seen=Counter(r['url'] for r in records)
  for f in fields:
   i=int(f['entityId'].rsplit('-',1)[1])-1;r=records[i] if i<len(records) else None
   if r is None:put(f,None,None,entity=False);continue
   duplicates[f['entityId']]=seen[r['url']]-1
   region=r['region'];flat=plain(IMAGE.sub(lambda m:m[1],region));n=f['name']
   d=re.search(r'/(\d{4})(\d{2})(\d{2})(?:[/?#]|$)',r['url']);iso=f'{d[1]}-{d[2]}-{d[3]}' if d else None
   route=re.search(r'\b([A-Z]{3} - [A-Z]{3} with .+?)(?=\s+from\b|\s*$)',flat,re.M)
   price=re.search(r'from\s*(£|GBP)\s*([\d,]+(?:\.\d+)?)',flat)
   if n=='url':v=r['url']
   elif n=='departure_display':m=re.search(WEEKDAY+r', \d{1,2} [A-Z][a-z]{2}\b',flat);v=m[0] if m else None
   elif n=='departure_iso':v=iso
   elif n=='carrier':
    alt=[a for a in IMAGE.findall(region) if a.strip()];v=alt[0] if alt else (re.search(r' with (.+)$',route[1])[1] if route else None)
   elif n=='route':v=route[1] if route else None
   elif n=='starting_price':v=price[2] if price else None
   else:v=None
   unit='GBP' if price and (price[1] in ['£','GBP'] or 'currency=GBP' in r['url']) else None
   put(f,v,r['ref'],unit=unit,date=iso)
 elif cid=='D04':
  cols={'date':{'date'},'close':{'close/last','close'},'volume':{'volume'},'open':{'open'},'high':{'high'},'low':{'low'}}
  for f in fields:
   day=f['entityId'].split('/',1)[1];matches=[]
   for table in tables:
    header=table['rows'][0] if table['rows'] else []
    if header_index(header,cols['close']) is None:continue
    for ri,row in enumerate(table['rows'][1:],1):
     if row and norm(row[0])==day:matches.append((row,header,f'{table["ref"]}.rows[{ri}]'))
   duplicates[f['entityId']]=max(0,len(matches)-1)
   if not matches:put(f,None,None,entity=False);continue
   row,header,ref=matches[0];mo,dd,yy=day.split('/');iso=f'{yy}-{mo}-{dd}';i=header_index(header,cols[f['name']])
   v=iso if f['name']=='date' else (row[i] if i is not None and i<len(row) else None)
   put(f,v,ref,date=iso)
 elif cid=='D06':
  history=[]
  for table in tables:
   header=table['rows'][0] if table['rows'] else []
   if header_index(header,{'date'}) is None or header_index(header,{'open'}) is None:continue
   for ri,row in enumerate(table['rows'][1:],1):
    if row and date_of(row[0]):history.append((row,header,f'{table["ref"]}.rows[{ri}]'))
  cols={'date':{'date'},'open':{'open'},'high':{'high'},'low':{'low'},'close':{'close','close*'},'adjusted_close':{'adj close','adj close**','adj. close'},'volume':{'volume'}}
  for f in fields:
   n=f['name']
   if n=='no_rows_message':m=re.search(r'There are no[^.\n]*in the selected time period\.?',text);put(f,norm(m[0]) if m else None,m and f'markdown.chars[{m.start()}:{m.end()}]');continue
   if n=='date_header':
    hdr=[(t,header_index(t['rows'][0],{'date'})) for t in tables if t['rows']];hdr=[(t,i) for t,i in hdr if i is not None]
    put(f,hdr[0][0]['rows'][0][hdr[0][1]] if hdr else None,hdr and hdr[0][0]['ref']+'.rows[0]');continue
   if not f['entityId'].startswith('required-slot-'):put(f,None,None,entity=False);continue
   i=int(f['entityId'].rsplit('-',1)[1])-1
   if i>=len(history):put(f,None,None,entity=False);continue
   row,header,ref=history[i];j=header_index(header,cols[n]);put(f,date_of(row[0]) if n=='date' else (row[j] if j is not None and j<len(row) else None),ref)
 elif cid in ['D07','D08','D10']:
  offers=first_price_records(md,src,fixture_origin)
  for f in fields:
   n=f['name']
   if n in BOUNDARY[cid]:m=re.search(BOUNDARY[cid][n],text);put(f,m[0] if m else None,m and f'markdown.chars[{m.start()}:{m.end()}]');continue
   i=int(f['entityId'].rsplit('-',1)[1])-1;r=offers[i] if i<len(offers) else None
   put(f,None if r is None else r['url'] if n=='url' else r['name'] if n=='name' else r['price'],r and r['ref'],entity=r is not None)
 elif cid=='D09':
  usd='USD' if re.search(r'\bUSD\b',text) else None
  cols={'price':{'price'},'change_1h':{'1h'},'change_24h':{'24h'},'change_7d':{'7d'},'change_30d':{'30d'}}
  for f in fields:
   name,sym=COINS[f['entityId']];matches=[]
   for table in tables:
    header=table['rows'][0] if table['rows'] else []
    if header_index(header,{'1h'}) is None:continue
    for ri,row in enumerate(table['rows'][1:],1):
     cell=next((c for c in row if re.search(rf'\b{name}\b\W*\b{sym}\b',c)),None)
     if cell:matches.append((row,header,cell,f'{table["ref"]}.rows[{ri}]'))
   duplicates[f['entityId']]=max(0,len(matches)-1)
   if not matches:put(f,None,None,entity=False);continue
   row,header,cell,ref=matches[0];n=f['name']
   if n=='coin':m=re.search(rf'\b({name})\b\W*\b({sym})\b',cell);put(f,f'{m[1]} {m[2]}',ref);continue
   j=header_index(header,cols[n]);v=row[j] if j is not None and j<len(row) else None
   if n=='price':put(f,v,ref,unit=usd if v else None)
   else:put(f,v,ref,unit='%' if v and norm(v).endswith('%') else None,period=norm(header[j]) if j is not None else None)
 else:raise ValueError('Unsupported development case '+cid)

SCHEMA_AVAILABILITY=re.compile(r'https?://schema\.org/([A-Za-z]+)')
def availability(s):
 """schema.org ItemAvailability URL or its label, as one comparable token: InStock, 'In stock', 'IN STOCK' -> instock."""
 t=norm(s);m=SCHEMA_AVAILABILITY.fullmatch(t)
 return (m[1] if m else t).replace(' ','').replace('-','').casefold()
def month_only(s):
 """'YYYY-MM', 'June 2031' or 'Jun 2031' as YYYY-MM; None for anything with a day or no month."""
 t=norm(s)
 if re.fullmatch(r'\d{4}-\d{2}',t):return t
 return date_of(t,True) if re.fullmatch(r'[A-Za-z]+\.?\s+\d{4}',t) else None

def equal(value,expected,datatype):
 if value is None:return False
 if expected is not None and SCHEMA_AVAILABILITY.fullmatch(norm(expected)):return availability(value)==availability(expected)
 if expected is not None and month_only(expected) and month_only(value):return month_only(value)==month_only(expected)
 if expected is None:return False
 if datatype in ['integer','decimal']:
  try:return Decimal(norm(value).replace(',','').lstrip('$£€').strip())==Decimal(expected)
  except InvalidOperation:return False
 if datatype=='percent':
  a,b=signed_percent(value),signed_percent(expected)
  return a is not None and a==b
 return norm(value)==norm(expected)

def score_case(case,doc,fixture_origin):
 observed,duplicates,notes=mapped(case,doc,fixture_origin)
 er=doc.get('evidenceRecord') or {};rawsha=er.get('rawSha256');same_source=rawsha==case['rawSha256'];rows=[]
 haystack=norm(plain(doc.get('markdown') or '')+'\n'+'\n'.join(' '.join(c for row in t['rows'] for c in row) for t in table_views(doc)))
 for f in case['fields']:
  o=observed.get(f['id'],{});captured=f.get('availability','captured')=='captured'
  value_ok=equal(o.get('observed'),f['value'],f['dataType'])
  checks={'value':value_ok,'entity':o.get('entityMatched',False),'sameSource':same_source}
  for label,collection,refkey,obskey in [('unit','units','unitRef','unit'),('date','dates','dateRef','businessDate'),('period','periods','periodRef','period')]:
   context=case[collection].get(f.get(refkey))
   checks[label]=True if not context or context['state']=='not_applicable' else None if context['state']=='unknown' else (norm(o.get(obskey) or '').casefold()==norm(context['value']).casefold() if label=='period' else norm(o.get(obskey) or '')==norm(context['value']))
  # Field relation: the right value read from the record bound to its own subject.
  checks['relation']=bool(value_ok and checks['entity'] and o.get('outputLocation'))
  # Fully correct needs every known dimension; a context the source leaves unknown is not scored (None).
  complete=captured and all(v is not False for v in checks.values());locatable=value_ok and checks['entity'] and same_source and bool(o.get('outputLocation'))
  others={g['value'] for g in case['fields'] if g['name']==f['name'] and g['entityId']!=f['entityId'] and g['value'] is not None and g['value']!=f['value']}
  wrong_record=captured and not value_ok and o.get('observed') is not None and any(equal(o['observed'],v,f['dataType']) for v in others)
  expected=norm(f['value']) if f['value'] is not None else ''
  unbound=captured and not checks['relation'] and len(expected)>=4 and re.search(r'(?<![\w.])'+re.escape(expected)+r'(?![\w])',haystack) is not None
  fabricated=not captured and o.get('observed') is not None
  rows.append({'fieldId':f['id'],'entityId':f['entityId'],'field':f['name'],'required':f['required'],'availability':f.get('availability','captured'),'expected':f['value'],**o,'checks':checks,'fullyCorrect':complete,'independentlySourceLocatable':locatable,'wrongRecord':wrong_record,'unboundValuePresent':unbound,'fabricated':fabricated,'sourceEvidence':f['evidence'],'contextEvidence':{k:case[k].get(f.get(ref)) for k,ref in [('units','unitRef'),('dates','dateRef'),('periods','periodRef')]}})
 cap=[r for r in rows if r['availability']=='captured']
 def known(label):return sum(r['checks'][label] is not None and r['contextEvidence'][label+'s'] is not None and r['contextEvidence'][label+'s']['state']=='known' for r in cap)
 totals={'fieldSlots':len(rows),'requiredFields':sum(f['required'] for f in rows),'observedFields':sum(r.get('observed') is not None for r in rows),'valueCorrect':sum(r['checks']['value'] and r['checks']['entity'] for r in rows),'fullyCorrect':sum(r['fullyCorrect'] for r in rows),'requiredFullyCorrect':sum(r['required'] and r['fullyCorrect'] for r in rows),'sourceLocatable':sum(r['independentlySourceLocatable'] for r in rows),'duplicateSelectedRecords':sum(duplicates.values()),
  'capturedFields':len(cap),'requiredCaptured':sum(r['required'] for r in cap),'requiredNotCaptured':sum(r['required'] for r in rows if r['availability']!='captured'),
  'entityMatched':sum(r['checks']['entity'] is True for r in cap),'relationCorrect':sum(r['checks']['relation'] for r in cap),
  'unitKnown':known('unit'),'unitPreserved':sum(r['checks']['unit'] is True and r['contextEvidence']['units'] is not None and r['contextEvidence']['units']['state']=='known' for r in cap),
  'dateKnown':known('date'),'datePreserved':sum(r['checks']['date'] is True and r['contextEvidence']['dates'] is not None and r['contextEvidence']['dates']['state']=='known' for r in cap),
  'periodKnown':known('period'),'periodPreserved':sum(r['checks']['period'] is True and r['contextEvidence']['periods'] is not None and r['contextEvidence']['periods']['state']=='known' for r in cap),
  'wrongRecord':sum(r['wrongRecord'] for r in rows),'unboundValuePresent':sum(r['unboundValuePresent'] for r in rows),'fabricated':sum(r['fabricated'] for r in rows)}
 deliverable=totals['requiredNotCaptured']==0
 accepted=deliverable and all(r['fullyCorrect'] for r in rows if r['required']) and not totals['duplicateSelectedRecords'] and not totals['fabricated']
 verification=(doc.get('verification') or {}).get('status')
 success=doc.get('status')=='success' and verification!='failed'
 outcome='correct_success' if success and accepted else 'false_success' if success else 'missed' if deliverable else 'correct_non_success'
 kind=None if outcome!='false_success' else 'field_error' if deliverable else 'no_target'
 return {'id':case['id'],'sameSource':same_source,'status':doc.get('status'),'configuredVerification':verification,'readiness':(doc.get('readiness') or {}).get('state'),'totals':totals,'deliverable':deliverable,'taskAccepted':accepted,'outcome':outcome,'falseSuccessKind':kind,'duplicateKeys':duplicates,'rows':rows,'notes':notes,'explicitProductFieldCitation':None,'nonAuthorReview':None}

def upper95(k,n):
 """One-sided 95% upper bound on a proportion: 1-0.05^(1/n) at k=0, Clopper-Pearson otherwise."""
 if not n:return None
 if k==0:return 1-0.05**(1/n)
 if k>=n:return 1.0
 def cdf(p):return sum(math.comb(n,i)*p**i*(1-p)**(n-i) for i in range(k+1))
 lo,hi=k/n,1.0
 for _ in range(200):
  mid=(lo+hi)/2
  if cdf(mid)>0.05:lo=mid
  else:hi=mid
 return (lo+hi)/2

def rate(k,n):return {'k':k,'n':n,'rate':k/n if n else None,'upper95':upper95(k,n)}

def summarize(rows):
 """Error among success results and false success per request are separate denominators."""
 outcomes=Counter(r['outcome'] for r in rows);successes=outcomes['correct_success']+outcomes['false_success'];fs=outcomes['false_success'];totals=Counter()
 for r in rows:totals.update(r['totals'])
 return {'requests':len(rows),'successResults':successes,'falseSuccess':fs,'falseSuccessByKind':dict(Counter(r['falseSuccessKind'] for r in rows if r['falseSuccessKind'])),'outcomes':dict(outcomes),
  'errorAmongSuccess':rate(fs,successes),'falseSuccessPerRequest':rate(fs,len(rows)),'zeroFalseSuccessUpper95':upper95(0,len(rows)),'deliverable':sum(r.get('deliverable',True) for r in rows),'accepted':sum(r.get('taskAccepted',False) for r in rows),'fields':dict(totals)}

def markdown_report(report,values=False):
 """Per-field tables for a run record: one row per captured field, not-captured slots counted per case.
 Expected and observed values are labels and output, so they stay out unless values=True (for .w2l/ only);
 so do entity IDs, which can carry label values (SKUs, product IDs): records are numbered in label order instead."""
 def cut(v,n=48):
  t='∅' if v is None else norm(v).replace('|','\\|');return t if len(t)<=n else t[:n-1]+'…'
 def mark(v):return '✓' if v is True else '✗' if v is False else '–'
 out=['✓ correct, ✗ wrong or missing, – unknown in the source (not scored), · not applicable.'+('' if values else ' Fields are named rN/field, N the record in label order.'),'']
 for r in report['rows']:
  t=r['totals'];out+=[f"### {r['id']} ({r.get('version')}): {r['outcome']}"+(f" ({r['falseSuccessKind']})" if r['falseSuccessKind'] else ''),'',
   f"status `{r['status']}`, verification `{r['configuredVerification']}`, same source {mark(r['sameSource'])}; required fully correct {t['requiredFullyCorrect']}/{t['requiredCaptured']}, all captured {t['fullyCorrect']}/{t['capturedFields']}; duplicates {t['duplicateSelectedRecords']}; required not captured {t['requiredNotCaptured']}, fabricated {t['fabricated']}",'',
   '| Field | Req |'+(' Expected | Observed |' if values else '')+' Value | Subject | Relation | Unit | Date | Period | Fully |','| --- '*(11 if values else 9)+'|']
  order={}
  for f in r['rows']:order.setdefault(f['entityId'],len(order)+1)
  for f in r['rows']:
   if f['availability']!='captured':continue
   label=f['fieldId'].split('/',1)[1] if values else f"r{order[f['entityId']]}/{f['field']}"
   c=f['checks'];ctx=lambda k:'·' if not f['contextEvidence'][k+'s'] or f['contextEvidence'][k+'s']['state']=='not_applicable' else mark(c[k])
   out.append(f"| `{label}` | {'R' if f['required'] else 'o'} |{f" {cut(f['expected'])} | {cut(f.get('observed'))} |" if values else ''} {mark(c['value'])} | {mark(c['entity'])} | {mark(c['relation'])} | {ctx('unit')} | {ctx('date')} | {ctx('period')} | {mark(f['fullyCorrect'])} |")
  out.append('')
 return '\n'.join(out)

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('dataset',type=Path);p.add_argument('outputs',type=Path);p.add_argument('--fixture-origin',required=True);p.add_argument('--out',required=True,type=Path)
 p.add_argument('--versions',default='candidate,control',help='Comma-separated output subdirectories (default: the #562 run).')
 p.add_argument('--markdown',type=Path,help='Also write per-field tables as Markdown (correctness marks only).')
 p.add_argument('--markdown-values',action='store_true',help='Include expected and observed values in the Markdown; keep such files under .w2l/.')
 p.add_argument('--cases',default=','.join(f'H{i:02}' for i in range(1,9)),help='Comma-separated case IDs (default: H01-H08).')
 args=p.parse_args();results=[];versions=args.versions.split(',');cases=args.cases.split(',')
 for version in versions:
  for cid in cases:
   case=json.loads((args.dataset/'cases'/cid/'gold.json').read_text());path=args.outputs/version/(cid+'.json');saved=json.loads(path.read_text()) if path.exists() else {};doc=saved.get('response') or {};r=score_case(case,doc,args.fixture_origin);r['version']=version;r['runError']=saved.get('error');results.append(r)
 report={'schema':'octocrawl.field-acceptance/2','scope':'Retained source snapshots, one fixed SDK call per version/case; no live access or independent human acceptance.','rows':results,'summaries':{}}
 for version in versions:
  subset=[r for r in results if r['version']==version];totals=Counter()
  for row in subset:totals.update(row['totals'])
  groups={g:summarize([r for r in subset if r['id'][0]==g]) for g in sorted({r['id'][0] for r in subset})}
  report['summaries'][version]={'cases':len(subset),'accepted':sum(r['taskAccepted'] for r in subset),'configuredPassed':sum(r['configuredVerification']=='passed' for r in subset),'configuredPassButFieldIncomplete':sum(r['configuredVerification']=='passed' and not r['taskAccepted'] for r in subset),**dict(totals),'byGroup':groups,'all':summarize(subset)}
 args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 if args.markdown:args.markdown.write_text(markdown_report(report,args.markdown_values)+'\n')
 print(json.dumps({v:{k:x for k,x in s.items() if k not in('byGroup','all')} for v,s in report['summaries'].items()},indent=2))
if __name__=='__main__':main()
