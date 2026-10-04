import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config.js'

/**
 * `npm run test:live`: the tests that call live websites (`*.live.test.ts`),
 * which `npm test` leaves out so that it passes offline. They need the
 * network (and follow HTTPS_PROXY / HTTP_PROXY / NO_PROXY like local mode),
 * and a site's own changes or outages can fail them.
 */
export default mergeConfig({ ...base, test: { ...base.test, projects: undefined } }, defineConfig({
  test: {
    include: ['packages/*/test/**/*.live.test.ts', 'apps/*/test/**/*.live.test.ts', 'cloudflare/*/test/**/*.live.test.ts'],
  },
}))
