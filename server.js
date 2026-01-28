/**
 * server.js
 * Entrypoint: Next + Express + Socket.IO
 */
const express = require('express')
const next = require('next')
const http = require('http')
const { Server } = require('socket.io')
const socketHandler = require('./lib/socket')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()
  const httpServer = http.createServer(server)
  
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    pingInterval: 25000,
    pingTimeout: 20000
  })

  // Mount Socket Logic
  socketHandler(io)

  server.all('*', (req, res) => handle(req, res))

  const port = process.env.PORT || 3000
  httpServer.listen(port, () => {
    console.log(`> Hina Chess Ready on port ${port}`)
  })
}).catch(err => {
  console.error('Next.js prepare failed', err)
})
