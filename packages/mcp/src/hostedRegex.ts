/**
 * The operator's switch for the regular-expression checks of a task contract on hosted Octocrawl (ADR 0006, amendment of
 * 2026-10-29): W2L_HOSTED_REGEX_CHECKS=1 on the API and the job worker, honoured only when this process's start-up
 * self-test passes (regexBoundSelfTest in @w2l/runtime). Unset, empty or 0: off, and the checks are refused by name as
 * before; any other value stops the start. A self-test that fails leaves them off, and the startup line says why.
 */
import { regexBoundSelfTest } from '@w2l/runtime'

export interface HostedRegexChecks {
  enabled: boolean
  /** What the self-test found wrong; empty when it passed or did not run. */
  failures: string[]
}

export function hostedRegexChecksFromEnv(env: NodeJS.ProcessEnv, selfTest: () => { ok: boolean; failures: string[] } = regexBoundSelfTest): HostedRegexChecks {
  const value = (env.W2L_HOSTED_REGEX_CHECKS ?? '').trim()
  if (value === '' || value === '0') return { enabled: false, failures: [] }
  if (value !== '1') throw new Error('W2L_HOSTED_REGEX_CHECKS must be 1 (on), or 0 or unset (off)')
  const result = selfTest()
  return { enabled: result.ok, failures: result.failures }
}
