#!/usr/bin/env node
// Builds the npm packages W2L publishes, into .w2l/pack/<name>/, and packs each
// into .w2l/pack/tarballs/. The workspace packages stay as they are (private,
// built by tsc for the repository); a published package is a bundle with a
// package.json of its own:
//
//   @w2l/sdk  MIT         ESM + CJS, @w2l/contracts bundled in (and its declarations beside the SDK's), no dependencies
//   @w2l/cli  AGPL-3.0    bin w2l, every @w2l/* package bundled in, their third-party dependencies declared
//   @w2l/mcp  AGPL-3.0    bin w2l-mcp (stdio; a client of a running W2L API), bundled the same way
//
// Usage: node scripts/pack-packages.mjs [--skip-tarballs]
// Publishing is a separate, deliberate step: npm publish .w2l/pack/tarballs/<file>.tgz --access public

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { builtinModules } from 'node:module'
import { build } from 'tsup'

const BUILTINS = new Set(builtinModules)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, '.w2l', 'pack')
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
const rootPackage = read('package.json')
const repository = { type: 'git', url: 'git+https://github.com/77777R7/w2l.git' }

/** Every third-party dependency of the workspace packages a bundle takes in, with the range they declare. */
function thirdPartyDependencies(names) {
  const seen = new Set()
  const deps = {}
  const visit = (name) => {
    if (seen.has(name)) return
    seen.add(name)
    const pkg = read(`packages/${name.slice('@w2l/'.length)}/package.json`)
    for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) {
      if (dep.startsWith('@w2l/')) visit(dep)
      else deps[dep] = range
    }
  }
  names.forEach(visit)
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)))
}

/** The mcp package reads the Amazon product schema from research/ at run time; a bundle carries it inline. */
const inlineAmazonSchema = {
  name: 'inline-amazon-schema',
  setup(builder) {
    builder.onLoad({ filter: /packages[\\/]mcp[\\/]src[\\/]productSchema\.ts$/ }, () => ({
      contents: `export const AMAZON_PRODUCT_SCHEMA = ${readFileSync(join(root, 'research', 'amazon-product-schema.v1.json'), 'utf8')}`,
      loader: 'ts',
    }))
  },
}

/**
 * In one bundle every module's `import.meta.url` is the bundle's, so a
 * module that runs itself when it is the entry (`import.meta.url ===
 * pathToFileURL(process.argv[1])`: the API server, the ladder CLI) would run
 * beside the real entry. Every guard but the entry's is turned off.
 */
function onlyEntryRuns(entry) {
  const entryPath = join(root, entry)
  return {
    name: 'only-entry-runs',
    setup(builder) {
      builder.onLoad({ filter: /packages[\\/][^\\/]+[\\/]src[\\/].*\.ts$/ }, (args) => {
        if (args.path === entryPath) return undefined
        const text = readFileSync(args.path, 'utf8')
        if (!text.includes('import.meta.url === pathToFileURL(')) return undefined
        return { contents: text.replaceAll('import.meta.url === pathToFileURL(', 'false && import.meta.url === pathToFileURL('), loader: 'ts' }
      })
    },
  }
}

/** The packages a bundle imports, read from esbuild's metafile: what it must declare, and nothing more. */
function importedPackages(outDir) {
  const names = new Set()
  for (const file of readdirSync(outDir).filter((name) => name.startsWith('metafile-'))) {
    const meta = JSON.parse(readFileSync(join(outDir, file), 'utf8'))
    for (const output of Object.values(meta.outputs)) {
      for (const { path, external } of output.imports ?? []) {
        if (!external || path.startsWith('node:') || path.startsWith('.')) continue
        names.add(path.startsWith('@') ? path.split('/').slice(0, 2).join('/') : path.split('/')[0])
      }
    }
    rmSync(join(outDir, file))
  }
  return names
}

const targets = [
  {
    name: '@w2l/sdk', dir: 'sdk', license: 'MIT', licenseFile: 'packages/sdk/LICENSE',
    description: 'TypeScript client for the W2L API: scrape, map, crawl and batch with an Evidence Record on every page.',
    entry: { index: 'packages/sdk/src/index.ts' }, formats: ['esm', 'cjs'], types: true,
    manifest: () => ({
      main: './dist/index.cjs', module: './dist/index.js', types: './dist/types/esm/index.d.ts',
      exports: { '.': { import: { types: './dist/types/esm/index.d.ts', default: './dist/index.js' }, require: { types: './dist/types/cjs/index.d.ts', default: './dist/index.cjs' } } },
      sideEffects: false, engines: { node: '>=18.17' }, dependencies: {},
    }),
  },
  {
    name: '@w2l/cli', dir: 'cli', license: 'AGPL-3.0-only', licenseFile: 'LICENSE',
    description: 'W2L on the command line: scrape, crawl, batch and map with an Evidence Record on every page, or serve the local API.',
    entry: { cli: 'packages/cli/src/cli.ts' }, formats: ['esm'],
    manifest: () => ({ bin: { w2l: './dist/cli.js' }, engines: { node: rootPackage.engines?.node ?? '>=22.13.0' }, dependencies: thirdPartyDependencies(['@w2l/cli']) }),
  },
  {
    name: '@w2l/mcp', dir: 'mcp', license: 'AGPL-3.0-only', licenseFile: 'LICENSE',
    description: 'W2L as an MCP server over stdio, a client of a running W2L API (w2l serve).',
    entry: { stdio: 'packages/mcp/src/stdio.ts' }, formats: ['esm'], plugins: [inlineAmazonSchema],
    manifest: () => ({ bin: { 'w2l-mcp': './dist/stdio.js' }, engines: { node: '>=20' }, dependencies: thirdPartyDependencies(['@w2l/mcp']) }),
  },
]

