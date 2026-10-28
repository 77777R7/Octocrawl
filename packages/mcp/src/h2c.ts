import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http'
import { createServer as createH2cServer, type Http2Session } from 'node:http2'
import type { Socket } from 'node:net'

/** How many MB of unread response one HTTP/2 connection may hold before it refuses new streams. */
export const H2C_SESSION_MEMORY_MB = 128
/** What every HTTP/2 connection opens with (RFC 9113 §3.4); no HTTP/1 request starts with it. */
const PREFACE = Buffer.from('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n', 'latin1')

/**
 * Lets an HTTP/1 server answer HTTP/2 cleartext (h2c with prior knowledge) on the same port, with the same handler:
 * each connection is read until its first bytes show which protocol it speaks, and handed to that one's server.
 *
 * Cloud Run passes a client's disconnect on to the container only over HTTP/2: "When you use HTTP/1.1 on Cloud Run,
 * client disconnect events are not propagated to the Cloud Run container"
 * (https://docs.cloud.google.com/run/docs/troubleshooting, read 2026-10-28). Over HTTP/1.1 a cancelled hosted scrape
 * ran to its end, held the key's browser lease and was charged. Deployed with `--use-http2`, Cloud Run speaks h2c to
 * the container and resets a request's stream when its client goes away, and the response closes before it ended.
 * HTTP/1 stays served for a local run, the tests and a deploy without the flag.
 *
 * `close()` ends the HTTP/2 connections gracefully (GOAWAY, open streams finish), as the HTTP/1 server's own close
 * ends its idle connections; call it with the server's.
 */
export function serveH2cToo(server: HttpServer, handler: (req: IncomingMessage, res: ServerResponse) => void): { close(): void } {
  // A session counts the response bytes its peer has not read yet, and past maxSessionMemory (10 MB by default) it
  // resets every new stream on the connection: while a page of job results (up to 16 MB) or a scrape with rawHtml was
  // on its way, Cloud Run's other request on the same connection failed. A response is still bounded by the server.
  const h2c = createH2cServer({ maxSessionMemory: H2C_SESSION_MEMORY_MB }, (req, res) => {
    // A reset stream's response reports writableFinished, which @hono/node-server reads to tell a client that went away;
    // an error on the request is what it reads first, and it then stops the request's signal.
    req.once('aborted', () => { if (!res.writableEnded) req.destroy(new Error('the client reset the stream before the response')) })
    req.on('error', () => {})
    handler(req as unknown as IncomingMessage, res as unknown as ServerResponse)
  })
  const sessions = new Set<Http2Session>()
  // Connections that have not yet said which protocol they speak: neither server knows them, so close() ends them here.
  const undecided = new Set<Socket>()
  h2c.on('session', (session) => { sessions.add(session); session.once('close', () => sessions.delete(session)) })
  // The HTTP/1 server's own connection listener, which now gets only the connections that are not HTTP/2.
  const http1 = server.listeners('connection') as ((socket: Socket) => void)[]
  server.removeAllListeners('connection')
  server.on('connection', (socket: Socket) => {
    let head = Buffer.alloc(0)
    const read = (chunk: Buffer) => {
      head = Buffer.concat([head, chunk])
      const seen = Math.min(head.length, PREFACE.length)
      const h2 = head.subarray(0, seen).equals(PREFACE.subarray(0, seen))
      if (h2 && head.length < PREFACE.length) return
      undecided.delete(socket)
      socket.off('data', read)
      socket.off('error', gone)
      socket.setTimeout(0)
      socket.off('timeout', gone)
      socket.pause()
      // The bytes read so far go back to the socket, where the chosen server reads them first.
      socket.unshift(head)
      if (h2) h2c.emit('connection', socket)
      else {
        for (const listener of http1) listener.call(server, socket)
        // The HTTP/2 session reads what is buffered itself; the HTTP/1 parser gets it once the socket flows again.
        socket.resume()
      }
    }
    // A connection that fails, or says nothing for as long as a request's headers may take, is just gone.
    const gone = () => { undecided.delete(socket); socket.destroy() }
    undecided.add(socket)
    socket.on('error', gone)
    socket.once('close', () => undecided.delete(socket))
    socket.setTimeout(server.headersTimeout, gone)
    socket.on('data', read)
  })
  return {
    close: () => {
      for (const session of sessions) session.close()
      for (const socket of undecided) socket.destroy()
    },
  }
}
