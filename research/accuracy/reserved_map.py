"""Output-to-field mappings for reserved set v2 (V01-V42), written and committed before any candidate output on these URLs.

Same rules as the H and D mappings in holdout_score.py: record selection, labels and column headers come from the
frozen task text and the labels the page itself prints; values come only from the delivered output (Markdown,
tables, links, metadata). Records of list, table and dynamic tasks are positional ("the first three records in page
order"), so record k is the k-th record the output shows. A value the output does not carry stays None; nothing is
read from the retained source or the labels.
"""
import re
import holdout_score as hs

RESERVED_CASES={f'V{i:02}' for i in range(1,43)}
DAY=r'(?:\d{4}-\d{2}-\d{2}|\d{4}/\d{2}/\d{2}|\d{1,2}-[A-Za-z]{3}-\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})'
SEP=r'[\s:|*_\-–—]*'
DOI=r'\bDOI\b[\s:]*(?:https?://(?:dx\.)?doi\.org/)?(10\.\d{4,9}/[^\s\])"<>·|]*[^\s\])"<>·|.,;])'
VERSION=r'v?\d+(?:\.\d+)+(?:[a-z]+\d*)?'

def vdate(s):
 """A stated calendar day as ISO, or None when the text states no day (a month alone, a weekday, '2 hours ago')."""
 if s is None:return None
 t=hs.norm(s)
 t=re.sub(r'\b(\d{4})/(\d{2})/(\d{2})\b',r'\1-\2-\3',t)
 t=re.sub(r'\b(\d{1,2})-([A-Za-z]{3})-(\d{4})\b',r'\1 \2 \3',t)
 t=re.sub(r'\bSept\b','Sep',t)
 t=re.sub(r'\b([A-Za-z]{3,9})\.(?=\s)',r'\1',t)
 t=re.sub(r'\b(\d{1,2})\s+([A-Za-z]{3,9}),\s*(\d{4})\b',r'\1 \2 \3',t)
 return hs.date_of(t)

def first_day(scope):
 """The first stated calendar day in scope: (iso, match) or (None, None)."""
 for m in re.finditer(DAY,scope or ''):
  v=vdate(m[0])
  if v:return v,m
 return None,None

def clean(s):return re.sub(r'^(?:#{1,6}|[-*+]|\d+\.)\s+','',hs.norm(hs.IMAGE.sub('',s or '')))
def ltext(t):return hs.norm(hs.IMAGE.sub('',t or '').lstrip('![').rstrip(']')) or None

class Out:
 def __init__(self,case,doc,fixture_origin):
  self.case=case;self.src=case['url'];self.origin=fixture_origin
  self.md=doc.get('markdown') or '';self.text=hs.plain(self.md);self.meta=doc.get('metadata') or {};self.tables=hs.table_views(doc)
  self.lines=self.md.splitlines()
 def find(self,pattern,scope=None,group=1,flags=re.I):
  scope=self.text if scope is None else scope;m=re.search(pattern,scope,flags)
  return (hs.norm(m[group]),f'markdown.text[{m.start()}:{m.end()}]') if m else (None,None)
 def headings(self,max_level=2):
  out=[]
  for i,line in enumerate(self.lines):
   h=re.match(r'^(#{1,6})\s+(.+?)\s*#*\s*$',line.strip())
   if not h or len(h[1])>max_level:continue
   body=h[2].strip();pure_link=re.fullmatch(r'\[[^\]]*\]\([^)]*\)',body) is not None;t=clean(body)
   if t and not pure_link:out.append((i,t))
  return out
 def title(self,max_level=2):
  """The first heading of level <= max_level that is not only a link (a site or section name), else the page's og:title / title."""
  hs_=self.headings(max_level)
  if hs_:return hs_[0][1],f'markdown.line[{hs_[0][0]}]',hs_[0][0]
  for k in ['ogTitle','title']:
   if self.meta.get(k):return hs.norm(self.meta[k]),'metadata.'+k,None
  return None,None,None
 def after(self,line,n=30):
  """Plain text of the n lines after markdown line `line` (the whole text when line is None), with its line offset."""
  start=0 if line is None else line+1;kept=[clean(l) for l in self.lines[start:] if l.strip()][:n]
  return '\n'.join(kept),start
 def links(self,pattern,inside=False):
  return hs.link_records(self.md,pattern,self.src,self.origin,inside)
 def table_with(self,*names):
  """The first table whose first row holds every named header (case-insensitive substring), with its header row."""
  for t in self.tables:
   if not t['rows']:continue
   header=[c.casefold() for c in t['rows'][0]]
   if all(any(n.casefold() in c for c in header) for n in names):return t
  return None

