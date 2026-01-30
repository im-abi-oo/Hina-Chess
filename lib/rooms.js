const { Chess } = require('chess.js')

// حافظه موقت سرور برای اتاق‌ها
const rooms = new Map()

// پاکسازی اتاق‌های خالی هر 1 دقیقه
setInterval(() => {
    const now = Date.now()
    rooms.forEach((room, id) => {
        // اگر اتاق خالی است و 10 دقیقه گذشته حذف کن
        if (room.players.length === 0 && (now - room.lastActivity > 600000)) {
            if(room.timer) clearInterval(room.timer)
            rooms.delete(id)
        }
    })
}, 60000)

function createRoom(id, config = {}) {
    // تنظیمات پیش فرض
    const timeInMinutes = parseInt(config.time) || 10
    const colorPref = config.color || 'random'

    rooms.set(id, {
        id,
        game: new Chess(),
        players: [],
        config: { time: timeInMinutes, color: colorPref },
        timeLeft: { w: timeInMinutes * 60, b: timeInMinutes * 60 },
        status: 'waiting', // waiting, playing, finished
        lastMoveTime: null,
        timer: null,
        lastActivity: Date.now(),
        result: null
    })
    return rooms.get(id)
}

function getRoom(id) {
    return rooms.get(id)
}

function getActiveRooms() {
    return Array.from(rooms.values())
        .filter(r => r.status === 'waiting' || r.players.length > 0)
        .map(r => ({
            id: r.id,
            playersCount: r.players.length,
            status: r.status,
            config: r.config
        }))
}

module.exports = { rooms, createRoom, getRoom, getActiveRooms }
