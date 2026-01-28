/**
 * server.js
 * Full Stack Server: Next.js + Socket.IO + Express API + MongoDB + JWT Auth
 */
require('dotenv').config()
const express = require('express')
const next = require('next')
const http = require('http')
const { Server } = require('socket.io')
const mongoose = require('mongoose')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const helmet = require('helmet')

const socketHandler = require('./lib/socket')
// Import Models temporarily defined here to keep file count same or load from lib
const { User } = require('./lib/rooms') // We will put models in rooms.js to save file space

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()
const JWT_SECRET = process.env.JWT_SECRET || 'hina-super-secret-key-change-me'

// --- DB Connection ---
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hina_chess_v3'
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB Connected')).catch(err => console.error('❌ DB Error:', err))

app.prepare().then(() => {
  const server = express()
  const httpServer = http.createServer(server)
  const io = new Server(httpServer, {
    cors: { origin: '*' }, // In production set this to your domain
    transports: ['websocket', 'polling']
  })

  server.use(express.json())
  server.use(cookieParser())
  // Relax helmet for images/scripts
  server.use(helmet({ contentSecurityPolicy: false }))

  // --- API ROUTES (Auth) ---
  
  // Register
  server.post('/api/auth/register', async (req, res) => {
    try {
      const { username, password } = req.body
      if(!username || !password) return res.status(400).json({error: 'All fields required'})
      if(password.length < 6) return res.status(400).json({error: 'Password too short'})
      
      const existing = await User.findOne({ username })
      if(existing) return res.status(400).json({error: 'Username taken'})

      const hashedPassword = await bcrypt.hash(password, 10)
      const user = await User.create({ username, password: hashedPassword })
      
      // Auto login
      const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' })
      res.cookie('token', token, { httpOnly: true, sameSite: 'lax' })
      res.json({ ok: true, user: { id: user._id, username: user.username, elo: user.elo } })
    } catch(e) { res.status(500).json({error: e.message}) }
  })

  // Login
  server.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body
      const user = await User.findOne({ username })
      if(!user) return res.status(400).json({error: 'User not found'})

      const valid = await bcrypt.compare(password, user.password)
      if(!valid) return res.status(400).json({error: 'Invalid password'})

      const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' })
      res.cookie('token', token, { httpOnly: true, sameSite: 'lax' }) // HttpOnly for security
      res.json({ ok: true, user: { id: user._id, username: user.username, elo: user.elo } })
    } catch(e) { res.status(500).json({error: e.message}) }
  })

  // Logout
  server.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token')
    res.json({ ok: true })
  })

  // Me
  server.get('/api/auth/me', async (req, res) => {
    const token = req.cookies.token
    if(!token) return res.status(401).json({error: 'Not logged in'})
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      const user = await User.findById(decoded.id).select('-password')
      res.json({ user })
    } catch(e) { res.status(401).json({error: 'Invalid token'}) }
  })

  // --- SOCKET ---
  // Middleware to attach user to socket
  io.use((socket, next) => {
    const cookie = socket.handshake.headers.cookie
    if (cookie) {
        const token = cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1]
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET)
                socket.user = decoded
            } catch (e) {}
        }
    }
    next()
  })
  
  socketHandler(io)

  // Next.js Handler
  server.all('*', (req, res) => handle(req, res))

  const PORT = process.env.PORT || 3000
  httpServer.listen(PORT, () => {
    console.log(`> 🚀 Hina Chess Active on port ${PORT}`)
  })
})
