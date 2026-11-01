// Bundles the public preview server (packages/public-preview/dist, built by tsc) into packages/public-preview/bundle,
// which Dockerfile.public-preview runs. A new Cloud Run instance read each of the ~900 files the reading engine loads
// for the first time, which took 3 to 7 s; bundled, the engine is 17 files that the server reads at start-up in about
// 0.1 s (docs/public-preview.md). The chunks the server needs at start-up stay apart from the engine's, which server.ts
// loads on the first run.
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../../', import.meta.url))
const dist = `${root}packages/public-preview/dist/`
export const BUNDLE_DIR = `${root}packages/public-preview/bundle/`

// Left out, loaded from node_modules as before: native modules (better-sqlite3, impit, fsevents), Playwright, which
// finds its browsers and drivers from its own files, and pdfjs, which loads its worker beside its own module.
const EXTERNAL = ['better-sqlite3', 'impit', 'fsevents', 'playwright', 'playwright-core', 'pdfjs-dist']

export async function bundle() {
  rmSync(BUNDLE_DIR, { recursive: true, force: true })
  await build({
    // engineCheck.js loads the whole engine and tests it; the check below and bundle.test.mjs run it.
    entryPoints: [`${dist}cli.js`, `${dist}engineCheck.js`],
    outdir: BUNDLE_DIR,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    chunkNames: 'chunk-[hash]',
    external: EXTERNAL,
    // The bundled CommonJS packages call require().
    banner: { js: "import { createRequire as __bundleRequire } from 'node:module'; const require = __bundleRequire(import.meta.url);" },
    logLevel: 'warning',
  })
  // An engine that cannot load from the bundle, or read a PDF, fails the build, so its image is never pushed.
  const check = spawnSync(process.execPath, ['--input-type=module', '-e', `await (await import(${JSON.stringify(`${BUNDLE_DIR}engineCheck.js`)})).engineSelfTest()`], { encoding: 'utf8' })
  if (check.status !== 0) throw new Error(`The bundled reading engine failed its check:\n${check.stderr}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await bundle()
