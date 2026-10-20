import { expect, it } from 'vitest'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The LaunchAgent text scripts/section-c/local-service.mjs install writes; built here without running install, which would bootout and bootstrap the person's own service.
type Plist = (options: { label: string; nodePath: string; root: string; taskRoot: string; port: number; env: NodeJS.ProcessEnv; receiverCert: string }) => string
const script = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts/section-c/local-service-plist.mjs')).href
const plistFor = async (env: NodeJS.ProcessEnv) => {
  const { localServicePlist } = await import(script) as { localServicePlist: Plist }
  return localServicePlist({ label: 'dev.w2l.local-mcp', nodePath: '/usr/local/bin/node', root: '/repo', taskRoot: '/repo/.w2l/api', port: 8791, env, receiverCert: '/repo/.w2l/local-receiver/receiver.crt' })
}

it('forwards W2L_ACCESS_GRANT to the local host it starts, a path made absolute and the JSON as given; without one, writes none', async () => {
  const none = await plistFor({})
  expect(none).not.toContain('W2L_ACCESS_GRANT')
  expect(none).toContain('<key>W2L_TASK_ROOT</key><string>/repo/.w2l/api</string><key>W2L_LOCAL_MCP_PORT</key><string>8791</string></dict>')
  expect(await plistFor({ W2L_ACCESS_GRANT: '/grants/steel.json' })).toContain('<key>W2L_ACCESS_GRANT</key><string>/grants/steel.json</string>')
  expect(await plistFor({ W2L_ACCESS_GRANT: 'grants/steel.json' })).toContain(`<key>W2L_ACCESS_GRANT</key><string>${join(process.cwd(), 'grants/steel.json')}</string>`)
  const json = JSON.stringify({ tier: 'enhanced', capabilities: ['installed_chrome'] })
  expect(await plistFor({ W2L_ACCESS_GRANT: json })).toContain('<key>W2L_ACCESS_GRANT</key><string>{&quot;tier&quot;:&quot;enhanced&quot;,&quot;capabilities&quot;:[&quot;installed_chrome&quot;]}</string>')
  expect(await plistFor({ W2L_ACCESS_GRANT: '  ' })).not.toContain('W2L_ACCESS_GRANT')
})
