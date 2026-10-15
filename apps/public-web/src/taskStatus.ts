/** A display view of the server's actual task verdict; it never makes or changes a verification decision. */
export interface TaskState {
  verification?: {
    status: 'passed' | 'failed' | 'not_requested'
    reason?: string | null
    checks?: readonly { type: string; passed: boolean | null; observed: string }[]
  }
  readiness?: { state: 'ready' | 'not_loaded' | 'not_extracted' | 'not_served'; basis: readonly string[] }
  warnings?: readonly { code: string; message: string }[]
}

export function taskStatus(result: TaskState): { label: string; detail: string; tone: 'success' | 'partial' } {
  const verification = result.verification
  const unavailable = result.readiness?.basis.includes('source_data_error') === true || result.warnings?.some(warning => warning.code === 'source_data_error') === true
  const verdict = verification?.status === 'passed' ? 'Configured checks passed. This does not establish independent field accuracy.'
    : verification?.status === 'failed' ? `Configured checks failed.${verification.reason === 'empty_not_allowed' ? ' An empty result is not allowed by this task.' : ''}`
      : 'This result has not been verified against a task contract.'
  const checks = verification?.status === 'failed' ? verification.checks?.filter(check => check.passed !== true).map(check => `${check.type}: ${check.observed}`).join('; ') : undefined
  const ready = unavailable ? 'The source did not serve the target data. Navigation or waiting does not establish task completion.'
    : result.readiness?.state === 'not_served' ? 'The target content was not served. Check access and source availability before another request.'
      : result.readiness?.state === 'not_extracted' ? 'The page was served but the target content was not extracted. Review extraction; another paid request is not a fix.'
        : result.readiness?.state === 'not_loaded' ? 'The target content had not finished loading. Waiting would require an explicit action in the same authorized session.' : ''
  return {
    label: unavailable ? 'Target data unavailable' : verification?.status === 'failed' ? 'Configured checks failed'
      : verification?.status === 'passed' ? 'Configured checks passed' : 'Page read · Task unverified',
    detail: [ready, verdict, checks].filter(Boolean).join(' '),
    tone: !unavailable && verification?.status === 'passed' && (!result.readiness || result.readiness.state === 'ready') ? 'success' : 'partial',
  }
}
