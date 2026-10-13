// Local forwarder: http://127.0.0.1:PORT -> the residential gateway with its login (Chrome cannot send proxy credentials itself).
import { Server } from 'proxy-chain'
const upstream = process.env.UPSTREAM
const server = new Server({ port: Number(process.env.PORT ?? 8794), host: '127.0.0.1', prepareRequestFunction: () => ({ upstreamProxyUrl: upstream }) })
server.listen(() => console.log(`forwarder on 127.0.0.1:${server.port}`))
