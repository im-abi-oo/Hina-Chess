/**
 * server.js
 * Backend: Auth + Social API + Socket + DB Fixes
 */
require('dotenv').config()
const express = require('express')
const next = require('next')
const http = require('http')
const { Server } = require('socket.io')
const mongoose = require('mongoose')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const { User, Message } = require('./lib/models') // New models file
const socketHandler = require('./lib/socket')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const JWT_SECRET = process.env.JWT_SECRET || 'hina-pro-secret-key-2026'
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hina_chess_pro'

// --- DB Connection & Fixer ---
const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI)
        console.log('✅ MongoDB Connected')
        
        // FIX: Drop the problematic index if it exists
        try {
            await mongoose.connection.collection('users').dropIndex('clientId_1')
            console.log('🔧 Fixed: Dropped old clientId index.')
        } catch(e) { /* Index doesn't exist, all good */ }

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
  server.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body
        if(!username || !password || username.length < 3) return res.status(400).json({error: 'نام کاربری کوتاه است'})
        
        const existing = await User.findOne({ username })
        if(existing) return res.status(400).json({error: 'نام کاربری تکراری است'})

        const user = await User.create({ username, password })
        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' })
        res.cookie('token', token, { httpOnly: true, maxAge: 7*24*3600*1000 })
        res.json({ ok: true, user: { id: user._id, username: user.username, elo: user.elo } })
    } catch(e) { res.status(500).json({error: 'خطای سرور'}) }
  })

  server.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body
        const user = await User.findOne({ username, password })
        if(!user) return res.status(401).json({error: 'اطلاعات اشتباه است'})

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' })
        res.cookie('token', token, { httpOnly: true, maxAge: 7*24*3600*1000 })
        res.json({ ok: true, user: { id: user._id, username: user.username, elo: user.elo } })
    } catch(e) { res.status(500).json({error: 'خطای سرور'}) }
  })

  server.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token')
    res.json({ ok: true })
  })

  server.get('/api/auth/me', async (req, res) => {
    const token = req.cookies.token
    if(!token) return res.json({ user: null })
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      // Populate friends and requests
      const user = await User.findById(decoded.id)
          .select('-password')
          .populate('friends', 'username elo')
          .populate('friendRequests.from', 'username')
      res.json({ user })
    } catch(e) { res.json({ user: null }) }
  })

  // --- SOCIAL API ---
  // Send Friend Request
  server.post('/api/social/request', async (req, res) => {
      const token = req.cookies.token
      if(!token) return res.status(401).json({error: 'Unauthorized'})
      try {
          const sender = jwt.verify(token, JWT_SECRET)
          const { targetUsername } = req.body
          
          const target = await User.findOne({ username: targetUsername })
          if(!target) return res.status(404).json({error: 'کاربر یافت نشد'})
          if(target._id.toString() === sender.id) return res.status(400).json({error: 'نمی‌توانید به خودتان درخواست دهید'})

          // Check if already friends or requested
          const senderUser = await User.findById(sender.id)
          if(senderUser.friends.includes(target._id)) return res.status(400).json({error: 'شما قبلاً دوست هستید'})
          
          const alreadyRequested = target.friendRequests.find(r => r.from.toString() === sender.id)
          if(alreadyRequested) return res.status(400).json({error: 'قبلاً درخواست داده‌اید'})

          target.friendRequests.push({ from: sender.id, username: sender.username })
          await target.save()
          
          // Notify via Socket
          const targetSocket = io.sockets.adapter.rooms.get(`user-${target._id}`)
          if(targetSocket) io.to(`user-${target._id}`).emit('social-update')

          res.json({ ok: true })
      } catch(e) { res.status(500).json({error: e.message}) }
  })

  // Accept Request
  server.post('/api/social/accept', async (req, res) => {
      const token = req.cookies.token
      if(!token) return res.status(401).json({error: 'Unauthorized'})
      try {
          const me = jwt.verify(token, JWT_SECRET)
          const { requestId } = req.body // ID of the user to accept

          const myUser = await User.findById(me.id)
          const otherUser = await User.findById(requestId)

          // Add to friends list
          if(!myUser.friends.includes(otherUser._id)) myUser.friends.push(otherUser._id)
          if(!otherUser.friends.includes(myUser._id)) otherUser.friends.push(myUser._id)

          // Remove request
          myUser.friendRequests = myUser.friendRequests.filter(r => r.from.toString() !== requestId)
          
          await myUser.save()
          await otherUser.save()

          res.json({ ok: true })
      } catch(e) { res.status(500).json({error: e.message}) }
  })

  // Get Private Messages
  server.get('/api/social/messages/:friendId', async (req, res) => {
      const token = req.cookies.token; if(!token) return res.status(401).end()
      try {
          const me = jwt.verify(token, JWT_SECRET)
          const msgs = await Message.find({
              $or: [
                  { from: me.id, to: req.params.friendId },
                  { from: req.params.friendId, to: me.id }
              ]
          }).sort({ createdAt: 1 }).limit(50)
          res.json(msgs)
      } catch(e) { res.status(500).end() }
  })

  // --- SOCKET AUTH INJECTION ---
  io.use((socket, next) => {
    const cookie = socket.handshake.headers.cookie
    socket.user = { username: 'Guest', isGuest: true }
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

  socketHandler(io, Message)

  server.all('*', (req, res) => handle(req, res))

  const PORT = process.env.PORT || 3000
  httpServer.listen(PORT, (err) => {
    if (err) throw err
    console.log(`> 🚀 Hina Chess Pro running on port ${PORT}`)
  })
})
