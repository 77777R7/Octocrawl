import type { Attempt, CrawlReport, PaidCallRecord, PaidCallTotals, Task } from '@w2l/contracts'
import type { TaskStore } from './taskStore.js'

export async function crawlReportFromStore(store: TaskStore, taskId: string): Promise<CrawlReport | null> {
  const task = await store.getTask(taskId)
  if (task === null) return null
  const attempts = await store.listAttempts(taskId)
  const latest = attempts[attempts.length - 1]
  if (latest === undefined) {
    return {
      taskId,
      attemptId: '',
      status: task.status,
      pagesFetched: 0,
      cachedPages: 0,
        budgetExceeded: null,
        loopDetected: false,
        wallMs: 0,
        costUsd: null,
        costUnknown: true,
        contentTokens: null,
        contentTokensUnknown: true,
        discovery: null,
        ...(task.attribution === undefined ? {} : { attribution: task.attribution }),
    }
  }
  const steps = await store.listSteps(taskId, latest.id)
  const report = reportFromTaskAttempt(
    task,
    latest,
    steps.filter((step) => step.cached).length,
    steps.some((step) => step.result?.failureReason === 'loop_detected'),
  )
  // A batch counts its contract over every attempt, where it counts succeeded and failed.
  const counted = task.batch === undefined && task.crawl?.verify !== undefined ? { ...report, ...(await store.countVerifications(taskId, latest.id)) } : report
  const paid = await store.listPaidCalls(taskId)
  return paid.length === 0 ? counted : { ...counted, paidCalls: paidCallTotals(paid) }
}

/**
 * What a set of paid calls may have cost, for a budget: a settled call at its charge, a released one at nothing, any other
 * at its ceiling or the charge it already holds, whichever is higher. Never less than the provider could bill.
 */
export function paidCallExposureUsd(calls: readonly PaidCallRecord[]): number {
  return calls.reduce((sum, call) => sum + (call.state === 'released' ? 0 : call.state === 'settled' ? call.chargedUsd ?? call.ceilingUsd : Math.max(call.ceilingUsd, call.chargedUsd ?? 0)), 0)
}

/** A task's paid calls as its status shows them (PA E5). */
export function paidCallTotals(calls: readonly PaidCallRecord[]): PaidCallTotals {
  const totals: PaidCallTotals = { reservedUsd: 0, knownChargedUsd: 0, unknownExposureUsd: 0, refundableUsd: 0, overCeiling: 0, calls: {} }
  for (const call of calls) {
    totals.calls[call.state] = (totals.calls[call.state] ?? 0) + 1
    if (call.state === 'reserved' || call.state === 'submitted') {
      totals.reservedUsd += call.ceilingUsd
      if (call.state === 'reserved') totals.refundableUsd += call.ceilingUsd
    } else if (call.state === 'settled') {
      totals.knownChargedUsd += call.chargedUsd ?? 0
      if ((call.chargedUsd ?? 0) > call.ceilingUsd + 1e-9) totals.overCeiling++
    } else if (call.state === 'unknown') totals.unknownExposureUsd += Math.max(call.ceilingUsd, call.chargedUsd ?? 0)
    else if (call.state === 'usage_pending') totals.unknownExposureUsd += call.chargedUsd ?? call.ceilingUsd
  }
  return totals
}

export function reportFromTaskAttempt(
  task: Task,
  attempt: Attempt,
  cachedPages: number,
  loopDetected = false,
): CrawlReport {
  return {
    taskId: task.id,
    attemptId: attempt.id,
    status: task.status,
    pagesFetched: attempt.pagesFetched,
    cachedPages,
    budgetExceeded: attempt.budgetExceeded,
    loopDetected,
    wallMs: attempt.wallMs,
    costUsd: attempt.costUsd,
    costUnknown: attempt.costUnknown,
    contentTokens: attempt.contentTokens,
    contentTokensUnknown: attempt.contentTokensUnknown,
    // A batch discovers nothing; a crawl attempt stored before the counters were kept has none, and one stored before the sitemap record read no sitemap.
    discovery: task.batch !== undefined || attempt.discovery === undefined || attempt.discovery === null ? null : { ...attempt.discovery, sitemap: attempt.discovery.sitemap ?? null },
    ...(task.attribution === undefined ? {} : { attribution: task.attribution }),
  }
}
