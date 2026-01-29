/**
 * server.js
 * Backend: Express + Socket.IO + MongoDB + Auth
 * Optimized for stability and performance.
 */
require('dotenv').config()
const express = require('express')
const next = require('next')
const http = require('http')
const { Server } = require('socket.io')
const mongoose = require('mongoose')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const { User } = require('./lib/rooms') // Models imported from shared lib
const socketHandler = require('./lib/socket')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const JWT_SECRET = process.env.JWT_SECRET || 'hina-pro-secret-key-2026'
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hina_chess_pro'

// DB Connection with retry logic
const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI)
        console.log('✅ MongoDB Connected')
    } catch (err) {
        console.error('❌ DB Error:', err)
        setTimeout(connectDB, 5000)
    }
}
connectDB()

app.prepare().then(() => {
  const server = express()
  const httpServer = http.createServer(server)
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling']
  })

  server.use(express.json())
  server.use(cookieParser())

  // --- AUTH API ---
  
  // Register
  server.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body
        if(!username || !password || username.length < 3) {
            return res.status(400).json({ ok: false, error: 'نام کاربری باید حداقل ۳ حرف باشد.' })
        }
        
        const existing = await User.findOne({ username })
        if(existing) return res.status(400).json({ ok: false, error: 'این نام کاربری قبلاً گرفته شده است.' })

        const user = await User.create({ username, password }) // Password hashing handled in model logic or simple for demo
        
        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' })
        res.cookie('token', token, { httpOnly: true, maxAge: 7*24*3600*1000 })
        res.json({ ok: true, user: { id: user._id, username: user.username, elo: user.elo } })
    } catch(e) {
        console.error(e)
        res.status(500).json({ ok: false, error: 'خطای سرور' })
    }
  })

  // Login
  server.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body
        const user = await User.findOne({ username, password }) // In prod, use bcrypt.compare
        if(!user) return res.status(401).json({ ok: false, error: 'نام کاربری یا رمز عبور اشتباه است.' })

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' })
        res.cookie('token', token, { httpOnly: true, maxAge: 7*24*3600*1000 })
        res.json({ ok: true, user: { id: user._id, username: user.username, elo: user.elo } })
    } catch(e) {
        res.status(500).json({ ok: false, error: 'خطای سرور' })
    }
  })

  // Logout
  server.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token')
    res.json({ ok: true })
  })

  // Me (Session Check)
  server.get('/api/auth/me', async (req, res) => {
    const token = req.cookies.token
    if(!token) return res.json({ user: null })
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      const user = await User.findById(decoded.id).select('-password')
      res.json({ user })
    } catch(e) { res.json({ user: null }) }
  })

  // --- SOCKET INTEGRATION ---
  io.use((socket, next) => {
    const cookie = socket.handshake.headers.cookie
    socket.user = { username: 'Guest', isGuest: true } // Default
    if (cookie) {
        const token = cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1]
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET)
                socket.user = { ...decoded, isGuest: false }
            } catch(e) {}
        }
    }
    next()
  })

  socketHandler(io)

  server.all('*', (req, res) => handle(req, res))

  const PORT = process.env.PORT || 3000
  httpServer.listen(PORT, (err) => {
    if (err) throw err
    console.log(`> 🚀 Hina Chess Ready on http://localhost:${PORT}`)
  })
})
