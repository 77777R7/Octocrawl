#!/usr/bin/env node
// Issues, lists and revokes hosted Octocrawl API keys (ROADMAP PH phase 1; docs/hosted-api.md).
//
//   node scripts/hosted/issue-key.mjs issue --label 'name or email' [--plan free] [--daily 1000] [--browser] [--uid <account>]
//   node scripts/hosted/issue-key.mjs list
//   node scripts/hosted/issue-key.mjs revoke <digest>
//
// A key is `oc_` and 32 random bytes in base64url, printed once and never stored: the service and this script keep
// only its HMAC-SHA256 under W2L_QUOTA_HASH_KEY (the same secret the service reads), as the document id in Firestore's
// `hostedApiKeys` collection (packages/mcp/src/hostedApi.ts, keyDigest and FirestoreHostedKeys). The hash key comes from
// W2L_QUOTA_HASH_KEY, else from Secret Manager (`w2l-quota-hash-key`, latest) through gcloud; the Firestore calls use
// `gcloud auth print-access-token`. W2L_PROJECT_ID names the project. A key issued with --uid belongs to that account,
// which must have signed in on octocrawl.dev once (users/{uid}) before its first call. The key spends the account's
// credits (packages/mcp/src/hostedCredits.ts) and its daily limit is not used.
import { execFileSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'

const project = process.env.W2L_PROJECT_ID
if (!project) fail('W2L_PROJECT_ID is required')
const [command = 'help', ...rest] = process.argv.slice(2)
const options = parse(rest)

function fail(message) { console.error(message); process.exit(2) }
function parse(args) {
  const out = { _: [] }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) { out._.push(arg); continue }
    const name = arg.slice(2)
    if (name === 'browser') { out.browser = true; continue }
    out[name] = args[++i]
  }
  return out
}
function gcloud(args) { return execFileSync('gcloud', [...args, `--project=${project}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim() }
function hashKey() {
  const fromEnv = process.env.W2L_QUOTA_HASH_KEY
  const key = fromEnv && fromEnv.length >= 32 ? fromEnv : gcloud(['secrets', 'versions', 'access', 'latest', '--secret=w2l-quota-hash-key'])
  if (key.length < 32) fail('the hash key must contain at least 32 characters')
  return key
}
function digest(key) { return createHmac('sha256', hashKey()).update(`key:${key}`).digest('hex') }
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/hostedApiKeys`
async function firestore(method, path, body) {
  const token = gcloud(['auth', 'print-access-token'])
  const response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!response.ok) fail(`Firestore ${method} ${path} answered ${response.status}: ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}
const fields = (record) => ({
  enabled: { booleanValue: record.enabled },
  plan: { stringValue: record.plan },
  dailyLimit: { integerValue: String(record.dailyLimit) },
  browser: { booleanValue: record.browser },
  label: { stringValue: record.label },
  createdAt: { timestampValue: record.createdAt },
  ...(record.uid === undefined ? {} : { uid: { stringValue: record.uid } }),
})
const read = (doc) => ({
  digest: doc.name.split('/').pop(),
  enabled: doc.fields?.enabled?.booleanValue === true,
  plan: doc.fields?.plan?.stringValue ?? '',
  dailyLimit: Number(doc.fields?.dailyLimit?.integerValue ?? 0),
  browser: doc.fields?.browser?.booleanValue === true,
  label: doc.fields?.label?.stringValue ?? '',
  createdAt: doc.fields?.createdAt?.timestampValue ?? '',
  ...(doc.fields?.uid?.stringValue === undefined ? {} : { uid: doc.fields.uid.stringValue }),
})

if (command === 'issue') {
  const label = options.label
  if (!label) fail('--label is required: who the key is for')
  const dailyLimit = Number(options.daily ?? 1000)
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1) fail('--daily must be a positive integer')
  if ('uid' in options && (typeof options.uid !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(options.uid) || /^__.*__$/.test(options.uid))) fail('--uid must be 8 to 128 letters, digits, _ or -, and not of the form __name__')
  const key = `oc_${randomBytes(32).toString('base64url')}`
  const record = { enabled: true, plan: options.uid === undefined ? (options.plan ?? 'free') : 'account', dailyLimit, browser: options.browser === true, label, createdAt: new Date().toISOString(), ...(options.uid === undefined ? {} : { uid: options.uid }) }
  const id = digest(key)
  await firestore('PATCH', `/${id}?currentDocument.exists=false`, { fields: fields(record) })
  console.log(JSON.stringify({ issued: true, digest: id, ...record }))
  console.log(`\nThe key, shown once:\n\n  ${key}\n\nUse it as Authorization: Bearer ${key.slice(0, 6)}… (https://octocrawl.dev/docs/connect-mcp/)`)
} else if (command === 'list') {
  const page = await firestore('GET', '?pageSize=200')
  for (const doc of page.documents ?? []) console.log(JSON.stringify(read(doc)))
  if (!page.documents?.length) console.log('no keys issued')
} else if (command === 'revoke') {
  const id = options._[0]
  if (!/^[a-f0-9]{64}$/.test(id ?? '')) fail('revoke takes the key digest from `list`')
  await firestore('PATCH', `/${id}?updateMask.fieldPaths=enabled&currentDocument.exists=true`, { fields: { enabled: { booleanValue: false } } })
  console.log(JSON.stringify({ revoked: true, digest: id }))
} else {
  console.log('usage: issue-key.mjs issue --label <text> [--plan free] [--daily 1000] [--browser] [--uid <account>] | list | revoke <digest>')
}
