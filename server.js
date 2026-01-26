/**
 * server.js
 * Entrypoint: Next + Express + Socket.IO
 * Loads the socket handler in lib/socket.js
 */

const express = require('express')
const next = require('next')
const http = require('http')
const { Server } = require('socket.io')
const helmet = require('helmet')
const socketHandler = require('./lib/socket')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()
  server.use(helmet())

  // static hosting (Next handles public/.next)
  const httpServer = http.createServer(server)
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGIN || '*',
      methods: ['GET', 'POST']
    },
    pingInterval: 20000,
    pingTimeout: 60000
  })

  // mount socket logic
  socketHandler(io)

  // default next handler
  server.all('*', (req, res) => handle(req, res))

  const port = parseInt(process.env.PORT || '3000', 10)
  httpServer.listen(port, () => {
    console.log(`> Hina Chess ready on http://0.0.0.0:${port} (env=${process.env.NODE_ENV})`)
  })
}).catch(err => {
  console.error('next prepare failed', err)
})
