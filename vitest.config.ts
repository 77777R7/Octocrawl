import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

const TESTS = ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'cloudflare/*/test/**/*.test.ts']
/** Tests that call live websites (`*.live.test.ts`): not run by `npm test`, which must pass offline; `npm run test:live` runs them. */
const LIVE = TESTS.map((glob) => glob.replace(/\.test\.ts$/, '.live.test.ts'))
/**
 * Tests that bound the CPU time of a piece of code (`*.perf.test.ts`): run
 * last, one file at a time, so no other test file shares the machine with
 * them. On CI the files run side by side on a few cores, and such bounds
 * failed there by 5 to 10 percent, or more, when another heavy file ran
 * beside them.
 */
const PERF = TESTS.map((glob) => glob.replace(/\.test\.ts$/, '.perf.test.ts'))
/**
 * Test files that drive a real browser or real HTTP and bound how long a
 * wait or a cancellation takes: run after the rest, two at a time, so a
 * browser start or a deadline is not stretched by a full machine.
 */
const TIMED = [
  'packages/*/test/**/*.integration.test.ts',
  'packages/api/test/chromeHandoff.test.ts',
  'packages/api/test/chromeLogin.test.ts',
  'packages/api/test/handoffRoute.test.ts',
  'packages/api/test/keepAlive.test.ts',
  'packages/api/test/map.test.ts',
  'packages/api/test/pageOptions.test.ts',
  'packages/bench/test/browserLocal.test.ts',
  'packages/bench/test/originScheduler.test.ts',
  'packages/bench/test/sitemapSource.test.ts',
  'packages/mcp/test/httpCancellation.test.ts',
]

export default defineConfig({
  // Workspace packages resolve to source, not dist: a stale build must never
  // silently test old code (dist/ is gitignored and rebuilt separately).
  resolve: {
    alias: {
      '@w2l/contracts': resolve(root, 'packages/contracts/src/index.ts'),
      '@w2l/extract-tf': resolve(root, 'packages/extract-tf/src/index.ts'),
      '@w2l/fixtures': resolve(root, 'packages/fixtures/src/index.ts'),
      '@w2l/http-core': resolve(root, 'packages/http-core/src/index.ts'),
      '@w2l/bench': resolve(root, 'packages/bench/src/index.ts'),
      '@w2l/runtime': resolve(root, 'packages/runtime/src/index.ts'),
      '@w2l/api/structured': resolve(root, 'packages/api/src/structured.ts'),
      '@w2l/api': resolve(root, 'packages/api/src/index.ts'),
      '@w2l/sdk': resolve(root, 'packages/sdk/src/index.ts'),
      '@w2l/mcp': resolve(root, 'packages/mcp/src/index.ts'),
      '@w2l/public-preview': resolve(root, 'packages/public-preview/src/index.ts'),
    },
  },
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The rest in parallel first, then the timed files two at a time, then the perf files one at a time (a group runs
    // once the one before it is done).
    projects: [
      { extends: true, test: { name: 'unit', include: TESTS, exclude: [...configDefaults.exclude, ...PERF, ...TIMED, ...LIVE] } },
      { extends: true, test: { name: 'timed', include: TIMED, exclude: [...configDefaults.exclude, ...PERF, ...LIVE], maxWorkers: 2, sequence: { groupOrder: 1 } } },
      { extends: true, test: { name: 'perf', include: PERF, fileParallelism: false, sequence: { groupOrder: 2 } } },
    ],
  },
})
