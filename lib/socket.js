/**
 * lib/socket.js
 * منطق اصلی سوکت: مدیریت بازی، زمان و چت
 */

const { createRoomIfMissing, serialize, rooms } = require('./rooms')
const xss = require('xss')

module.exports = function socketHandler(io) {
  io.on('connection', (socket) => {
    
    // --- JOIN ---
    socket.on('join', ({ roomId, clientId, options }, cb) => {
      try {
        if (!roomId || !clientId) return cb({ ok: false, error: 'Invalid params' })
        
        socket.join(roomId)
        // تنظیمات فقط زمانی اعمال می‌شوند که اتاق تازه ساخته شود
        const room = createRoomIfMissing(roomId, options)

        // مدیریت اتصال مجدد یا بازیکن جدید
        let player = room.players.find(p => p.clientId === clientId)
        
        if (player) {
          player.socketId = socket.id
          player.lastSeen = Date.now()
        } else if (room.players.length < 2) {
          // تعیین رنگ: اولی سفید، دومی سیاه
          const color = room.players.length === 0 ? 'white' : 'black'
          player = { clientId, socketId: socket.id, color, lastSeen: Date.now() }
          room.players.push(player)
        }

        // شروع بازی اگر ۲ نفر تکمیل شدند
        if (room.players.length === 2 && room.status === 'waiting') {
          room.status = 'playing'
          room.lastMoveTime = Date.now()
          startTimer(room, io)
        }

        // ارسال پاسخ به کلاینت متصل شده
        const role = player ? player.color : 'spectator'
        cb({ ok: true, role, state: serialize(roomId, clientId) })
        
        // خبر به بقیه
        io.to(roomId).emit('state', serialize(roomId))
        
      } catch (e) {
        console.error(e)
        cb({ ok: false, error: 'Server Error' })
      }
    })

    // --- MOVE ---
    socket.on('move', ({ roomId, clientId, move }, cb) => {
      const room = rooms.get(roomId)
      if (!room || room.status !== 'playing') return cb({ ok: false })
      
      const player = room.players.find(p => p.clientId === clientId)
      if (!player) return cb({ ok: false })

      const currentTurn = room.game.turn() === 'w' ? 'white' : 'black'
      if (player.color !== currentTurn) return cb({ ok: false })

      try {
        // محاسبه زمان مصرف شده
        const now = Date.now()
        const elapsed = (now - room.lastMoveTime) / 1000
        
        // کسر زمان (با کمی ارفاق برای لگ شبکه)
        room.timeLeft[currentTurn] = Math.max(0, room.timeLeft[currentTurn] - elapsed + room.config.increment)
        
        const result = room.game.move(move) // { from, to, promotion... }
        if (!result) return cb({ ok: false }) // حرکت نامعتبر

        room.lastMoveTime = now
        room.lastActivity = now

        // بررسی پایان بازی
        if (room.game.game_over()) {
          handleGameOver(room, io)
        } else {
            // پخش صدای حرکت در کلاینت‌ها (flag)
            io.to(roomId).emit('move-sound', { capture: !!result.captured, check: room.game.in_check() })
        }
        
        io.to(roomId).emit('state', serialize(roomId))
        cb({ ok: true })

      } catch (e) {
        console.error(e)
      }
    })

    // --- CHAT ---
    socket.on('chat', ({ roomId, clientId, message }) => {
      if (!message || message.length > 500) return
      const cleanMsg = xss(message)
      const room = rooms.get(roomId)
      // پیدا کردن اسم یا رنگ بازیکن برای نمایش بهتر
      const p = room?.players.find(x => x.clientId === clientId)
      const senderName = p ? (p.color === 'white' ? 'سفید' : 'سیاه') : 'تماشاگر'
      
      io.to(roomId).emit('chat', { 
        id: Date.now(), 
        fromId: clientId, 
        senderName, 
        text: cleanMsg,
        system: false 
      })
    })

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
      for (const [rid, room] of rooms.entries()) {
        const p = room.players.find(x => x.socketId === socket.id)
        if (p) {
          p.socketId = null
          io.to(rid).emit('player-disconnect', { color: p.color })
          // اگر بازی در جریان است، می‌توان تایمر برای قطع اتصال گذاشت (اینجا ساده نگه می‌داریم)
        }
      }
    })

    // --- RESIGN / REMATCH ---
    socket.on('resign', ({roomId, clientId}) => {
        const room = rooms.get(roomId)
        if(!room || room.status !== 'playing') return
        const p = room.players.find(x => x.clientId === clientId)
        if(!p) return
        
        room.result = { winner: p.color === 'white' ? 'black' : 'white', reason: 'resign' }
        handleGameOver(room, io)
    })
  })

  // --- HELPERS ---
  function startTimer(room, io) {
    if (room.timerInterval) clearInterval(room.timerInterval)
    room.lastMoveTime = Date.now()
    
    room.timerInterval = setInterval(() => {
      if (room.status !== 'playing') {
        clearInterval(room.timerInterval)
        return
      }
      
      const turn = room.game.turn() === 'w' ? 'white' : 'black'
      const now = Date.now()
      const delta = (now - room.lastMoveTime) / 1000
      
      // آپدیت موقت برای نمایش (واقعی در move آپدیت می‌شود)
      const currentLeft = Math.max(0, room.timeLeft[turn] - delta)
      
      if (currentLeft <= 0) {
        room.timeLeft[turn] = 0
        room.result = { winner: turn === 'white' ? 'black' : 'white', reason: 'timeout' }
        handleGameOver(room, io)
      }
      
      // فقط هر ثانیه اگر تغییر چشمگیری بود یا ثانیه‌های آخر بفرستیم تا ترافیک کم شود
      // اما برای روانی UI، کلاینت خودش تایمر دارد، سرور فقط سینک می‌کند
      // اینجا هر 1 ثانیه سینک می‌کنیم
      if(Math.floor(delta) % 2 === 0) {
          io.to(room.id).emit('time-sync', { 
              white: turn === 'white' ? currentLeft : room.timeLeft.white,
              black: turn === 'black' ? currentLeft : room.timeLeft.black
          })
      }

    }, 1000)
  }

  function handleGameOver(room, io) {
    room.status = 'finished'
    if (room.timerInterval) clearInterval(room.timerInterval)
    
    if (!room.result) {
        // محاسبه نتیجه اگر دستی ست نشده (کیش و مات یا مساوی)
        if (room.game.in_checkmate()) {
            room.result = { winner: room.game.turn() === 'w' ? 'black' : 'white', reason: 'checkmate' }
        } else if (room.game.in_draw() || room.game.in_stalemate() || room.game.in_threefold_repetition()) {
            room.result = { winner: 'draw', reason: 'draw' }
        }
    }
    
    io.to(room.id).emit('game-over', room.result)
    io.to(room.id).emit('state', serialize(room.id))
  }
}
