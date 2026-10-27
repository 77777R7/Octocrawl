// Writes the hosted parity board's table into docs/hosted-api.md, between its hosted-parity markers, from the manifest
// (packages/mcp/src/hostedParity.ts parityTable()); without --write it only says whether the table is current.
//
//   node --import tsx scripts/hosted/parity-table.ts [--write]
//
// packages/mcp/test/hostedParity.test.ts fails while the table and the manifest differ.
import { readFileSync, writeFileSync } from 'node:fs'
import { parityTable } from '../../packages/mcp/src/hostedParity.js'

const DOCS = new URL('../../docs/hosted-api.md', import.meta.url)
const START = '<!-- hosted-parity:start -->'
const END = '<!-- hosted-parity:end -->'
const docs = readFileSync(DOCS, 'utf8')
const start = docs.indexOf(START)
const end = docs.indexOf(END)
if (start < 0 || end < start) {
  console.error(`docs/hosted-api.md has no ${START} … ${END} section`)
  process.exit(1)
}
const current = `${docs.slice(0, start + START.length)}\n${parityTable()}\n${docs.slice(end)}`
if (process.argv.includes('--write')) {
  writeFileSync(DOCS, current)
  console.log(current === docs ? 'docs/hosted-api.md: the table was current' : 'docs/hosted-api.md: the table is rewritten')
} else if (current !== docs) {
  console.error('docs/hosted-api.md: the table differs from the manifest; run this with --write')
  process.exit(1)
} else console.log('docs/hosted-api.md: the table is current')
