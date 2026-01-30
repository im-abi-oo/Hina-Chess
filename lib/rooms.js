const { Chess } = require('chess.js')

const rooms = new Map()

// پاکسازی هوشمند اتاق‌ها
setInterval(() => {
    const now = Date.now()
    rooms.forEach((room, id) => {
        if ((room.players.length === 0 && now - room.lastActivity > 600000) || 
            (room.status === 'finished' && now - room.lastActivity > 3600000)) {
            if(room.timerInterval) clearInterval(room.timerInterval)
            rooms.delete(id)
        }
    })
}, 60000)

function createRoom(id, config = {}) {
    const timeInMinutes = parseInt(config.time) || 10
    const increment = parseInt(config.increment) || 2 // پاداش زمانی پیش‌فرض ۲ ثانیه
    
    const room = {
        id,
        game: new Chess(),
        players: [], 
        config: { 
            time: timeInMinutes, 
            increment: increment,
            color: config.color || 'random' 
        },
        timeLeft: { w: timeInMinutes * 60, b: timeInMinutes * 60 },
        status: 'waiting', // waiting (لابی), playing, finished
        lastMoveTime: null,
        timerInterval: null,
        lastActivity: Date.now(),
        result: null,
        drawOffers: [] 
    }
    
    rooms.set(id, room)
    return room
}

function getRoom(id) {
    return rooms.get(id)
}

module.exports = { rooms, createRoom, getRoom }
