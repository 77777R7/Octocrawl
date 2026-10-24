import { describe, expect, it } from 'vitest'
import type { FetchResult, JsonFormatRequest, ListColumn, ListExtraction, ListFormatRequest, ListTableText } from '@w2l/contracts'
import { extractStructured } from '../src/structured.js'

const url = 'https://example.test/products'
const request: ListFormatRequest = { type: 'list', itemSelector: '.item', fields: [{ name: 'name', selector: 'h2' }, { name: 'price', selector: '.price' }] }
function page(count = 1): FetchResult {
  const list: ListExtraction = { itemSelector: '.item', fields: ['name', 'price'], records: Array.from({ length: count }, (_, index) => ({ values: { name: 'Notebook', price: '$12.00' }, missing: [], source: { url, page: 1, index } })), pages: 1, incomplete: 0, truncated: false, csv: '', csvSha256: '' }
  return { requestedUrl: url, status: 'success', markdown: 'Notebook $12.00', evidence: { finalUrl: url, httpStatus: 200 }, list } as FetchResult
}
const read = (source: FetchResult, format?: JsonFormatRequest) => extractStructured(source, format, {}, null, request)

describe('selected-list JSON scope and bounds', () => {
  it('retains repeated records and their distinct source positions', async () => {
    const source = page(2)
    const out = await read(source)
    expect(out.status).toBe('complete')
    expect((out.data as any).records).toEqual(source.list!.records)
    expect((out.data as any).records.map((r: any) => r.source.index)).toEqual([0, 1])
  })

  it.each(['count', 'characters'] as const)('bounds %s without discarding the original list', async limit => {
    const source = page(limit === 'count' ? 2001 : 1)
    if (limit === 'characters') source.list!.records[0]!.values.price = 'x'.repeat(1_000_001)
    const before = JSON.stringify(source.list)
    const out = await read(source)
    expect(out).toMatchObject({ status: 'incomplete', data: null, evidence: [] })
    expect(out.issues[0]!.message).toMatch(/limit|budget/)
    expect(JSON.stringify(source.list)).toBe(before)
  })

  it.each(['empty', 'truncated', 'multiplePages', 'unrelatedSource', 'blocked'] as const)('does not mark %s input complete', async shape => {
    const source = page(shape === 'empty' ? 0 : 1)
    if (shape === 'truncated') source.list!.truncated = true
    if (shape === 'multiplePages') source.list!.pages = 2
    if (shape === 'unrelatedSource') source.list!.records[0]!.source.url = 'https://other.test/'
    if (shape === 'blocked') source.status = 'blocked'
    const out = await read(source)
    expect(out.status).toBe('incomplete')
    expect(out.issues.length).toBeGreaterThan(0)
  })

  it('preserves an unsettled amount as source text and an unavailable numeric value as null', async () => {
    const source = page()
    source.list!.records[0]!.values.price = '1,299'
    const out = await read(source, { type: 'json', schema: { type: 'object', properties: { price: { type: ['number', 'null'] }, currency: { type: ['string', 'null'] } }, required: ['price', 'currency'] } })
    expect(out).toMatchObject({ status: 'incomplete', data: { price: null, currency: null } })
    expect(out.evidence).toEqual([])
    expect(source.list!.records[0]!.values.price).toBe('1,299')
  })

  it('maps a root array and does not call a model for an ambiguous schema', async () => {
    const array: JsonFormatRequest = { type: 'json', schema: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } }
    expect(await read(page(2), array)).toMatchObject({ status: 'complete', data: [{ name: 'Notebook' }, { name: 'Notebook' }] })
    let calls = 0
    const unsupported: JsonFormatRequest = { type: 'json', modelFallback: true, schema: { type: 'object', properties: { first: array.schema, second: array.schema } } }
    const out = await extractStructured(page(2), unsupported, {}, { baseUrl: 'https://model.invalid', model: 'not-called', fetch: async () => { calls++; throw new Error('no model request allowed') } }, request)
    expect(out).toMatchObject({ status: 'incomplete', data: null, modelUsage: null })
    expect(calls).toBe(0)
  })
})

