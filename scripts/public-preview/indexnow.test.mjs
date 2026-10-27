import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_PER_POST, RESUBMIT_AFTER_MS, afterResponse, batches, emptyState, fingerprintOf, plan, readState } from './indexnow-lib.mjs'
import { parseArgs } from './indexnow.mjs'

const NOW = new Date('2026-10-28T10:00:00Z')
const minutesAgo = minutes => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const entry = (loc, fingerprint) => ({ loc, fingerprint })
const stateOf = urls => ({ ...emptyState('https://x.example'), urls })

test('a page is new when the state has never seen it and changed when its fingerprint differs or cannot be compared', () => {
  const state = stateOf({
    'https://x.example/same/': { fingerprint: 'lastmod:2026-10-01', submittedAt: minutesAgo(60) },
    'https://x.example/moved/': { fingerprint: 'lastmod:2026-10-01', submittedAt: minutesAgo(60) },
    'https://x.example/blind/': { fingerprint: null, submittedAt: minutesAgo(60) },
    'https://x.example/gone/': { fingerprint: 'lastmod:2026-10-01', submittedAt: minutesAgo(60) },
  })
  const result = plan({
    entries: [entry('https://x.example/same/', 'lastmod:2026-10-01'), entry('https://x.example/moved/', 'lastmod:2026-10-20'), entry('https://x.example/blind/', null), entry('https://x.example/new/', 'lastmod:2026-10-20')],
    state, now: NOW,
  })
  assert.deepEqual(result.fresh, ['https://x.example/new/'])
  assert.deepEqual(result.changed, ['https://x.example/moved/', 'https://x.example/blind/'])
  assert.deepEqual(result.unchanged, ['https://x.example/same/'])
  assert.deepEqual(result.uncomparable, ['https://x.example/blind/'])
  assert.deepEqual(result.send, ['https://x.example/new/', 'https://x.example/moved/', 'https://x.example/blind/'])
  assert.deepEqual(result.gone, ['https://x.example/gone/'])
})

test('a URL sent less than five minutes ago is held back, unless everything is sent on purpose', () => {
  const state = stateOf({ 'https://x.example/a/': { fingerprint: 'lastmod:1', submittedAt: new Date(NOW.getTime() - RESUBMIT_AFTER_MS + 1000).toISOString() } })
  const entries = [entry('https://x.example/a/', 'lastmod:2')]
  const held = plan({ entries, state, now: NOW })
  assert.deepEqual(held.recent, ['https://x.example/a/'])
  assert.deepEqual(held.send, [])
  assert.deepEqual(plan({ entries, state, now: NOW, all: true }).send, ['https://x.example/a/'])
})

test('--all sends every URL even when nothing changed', () => {
  const state = stateOf({ 'https://x.example/a/': { fingerprint: 'lastmod:1', submittedAt: minutesAgo(60) } })
  const result = plan({ entries: [entry('https://x.example/a/', 'lastmod:1'), entry('https://x.example/b/', 'lastmod:1')], state, now: NOW, all: true })
  assert.deepEqual(result.send, ['https://x.example/a/', 'https://x.example/b/'])
})

test('after a 429 nothing is sent until the wait is over', () => {
  const blocked = { ...stateOf({}), retryNotBefore: new Date(NOW.getTime() + 60_000).toISOString() }
  const result = plan({ entries: [entry('https://x.example/a/', 'lastmod:1')], state: blocked, now: NOW })
  assert.equal(result.blockedUntil, blocked.retryNotBefore)
  assert.deepEqual(result.send, [])
  assert.equal(plan({ entries: [entry('https://x.example/a/', 'lastmod:1')], state: { ...blocked, retryNotBefore: minutesAgo(1) }, now: NOW }).blockedUntil, null)
})

test('the state records what a 200 or 202 accepted, drops deleted URLs, and learns nothing from a failure', () => {
  const before = stateOf({ 'https://x.example/old/': { fingerprint: 'lastmod:1', submittedAt: minutesAgo(60) } })
  const fingerprints = new Map([['https://x.example/a/', 'lastmod:2']])
  for (const status of [200, 202]) {
    const after = afterResponse(before, { status, sent: ['https://x.example/a/'], deleted: ['https://x.example/old/'], fingerprints, now: NOW })
    assert.deepEqual(after.urls, { 'https://x.example/a/': { fingerprint: 'lastmod:2', submittedAt: NOW.toISOString() } })
  }
  assert.deepEqual(afterResponse(before, { status: 500, sent: ['https://x.example/a/'], deleted: [], fingerprints, now: NOW }).urls, before.urls)
  assert.equal(afterResponse(before, { status: 429, sent: [], deleted: [], fingerprints, now: NOW }).retryNotBefore, new Date(NOW.getTime() + 10 * 60_000).toISOString())
  assert.equal(before.retryNotBefore, null)
})

