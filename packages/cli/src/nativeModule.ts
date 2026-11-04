/**
 * better-sqlite3's binding is built for one Node ABI, and an install can outlive the Node that built it: npx keys its
 * cache by package alone, so nvm, or an app that starts npx with its own PATH, reaches the same install from another
 * Node. Nothing here rebuilds on its own: the install is shared, a rebuild would swap the binding under every other
 * process using it and break the Node that built it, and it may need the network or a compiler.
 */

import { dirname } from 'node:path'

export interface RunningNode {
  version: string
  /** process.versions.modules: what Node's message calls NODE_MODULE_VERSION. */
  abi: string
  execPath: string
  platform: NodeJS.Platform
}

const THIS_NODE: RunningNode = { version: process.version, abi: process.versions.modules, execPath: process.execPath, platform: process.platform }

// Node's own wording: the path of the binding, then the version it was built for. On Windows the path is namespaced (\\?\C:\...).
const ABI_MISMATCH = /^The module '(?:\\\\\?\\(?=[A-Za-z]:))?(.+)[\\/]node_modules[\\/]better-sqlite3[\\/].*'\s+was compiled against a different Node\.js version using\s+NODE_MODULE_VERSION (\d+)\./

/** What to tell the person when `error` is better-sqlite3 built for another Node, else null. */
export function nativeModuleHelp(error: unknown, node: RunningNode = THIS_NODE): string | null {
  if ((error as { code?: unknown } | null)?.code !== 'ERR_DLOPEN_FAILED') return null
  const match = ABI_MISMATCH.exec((error as Error).message)
  if (match === null) return null
  const [, install, built] = match
  // The rebuild has to run on the Node that failed, which need not be the one the person's shell finds first.
  const windows = node.platform === 'win32'
  return [
    `better-sqlite3 in this install was built for another Node.js version (NODE_MODULE_VERSION ${built}); this is Node.js ${node.version} (NODE_MODULE_VERSION ${node.abi}) at ${node.execPath}.`,
    'One install, such as the npx cache, was used under two Node versions.',
    `Rebuild it with that Node${windows ? ' first on your PATH' : ''}, then run the command again:`,
    '',
    `  ${windows ? '' : `PATH="${dirname(node.execPath)}:$PATH" `}npm rebuild better-sqlite3 --prefix "${install}"`,
    '',
    'Any other Node version using this install then needs the same.',
  ].join('\n')
}
