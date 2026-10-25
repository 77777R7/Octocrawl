import { createServer, type Server } from 'node:http'

/** What the stand-in does with a task: answer after some polls, fail at creation or on a poll, or never finish. */
export type MockBehaviour =
  | { solution: Record<string, unknown>; polls?: number; readyAtCreate?: boolean }
  | { createError: string }
  | { pollError: string }
  | { never: true }
  | { createGarbled: true }

/** CapSolver's createTask and getTaskResult on loopback, with every request kept for the test to read. */
export interface MockCapSolver {
  url: string
  requests: { path: string; body: Record<string, unknown> }[]
  /** The tasks created, by their request body's `task`. */
  readonly tasks: Record<string, unknown>[]
  behave: (task: Record<string, unknown>) => MockBehaviour
  close(): Promise<void>
}

export async function startMockCapSolver(behave: (task: Record<string, unknown>) => MockBehaviour): Promise<MockCapSolver> {
  const pending = new Map<string, { behaviour: MockBehaviour; polled: number }>()
  let next = 0
  const mock: MockCapSolver = {
    url: '', requests: [], behave,
    get tasks() { return mock.requests.filter((r) => r.path === '/createTask').map((r) => r.body.task as Record<string, unknown>) },
    close: async () => {},
  }
  const server: Server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      const body = JSON.parse(raw || '{}') as Record<string, unknown>
      mock.requests.push({ path: req.url ?? '', body })
      const send = (answer: Record<string, unknown>) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(answer)) }
      if (req.url === '/createTask') {
        const behaviour = mock.behave(body.task as Record<string, unknown>)
        if ('createGarbled' in behaviour) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"errorId":0,"taskId":"t'); return }
        if ('createError' in behaviour) return send({ errorId: 1, errorCode: behaviour.createError, errorDescription: `refused: ${JSON.stringify(body)}` })
        const taskId = `task-${++next}`
        if ('solution' in behaviour && behaviour.readyAtCreate === true) return send({ errorId: 0, taskId, status: 'ready', solution: behaviour.solution })
        pending.set(taskId, { behaviour, polled: 0 })
        return send({ errorId: 0, taskId, status: 'idle' })
      }
      if (req.url === '/getTaskResult') {
        const task = pending.get(String(body.taskId))
        if (task === undefined) return send({ errorId: 1, errorCode: 'ERROR_TASKID_INVALID', errorDescription: 'no such task' })
        task.polled++
        if ('pollError' in task.behaviour) return send({ errorId: 1, errorCode: task.behaviour.pollError, errorDescription: `failed for ${JSON.stringify(body)}` })
        if ('never' in task.behaviour) return send({ errorId: 0, taskId: body.taskId, status: 'processing' })
        if ('solution' in task.behaviour && task.polled > (task.behaviour.polls ?? 0)) return send({ errorId: 0, taskId: body.taskId, status: 'ready', solution: task.behaviour.solution })
        return send({ errorId: 0, taskId: body.taskId, status: 'processing' })
      }
      res.writeHead(404).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  mock.url = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
  mock.close = () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()) })
  return mock
}