describe('selected-list JSON from the selected table rows\' columns', () => {
  // Minimized from reserved v2 V23 (devguide.python.org) and V22 (endoflife.date): the list names the first cell only.
  const rows: ListFormatRequest = { type: 'list', itemSelector: 'table > tbody > tr', fields: [{ name: 'branch', selector: 'td' }] }
  const schema = (keys: string[]): JsonFormatRequest => ({ type: 'json', schema: { type: 'object', properties: { records: { type: 'array', items: { type: 'object', properties: Object.fromEntries(keys.map(key => [key, { type: 'string' }])), required: keys } } }, required: ['records'] } })
  function table(columns: FetchResult['listColumns']): FetchResult {
    const branches = ['main', '3.15']
    const list: ListExtraction = { itemSelector: rows.itemSelector!, fields: ['branch'], records: branches.map((branch, index) => ({ values: { branch }, missing: [], source: { url, page: 1, index } })), pages: 1, incomplete: 0, truncated: false, csv: '', csvSha256: '' }
    return { requestedUrl: url, status: 'success', markdown: '', evidence: { finalUrl: url, httpStatus: 200 }, list, listColumns: columns } as FetchResult
  }
  const header = (values: [string, string | null][]) => values.map(([h, value], i) => ({ header: h, column: i + 1, value }))
  const read = (source: FetchResult, format: JsonFormatRequest) => extractStructured(source, format, {}, null, rows)

  it('fills a key the list fields do not name from the column whose header names it, with the column as evidence', async () => {
    const source = table([
      header([['Branch', 'main'], ['Status', 'feature'], ['First release', '2027-10-06'], ['End of life', '2032-10']]),
      header([['Branch', '3.15'], ['Status', 'bugfix'], ['First release', '2026-10-09'], ['End of life', '2031-10']]),
    ])
    const out = await read(source, schema(['branch', 'status', 'first_release', 'end_of_life']))
    expect(out.status).toBe('complete')
    expect(out.data).toEqual({ records: [
      { branch: 'main', status: 'feature', first_release: '2027-10-06', end_of_life: '2032-10' },
      { branch: '3.15', status: 'bugfix', first_release: '2026-10-09', end_of_life: '2031-10' },
    ] })
    expect(out.evidence.find(item => item.path === '/records/1/first_release')).toEqual({ path: '/records/1/first_release', source: 'dom', evidencePath: `${JSON.stringify(url)} page 1 table > tbody > tr record 1 column 3 "First release" text` })
    expect(out.evidence.find(item => item.path === '/records/0/branch')!.evidencePath).toContain('record 0 td text')
  })

  it('keeps a named field\'s own value, and leaves out a key no header names, a column under no text and two columns that state different values', async () => {
    const source = table([
      header([['Branch', 'other'], ['Security Support', 'Ends in 5 years (31 Oct 2031)'], ['Status', null], ['Released', '2026'], ['Released', '2027']]),
      header([['Branch', 'other'], ['Security Support', 'Ends in 4 years (31 Oct 2030)'], ['Status', 'bugfix'], ['Released', '2025'], ['Released', '2025']]),
    ])
    const out = await read(source, schema(['branch', 'security_support_until', 'status', 'released']))
    expect(out.status).toBe('incomplete')
    expect(out.data).toEqual({ records: [{ branch: 'main' }, { branch: '3.15', status: 'bugfix', released: '2025' }] })
    expect(out.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'field_unavailable', path: '/records/0/security_support_until' }),
      expect.objectContaining({ code: 'field_unavailable', path: '/records/0/status' }),
      expect.objectContaining({ code: 'field_ambiguous', path: '/records/0/released' }),
    ]))
    expect(out.issues.some(issue => issue.path === '/records/1/released')).toBe(false)
  })

  it('counts against the JSON budget only the columns a key is read from', async () => {
    const many = 700
    const wide = table(Array.from({ length: many }, () => Array.from({ length: 10 }, (_, i) => ({ header: `Column header ${i}`, column: i + 1, value: `some cell value ${i}`.repeat(4) }))))
    wide.list!.records = Array.from({ length: many }, (_, index) => ({ values: { branch: 'main' }, missing: [], source: { url, page: 1, index } }))
    expect((await read(wide, schema(['branch']))).status).toBe('complete')
    const read2000 = table(Array.from({ length: 2000 }, () => [{ header: 'Status', column: 1, value: 'x'.repeat(600) }]))
    read2000.list!.records = Array.from({ length: 2000 }, (_, index) => ({ values: { branch: 'main' }, missing: [], source: { url, page: 1, index } }))
    const over = await read(read2000, schema(['branch', 'status']))
    expect(over).toMatchObject({ status: 'incomplete', data: null })
    expect(over.issues[0]!.message).toMatch(/budget/)
  })

  it('reads no column when the columns are not those of the selected records', async () => {
    const source = table([header([['Branch', 'main'], ['Status', 'feature']])])
    const out = await read(source, schema(['branch', 'status']))
    expect(out.data).toEqual({ records: [{ branch: 'main' }, { branch: '3.15' }] })
  })
})


