require('dotenv').config()
const express = require('express')
const next = require('next')
const http = require('http')
const { Server } = require('socket.io')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const { connectDB } = require('./lib/db')
// اطمینان حاصل کنید فایل socket.js در پوشه lib موجود است
const socketHandler = require('./lib/socket') 
const { User } = require('./lib/models') // اطمینان از وجود مدل

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()
const PORT = process.env.PORT || 3000

app.prepare().then(async () => {
    // 1. اتصال به دیتابیس
    await connectDB()

    // 2. راه‌اندازی Express و Http Server
    const server = express()
    const httpServer = http.createServer(server)
    
    // 3. راه‌اندازی Socket.io
    const io = new Server(httpServer, {
        cors: { origin: "*" },
        transports: ['websocket', 'polling'] // اولویت با وب‌سوکت
    })

    // میدل‌ویرهای Express
    server.use(express.json())
    server.use(cookieParser())

    // 4. API های احراز هویت (Auth)
    server.post('/api/auth/register', async (req, res) => {
        try {
            const { username, password, email } = req.body
            if(await User.findOne({ username })) return res.status(400).json({error: 'نام کاربری تکراری است'})
            
            const user = await User.create({ username, password, email })
            const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' })
            
            res.cookie('token', token, { httpOnly: true, maxAge: 7*24*3600*1000 })
            res.json({ ok: true, user })
        } catch(e) { res.status(500).json({error: 'خطای سرور'}) }
    })

    server.post('/api/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body
            const user = await User.findOne({ username, password })
            if(!user) return res.status(401).json({error: 'اطلاعات اشتباه است'})
            
            const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' })
            res.cookie('token', token, { httpOnly: true, maxAge: 7*24*3600*1000 })
            res.json({ ok: true, user })
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
            const decoded = jwt.verify(token, process.env.JWT_SECRET)
            const user = await User.findById(decoded.id).select('-password')
            res.json({ user })
        } catch(e) { res.json({ user: null }) }
    })

    // 5. تزریق هویت کاربر به سوکت
    io.use((socket, next) => {
        const cookie = socket.handshake.headers.cookie
        // ایجاد یوزر مهمان تصادفی در صورت نبود کوکی
        socket.user = { username: 'مهمان_' + Math.floor(Math.random()*1000), id: 'guest_'+Math.floor(Math.random()*1000), isGuest: true }
        
        if (cookie) {
            const token = cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1]
            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET)
                    socket.user = { ...decoded, isGuest: false }
                } catch(e) {}
            }
        }
        next()
    })

    // 6. هندل کردن لاجیک بازی (فراخوانی تابع اکسپورت شده از lib/socket.js)
    socketHandler(io)

    // 7. هندل کردن صفحات Next.js
    server.all('*', (req, res) => handle(req, res))

    httpServer.listen(PORT, (err) => {
        if (err) throw err
        console.log(`> :rocket: Hina Chess Pro Ready on http://localhost:${PORT}`)
    })
})
