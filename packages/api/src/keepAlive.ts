import type { Server } from 'node:http'
import type { Socket } from 'node:net'

/**
 * Keeps Node's keep-alive idle timeout from resetting a request that is
 * already on its way. The engine's extraction runs on this thread and can hold
 * the event loop for several seconds on a large page (5 to 6 s on some of
 * docs.python.org's). When the loop comes back, Node runs its timers before it
 * reads the sockets, so the idle timeout of a connection whose client sent its
 * next request during the stall fires first and destroys the socket with that
 * request unread: the client gets ECONNRESET. A 'timeout' listener on the
 * server takes over that destroy (Node's documented behaviour); this one waits
 * until the sockets have been read and closes the connection only if nothing
 * arrived on it since the timeout fired. A request that did arrive is answered,
 * and Node arms the idle timeout again once its response is sent.
 */
export function closeIdleOnlyWhenUnread(server: Server): void {
  server.on('timeout', (socket: Socket) => {
    const bytesRead = socket.bytesRead
    setImmediate(() => { if (socket.bytesRead === bytesRead) socket.destroy() })
  })
}
