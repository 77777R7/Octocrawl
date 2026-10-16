# Why HTTP 200 is not enough to accept a scraped page

Demonstration recorded 16 October 2026. This is a **synthetic fixture demonstration** of Octocrawl’s existing result-display logic at source commit `bc47bf0e62b07c45b517c2761f1ccb8c7e599073`. It is not a live-site success rate, an extraction benchmark or a comparison with another provider.

HTTP 200 says the server returned a successful HTTP response. The response may contain a navigation shell, a verification message, the wrong region of a page or a source-side error instead of the table you need. Accept the content against the task you asked for, and keep that decision separate from the network response.

Octocrawl exposes fetch status, task verification and readiness separately. `verification.status: "not_requested"` means no task contract was checked. A configured check that passes establishes only that check, not independent accuracy of every field. Readiness can identify content that was not loaded, was not extracted or was not served.

## Four controlled results, the same HTTP status

We passed these four synthetic objects to the same `taskStatus` function the public page uses. The function formats an existing verdict; it does not inspect HTML or perform verification.

| Fixture | Input alongside HTTP 200 / fetch success | Actual label | Acceptance boundary |
| --- | --- | --- | --- |
| No contract | `verification.status=not_requested` | Page read · Task unverified | Review the needed content or define a task contract |
| Configured checks pass | `verification.status=passed`, `readiness.state=ready` | Configured checks passed | Limited to the configured checks |
| Expected table absent | Failed `minTables` check observes `0 tables, at least 1 asked`; readiness `not_extracted` | Configured checks failed | Review region/extraction; another paid fetch is not automatically a fix |
| Source does not serve data | `verification.status=passed`, readiness `not_served`, basis `source_data_error` | Target data unavailable | A weak passing check cannot establish that the missing target was served |

A blocked result is another case: preserve its access/policy reason instead of treating the block message as target content. A partially useful result needs a separate review decision. A missing field is unknown; a zero is a value that needs evidence in the source.

## Reproduce the verdict demonstration

In the Octocrawl source checkout with dependencies installed, run:

```bash
node --import tsx --input-type=module <<'JS'
import { taskStatus } from './apps/public-web/src/taskStatus.ts'
const cases = [
  { name: 'not requested', http: 200, status: 'success',
    verification: { status: 'not_requested' } },
  { name: 'configured checks pass', http: 200, status: 'success',
    verification: { status: 'passed' },
    readiness: { state: 'ready', basis: [] } },
  { name: 'target missing', http: 200, status: 'success',
    verification: { status: 'failed', checks: [
      { type: 'minTables', passed: false, observed: '0 tables, at least 1 asked' }
    ] }, readiness: { state: 'not_extracted', basis: [] } },
  { name: 'source did not serve data', http: 200, status: 'success',
    verification: { status: 'passed' },
    readiness: { state: 'not_served', basis: ['source_data_error'] } }
]
for (const input of cases) {
  console.log(input.name, JSON.stringify(taskStatus(input)))
}
JS
```

The third result includes:

```json
{
  "label": "Configured checks failed",
  "detail": "The page was served but the target content was not extracted. Review extraction; another paid request is not a fix. Configured checks failed. minTables: 0 tables, at least 1 asked",
  "tone": "partial"
}
```

The fourth label is `Target data unavailable`, even though its synthetic verification says passed. The command above contains the full synthetic inputs and prints their actual outputs. The existing [rendered regression suite](https://github.com/77777R7/Octocrawl/blob/main/apps/public-web/test/taskCompletion.integration.test.ts) was also run locally: 13 cases passed, including unverified results, explicit failed checks and unavailable source data. It exercises a browser with injected responses, not independent live acquisition.

## Use the distinction in a pipeline

Keep the original result and reason even when it produces no chunks. Send partial results to review. Do not embed the text of a blocked/error page simply because a Markdown field is nonempty. If no task check was requested, record the result as unverified instead of renaming fetch success to “accurate.”

The [RAG guide](https://octocrawl.dev/blog/web-scraping-for-rag/) shows source URL, timestamp and hash retention; splitting and embedding stay in your pipeline. The [MCP guide](https://octocrawl.dev/docs/connect-mcp/) shows what to inspect after connecting, and the [result-state reference](https://octocrawl.dev/docs/limits/) describes the available routes and limits. None of this establishes that every hard site is handled correctly; validate the source region and values your own task requires.
