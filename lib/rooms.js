const { Chess } = require('chess.js');

// حافظه موقت سرور برای نگهداری وضعیت بازی‌ها
const rooms = new Map();

/**
 * سیستم خودکار پاکسازی اتاق‌های غیرفعال
 * هر ۱ دقیقه چک می‌کند که اگر اتاقی متروکه شده، آن را از حافظه حذف کند
 */
setInterval(() => {
    const now = Date.now();
    rooms.forEach((room, id) => {
        const isAbandoned = room.players.length === 0 && (now - room.lastActivity > 600000); // ۱۰ دقیقه خالی بودن
        const isFinishedLongAgo = room.status === 'finished' && (now - room.lastActivity > 3600000); // ۱ ساعت بعد از پایان بازی
        
        if (isAbandoned || isFinishedLongAgo) {
            if (room.timerInterval) clearInterval(room.timerInterval);
            rooms.delete(id);
        }
    });
}, 60000);

function createRoom(id, config = {}) {
    const timeInMinutes = parseInt(config.time) || 10;
    const increment = parseInt(config.increment) || 2; // پاداش زمانی پیش‌فرض
    
    const room = {
        id,
        game: new Chess(), // موتور منطق شطرنج
        players: [], // لیست بازیکنان: { socketId, id, username, color, ready, drawOffered }
        config: { 
            time: timeInMinutes, 
            increment: increment,
            color: config.color || 'random' 
        },
        timeLeft: { 
            w: timeInMinutes * 60, 
            b: timeInMinutes * 60 
        },
        status: 'waiting', // وضعیت‌ها: waiting (لابی), playing (در حال بازی), finished (پایان)
        lastMoveTime: null,
        timerInterval: null,
        lastActivity: Date.now(),
        result: null, // { winner: 'w'/'b'/'draw', reason: 'checkmate'/'timeout'/'agreement' }
        chat: [] // آرشیو پیام‌های چت برای کاربران جدید
    };
    
    rooms.set(id, room);
    return room;
}

function getRoom(id) {
    return rooms.get(id);
}

module.exports = { rooms, createRoom, getRoom };