test('fingerprints, batches and the state file are strict', () => {
  assert.equal(fingerprintOf({ lastmod: '2026-10-01' }, 'abc'), 'lastmod:2026-10-01')
  assert.equal(fingerprintOf({ lastmod: null }, 'abc'), 'sha256:abc')
  assert.equal(fingerprintOf({ lastmod: null }, null), null)
  assert.deepEqual(batches(Array.from({ length: MAX_PER_POST * 2 + 1 }, (_, i) => i)).map(batch => batch.length), [MAX_PER_POST, MAX_PER_POST, 1])
  assert.deepEqual(batches([]), [])
  assert.deepEqual(readState(JSON.stringify(emptyState('https://x.example')), 'https://x.example').urls, {})
  assert.throws(() => readState('{}', 'https://x.example'), /version 1/)
  assert.throws(() => readState(JSON.stringify(emptyState('https://other.example')), 'https://x.example'), /for https:\/\/other\.example/)
  assert.throws(() => readState('not json', 'https://x.example'))
  assert.deepEqual(parseArgs(['--dry-run', '--all']), { dryRun: true, all: true })
  assert.throws(() => parseArgs(['--now']), /unknown option/)
})

// The command itself, against a local site and a local IndexNow endpoint: nothing leaves this machine.
async function withSite(body) {
  const dir = mkdtempSync(join(tmpdir(), 'indexnow-test-'))
  const site = { sitemap: [], changelog: 'v1', answers: { '/old/': 404 }, endpointStatus: 200, posts: [] }
  const server = createServer((request, response) => {
    const send = (status, text, type = 'text/plain') => { response.writeHead(status, { 'content-type': type }); response.end(text) }
    if (request.method === 'POST' && request.url === '/indexnow') {
      const chunks = []
      request.on('data', chunk => chunks.push(chunk)).on('end', () => { site.posts.push(JSON.parse(Buffer.concat(chunks).toString('utf8'))); send(site.endpointStatus, site.endpointStatus === 200 ? '' : 'slow down') })
    } else if (request.url === '/indexnow-key.txt') send(200, 'testkey12345678\n')
    else if (request.url === '/sitemap.xml') send(200, `<urlset>${site.sitemap.map(([path, lastmod]) => `<url><loc>${origin}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('')}</urlset>`, 'application/xml')
    else if (request.url === '/changelog/index.md') send(200, site.changelog)
    else send(site.answers[request.url] ?? 404, 'x')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const env = { ...process.env, W2L_PUBLIC_ORIGIN: origin, W2L_INDEXNOW_ENDPOINT: `${origin}/indexnow`, W2L_SEO_DIR: dir }
  for (const name of ['NODE_USE_ENV_PROXY', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete env[name]
  const script = new URL('./indexnow.mjs', import.meta.url).pathname
  const run = (...args) => new Promise(resolve => {
    const child = spawn(process.execPath, [script, ...args], { env })
    let out = ''
    child.stdout.on('data', chunk => { out += chunk }); child.stderr.on('data', chunk => { out += chunk })
    child.on('close', status => resolve({ status, out }))
  })
  const stateFile = join(dir, 'indexnow-state.json')
  const state = () => JSON.parse(readFileSync(stateFile, 'utf8'))
  try { await body({ site, origin, run, dir, stateFile, state }) } finally { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }) }
}

test('the command sends only what changed since the last submission, and says so', async () => {
  await withSite(async ({ site, origin, run, dir, stateFile, state }) => {
    site.sitemap = [['/', '2026-10-01'], ['/docs/', '2026-10-01'], ['/changelog/', null], ['/old/', '2026-09-01']]

    // dry run: reads the site, writes nothing, sends nothing
    const dry = await run('--dry-run')
    assert.equal(dry.status, 0)
    assert.match(dry.out, /4 URLs in the sitemap; 4 new, 0 changed/)
    assert.match(dry.out, /first run sends every URL once/)
    assert.equal(site.posts.length, 0)
    assert.equal(existsSync(stateFile), false)

    // first run: everything, once
    const first = await run()
    assert.equal(first.status, 0)
    assert.match(first.out, /IndexNow 200 for 4 URLs/)
    assert.deepEqual(site.posts[0].urlList, [`${origin}/`, `${origin}/docs/`, `${origin}/changelog/`, `${origin}/old/`])
    assert.equal(site.posts[0].key, 'testkey12345678')
    assert.equal(state().urls[`${origin}/changelog/`].fingerprint.startsWith('sha256:'), true)
    assert.equal(readFileSync(join(dir, 'indexnow-log.jsonl'), 'utf8').trim().split('\n').length, 1)

    // nothing changed: nothing sent
    const same = await run()
    assert.equal(same.status, 0)
    assert.match(same.out, /0 new, 0 changed, 4 unchanged/)
    assert.match(same.out, /Nothing to send/)
    assert.equal(site.posts.length, 1)

    // a change, but the pages were sent a moment ago: held back
    site.sitemap = [['/', '2026-10-01'], ['/docs/', '2026-10-28'], ['/changelog/', null], ['/old/', '2026-09-01']]
    site.changelog = 'v2'
    const held = await run()
    assert.match(held.out, /2 changed, 2 unchanged, 2 held back/)
    assert.equal(site.posts.length, 1)

    // five minutes later: exactly the changed pages go, and a dropped URL that answers 404 goes as deleted
    const aged = state()
    for (const url of Object.values(aged.urls)) url.submittedAt = new Date(Date.now() - 10 * 60_000).toISOString()
    writeFileSync(stateFile, JSON.stringify(aged))
    site.sitemap = [['/', '2026-10-01'], ['/docs/', '2026-10-28'], ['/changelog/', null]]
    const second = await run()
    assert.equal(second.status, 0)
    assert.match(second.out, /0 new, 2 changed, 1 unchanged, 0 held back \(sent less than 5 minutes ago\), 1 deleted/)
    assert.deepEqual(site.posts[1].urlList, [`${origin}/docs/`, `${origin}/changelog/`, `${origin}/old/`])
    assert.equal(`${origin}/old/` in state().urls, false)
    assert.equal(state().urls[`${origin}/docs/`].fingerprint, 'lastmod:2026-10-28')
  })
})

test('a URL dropped from the sitemap that still answers 200 is not sent as deleted', async () => {
  await withSite(async ({ site, origin, run, stateFile, state }) => {
    site.sitemap = [['/', '2026-10-01'], ['/moved/', '2026-10-01']]
    await run()
    const aged = state()
    for (const url of Object.values(aged.urls)) url.submittedAt = new Date(Date.now() - 10 * 60_000).toISOString()
    writeFileSync(stateFile, JSON.stringify(aged))
    site.sitemap = [['/', '2026-10-01']]
    site.answers['/moved/'] = 200
    const result = await run()
    assert.match(result.out, /\/moved\/ is no longer in the sitemap but answers 200, so it is not sent as deleted/)
    assert.match(result.out, /Nothing to send/)
    assert.equal(site.posts.length, 1)
    assert.equal(`${origin}/moved/` in state().urls, true)
  })
})

test('--all sends every URL again, a 429 stops the next run, and a failure leaves the state as it was', async () => {
  await withSite(async ({ site, origin, run, stateFile, state }) => {
    site.sitemap = [['/', '2026-10-01'], ['/docs/', '2026-10-01']]
    await run()
    const all = await run('--all')
    assert.match(all.out, /--all: every URL is sent/)
    assert.deepEqual(site.posts[1].urlList, [`${origin}/`, `${origin}/docs/`])

    const aged = state()
    for (const url of Object.values(aged.urls)) url.submittedAt = new Date(Date.now() - 10 * 60_000).toISOString()
    writeFileSync(stateFile, JSON.stringify(aged))
    site.sitemap = [['/', '2026-10-28'], ['/docs/', '2026-10-01']]
    site.endpointStatus = 429
    const limited = await run()
    assert.equal(limited.status, 1)
    assert.match(limited.out, /IndexNow 429/)
    assert.equal(state().urls[`${origin}/`].fingerprint, 'lastmod:2026-10-01')
    assert.notEqual(state().retryNotBefore, null)

    site.endpointStatus = 200
    const waiting = await run()
    assert.equal(waiting.status, 1)
    assert.match(waiting.out, /asked us to wait/)
    assert.equal(site.posts.length, 3)
  })
})

test('a state file from another origin, or one that is not a state, stops the run instead of sending the whole site', async () => {
  await withSite(async ({ site, run, stateFile }) => {
    site.sitemap = [['/', '2026-10-01']]
    writeFileSync(stateFile, JSON.stringify(emptyState('https://other.example')))
    const other = await run()
    assert.equal(other.status, 1)
    assert.match(other.out, /for https:\/\/other\.example/)
    writeFileSync(stateFile, '{"oops":')
    assert.equal((await run()).status, 1)
    assert.equal(site.posts.length, 0)
  })
})
