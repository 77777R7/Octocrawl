import { describe, expect, it } from 'vitest'
import { classifyContentType, decodeFileText, detectFile, responseFileName } from '../src/index.js'

const bytes = (text: string) => Uint8Array.from(text, char => char.charCodeAt(0))
const PDF = bytes('%PDF-1.7\n1 0 obj\n')
const ZIP = bytes('PK\u0003\u0004\u0014\u0000')
const OLE = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])

describe('file detection', () => {
  it('reads the kind from the Content-Type, parameters and case aside', () => {
    expect(classifyContentType('Application/PDF')).toEqual({ kind: 'pdf' })
    expect(classifyContentType('text/csv; charset=windows-1252')).toEqual({ kind: 'csv' })
    expect(classifyContentType('application/ld+json')).toEqual({ kind: 'json' })
    expect(classifyContentType('application/vnd.sdmx.data+csv;version=1.0.0')).toEqual({ kind: 'csv' })
    expect(classifyContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toEqual({ kind: 'xlsx' })
    expect(classifyContentType('application/vnd.ms-excel')).toEqual({ kind: 'xls' })
    expect(classifyContentType('application/x-zip-compressed')).toEqual({ kind: 'zip' })
    expect(classifyContentType(null)).toBe('maybe_file')
    expect(classifyContentType('application/octet-stream')).toBe('maybe_file')
    expect(classifyContentType('image/png')).toBe('unsupported')
    expect(classifyContentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('unsupported')
    expect(classifyContentType('text/html; charset=utf-8')).toBe('page')
    expect(classifyContentType('application/xml')).toBe('page')
  })

  it('lets the bytes decide where the Content-Type does not say', () => {
    expect(detectFile('application/pdf', bytes('<html>'), 'a.pdf')).toEqual({ kind: 'pdf', detectedBy: 'content_type' })
    expect(detectFile('application/octet-stream', PDF, 'download')).toEqual({ kind: 'pdf', detectedBy: 'content' })
    expect(detectFile(null, new Uint8Array([...bytes('\n'.repeat(500)), ...PDF]), 'x')).toEqual({ kind: 'pdf', detectedBy: 'content' })
    expect(detectFile('text/html', PDF, 'report')).toEqual({ kind: 'pdf', detectedBy: 'content' })
    expect(detectFile('application/octet-stream', ZIP, 'book.xlsx')).toEqual({ kind: 'xlsx', detectedBy: 'content' })
    expect(detectFile('binary/octet-stream', ZIP, 'bundle')).toEqual({ kind: 'zip', detectedBy: 'content' })
    expect(detectFile('application/octet-stream', OLE, 'sheet.xls')).toEqual({ kind: 'xls', detectedBy: 'content' })
    expect(detectFile('application/octet-stream', bytes('a,b\n1,2\n'), 'table.csv')).toEqual({ kind: 'csv', detectedBy: 'content' })
    expect(detectFile('application/octet-stream', OLE, 'unknown.bin')).toBeNull()
    expect(detectFile(null, bytes('<!doctype html><p>page</p>'), 'index.csv')).toBeNull()
    expect(detectFile('text/plain', bytes('<!DOCTYPE html><html><body>page</body></html>'), 'a.txt')).toBeNull()
    expect(detectFile('text/html', bytes('<!doctype html>'), 'a.pdf')).toBeNull()
    expect(detectFile('video/mp4', new Uint8Array(), 'clip.mp4')).toBe('unsupported')
  })

  it('names the file from Content-Disposition, else the URL path', () => {
    expect(responseFileName('https://a.example/get?id=1', 'attachment; filename="data 2024.csv"')).toBe('data 2024.csv')
    expect(responseFileName('https://a.example/get', "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf")).toBe('résumé.pdf')
    expect(responseFileName('https://a.example/files/Report%202025.pdf', null)).toBe('Report 2025.pdf')
  })
})

describe('decodeFileText', () => {
  it('decodes by byte-order mark, declared charset or UTF-8, and drops the mark', () => {
    expect(decodeFileText(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61, 0x2c, 0x62]), null)).toEqual({ text: 'a,b', encoding: 'utf-8' })
    expect(decodeFileText(Uint8Array.from([0xff, 0xfe, 0x61, 0x00]), 'text/csv; charset=utf-8')).toEqual({ text: 'a', encoding: 'utf-16le' })
    expect(decodeFileText(Uint8Array.from([0x63, 0x61, 0x66, 0xe9]), 'text/csv; charset="ISO-8859-1"')).toEqual({ text: 'café', encoding: 'windows-1252' })
  })

  it('returns nothing rather than a guess when the bytes are not valid text', () => {
    expect(decodeFileText(Uint8Array.from([0x63, 0x61, 0x66, 0xe9]), 'text/csv')).toBeNull()
    expect(decodeFileText(bytes('a,b'), 'text/csv; charset=x-no-such-charset')).toBeNull()
  })
})
