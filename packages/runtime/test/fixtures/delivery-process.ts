import { readFileSync } from 'node:fs'
import { createSecureContext } from 'node:tls'
import { hostedNetworkPolicy } from '../../../contracts/src/index.js'
import { DeliveryStore } from '../../src/deliveryStore.js'
import { DeliveryWorker } from '../../src/deliveryWorker.js'

const store = DeliveryStore.open(process.env.DELIVERY_TEST_DB!)
const policy = hostedNetworkPolicy()
policy.privateAllowlist = ['127.0.0.1/32']
const ca = readFileSync(process.env.DELIVERY_TEST_CA!)
// A fresh process builds Node's root CA store on its first TLS context, synchronously (about a second
// on macOS with NODE_USE_SYSTEM_CA=1). Pay that before claiming so the lease times only the delivery.
createSecureContext({ ca })
// The store's lease runs on the clock the test passes in and the request deadline on real timers, so a stalled runner
// can delay this process but cannot expire its lease and fence out its result; the test expires a lease by starting
// the next process with a later clock.
const now = Number(process.env.DELIVERY_TEST_NOW)
const worker = new DeliveryWorker(store, { networkPolicy: policy, ca, now: () => now, leaseMs: 20_000, requestTimeoutMs: 10_000, retryBaseMs: 10 })
try { await worker.processOne() } finally { store.close() }
