/**
 * server.js
 * Entrypoint: Next + Express + Socket.IO + MongoDB
 */

const express = require('express')
const next = require('next')
const http = require('http')
const { Server } = require('socket.io')
const helmet = require('helmet')
const mongoose = require('mongoose')
const socketHandler = require('./lib/socket')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hina-chess'

app.prepare().then(async () => {
  const server = express()
  server.use(helmet({ contentSecurityPolicy: false })) // Allow external images/scripts if needed

  // Database Connection
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(MONGODB_URI)
      console.log('> Connected to MongoDB Atlas')
    } else {
      console.log('> Warning: MONGODB_URI not set. Stats will not be saved permanently.')
    }
  } catch (err) {
    console.error('> MongoDB Connection Failed:', err.message)
  }

  const httpServer = http.createServer(server)
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGIN || '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'], // Prioritize websocket
    pingInterval: 25000,
    pingTimeout: 20000
  })

  // Mount socket logic
  socketHandler(io)

  server.all('*', (req, res) => handle(req, res))

  const port = parseInt(process.env.PORT || '3000', 10)
  httpServer.listen(port, () => {
    console.log(`> Hina Chess ready on http://0.0.0.0:${port}`)
    console.log(`> Mode: ${dev ? 'Development' : 'Production'} | RAM Optimized`)
  })
}).catch(err => {
  console.error('Next prepare failed', err)
})