def col(header,name):
 for i,c in enumerate(header):
  if name.casefold() in c.casefold():return i
 return None

def cell(row,i):return row[i] if i is not None and i<len(row) else None

def put_all(put,fields,values,ref,entity=True,units=None,dates=None,periods=None):
 units=units or {};dates=dates or {};periods=periods or {}
 for f in fields:
  n=f['name'];put(f,values.get(n),ref if values.get(n) is not None else None,unit=units.get(n),date=dates.get(n),period=periods.get(n),entity=entity)

def records(put,case,recs,fn,duplicates):
 """recs: the output's records in page order. fn(record) -> (values, ref, units, dates, periods). Record k serves entity '<kind>-k'."""
 keys=[r.get('key') for r in recs]
 by={}
 for f in case['fields']:by.setdefault(f['entityId'],[]).append(f)
 for eid,fields in by.items():
  m=re.search(r'-(\d+)$',eid)
  if not m:continue
  k=int(m[1])-1;r=recs[k] if k<len(recs) else None
  if r is None:put_all(put,fields,{},None,entity=False);continue
  if r.get('key') is not None:duplicates[eid]=keys[k+1:].count(r['key'])
  values,ref,units,dates,periods=fn(r)
  put_all(put,fields,values,ref,units=units,dates=dates,periods=periods)

def byline(window):
 """The first line of window that states a day: (iso, rest of that line, previous non-empty line)."""
 lines=window.split('\n');prev=None
 for line in lines:
  v,m=first_day(line)
  if v:return v,hs.norm(line[:m.start()]+' '+line[m.end():]).strip(' ·|-–,'),prev
  if line.strip():prev=line.strip()
 return None,None,None

def article(o,put,case):
 title,tref,tl=o.title();window,_=o.after(tl,25);f={x['name']:x for x in case['fields']};cid=case['id'];v={};d=None;dref=None;aref=None
 if cid=='V01':
  d,rest,prev=byline(window);line=rest if rest and re.search(r'[A-Za-z]',rest) else prev
  names=[hs.norm(x) for x in re.split(r'\s*,\s*|\s+and\s+',line or '') if hs.norm(x)] if d else []
  v={'author_1':names[0] if names else None,'author_2':names[1] if len(names)>1 else None};aref=dref=f'markdown.after-title[{tl}]'
 elif cid=='V02':
  d,rest,_=byline(window);v={'author':rest or None};aref=dref=f'markdown.after-title[{tl}]'
 elif cid=='V03':
  author=None
  for l in o.lines[(tl or -1)+1:(tl or -1)+15]:
   if l.strip() and '[' not in l and '![' not in l and not first_day(l)[0]:author=clean(l);break
  v={'author':author};aref=f'markdown.after-title[{tl}]'
  raw,dref=o.find(r'Last Updated'+SEP+'('+DAY+')');d=vdate(raw)
  if not d and o.meta.get('modifiedTime'):d=vdate(o.meta['modifiedTime']) or hs.date_of(o.meta['modifiedTime']);dref='metadata.modifiedTime'
  rd=vdate(title) if title else None
  if 'release_date' in f:put(f['release_date'],rd,tref if rd else None,date=rd,entity=title is not None)
 elif cid=='V04':
  raw,dref=o.find(r'Published'+SEP+'('+DAY+')');d=vdate(raw)
  body,sref=hs.section(o.md,r'Authors?')
  author=next((clean(l) for l in body.splitlines() if clean(l)),None) if sref else None
  v={'author':author};aref=sref
 elif cid=='V05':
  m=re.search(r'\bBy\s+(.+?)\s*\|\s*('+DAY+r'|[A-Za-z]+,\s*'+DAY+')',window)
  v={'author':hs.norm(m[1]) if m else None};d=vdate(m[2]) if m else None;aref=dref=f'markdown.after-title[{tl}]'
 elif cid=='V06':
  m=re.search(r'\[([^\]]+)\]\([^)]*/author/[^)]*\)','\n'.join(o.lines[(tl or 0)+1:(tl or 0)+25]))
  v={'author':clean(m[1]) if m else None};aref=f'markdown.after-title[{tl}]'
  before='\n'.join(clean(l) for l in o.lines[max(0,(tl or 0)-6):(tl or 0)]) if tl is not None else ''
  d,_=first_day(before);dref=f'markdown.before-title[{tl}]'
 elif cid=='V07':
  m=re.search(r'^\s*By\s+(.+?)\s*$',window,re.M);v={'author':hs.norm(m[1]) if m else None};aref=f'markdown.after-title[{tl}]'
  d,_=first_day(window);dref=aref
 if not d and o.meta.get('publishedTime') and 'published' in f:d=hs.date_of(o.meta['publishedTime']) or vdate(o.meta['publishedTime']);dref='metadata.publishedTime'
 date_field=next((n for n in ['published','updated'] if n in f),None)
 for n,fld in f.items():
  if n=='title':put(fld,title,tref,entity=title is not None)
  elif n==date_field:put(fld,d,dref if d else None,date=d,entity=title is not None)
  elif n in v:put(fld,v[n],aref if v[n] else None,entity=title is not None)

