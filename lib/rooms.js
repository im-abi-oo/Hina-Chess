const { rooms, createRoom, getRoom } = require('./rooms')
const { Chess } = require('chess.js')

module.exports = function socketHandler(io) {
    io.on('connection', (socket) => {
        // دریافت اطلاعات کاربر از میدل‌ویر (که در server.js ست شده)
        const user = socket.user || { username: 'مهمان', id: socket.id }

        socket.on('join', ({ roomId }) => {
            let room = getRoom(roomId)
            
            // اگر اتاق وجود ندارد، بسازیم (با تنظیمات پیش‌فرض اگر کلاینت چیزی نفرستاده بود)
            if (!room) {
                room = createRoom(roomId)
            }

            room.lastActivity = Date.now()

            // جلوگیری از جوین شدن تکراری یا نفر سوم
            const existingPlayer = room.players.find(p => p.username === user.username)
            if (existingPlayer) {
                // آپدیت سوکت آی‌دی برای ریکانکت
                existingPlayer.socketId = socket.id
                socket.join(roomId)
                emitGameUpdate(io, room)
                return
            }

            if (room.players.length >= 2) {
                // اگر اتاق پر است، به عنوان تماشاچی جوین شود
                socket.emit('error', 'اتاق پر است. شما به عنوان تماشاچی وارد شدید.')
                socket.join(roomId)
                emitGameUpdate(io, room)
                return
            }

            // تعیین رنگ بازیکن
            let color = 'w'
            if (room.players.length === 0) {
                // نفر اول
                if (room.config.color === 'white') color = 'w'
                else if (room.config.color === 'black') color = 'b'
                else color = Math.random() > 0.5 ? 'w' : 'b'
            } else {
                // نفر دوم: رنگ مخالف نفر اول
                color = room.players[0].color === 'w' ? 'b' : 'w'
            }

            const newPlayer = {
                socketId: socket.id,
                username: user.username,
                id: user.id,
                color: color
            }

            room.players.push(newPlayer)
            socket.join(roomId)

            // *** فیکس مشکل شروع بازی: اگر 2 نفر شدند، بازی را شروع کن ***
            if (room.players.length === 2 && room.status === 'waiting') {
                room.status = 'playing'
                room.lastMoveTime = Date.now()
                startGameTimer(io, room)
            }

            // ارسال وضعیت به همه
            emitGameUpdate(io, room)
        })

        socket.on('move', ({ roomId, move }) => {
            const room = getRoom(roomId)
            if (!room || room.status !== 'playing') return

            const player = room.players.find(p => p.socketId === socket.id)
            if (!player) return

            // نوبت کیست؟
            if (room.game.turn() !== player.color) return

            try {
                // اعمال حرکت در chess.js
                // نکته: move باید شامل {from, to, promotion} باشد
                const result = room.game.move(move) 
                
                if (result) {
                    room.lastActivity = Date.now()
                    
                    // مدیریت تایمر (اضافه کردن زمان پاداش یا فقط سوئیچ)
                    // در اینجا ساده نگه میداریم: زمان را آپدیت میکنیم و نوبت عوض میشود
                    handleTimerSwitch(io, room)

                    // بررسی پایان بازی (مات، پات و ...)
                    checkGameOver(io, room)

                    // ارسال وضعیت جدید به همه کلاینت‌ها
                    io.to(roomId).emit('sync', {
                        fen: room.game.fen(),
                        timeLeft: room.timeLeft,
                        lastMove: result, // برای هایلایت و صدا
                        turn: room.game.turn()
                    })
                }
            } catch (e) {
                console.error("Move Error:", e)
            }
        })

        socket.on('chat', ({ roomId, text }) => {
            const room = getRoom(roomId)
            if (room) {
                io.to(roomId).emit('chat-msg', { 
                    sender: user.username, 
                    text: text.substring(0, 200) // محدودیت طول پیام
                })
            }
        })

        socket.on('resign', ({ roomId }) => {
            const room = getRoom(roomId)
            if (!room || room.status !== 'playing') return
            
            const player = room.players.find(p => p.socketId === socket.id)
            if (!player) return

            endGame(io, room, player.color === 'w' ? 'b' : 'w', 'resignation')
        })

        socket.on('disconnect', () => {
            // هندل کردن قطع اتصال
            // برای سادگی فعلا فقط لاگ میزنیم. در نسخه کامل باید تایمر ریکانکت بگذاریم.
            rooms.forEach(room => {
                const player = room.players.find(p => p.socketId === socket.id)
                if (player) {
                    if (room.status === 'playing') {
                         // اخطار به حریف یا شروع تایمر قطع اتصال (اینجا ساده رد می‌شویم)
                         io.to(room.id).emit('chat-msg', { sender: 'System', text: `${player.username} قطع شد.` })
                    }
                }
            })
        })
    })
}

