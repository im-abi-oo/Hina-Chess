const { Chess } = require('chess.js')

// حافظه موقت سرور برای اتاق‌ها
const rooms = new Map()

// پاکسازی اتاق‌های خالی یا متروکه
setInterval(() => {
    const now = Date.now()
    rooms.forEach((room, id) => {
        // اگر بازی تمام شده و 1 ساعت گذشته یا اتاق خالی است و 10 دقیقه گذشته
        if ((room.players.length === 0 && now - room.lastActivity > 600000) || 
            (room.status === 'finished' && now - room.lastActivity > 3600000)) {
            if(room.timerInterval) clearInterval(room.timerInterval)
            rooms.delete(id)
        }
    })
}, 60000)

function createRoom(id, config = {}) {
    const timeInMinutes = parseInt(config.time) || 10
    
    // ساختار کامل دیتا
    const room = {
        id,
        game: new Chess(), // منطق شطرنج
        players: [], // آرایه بازیکنان {id, username, color, socketId}
        config: { 
            time: timeInMinutes, 
            color: config.color || 'random' 
        },
        timeLeft: { w: timeInMinutes * 60, b: timeInMinutes * 60 }, // زمان به ثانیه
        status: 'waiting', // waiting, playing, finished
        lastMoveTime: null,
        timerInterval: null,
        lastActivity: Date.now(),
        result: null, // { winner: 'w'/'b'/'draw', reason: 'checkmate'/'timeout'/... }
        rematchOffers: []
    }
    
    rooms.set(id, room)
    return room
}

function getRoom(id) {
    return rooms.get(id)
}

module.exports = { rooms, createRoom, getRoom }