def money(scope,symbol):
 m=re.search(symbol+r'\s*(\d[\d,]*(?:\.\d{2})?)',scope or '')
 return (hs.amount(m[1]),m) if m else (None,None)

def product(o,put,case):
 name,nref,nl=o.title();window,_=o.after(nl,40);cid=case['id'];f={x['name']:x for x in case['fields']};v={};units={}
 usd='USD' if re.search(r'\bUSD\b',window) else None
 if cid=='V08':
  v['product_id']=o.find(r'Product ID'+SEP+r'(\d+)',window)[0];v['price'],_=money(window,r'\$');units['price']=usd
  v['availability']=o.find(r'\b(In stock|Out of stock|Sold out|Coming soon)\b',window)[0]
 elif cid=='V09':
  v['sku']=o.find(r'\bSKU'+SEP+r'([\w-]+)',window)[0];v['price'],_=money(window,r'\$');units['price']=usd
  v['availability']=o.find(r'\b(In stock|Out of stock|Sold out|Backorder)\b',window)[0]
 elif cid=='V10':
  v['product_code']=o.find(r'Product code'+SEP+r'([\w-]+)',window)[0];v['price'],m=money(window,r'€');units['price']='EUR' if m else None
  v['tax_basis']=o.find(r'\b((?:Ex|Excl|Incl)\.?\s+VAT)\b',window)[0]
 elif cid=='V11':
  v['price'],m=money(o.text,r'S\$');units['price']='SGD' if m else None
  raw,_=o.find(r'Release Date'+SEP+'('+DAY+')');v['release_date']=vdate(raw)
 elif cid=='V12':
  v['price'],m=money(window,r'\$');units['price']='USD' if m and re.search(r'\bUSD\b',o.text) else None
  raw,_=o.find(r'Release date'+SEP+'('+DAY+')');v['release_date']=vdate(raw)
 elif cid=='V13':
  v['product_number']=o.find(r'Product number'+SEP+r'([\w-]+)')[0];v['price'],m=money(window,r'€');units['price']='EUR' if m else None
  v['tax_basis']=o.find(r'(Prices?\s+incl\.?\s+VAT[^\n]*?shipping costs)',window)[0]
  v['availability']=o.find(r'\b(Available\s*·\s*[^·\n]+?\s*·\s*\d+(?:-\d+)?\s+days?)\b',window)[0]
 elif cid=='V14':
  m=re.search(r'\[([^\]]+)\]\([^)]*/authors/[^)]*\)','\n'.join(o.lines[(nl or 0)+1:(nl or 0)+40]));v['author']=clean(m[1]) if m else None
  e=re.search(r'\beBook\b[^$]{0,80}\$\s*(\d[\d,]*\.\d{2})\s*\$\s*(\d[\d,]*\.\d{2})',o.text)
  prices=sorted({hs.amount(x) for x in (e.groups() if e else []) if hs.amount(x)},key=lambda p:float(p))
  if prices:v['ebook_price']=prices[0];v['ebook_list_price']=prices[-1] if len(prices)>1 else None
  units['ebook_price']=units['ebook_list_price']=usd
 ref=f'markdown.after-title[{nl}]'
 for n,fld in f.items():
  if n=='name':put(fld,name,nref,entity=name is not None);continue
  val=v.get(n);put(fld,val,ref if val is not None else None,unit=units.get(n),date=val if n=='release_date' else None,entity=name is not None)

