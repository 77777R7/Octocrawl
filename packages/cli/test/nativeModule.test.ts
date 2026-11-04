import { afterEach, describe, expect, it, vi } from 'vitest'
import { win32 } from 'node:path'

// What Node throws from `new Database()` when the install's binding was built for another Node (octocrawl@0.8.1, Node 22 after Node 26).
function abiError(file: string, built = 147, runs = 127): Error {
  const error = new Error(`The module '${file}'\nwas compiled against a different Node.js version using\nNODE_MODULE_VERSION ${built}. This version of Node.js requires\nNODE_MODULE_VERSION ${runs}. Please try re-compiling or re-installing\nthe module (for instance, using \`npm rebuild\` or \`npm install\`).`)
  return Object.assign(error, { code: 'ERR_DLOPEN_FAILED' })
}

const NPX_INSTALL = '/Users/ada/.npm/_npx/cd0b78b80c57ba71'
const NPX_BINDING = `${NPX_INSTALL}/node_modules/better-sqlite3/build/Release/better_sqlite3.node`

const failure = vi.hoisted(() => ({ error: null as Error | null }))
vi.mock('@w2l/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@w2l/api')>()
  const opened = <T>(open: () => T): T => { if (failure.error !== null) throw failure.error; return open() }
  return {
    ...actual,
    createApiEngine: (options: Parameters<typeof actual.createApiEngine>[0]) => opened(() => actual.createApiEngine(options)),
    runApiServer: async (...args: Parameters<typeof actual.runApiServer>) => opened(() => actual.runApiServer(...args)),
  }
})

import { nativeModuleHelp, runCli } from '../src/index.js'

async function run(argv: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = []
  const err: string[] = []
  const code = await runCli(argv, { env: { W2L_TASK_ROOT: '/tmp/octocrawl-native-module-test' }, stdout: (text) => out.push(text), stderr: (text) => err.push(text) })
  return { code, out, err }
}

afterEach(() => { failure.error = null })

describe('better-sqlite3 built for another Node', () => {
  for (const argv of [['scrape', 'https://example.com/'], ['serve', '--port', '0']]) {
    it(`octocrawl ${argv[0]} says what to run, not what Node threw`, async () => {
      failure.error = abiError(NPX_BINDING, 147, Number(process.versions.modules))
      const { code, out, err } = await run(argv)
      expect(code).toBe(1)
      expect(out).toEqual([])
      const text = err.join('\n')
      expect(text).toContain(`npm rebuild better-sqlite3 --prefix "${NPX_INSTALL}"`)
      expect(text).toContain(process.version)
      expect(text).not.toContain('Please try re-compiling')
      expect(text).not.toContain('better_sqlite3.node')
    })
  }

  it('leaves any other failure as it was', async () => {
    failure.error = new Error('disk full')
    await expect(run(['scrape', 'https://example.com/'])).rejects.toThrow('disk full')
    // Another module's binding, and a binding that failed to load for another reason.
    expect(nativeModuleHelp(abiError('/x/node_modules/other/build/other.node'))).toBeNull()
    expect(nativeModuleHelp(Object.assign(new Error(`dlopen(${NPX_BINDING}, 0x0001): tried: not found`), { code: 'ERR_DLOPEN_FAILED' }))).toBeNull()
  })

  it('names the Node that failed, so the rebuild is for it and not for the shell\'s own', () => {
    const node = { version: 'v22.22.0', abi: '127', execPath: '/opt/homebrew/bin/node', platform: 'darwin' as const }
    const help = nativeModuleHelp(abiError(NPX_BINDING), node)
    expect(help).toContain('NODE_MODULE_VERSION 147')
    expect(help).toContain('Node.js v22.22.0 (NODE_MODULE_VERSION 127) at /opt/homebrew/bin/node')
    expect(help).toContain(`  PATH="/opt/homebrew/bin:$PATH" npm rebuild better-sqlite3 --prefix "${NPX_INSTALL}"`)
  })

  it('takes the directory npm installed into: a global install, a path with spaces, Windows', () => {
    const node = { version: 'v24.1.0', abi: '137', execPath: '/usr/local/bin/node', platform: 'linux' as const }
    expect(nativeModuleHelp(abiError('/usr/local/lib/node_modules/octocrawl/node_modules/better-sqlite3/build/Release/better_sqlite3.node'), node))
      .toContain('--prefix "/usr/local/lib/node_modules/octocrawl"')
    expect(nativeModuleHelp(abiError('/Users/ada/Library/Application Support/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node'), node))
      .toContain('--prefix "/Users/ada/Library/Application Support/app"')

    // Node opens a binding by its namespaced path, and its message keeps the \\?\ prefix, which the command must not carry.
    const windows = nativeModuleHelp(abiError(win32.toNamespacedPath('C:\\Users\\ada\\AppData\\Local\\npm-cache\\_npx\\abc\\node_modules\\better-sqlite3\\build\\Release\\better_sqlite3.node')), { version: 'v24.1.0', abi: '137', execPath: 'C:\\Program Files\\nodejs\\node.exe', platform: 'win32' })
    expect(windows).toContain('  npm rebuild better-sqlite3 --prefix "C:\\Users\\ada\\AppData\\Local\\npm-cache\\_npx\\abc"')
    expect(windows).toContain('first on your PATH')
    expect(windows).not.toContain('$PATH')
  })
})
