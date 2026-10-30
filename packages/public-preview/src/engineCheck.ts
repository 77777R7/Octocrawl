// Run in a worker thread by cli.ts once the server listens: it loads the reading engine, so a new instance has read its
// files before the first run loads it (server.ts), and an engine that cannot load fails here instead of on that run.
import './preview.js'
import './map.js'