describe('selected-list JSON numbers with the unit and as-of date their table states', () => {
  const rows: ListFormatRequest = { type: 'list', itemSelector: 'table > tbody > tr', fields: [{ name: 'currency', selector: 'th' }, { name: 'rate', selector: 'td.highlight' }] }
  const schema = (keys: Record<string, 'string' | 'number'>): JsonFormatRequest => ({ type: 'json', schema: { type: 'object', properties: { records: { type: 'array', items: { type: 'object', properties: Object.fromEntries(Object.entries(keys).map(([key, type]) => [key, { type }])), required: Object.keys(keys) } } }, required: ['records'] } })
  const rates = schema({ currency: 'string', rate: 'number' })
  /** A column as a test writes it: with its table's text inline, which `table` moves to `listTables`. */
  type Column = Omit<ListColumn, 'table'> & { table?: ListTableText }
  type Row = { values: Record<string, string | null>; columns: Column[] | null }
  function table(records: Row[], fields = ['currency', 'rate']): FetchResult {
    const list: ListExtraction = { itemSelector: rows.itemSelector!, fields, records: records.map(({ values }, index) => ({ values, missing: [], source: { url, page: 1, index } })), pages: 1, incomplete: 0, truncated: false, csv: '', csvSha256: '' }
    const listTables: ListTableText[] = []
    const listColumns: FetchResult['listColumns'] = records.map(row => row.columns?.map(({ table: text, ...column }) => {
      if (text === undefined) return column
      if (!listTables.includes(text)) listTables.push(text)
      return { ...column, table: listTables.indexOf(text) }
    }) ?? null)
    const tables: FetchResult['listTables'] = listTables
    return { requestedUrl: url, status: 'success', markdown: '', evidence: { finalUrl: url, httpStatus: 200 }, list, listColumns, listTables: tables } as FetchResult
  }
  const read = (source: FetchResult, format: JsonFormatRequest, request: ListFormatRequest = rows) => extractStructured(source, format, {}, null, request)
  const at = (out: Awaited<ReturnType<typeof read>>, path: string) => out.evidence.find(item => item.path === path)
  const where = (index: number) => `${JSON.stringify(url)} page 1 table > tbody > tr record ${index}`
  /** One record read from one column (the list's `rate`), its header and its table's text as given. */
  const one = (raw: string, column: Column, others: Column[] = []) => table([{ values: { currency: 'Euro', rate: raw }, columns: [{ ...column, value: raw, fields: ['rate'] }, ...others] }])

  // Minimized from reserved v2 V25 (rba.gov.au): the caption states the unit, each column's header its day.
  const v25: ListTableText = { caption: 'Units of Foreign Currencies per Australian Dollar', before: [{ text: 'Latest Exchange Rates', element: 'h2', distance: 1 }] }
  const v25Row = (currency: string, earlier: string, latest: string): Row => ({ values: { currency, rate: latest }, columns: [
    { header: '16 Oct 2026', column: 2, value: earlier, table: v25 },
    { header: '19 Oct 2026', column: 3, value: latest, fields: ['rate'], table: v25 },
  ] })

  it('gives a number read from a column the unit its table\'s caption states and the day its column\'s header is, with where each was read, and leaves the data as read', async () => {
    const out = await read(table([v25Row('United States dollar', '0.6947', '0.6975'), v25Row('Japanese yen', '109.67', '110.27')]), rates)
    expect(out.status).toBe('complete')
    expect(out.issues).toEqual([])
    expect(out.data).toEqual({ records: [{ currency: 'United States dollar', rate: 0.6975 }, { currency: 'Japanese yen', rate: 110.27 }] })
    expect(at(out, '/records/1/rate')).toEqual({
      path: '/records/1/rate', source: 'dom', evidencePath: `${where(1)} td.highlight text`, text: '110.27', normalized: 110.27, conversion: 'number/decimal',
      context: { unit: 'Units of Foreign Currencies per Australian Dollar', date: '2026-10-19' },
      contextEvidence: {
        unit: { text: 'Units of Foreign Currencies per Australian Dollar', evidencePath: `${where(1)} table caption` },
        date: { text: '19 Oct 2026', evidencePath: `${where(1)} column 3 "19 Oct 2026" header` },
      },
    })
    // A text value is not a number its table's unit or date qualifies.
    expect(at(out, '/records/0/currency')).not.toHaveProperty('context')
  })

  it('reads a unit a header states as an amount of a currency, and a date the block just before the table is', async () => {
    // Minimized from reserved v2 V34 (x-rates.com): the inverse column next to it states another unit.
    const v34: ListTableText = { caption: null, before: [{ text: 'Jan 01, 2026 03:50 UTC', element: 'span.ratesTimestamp', distance: 1 }, { text: 'Top 10', element: 'span.ratesTablePopu', distance: 2 }, { text: 'US Dollar Exchange Rates Table Converter', element: 'h1.basicH1', distance: 3 }] }
    const source = table([{ values: { currency: 'Euro', rate: '0.890579' }, columns: [
      { header: 'US Dollar', column: 1, value: 'Euro', fields: ['currency'], table: v34 },
      { header: '1.00 USD', column: 2, value: '0.890579', fields: ['rate'], table: v34 },
      { header: 'inv. 1.00 USD', column: 3, value: '1.122865', table: v34 },
    ] }])
    const out = await read(source, rates)
    expect(out.status).toBe('complete')
    expect(at(out, '/records/0/rate')).toMatchObject({
      context: { unit: '1.00 USD', date: '2026-01-01' },
      contextEvidence: {
        unit: { text: '1.00 USD', evidencePath: `${where(0)} column 2 "1.00 USD" header` },
        date: { text: 'Jan 01, 2026 03:50 UTC', evidencePath: `${where(0)} table, block 1 before it (span.ratesTimestamp)` },
      },
    })
  })

  it('reads a unit from a header\'s bracketed qualifier, for a key read from that column', async () => {
    // Minimized from reserved v2 V24 (worldometers): the key names the header without its qualifier.
    const source = table([{ values: { country: 'India' }, columns: [
      { header: 'Country (or dependency)', column: 2, value: 'India', fields: ['country'] },
      { header: 'Density (P/Km²)', column: 6, value: '518' },
      { header: 'Land Area (Km²)', column: 7, value: '2,973,190' },
    ] }], ['country'])
    const out = await read(source, schema({ country: 'string', land_area: 'number', density: 'number' }), { type: 'list', itemSelector: rows.itemSelector, fields: [{ name: 'country', selector: 'td' }] })
    expect(out.data).toEqual({ records: [{ country: 'India', land_area: 2973190, density: 518 }] })
    expect(at(out, '/records/0/land_area')).toMatchObject({ context: { unit: 'Km²' }, contextEvidence: { unit: { text: 'Land Area (Km²)', evidencePath: `${where(0)} column 7 "Land Area (Km²)" header` } } })
    expect(at(out, '/records/0/density')).toMatchObject({ context: { unit: 'P/Km²' } })
  })

  it('states no unit or date for a table that states none, and none from prose, a range, a year, a column\'s abbreviation or a day alone before the table', async () => {
    const prose: ListTableText = { caption: 'In 2024, the largest economies by output', before: [{ text: 'Rates for 15–19 Oct 2026', element: 'p', distance: 1 }, { text: 'Population (2024)', element: 'h2', distance: 2 }] }
    const posted: ListTableText = { caption: 'Units of measurement used in this report', before: [{ text: 'October 19, 2026', element: 'p.date', distance: 1 }, { text: 'Units of study', element: 'h2', distance: 2 }] }
    for (const column of [
      { header: 'Rate (est.)', column: 2 }, { header: 'Rate (est.)', column: 2, table: prose }, { header: 'Credit points', column: 2, table: posted },
      { header: 'Home Runs (HR)', column: 2 }, { header: 'Games (G)', column: 2 }, { header: 'Wins (W)', column: 2 }, { header: 'Tries (T)', column: 2 },
    ]) {
      const out = await read(one('41', { value: null, ...column }), rates)
      expect(out.status, column.header).toBe('complete')
      expect(at(out, '/records/0/rate'), column.header).not.toHaveProperty('context')
      expect(at(out, '/records/0/rate'), column.header).not.toHaveProperty('contextEvidence')
    }
    expect(at(await read(one('7.5', { header: 'Power (kW)', column: 2, value: null }), rates), '/records/0/rate')).toMatchObject({ context: { unit: 'kW' } })
    const asOf = { caption: null, before: [{ text: 'As of October 19, 2026', element: 'p.date', distance: 1 }] }
    expect(at(await read(one('41', { header: 'Rate', column: 2, value: null, table: asOf }), rates), '/records/0/rate')).toMatchObject({ context: { date: '2026-10-19' } })
  })

  it('leaves out a unit, or a date, that two of the table\'s statements give differently, with field_ambiguous', async () => {
    const prices: ListTableText = { caption: 'Figures in USD', before: [{ text: 'As of 18 Oct 2026', element: 'p', distance: 1 }, { text: 'Prices', element: 'h2', distance: 2 }] }
    const later = { header: '20 Oct 2026', column: 3, value: '0.7', table: prices }
    const agreed = await read(one('0.6210', { header: 'Price', column: 2, value: null, table: prices }, [later]), rates)
    expect(agreed.status).toBe('complete')
    expect(at(agreed, '/records/0/rate')).toMatchObject({ context: { unit: 'USD', date: '2026-10-18' } })
    const unit = await read(one('0.6210', { header: 'Price (EUR)', column: 2, value: null, table: prices }, [later]), rates)
    expect(unit.status).toBe('incomplete')
    expect(unit.data).toEqual({ records: [{ currency: 'Euro', rate: 0.621 }] })
    expect(at(unit, '/records/0/rate')!.context).toEqual({ date: '2026-10-18' })
    expect(unit.issues).toEqual([expect.objectContaining({ code: 'field_ambiguous', path: '/records/0/rate' })])
    expect(unit.issues[0]!.message).toContain('"EUR"')
    const date = await read(one('0.6210', { header: '19 Oct 2026', column: 2, value: null, table: prices }, [later]), rates)
    expect(date.status).toBe('incomplete')
    expect(at(date, '/records/0/rate')!.context).toEqual({ unit: 'USD' })
    expect(date.issues).toEqual([expect.objectContaining({ code: 'field_ambiguous', path: '/records/0/rate' })])
    expect(date.issues[0]!.message).toContain('2026-10-18')
  })

  it('keeps the percent or currency a number\'s own text states, and leaves out a table unit that cannot be it, with field_ambiguous', async () => {
    const shares: ListFormatRequest = { type: 'list', itemSelector: rows.itemSelector, fields: [{ name: 'country', selector: 'td' }] }
    const source = table([{ values: { country: 'India' }, columns: [
      { header: 'Country', column: 1, value: 'India', fields: ['country'] },
      { header: 'Yearly Change (%)', column: 2, value: '0.87 %' },
      { header: 'World Share (Km²)', column: 3, value: '17.8%' },
    ] }], ['country'])
    const out = await read(source, schema({ country: 'string', yearly_change: 'number', world_share: 'number' }), shares)
    expect(out.data).toEqual({ records: [{ country: 'India', yearly_change: 0.87, world_share: 17.8 }] })
    expect(at(out, '/records/0/yearly_change')!.context).toEqual({ unit: '%' })
    expect(at(out, '/records/0/world_share')!.context).toEqual({ unit: '%' })
    expect(at(out, '/records/0/world_share')).not.toHaveProperty('contextEvidence')
    expect(out.issues).toEqual([expect.objectContaining({ code: 'field_ambiguous', path: '/records/0/world_share' })])
    expect(out.issues[0]!.message).toMatch(/"%" \(the value's own text\), "Km²" \(column 3 "World Share \(Km²\)" header\); only the text's own is given/)
    const dollars = await read(one('$12.50', { header: 'Price (USD)', column: 2, value: null }), rates)
    expect(dollars.status).toBe('complete')
    expect(at(dollars, '/records/0/rate')!.context).toEqual({ currency: '$', unit: 'USD' })
    for (const [raw, column] of [['$12.50', { header: 'Price (EUR)', column: 2 }], ['€5', { header: 'Price', column: 2, table: { caption: 'Figures in USD millions', before: [] } }], ['$3', { header: 'Change (%)', column: 2 }]] as const) {
      const out = await read(one(raw, { value: null, ...column }), rates)
      expect(out.status, raw).toBe('incomplete')
      expect(at(out, '/records/0/rate')!.context, raw).toEqual({ currency: raw.slice(0, 1) })
      expect(out.issues, raw).toEqual([expect.objectContaining({ code: 'field_ambiguous', path: '/records/0/rate' })])
    }
  })

  it('takes no as-of date from a date column, whose dates are the rows\' data, or from the header of another column', async () => {
    const closes: ListFormatRequest = { type: 'list', itemSelector: rows.itemSelector, fields: [{ name: 'close', selector: 'td.close' }] }
    const source = table([{ values: { close: '231.40' }, columns: [
      { header: 'Date', column: 1, value: '10/15/2026' },
      { header: 'Close', column: 2, value: '231.40', fields: ['close'] },
      { header: '19 Oct 2026', column: 3, value: 'note' },
    ] }], ['close'])
    const out = await read(source, schema({ close: 'number', date: 'string' }), closes)
    expect(out.data).toEqual({ records: [{ close: 231.4, date: '10/15/2026' }] })
    expect(at(out, '/records/0/close')).not.toHaveProperty('context')
    expect(at(out, '/records/0/date')).not.toHaveProperty('context')
  })
})
