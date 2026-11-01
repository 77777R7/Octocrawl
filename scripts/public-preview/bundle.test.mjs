import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { BUNDLE_DIR, bundle } from './bundle.mjs'

// Needs packages/public-preview/dist (npm run build:public builds it, then this bundle).
await bundle()

/** The bundle's files that `entry` loads before any dynamic import: what the server reads to start. */
function staticGraph(entry, seen = new Set()) {
  if (seen.has(entry)) return seen
  seen.add(entry)
  for (const [, file] of readFileSync(BUNDLE_DIR + entry, 'utf8').matchAll(/^import\s+(?:[^"';]*?\s+from\s+)?"\.\/([^"]+)";?$/gm)) staticGraph(file, seen)
  return seen
}

test('the server starts on its own chunks, and the reading engine is a separate load', () => {
  const start = staticGraph('cli.js')
  const engine = staticGraph('engineCheck.js')
  const bytes = [...start].reduce((total, file) => total + statSync(BUNDLE_DIR + file).size, 0)
  assert.ok(bytes < 1_000_000, `the server reads ${bytes} bytes to start`)
  assert.ok([...engine].some(file => !start.has(file)), 'the engine has chunks of its own')
  for (const file of start) assert.doesNotMatch(readFileSync(BUNDLE_DIR + file, 'utf8'), /^import .* from "(playwright|better-sqlite3)";$/m, file)
})

test('the bundled server listens, answers and reads its files ahead', async () => {
  const port = await new Promise((resolve) => { const probe = createServer().listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)) }) })
  const child = spawn(process.execPath, [`${BUNDLE_DIR}cli.js`], {
    env: { ...process.env, PORT: String(port), W2L_FIRESTORE_PROJECT_ID: 'demo-project', W2L_QUOTA_HASH_KEY: 'k'.repeat(32), W2L_PREVIEW_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  try {
    const lines = []
    const files = readdirSync(BUNDLE_DIR).filter(name => name.endsWith('.js')).length
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no start-up lines in 15 s: ${lines.join('\n')}`)), 15_000)
      child.stdout.on('data', (chunk) => {
        lines.push(...String(chunk).split('\n').filter(Boolean))
        if (lines.some(line => line.includes('"startup"')) && lines.some(line => line.includes('"filesRead"'))) { clearTimeout(timer); resolve() }
      })
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`exited with ${code}: ${lines.join('\n')}`)) })
    })
    assert.equal(JSON.parse(lines.find(line => line.includes('"filesRead"'))).filesRead, files)
    const health = await fetch(`http://127.0.0.1:${port}/api/health`)
    assert.equal(health.status, 200)
  } finally {
    child.kill()
  }
})