// توابع کمکی (Helper Functions)

function startGameTimer(io, room) {
    if (room.timerInterval) clearInterval(room.timerInterval)
    
    room.lastMoveTime = Date.now()
    
    room.timerInterval = setInterval(() => {
        if (room.status !== 'playing') {
            clearInterval(room.timerInterval)
            return
        }

        const activeColor = room.game.turn() // 'w' or 'b'
        const now = Date.now()
        const delta = (now - room.lastMoveTime) / 1000 // تبدیل به ثانیه

        // کاهش زمان
        room.timeLeft[activeColor] -= 1 // هر ثانیه 1 واحد کم میکنیم (تقریبی)
        // برای دقت بالاتر در عمل باید delta را از زمان اصلی کم کنیم اما برای setInterval 1s این کافیست
        
        // آپدیت زمان آخرین چک
        room.lastMoveTime = now

        // چک کردن اتمام زمان
        if (room.timeLeft[activeColor] <= 0) {
            room.timeLeft[activeColor] = 0
            endGame(io, room, activeColor === 'w' ? 'b' : 'w', 'timeout')
        }
        
        // سینک کردن زمان با کلاینت ها هر 5 ثانیه یا اگر زمان کم بود هر 1 ثانیه
        // اما اینجا برای سادگی فرض میکنیم کلاینت خودش هم تایمر دارد و ما فقط در پایان حرکت سینک دقیق میکنیم
    }, 1000)
}

function handleTimerSwitch(io, room) {
    // محاسبه دقیق زمان مصرف شده در این حرکت
    const now = Date.now()
    const activeColor = room.game.turn() === 'w' ? 'b' : 'w' // رنگی که الان حرکت کرد
    
    // اینجا میتوان اینکریمنت (پاداش زمانی) هم اضافه کرد
    // room.timeLeft[activeColor] += room.config.increment 

    room.lastMoveTime = now
}

function checkGameOver(io, room) {
    if (room.game.isCheckmate()) {
        endGame(io, room, room.game.turn() === 'w' ? 'b' : 'w', 'checkmate')
    } else if (room.game.isDraw() || room.game.isStalemate() || room.game.isThreefoldRepetition() || room.game.isInsufficientMaterial()) {
        endGame(io, room, 'draw', 'draw')
    }
}

function endGame(io, room, winner, reason) {
    if (room.status === 'finished') return
    
    room.status = 'finished'
    room.result = { winner, reason }
    clearInterval(room.timerInterval)

    io.to(room.id).emit('game-over', { winner, reason })
    emitGameUpdate(io, room) // آپدیت نهایی
}

function emitGameUpdate(io, room) {
    // ارسال دیتای مورد نیاز به کاربر
    // توجه: برای هر کاربر باید بگوییم رنگ خودش چیست
    room.players.forEach(p => {
        io.to(p.socketId).emit('init-game', {
            fen: room.game.fen(),
            players: room.players,
            timeLeft: room.timeLeft,
            status: room.status,
            myColor: p.color,
            result: room.result
        })
    })
    
    // برای تماشاچی ها (کسانی که در روم هستند اما در لیست players نیستند)
    // این قسمت نیاز به هندلینگ دقیق تر سوکت دارد اما فعلا اکتفا میکنیم
}
