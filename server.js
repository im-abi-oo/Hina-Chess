require('dotenv').config()
const express = require('express')
const next = require('next')
const http = require('http')
const { Server } = require('socket.io')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const os = require('os') // برای بخش وضعیت سرور
const { connectDB } = require('./lib/db')
const socketHandler = require('./lib/socket') 
const { User } = require('./lib/models')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()
const PORT = process.env.PORT || 3000

app.prepare().then(async () => {
    // ۱. اتصال به دیتابیس (MongoDB)
    await connectDB()

    const server = express()
    const httpServer = http.createServer(server)
    
    // ۲. پیکربندی Socket.io
    const io = new Server(httpServer, {
        cors: { origin: "*" },
        transports: ['websocket', 'polling']
    })

    // میدل‌ویرهای اکسپرس
    server.use(express.json())
    server.use(cookieParser())

    // --- مسیر جدید: مانیتورینگ وضعیت (Health Check) ---
    server.get('/api/status', (req, res) => {
        const mongoose = require('mongoose');
        const uptime = process.uptime();
        
        res.json({
            status: 'online',
            db_connected: mongoose.connection.readyState === 1,
            server_info: {
                platform: os.platform(),
                uptime: `${Math.floor(uptime / 60)} minutes`,
                memory_usage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
            },
            timestamp: new Date().toISOString()
        });
    });

    // ۳. مسیر ثبت‌نام (Register) با هش کردن پسورد و ولیدیشن موبایل
    server.post('/api/auth/register', async (req, res) => {
        try {
            const { username, password, phone } = req.body
            
            if (phone) {
                const phoneRegex = /^09\d{9}$/;
                if (!phoneRegex.test(phone)) {
                    return res.status(400).json({ ok: false, error: 'شماره موبایل نامعتبر است' })
                }
            }

            const existingUser = await User.findOne({ username })
            if (existingUser) return res.status(400).json({ ok: false, error: 'این نام کاربری تکراری است' })
            
            const hashedPassword = await bcrypt.hash(password, 12)
            
            const user = await User.create({ 
                username, 
                password: hashedPassword, 
                phone: phone || '' 
            })

            const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' })
            
            res.cookie('token', token, { httpOnly: true, maxAge: 7*24*3600*1000, sameSite: 'lax' })
            res.json({ ok: true, user: { username: user.username, elo: user.elo } })
        } catch(e) { 
            console.error(e)
            res.status(500).json({ ok: false, error: 'خطای سرور' }) 
        }
    })

    // ۴. مسیر ورود (Login) با مقایسه Bcrypt
    server.post('/api/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body
            const user = await User.findOne({ username })
            
            if(!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ ok: false, error: 'نام کاربری یا رمز عبور اشتباه است' })
            }
            
            const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' })
            res.cookie('token', token, { httpOnly: true, maxAge: 7*24*3600*1000, sameSite: 'lax' })
            res.json({ ok: true, user: { username: user.username, elo: user.elo } })
        } catch(e) { 
            res.status(500).json({ ok: false, error: 'خطا در ورود' }) 
        }
    })

    // ۵. خروج و پاک کردن کوکی
    server.post('/api/auth/logout', (req, res) => {
        res.clearCookie('token')
        res.json({ ok: true })
    })

    // ۶. احراز هویت لحظه‌ای برای فرانت‌اِند
    server.get('/api/auth/me', async (req, res) => {
        const token = req.cookies.token
        if(!token) return res.json({ user: null })
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET)
            const user = await User.findById(decoded.id).select('-password')
            res.json({ user })
        } catch(e) { res.json({ user: null }) }
    })

    // ۷. تزریق یوزر به Socket.io (احراز هویت سوکت)
    io.use((socket, next) => {
        const cookie = socket.handshake.headers.cookie
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

    // ۸. اجرای هندلر بازی (حرکات، اتاق‌ها، چت)
    socketHandler(io)

    // ۹. واگذاری باقی مسیرها به Next.js
    server.all('*', (req, res) => handle(req, res))

    httpServer.listen(PORT, (err) => {
        if (err) throw err
        console.log(`
        ╔══════════════════════════════════════════════════╗
        ║  ♟️ HINA CHESS IS RUNNING                         ║
        ║  🌐 URL: http://localhost:${PORT}                 ║
        ║  📂 STATUS: http://localhost:${PORT}/api/status   ║
        ╚══════════════════════════════════════════════════╝
        `)
    })
})
