import { join, resolve } from 'node:path'

/** A value as plist XML text. */
export const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')

/**
 * The local MCP host's LaunchAgent plist, from the installing shell's environment: a LaunchAgent does not inherit
 * that shell, so each setting the host reads is written into it. W2L_ACCESS_GRANT is forwarded as given (the JSON
 * itself) or as an absolute path, so the host started by launchd runs under the grant the shell named.
 * Pure: the caller checks the files exist and writes the text.
 */
export function localServicePlist({label,nodePath,root,taskRoot,port,env,receiverCert}) {
  const entry=(name,value)=>`<key>${name}</key><string>${xml(value)}</string>`
  const amazonStateEnv=env.W2L_AMAZON_PUBLIC_STATE_FILE?entry('W2L_AMAZON_PUBLIC_STATE_FILE',resolve(env.W2L_AMAZON_PUBLIC_STATE_FILE)):''
  const rawCaptureEnv=env.W2L_CAPTURE_RAW_DIR?entry('W2L_CAPTURE_RAW_DIR',resolve(env.W2L_CAPTURE_RAW_DIR)):''
  const extraEnv=env.W2L_LOCAL_DELIVERY_LOOPBACK==='1'
    ? `<key>W2L_LOCAL_DELIVERY_LOOPBACK</key><string>1</string>${entry('W2L_DELIVERY_CA_FILE',receiverCert)}`
    : ''
  const pollEnv=env.W2L_LOCAL_MONITOR_POLL_MS?entry('W2L_LOCAL_MONITOR_POLL_MS',env.W2L_LOCAL_MONITOR_POLL_MS):''
  const grant=(env.W2L_ACCESS_GRANT??'').trim()
  const grantEnv=grant===''?'':entry('W2L_ACCESS_GRANT',grant.startsWith('{')?grant:resolve(grant))
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(nodePath)}</string><string>${xml(join(root,'packages/mcp/dist/localHostCli.js'))}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict><key>W2L_TASK_ROOT</key><string>${xml(taskRoot)}</string><key>W2L_LOCAL_MCP_PORT</key><string>${port}</string>${extraEnv}${pollEnv}${amazonStateEnv}${rawCaptureEnv}${grantEnv}</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(join(root,'.w2l/local-mcp.stdout.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(root,'.w2l/local-mcp.stderr.log'))}</string>
</dict></plist>
`
}