rmSync(out, { recursive: true, force: true })
const tarballs = join(out, 'tarballs')
mkdirSync(tarballs, { recursive: true })
for (const target of targets) {
  const source = read(`packages/${target.dir}/package.json`)
  const dir = join(out, target.dir)
  // Everything the workspace packages may import stays external; the manifest then declares what the bundle does import.
  const candidates = target.manifest(source.version).dependencies
  const entryFile = Object.values(target.entry)[0]
  await build({
    entry: Object.fromEntries(Object.entries(target.entry).map(([key, path]) => [key, join(root, path)])),
    outDir: join(dir, 'dist'),
    format: target.formats,
    dts: false,
    platform: 'node',
    target: target.dir === 'sdk' ? 'node18' : 'node22',
    splitting: false,
    sourcemap: false,
    clean: true,
    silent: true,
    // Every @w2l/* package goes into the bundle; what they depend on stays a declared dependency.
    noExternal: [/^@w2l\//],
    external: Object.keys(candidates),
    esbuildPlugins: [...(target.plugins ?? []), onlyEntryRuns(entryFile)],
    metafile: true,
    tsconfig: join(root, 'packages', target.dir, 'tsconfig.json'),
  })
  const imported = importedPackages(join(dir, 'dist'))
  const unknown = [...imported].filter((name) => !(name in candidates) && !BUILTINS.has(name))
  if (unknown.length > 0) throw new Error(`${target.name} imports ${unknown.join(', ')}, which no bundled workspace package declares`)
  const dependencies = Object.fromEntries(Object.entries(candidates).filter(([name]) => imported.has(name)))
  if (target.types) sdkTypes(join(dir, 'dist', 'types'))
  const manifest = {
    name: target.name,
    version: source.version,
    description: target.description,
    license: target.license,
    repository,
    homepage: 'https://github.com/77777R7/w2l#readme',
    type: 'module',
    files: ['dist', 'README.md', 'LICENSE'],
    ...target.manifest(source.version),
    dependencies,
    publishConfig: { access: 'public' },
  }
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  cpSync(join(root, target.licenseFile), join(dir, 'LICENSE'))
  const readme = join(root, 'packages', target.dir, 'README.md')
  if (existsSync(readme)) cpSync(readme, join(dir, 'README.md'))
  if (!process.argv.includes('--skip-tarballs')) {
    const file = execFileSync('npm', ['pack', '--pack-destination', tarballs, '--silent'], { cwd: dir, encoding: 'utf8' }).trim().split('\n').pop()
    console.log(`${target.name}@${source.version} → .w2l/pack/tarballs/${file}`)
  } else {
    console.log(`${target.name}@${source.version} → .w2l/pack/${target.dir}`)
  }
}

/**
 * The SDK's declarations, as tsc emitted them (npx tsc -b first), with
 * @w2l/contracts' declarations beside them under contracts/ and the import
 * of '@w2l/contracts' pointed there: types/esm for import, and the same
 * files under types/cjs, marked CommonJS, for require.
 */
function sdkTypes(types) {
  const esm = join(types, 'esm')
  const copy = (from, to, rewrite) => {
    mkdirSync(to, { recursive: true })
    for (const file of readdirSync(from).filter((name) => name.endsWith('.d.ts'))) {
      const text = readFileSync(join(from, file), 'utf8')
      writeFileSync(join(to, file), rewrite ? text.replaceAll("'@w2l/contracts'", "'./contracts/index.js'").replaceAll('"@w2l/contracts"', '"./contracts/index.js"') : text)
    }
  }
  copy(join(root, 'packages', 'sdk', 'dist'), esm, true)
  copy(join(root, 'packages', 'contracts', 'dist'), join(esm, 'contracts'), false)
  for (const file of readdirSync(esm)) if (file.endsWith('.d.ts') && readFileSync(join(esm, file), 'utf8').includes('@w2l/')) throw new Error(`types/esm/${file} still names a workspace package`)
  cpSync(esm, join(types, 'cjs'), { recursive: true })
  writeFileSync(join(types, 'cjs', 'package.json'), '{ "type": "commonjs" }\n')
}
