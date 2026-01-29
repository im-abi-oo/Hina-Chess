const { Chess } = require('chess.js')
const rooms = new Map()

// پاکسازی دوره‌ای اتاق‌های مرده
setInterval(() => {
  const now = Date.now()
  rooms.forEach((room, id) => {
    if (room.players.length === 0 && now - room.lastActivity > 600000) rooms.delete(id) // 10 دقیقه خالی
  })
}, 60000)

function createRoom(id, config = {}) {
    // تنظیمات پیش‌فرض اگر کاربر چیزی وارد نکرد
    const initialTime = (parseInt(config.time) || 10) * 60
    const colorPref = config.color || 'random' 
    
    rooms.set(id, {
        id,
        game: new Chess(),
        players: [], 
        spectators: [],
        config: { ...config, initialTime, colorPref },
        timeLeft: { w: initialTime, b: initialTime },
        status: 'waiting', // waiting, playing, finished
        lastMoveTime: null,
        timer: null,
        lastActivity: Date.now(),
        result: null
    })
    return rooms.get(id)
}

module.exports = { rooms, createRoom }
