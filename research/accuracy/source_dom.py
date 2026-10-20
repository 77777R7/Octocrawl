"""Read captured HTML without the production extractor. Offsets are decoded-text characters."""
from __future__ import annotations
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
import re

VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

def clean(value: str) -> str:
    return ' '.join(unescape(value).split())

class Node:
    def __init__(self, doc: 'Document', tag: str, attrs: list[tuple[str,str|None]], start: int, parent: 'Node|None'):
        self.doc, self.tag, self.attrs, self.start, self.parent = doc,tag,dict(attrs),start,parent
        self.end = start
        self.children: list[Node] = []
        self.parts: list[str|Node] = []
        self.closed = False
        if parent is not None:
            parent.children.append(self);parent.parts.append(self)
    def text(self) -> str:
        if self.tag in {'script','style'}:return ''
        return ' '.join(self._text().split())
    def _text(self) -> str:
        if self.tag in {'script','style'}:return ''
        value=''.join(p._text() if isinstance(p,Node) else p for p in self.parts)
        return '\n'+value+'\n' if self.tag in {'article','div','section','p','h1','h2','h3','h4','h5','h6','li','dt','dd','tr','td','th','br','ul','ol'} else value
    def raw(self) -> str:return self.doc.source[self.start:self.end]
    def all(self, tag: str|None=None, **attrs: str) -> list['Node']:
        rows=[]
        for child in self.children:
            if (tag is None or child.tag==tag) and all(child.attrs.get(k)==v for k,v in attrs.items()):rows.append(child)
            rows.extend(child.all(tag,**attrs))
        return rows
    def classes(self, token: str) -> bool:return token in (self.attrs.get('class') or '').split()
    def path(self) -> str:
        if self.parent is None:return 'document'
        siblings=[n for n in self.parent.children if n.tag==self.tag]
        return self.parent.path()+'/'+self.tag+'['+str(siblings.index(self)+1)+']'
    def ancestor(self, tag: str) -> 'Node|None':
        node=self.parent
        while node is not None:
            if node.tag==tag:return node
            node=node.parent
        return None
    def __repr__(self):return f'<{self.tag} {self.attrs} {self.text()[:100]!r}>'

class Document(HTMLParser):
    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.source=source;self.starts=[0]+[m.end() for m in re.finditer('\n',source)]
        self.root=Node(self,'document',[],0,None);self.stack=[self.root]
        self.feed(source);self.close()
        for node in self.stack:node.end=len(source)
    def position(self):
        line,col=self.getpos();return self.starts[line-1]+col
    def handle_starttag(self,tag,attrs):
        node=Node(self,tag,attrs,self.position(),self.stack[-1]);node.end=node.start+len(self.get_starttag_text())
        if tag not in VOID:self.stack.append(node)
        else:node.closed=True
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if self.stack[-1].tag==tag:self.stack.pop().closed=True
    def handle_endtag(self,tag):
        end=self.source.find('>',self.position())+1
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:
                for node in self.stack[i:]:node.end=end;node.closed=True
                del self.stack[i:];break
    def handle_data(self,data):self.stack[-1].parts.append(data)
    def handle_entityref(self,name):self.stack[-1].parts.append(unescape('&'+name+';'))
    def handle_charref(self,name):self.stack[-1].parts.append(unescape('&#'+name+';'))

def read(path: Path) -> Document:return Document(path.read_bytes().decode('utf-8'))