def region_lines(r):return [clean(l) for l in r['region'].splitlines() if clean(l)]

def listing(o,put,case,duplicates):
 cid=case['id']
 if cid=='V15':
  recs=[]
  for i,line in enumerate(o.lines):
   for m in re.finditer(r'\[([^\]]*)\]\((<?[^\s)]*lists\.debian\.org/debian-security-announce/\d{4}/msg\d+\.html>?)\)',line):
    recs.append({'key':m[2],'line':line,'text':clean(m[1]),'url':hs.rebase_url(m[2],o.src,o.origin),'ref':f'markdown.line[{i}]'})
  def fn(r):
   p=re.match(r'((?:DSA|DLA)-\d+(?:-\d+)?)\s+(.+)$',r['text']);d=vdate(re.search(r'\[('+DAY+r')\]',hs.plain(r['line']))[1]) if re.search(r'\[('+DAY+r')\]',hs.plain(r['line'])) else None
   return {'advisory_id':p[1] if p else None,'package':hs.norm(p[2]) if p else None,'url':r['url'],'date':d},r['ref'],{},{'date':d},{}
 elif cid=='V16':
  recs=o.links(r'/security/notices/(USN-\d+-\d+)/?$')
  def fn(r):
   t=ltext(r['texts'][0]) or '';p=re.match(r'(USN-\d+-\d+)\s*:\s*(.+)$',t);d,_=first_day(hs.plain(r['region']))
   return {'notice_id':p[1] if p else None,'title':p[2] if p else None,'url':r['url'],'published':d},r['ref'],{},{'published':d},{}
 elif cid=='V17':
  recs=[r for r in o.links(r'/about/news/[^/?#]+/?$') if re.search(r'Posted on',hs.plain(r['region']))];tags={clean(t) for t in re.findall(r'\[([^\]]+)\]\([^)]*/about/newsarchive/[^/)]+/?\)',o.md) if clean(t)}
  def fn(r):
   t=ltext(r['texts'][0]);text='\n'.join(region_lines(r));m=re.search(r'Posted on\s*('+DAY+r')\s*by\s+([^\n]+)',text);d=vdate(m[1]) if m else None;by=hs.norm(m[2]) if m else None
   for tag in sorted(tags,key=len,reverse=True):
    if by and by.endswith(' '+tag):by=by[:-len(tag)].strip();break
   return {'title':t,'url':r['url'],'posted':d,'posted_by':by},r['ref'],{},{'posted':d},{}
 elif cid=='V18':
  t=o.table_with('date','advisory');recs=[]
  if t:
   h=t['rows'][0];di,ni=col(h,'date'),col(h,'advisory')
   for ri,row in enumerate(t['rows'][1:],1):
    name=cell(row,ni)
    if name:
     m=re.search(r'\[\s*'+re.escape(name)+r'\s*\]\((<?[^\s)]+>?)\)',o.md);recs.append({'key':name,'name':name,'date':vdate(cell(row,di)),'url':hs.rebase_url(m[1],o.src,o.origin) if m else None,'ref':f'{t["ref"]}.rows[{ri}]'})
  def fn(r):return {'advisory_name':r['name'],'url':r['url'],'date':r['date']},r['ref'],{},{'date':r['date']},{}
 elif cid=='V19':
  recs=o.links(r'/abs/(\d{4}\.\d{4,5})(?:v\d+)?$')
  def fn(r):
   t=ltext(r['texts'][0]) or '';aid=re.search(r'(arXiv:\d{4}\.\d{4,5})',t);text='\n'.join(region_lines(r))
   title=re.search(r'Title:\s*([^\n]+)',text);auth=re.search(r'\[([^\]]+)\]\([^)]*searchtype=author[^)]*\)',r['region'])
   return {'arxiv_id':aid[1] if aid else None,'title':hs.norm(title[1]) if title else None,'first_author':clean(auth[1]) if auth else None},r['ref'],{},{},{}
 elif cid=='V20':
  recs=o.links(r'/en/news/\d{4}/\d{2}/\d{2}/[^/?#]+/?$')
  def fn(r):
   text='\n'.join(region_lines(r));m=re.search(r'Posted by\s+(.+?)\s+on\s+('+DAY+')',text);d=vdate(m[2]) if m else None
   return {'title':ltext(r['texts'][0]),'url':r['url'],'author':hs.norm(m[1]) if m else None,'posted':d},r['ref'],{},{'posted':d},{}
 elif cid=='V21':
  recs=o.links(r'/en/blog/[^/?#]+/[^/?#]+$')
  def fn(r):
   lines=region_lines(r);d=None;author=None
   for i,l in enumerate(lines):
    v,dm=first_day(l)
    if v:
     d=v;head=l[:dm.start()].strip()
     if re.search(r'[A-Za-z]',head):author=head;break
     author=next((x for x in reversed(lines[:i]) if not x.startswith('[') and x!=r['name']),None);break
   return {'title':r['name'],'url':r['url'],'author':author,'published':d},r['ref'],{},{'published':d},{}
 records(put,case,recs,fn,duplicates)

