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
const worker = new DeliveryWorker(store, { networkPolicy: policy, ca, leaseMs: 800, requestTimeoutMs: 600, retryBaseMs: 10 })
try { await worker.processOne() } finally { store.close() }
