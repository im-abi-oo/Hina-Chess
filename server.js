require('dotenv').config()
const express = require('express')
const next = require('next')
const http = require('http')
const { Server } = require('socket.io')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs') // حتما نصب کنید: npm install bcryptjs
const { connectDB } = require('./lib/db')
const socketHandler = require('./lib/socket') 
const { User } = require('./lib/models')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()
const PORT = process.env.PORT || 3000

app.prepare().then(async () => {
    // ۱. اتصال به دیتابیس
    await connectDB()

    const server = express()
    const httpServer = http.createServer(server)
    
    // ۲. راه‌اندازی Socket.io
    const io = new Server(httpServer, {
        cors: { origin: "*" },
        transports: ['websocket', 'polling']
    })

    // میدل‌ویرها
    server.use(express.json())
    server.use(cookieParser())

    // ۳. مسیر ثبت‌نام (Register)
    server.post('/api/auth/register', async (req, res) => {
        try {
            const { username, password, phone } = req.body
            
            // اعتبارسنجی موبایل
            if (phone) {
                const phoneRegex = /^09\d{9}$/;
                if (!phoneRegex.test(phone)) {
                    return res.status(400).json({ ok: false, error: 'شماره موبایل باید ۱۱ رقم و با 09 شروع شود' })
                }
            }

            // بررسی یوزر تکراری
            const existingUser = await User.findOne({ username })
            if (existingUser) return res.status(400).json({ ok: false, error: 'این نام کاربری قبلاً ثبت شده است' })
            
            // هش کردن رمز عبور قبل از ذخیره
            const hashedPassword = await bcrypt.hash(password, 12)
            
            const user = await User.create({ 
                username, 
                password: hashedPassword, 
                phone: phone || '' 
            })

            // ساخت توکن
            const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' })
            
            // تنظیم کوکی
            res.cookie('token', token, { httpOnly: true, maxAge: 7*24*3600*1000 })
            res.json({ ok: true, user: { username: user.username, elo: user.elo } })
        } catch(e) { 
            console.error("Register Error:", e)
            res.status(500).json({ ok: false, error: 'خطای سرور در عملیات ثبت‌نام' }) 
        }
    })

    // ۴. مسیر ورود (Login)
    server.post('/api/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body
            const user = await User.findOne({ username })
            
            if(!user) return res.status(401).json({ ok: false, error: 'نام کاربری یا رمز عبور اشتباه است' })
            
            // مقایسه پسورد با پسورد هش شده در دیتابیس
            const isMatch = await bcrypt.compare(password, user.password)
            if(!isMatch) return res.status(401).json({ ok: false, error: 'نام کاربری یا رمز عبور اشتباه است' })
            
            const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' })
            res.cookie('token', token, { httpOnly: true, maxAge: 7*24*3600*1000 })
            res.json({ ok: true, user: { username: user.username, elo: user.elo } })
        } catch(e) { 
            res.status(500).json({ ok: false, error: 'خطای سرور در ورود' }) 
        }
    })

    // ۵. خروج (Logout)
    server.post('/api/auth/logout', (req, res) => {
        res.clearCookie('token')
        res.json({ ok: true })
    })

    // ۶. چک کردن وضعیت لاگین کاربر (Me)
    server.get('/api/auth/me', async (req, res) => {
        const token = req.cookies.token
        if(!token) return res.json({ user: null })
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET)
            const user = await User.findById(decoded.id).select('-password')
            res.json({ user })
        } catch(e) { res.json({ user: null }) }
    })

    // ۷. تزریق هویت کاربر به سوکت (Socket Auth Middleware)
    io.use((socket, next) => {
        const cookie = socket.handshake.headers.cookie
        // یوزر مهمان پیش‌فرض
        socket.user = { 
            username: 'Guest_' + Math.floor(1000 + Math.random() * 9000), 
            id: 'guest_' + Date.now(), 
            isGuest: true 
        }
        
        if (cookie) {
            const token = cookie.split('; ').find(row => row.trim().startsWith('token='))?.split('=')[1]
            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET)
                    socket.user = { ...decoded, isGuest: false }
                } catch(e) {}
            }
        }
        next()
    })

    // ۸. هندل کردن لاجیک بازی
    socketHandler(io)

    // ۹. هندل کردن تمام درخواست‌های صفحات Next.js
    server.all('*', (req, res) => handle(req, res))

    httpServer.listen(PORT, (err) => {
        if (err) throw err
        console.log(`> ♟️ HINA CHESS PRO is live on http://localhost:${PORT}`)
    })
})