def table_case(o,put,case,duplicates):
 cid=case['id'];recs=[]
 spec={'V22':('Release','Released','Security Support','Latest'),'V23':('Branch','Status','First release','End of life'),'V24':('Country','Population','Yearly Change','Land Area'),
  'V27':('Branch','Initial Release','Active Support','Security Support'),'V28':('Version','Current minor','First Release','Final Release')}
 if cid in spec:
  t=o.table_with(*spec[cid])
  if t:
   h=t['rows'][0];idx=[col(h,n) for n in spec[cid]]
   for ri,row in enumerate(t['rows'][1:],1):
    if cell(row,idx[0]):recs.append({'key':cell(row,idx[0]),'cells':[cell(row,i) for i in idx],'header':[cell(h,i) for i in idx],'ref':f'{t["ref"]}.rows[{ri}]'})
  def fn(r):
   c=r['cells']
   if cid=='V22':
    lv=re.search(VERSION,c[3] or '');d1,d2=vdate(c[1]),vdate(c[2])
    return {'cycle':c[0],'released':d1,'security_support_until':d2,'latest_version':lv[0] if lv else None},r['ref'],{},{'released':d1,'security_support_until':d2},{}
   if cid=='V23':
    d1=vdate(c[2]);mo=hs.month_only(c[3]) if c[3] else None
    return {'branch':c[0],'status':c[1],'first_release':d1,'end_of_life':mo},r['ref'],{},{'first_release':d1,'end_of_life':mo},{}
   if cid=='V24':
    year=re.search(r'\b(\d{4})\b',r['header'][1] or '');unit=re.search(r'\(([^)]+)\)',r['header'][3] or '');ch=hs.norm(c[2] or '')
    return ({'country':c[0],'population':c[1],'yearly_change':ch.rstrip('%').strip() or None,'land_area':c[3]},r['ref'],
     {'yearly_change':'%' if ch.endswith('%') else None,'land_area':unit[1] if unit else None},{},{'population':year[1] if year else None})
   d=[vdate(x) for x in c[1:]]
   return dict(zip(['branch','initial_release','active_support_until','security_support_until'] if cid=='V27' else ['version','current_minor','first_release','final_release'],[c[0],*(d if cid=='V27' else [c[1],d[1],d[2]])])),r['ref'],{},(dict(zip(['initial_release','active_support_until','security_support_until'],d)) if cid=='V27' else {'first_release':d[1],'final_release':d[2]}),{}
 elif cid=='V25':
  for t in o.tables:
   rows=t['rows']
   if not rows:continue
   dates=[(i,vdate(c)) for i,c in enumerate(rows[0]) if vdate(c)]
   if not dates:continue
   i,latest=max(dates,key=lambda x:x[1]);unit=t['caption'] or None
   for ri,row in enumerate(rows[1:],1):
    if row and row[0] and not vdate(row[0]):recs.append({'key':row[0],'currency':row[0],'rate':cell(row,i),'unit':unit,'date':latest,'ref':f'{t["ref"]}.rows[{ri}]'})
   break
  def fn(r):return {'currency':r['currency'],'rate':r['rate']},r['ref'],{'rate':r['unit']},{'rate':r['date']},{}
 elif cid=='V26':
  for t in o.tables:
   for ri,row in enumerate(t['rows']):
    if row and re.fullmatch(r'[a-z][a-z-]*:',row[0] or ''):recs.append({'key':None,'cells':row,'ref':f'{t["ref"]}.rows[{ri}]'})
   if recs:break
  def fn(r):
   c=r['cells'];d=vdate(cell(c,2))
   return {'kind':c[0].rstrip(':'),'version':cell(c,1),'released':d},r['ref'],{},{'released':d},{}
 records(put,case,recs,fn,duplicates)

