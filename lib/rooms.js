const { Chess } = require('chess.js');

// حافظه موقت سرور
const rooms = new Map();

/**
 * پاکسازی دوره‌ای اتاق‌های متروکه (هر ۶۰ ثانیه)
 */
setInterval(() => {
    const now = Date.now();
    rooms.forEach((room, id) => {
        const isAbandoned = room.players.length === 0 && (now - room.lastActivity > 600000); // ۱۰ دقیقه
        const isOldFinished = room.status === 'finished' && (now - room.lastActivity > 3600000); // ۱ ساعت
        
        if (isAbandoned || isOldFinished) {
            if (room.timerInterval) clearInterval(room.timerInterval);
            rooms.delete(id);
        }
    });
}, 60000);

/**
 * ایجاد یک اتاق جدید با تنظیمات سفارشی
 */
function createRoom(id, config = {}) {
    const timeInMinutes = parseInt(config.time) || 10;
    const incrementSeconds = parseInt(config.increment) || 2; // زمان پاداش پیش‌فرض

    const room = {
        id,
        game: new Chess(),
        players: [], // { socketId, id, username, color, ready, drawOffered }
        config: {
            time: timeInMinutes,
            increment: incrementSeconds,
            color: config.color || 'random'
        },
        timeLeft: {
            w: timeInMinutes * 60,
            b: timeInMinutes * 60
        },
        status: 'waiting', // waiting, playing, finished
        lastMoveTime: null,
        timerInterval: null,
        lastActivity: Date.now(),
        result: null // { winner, reason }
    };

    rooms.set(id, room);
    return room;
}

function getRoom(id) {
    return rooms.get(id);
}

module.exports = { rooms, createRoom, getRoom };
