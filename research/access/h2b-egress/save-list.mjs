// H2b: the hidden-input prompt for the datacenter arm's proxy list (research/access/runs/2026-10-27-h2b-egress-8ece08ab.md).
// Howard pastes Webshare's Direct connection list, one `ip:port:user:password` per line, in a terminal, then presses
// Ctrl-D. The terminal is in raw mode from before the prompt until the list is saved or Ctrl-C cancels, so nothing
// pasted is shown or left for the shell; a stray key or a list that fails its check never ends the prompt, it asks
// again. The list must have at least MIN_HOSTS lines, each a distinct IPv4 address: the windows take positions 0–21
// and 50–71. It is saved as a mode-600 file under the git-ignored .w2l/access/ (H2B_LIST_OUT for a test). Only counts
// and line numbers are printed, never a line.
// Usage: node research/access/h2b-egress/save-list.mjs
import { chmodSync, closeSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const out = process.env.H2B_LIST_OUT ?? join(homedir(), 'Code/w2l/.w2l/access/h2b-dc-proxies.txt')
const MIN_HOSTS = 72
const LINE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5}):[^:\s]+:\S+$/
if (!process.stdin.isTTY) { console.error('run this in a terminal: it reads the list with the echo off'); process.exit(2) }

/** The pasted lines: whole escape sequences (bracketed paste, focus reports) and other control bytes taken out. */
function linesOf(text) {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1bO./g, '').replace(/\x1b./g, '')
    .replace(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/g, '').split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean)
}

const valid = (line) => {
  const match = LINE.exec(line)
  return match !== null && match.slice(1, 5).every((octet) => Number(octet) <= 255) && Number(match[5]) >= 1 && Number(match[5]) <= 65535
}

/** What is wrong with the list, by counts and line numbers alone; null when it can be saved. */
function problemOf(lines) {
  if (lines.length === 0) return 'Nothing was pasted'
  const bad = lines.flatMap((line, i) => (valid(line) ? [] : [i + 1]))
  if (bad.length > 0) return `${lines.length} lines; not ip:port:user:password: line ${bad.slice(0, 20).join(', ')}${bad.length > 20 ? ', …' : ''}`
  const hosts = new Set(lines.map((line) => line.split(':')[0])).size
  if (hosts !== lines.length) return `${lines.length} lines but ${hosts} distinct IPs (a line repeated, or the list pasted twice)`
  if (hosts < MIN_HOSTS) return `${hosts} IPs; the two windows need at least ${MIN_HOSTS} (the whole list, not one page of it)`
  return null
}

function save(lines) {
  mkdirSync(dirname(out), { recursive: true, mode: 0o700 })
  const temporary = `${out}.${process.pid}.tmp`
  const fd = openSync(temporary, 'w', 0o600)
  writeSync(fd, `${lines.join('\n')}\n`)
  closeSync(fd)
  chmodSync(temporary, 0o600)
  renameSync(temporary, out)
  const users = new Set(lines.map((line) => line.split(':')[2])).size
  return `Saved ${lines.length} lines to ${out}, mode 600 (distinct user names: ${users}).`
}

let pasted = ''
const restore = () => { process.stdin.setRawMode(false); process.stdin.pause() }
// Raw mode before the prompt: whatever is pasted once the prompt shows is never echoed.
process.stdin.setRawMode(true)
console.log('Paste the Direct connection list (one ip:port:user:password per line), then press Ctrl-D.')
console.log('Nothing you paste is shown. Ctrl-C cancels and saves nothing.')
process.stdin.on('data', (chunk) => {
  const text = chunk.toString('utf8')
  if (text.includes('\x03')) { pasted = ''; restore(); console.log('\nCancelled; nothing saved.'); process.exit(130) }
  const end = text.indexOf('\x04')
  pasted += end < 0 ? text : text.slice(0, end)
  if (end < 0) { process.stdout.write(`\r\x1b[KReceived ${linesOf(pasted).length} lines; press Ctrl-D to save.`); return }
  const lines = linesOf(pasted)
  pasted = ''
  const problem = problemOf(lines)
  if (problem !== null) { console.log(`\n${problem}. Nothing saved: paste the whole list again, then press Ctrl-D.`); return }
  const done = save(lines)
  restore()
  console.log(`\n${done}`)
  process.exit(0)
})