def dynamic(o,put,case,duplicates):
 cid=case['id'];recs=[]
 if cid=='V29':
  hits=[(m,hs.rebase_url(m[2],o.src,o.origin)) for m in hs.LINK.finditer(o.md)]
  for k,(m,url) in enumerate(hits):
   if k+1<len(hits) and re.search(r'/from\?site=',hits[k+1][1] or ''):recs.append({'key':url,'url':url,'title':clean(m[1]),'start':m.start()})
  for k,r in enumerate(recs):r['region']=hs.plain(o.md[r['start']:recs[k+1]['start'] if k+1<len(recs) else len(o.md)]);r['ref']=f'markdown.chars[{r["start"]}:]'
  def fn(r):
   p=re.search(r'\b(\d+)\s+(points?)\b',r['region']);d,_=first_day(r['region'])
   return {'title':r['title'],'url':r['url'],'points':p[1] if p else None,'submitted':d},r['ref'],{'points':'points' if p else None},{'submitted':d,'points':d},{}
 elif cid=='V30':
  recs=o.links(r'/incidents/([a-z0-9]+)/?$')
  def fn(r):
   imp=re.search(r'\b(critical|major|minor|none|maintenance)\b',hs.plain(r['region']),re.I)
   return {'name':r['name'],'impact':imp[1].lower() if imp else None},r['ref'],{},{},{}
 elif cid=='V31':
  recs=o.links(r'/incidents/([a-z0-9]+)/?$',inside=True)
  states=r'(Investigating|Identified|Monitoring|Resolved|Scheduled|In progress|Verifying|Completed|Postmortem)'
  def fn(r):
   text=hs.plain(r['region']);imp=re.search(r'\b(Critical|Major|Minor)\b',text);st=re.search(r'\b'+states+r'\b',text)
   title=ltext(r['texts'][0]) or '';cut=re.search(r'\s*\b(?:(?:Critical|Major|Minor)\s+)?'+states+r'\b',title)
   title=(title[:cut.start()] if cut else re.sub(r'\s+[A-Za-z]{3}\s+\d{1,2},\s*\d{4},?\s*\d{1,2}:\d{2}.*$','',title)).strip() or None
   sm=re.search(r'\bStart(?:ed|s)?\b'+SEP+'('+DAY+')',text);d=vdate(sm[1]) if sm else None
   return {'title':title,'state':st[1] if st else None,'impact':imp[1] if imp else None,'started':d},r['ref'],{},{'started':d},{}
 elif cid=='V32':
  raw,_=o.find(r'Last Update'+SEP+r'(?:[\d:]+\s*[ap]m\s+[A-Z]{2,4}\s+)?('+DAY+')');issued=vdate(raw)
  lines=[clean(l) if not l.lstrip().startswith('![') else '![' for l in o.lines]
  temps=[i for i,l in enumerate(lines) if re.search(r'\b(?:High|Low)\s*:?\s*-?\d+\s*°\s*F\b',l)]
  for k,i in enumerate(temps):
   j=i-1
   while j>=0 and (not lines[j] or lines[j]=='!['):j-=1
   nxt=temps[k+1] if k+1<len(temps) else len(lines);block=[l for l in lines[i+1:nxt] if l and l!='![']
   desc=' '.join(block[:-1]) if k+1<len(temps) else (block[0] if block else None)
   m=re.search(r'(-?\d+)\s*°\s*F',lines[i]);recs.append({'key':None,'period':lines[j] if j>=0 else None,'temp':m[1],'desc':desc or None,'ref':f'markdown.lines[{j}:{nxt}]'})
  for f in case['fields']:
   if f['entityId']=='issue':put(f,issued,'markdown.text' if issued else None,date=issued)
  case=dict(case,fields=[f for f in case['fields'] if f['entityId']!='issue'])
  def fn(r):return {'period':r['period'],'temperature':r['temp'],'short_description':r['desc']},r['ref'],{'temperature':'°F'},{'temperature':issued},{'temperature':r['period']}
 elif cid=='V33':
  name,ref,_=o.title(1);m=re.fullmatch(r'(\S+)\s+('+VERSION+')',name or '');raw,dref=o.find(r'Released'+SEP+'('+DAY+')');d=vdate(raw)
  for f in case['fields']:
   n=f['name'];val={'name':m[1] if m else name,'latest_version':m[2] if m else None,'released':d}.get(n);put(f,val,(dref if n=='released' else ref) if val else None,date=d if n=='released' else None,entity=name is not None)
  return
 elif cid=='V34':
  t=o.table_with('USD');i=col(t['rows'][0],'1.00') if t else None;unit=cell(t['rows'][0],i) if t else None
  e=re.search(r'Top 10',o.text);d,_=first_day(o.text[e.end():e.end()+200]) if e else (None,None)
  if t:recs=[{'key':row[0],'currency':row[0],'rate':cell(row,i),'ref':f'{t["ref"]}.rows[{ri}]'} for ri,row in enumerate(t['rows'][1:],1) if row and row[0]]
  def fn(r):return {'currency':r['currency'],'rate':r['rate']},r['ref'],{'rate':unit},{'rate':d},{}
 elif cid=='V35':
  celsius='degrees Celsius' if re.search(r'degrees Celsius',o.text) else None
  for m in re.finditer(r'Maximum minimum temperature\s*:?\s*(-?\d+)\s*°?\s*/\s*(-?\d+)\s*°?',o.text):
   before=o.text[max(0,(recs[-1]['end'] if recs else 0)):m.start()];day=None
   for dm in re.finditer(r'(?:\d{4}-\d{2}-\d{2}|'+DAY+')',before):day=vdate(dm[0]) or day
   recs.append({'key':None,'max':m[1],'min':m[2],'date':day,'end':m.end(),'ref':f'markdown.text[{m.start()}:{m.end()}]'})
  def fn(r):return {'date':r['date'],'max_temperature':r['max'],'min_temperature':r['min']},r['ref'],{'max_temperature':celsius,'min_temperature':celsius},{'date':r['date'],'max_temperature':r['date'],'min_temperature':r['date']},{}
 records(put,case,recs,fn,duplicates)

