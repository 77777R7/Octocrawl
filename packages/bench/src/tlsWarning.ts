import type { FetchWarning } from '@w2l/contracts'

/** The warning code every result of a fetch made with `skipTlsVerification` carries. */
export const TLS_UNVERIFIED = 'tls_unverified'

/**
 * The caveat a reader of the result must see without opening the trace: the
 * certificate of `host` was not verified, so nothing proves the content came
 * from that host. The browser lane's compliance record (schemaVersion 2) has
 * no TLS field; this warning and the `tls_verification_skipped` trace event
 * are the record of the relaxation.
 */
export function tlsUnverifiedWarning(host: string): FetchWarning {
  return {
    code: TLS_UNVERIFIED,
    message: `The certificate of ${host} was not verified at the caller's request; the content cannot be attributed to that host with certainty.`,
  }
}