def document(o,put,case):
 cid=case['id'];title,tref,tl=o.title();window,_=o.after(tl,60);t=o.text;v={};dates={}
 if cid=='V36':
  m=re.search(r'Authors/Creators\s*\n+\s*([^\n]+)',t);v['first_creator']=re.sub(r'\s*\d+(?:\s*,\s*\d+)*$','',clean(m[1])) if m else None
  raw,_=o.find(r'Published\s+('+DAY+')');v['published']=vdate(raw);v['version']=o.find(r'\bVersion\s+('+VERSION+r')\b')[0];v['doi']=o.find(DOI)[0]
 elif cid=='V37':
  m=re.fullmatch(r'PEP\s+(\d+)\s*[–—-]\s*(.+)',title or '');v['number']=m[1] if m else None;title=m[2] if m else title
  a=re.search(r'(?m)^\s*Author'+SEP+r'([^<,\n]+)',t);v['first_author']=hs.norm(a[1]) if a else None
  v['status']=o.find(r'(?m)^\s*Status'+SEP+r'([A-Z][A-Za-z-]*)',t,flags=0)[0];v['type']=o.find(r'(?m)^\s*Type'+SEP+r'([A-Z][A-Za-z-]*)',t,flags=0)[0]
  raw,_=o.find(r'(?m)^\s*Created'+SEP+'('+DAY+')');v['created']=vdate(raw)
 elif cid=='V38':
  head=title or '';m=re.match(r'(.+?)\s+(RFC\s+\d+)\b',head)
  v['rfc_number']=(m[2] if m else o.find(r'\b(RFC\s+\d+)\b',head+'\n'+window,flags=0)[0]);title=m[1] if m else title
  v['std_alias']=o.find(r'\b(STD\s+\d+)\b',window,flags=0)[0]
  st=re.search(r'\bRFC\s*-\s*(Internet Standard|Proposed Standard|Draft Standard|Informational|Experimental|Best Current Practice|Historic)\b\s*(?:\(([A-Z][a-z]+\s+\d{4})\))?',t)
  v['status']=st[1] if st else None;v['published']=st[2] if st and st[2] else None;dates['published']=v['published']
  author=None
  for tb in o.tables:
   for row in tb['rows']:
    if 'Authors' in row:
     rest=[c for c in row[row.index('Authors')+1:] if c];author=hs.norm(re.split(r',',rest[0])[0]) if rest else None;break
   if author:break
  if not author:author=o.find(r'\bAuthors?'+SEP+r'([A-Z]\.(?:\s*[A-Z]\.)*\s+[A-Z][\w\'-]+)',t,flags=0)[0]
  v['first_author']=author
 elif cid=='V39':
  m=re.search(r'An edition of\s+(.+?)\s*\((\d{4})\)',t);v['work_title']=hs.norm(m[1]) if m else None;v['first_published']=m[2] if m else None;dates['first_published']=v['first_published']
  a=re.search(r'^\s*by\s+(.+?)\s*$',window,re.M);v['author']=hs.norm(a[1]) if a else None;v['edition_title']=title
 elif cid=='V40':
  v['published'],_=first_day(window);v['doi']=o.find(DOI,window)[0];v['osti_id']=o.find(r'OSTI ID'+SEP+r'(\d+)',window)[0]
  a=re.search(r"([A-Z][\w'-]+(?:\s[A-Z][\w'-]+)*,\s*[A-Z][\w.' -]*?)\s*\[\d+\]",window);v['first_author']=hs.norm(a[1]) if a else None
 elif cid=='V41':
  th=next((t_ for _,t_ in o.headings() if t_.startswith('Title:')),None);title=re.sub(r'^Title:\s*','',th or title or '') or None
  a=re.search(r'Authors?:\s*([^,\n]+)',t);v['first_author']=hs.norm(a[1]) if a else None
  raw,_=o.find(r'Submitted on\s+('+DAY+')');v['submitted']=vdate(raw);v['arxiv_id']=o.find(r'\barXiv:(\d{4}\.\d{4,5})\b')[0]
  v['primary_subject']=o.find(r'Subjects'+SEP+r'([^;\n|]+?\([a-z-]+\.[A-Z]{2}\))')[0]
 elif cid=='V42':
  m=re.search(r'\b([A-Z][\w&]*(?:\s[A-Z][\w&]*)*)\s+volume\s+(\d+)\b',re.sub(r'[*_]','',t));v['journal']=hs.norm(m[1]) if m else None;v['volume']=m[2] if m else None
  raw,_=o.find(r'Published'+SEP+'('+DAY+')');v['published']=vdate(raw);v['doi']=o.find(DOI)[0]
 for n in ['published','created','submitted']:
  if n in v:dates[n]=v[n]
 for f in case['fields']:
  n=f['name'];val=title if n in ['title','edition_title'] and n not in v else v.get(n)
  put(f,val,(tref if n in ['title','edition_title'] else 'markdown.text') if val is not None else None,date=dates.get(n),entity=title is not None)

def v_mapped(case,doc,fixture_origin,put,duplicates):
 o=Out(case,doc,fixture_origin);n=int(case['id'][1:])
 if n<=7:article(o,put,case)
 elif n<=14:product(o,put,case)
 elif n<=21:listing(o,put,case,duplicates)
 elif n<=28:table_case(o,put,case,duplicates)
 elif n<=35:dynamic(o,put,case,duplicates)
 else:document(o,put,case)
