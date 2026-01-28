/**
 * lib/rooms.js
 * مدیریت وضعیت اتاق‌ها و منطق زمان‌بندی
 */

const { Chess } = require('chess.js')

const rooms = new Map()
const ROOM_TTL_MS = 15 * 60 * 1000 // 15 دقیقه بقا بدون فعالیت

function createRoomIfMissing(roomId, options = {}) {
  if (!rooms.has(roomId)) {
    // تنظیمات پیش‌فرض: 5 دقیقه بدون اینکریمنت
    const initialTime = (options.minutes || 5) * 60
    const increment = options.increment || 0

    const room = {
      id: roomId,
      players: [], // { clientId, socketId, color, lastSeen }
      game: new Chess(),
      status: 'waiting', // waiting, playing, finished, aborted
      config: { initialTime, increment },
      timeLeft: { white: initialTime, black: initialTime },
      lastMoveTime: null, // برای محاسبه دقیق زمان سرور
      timerInterval: null,
      lastActivity: Date.now(),
      result: null // { winner: 'white'|'black'|'draw', reason: 'checkmate'|'timeout'... }
    }
    rooms.set(roomId, room)
    scheduleTTL(roomId)
  }
  return rooms.get(roomId)
}

function scheduleTTL(roomId) {
  setTimeout(() => {
    const r = rooms.get(roomId)
    if (!r) return
    // اگر اتاق خالی است یا خیلی قدیمی شده
    const isInactive = (Date.now() - r.lastActivity) > ROOM_TTL_MS
    const isEmpty = r.players.every(p => !p.socketId)
    
    if (isInactive || (isEmpty && r.status !== 'playing')) {
      if (r.timerInterval) clearInterval(r.timerInterval)
      rooms.delete(roomId)
      console.log(`[GC] Room ${roomId} deleted.`)
    } else {
      scheduleTTL(roomId)
    }
  }, 60000) // چک کردن هر 1 دقیقه
}

function serialize(roomId, clientId = null) {
  const r = rooms.get(roomId)
  if (!r) return null
  
  // داده‌های عمومی
  const data = {
    fen: r.game.fen(),
    // فقط آخرین حرکت را برای انیمیشن کلاینت می‌فرستیم، تاریخچه کامل فقط در صورت نیاز
    lastMove: r.game.history({ verbose: true }).pop(), 
    players: r.players.map(p => ({ 
      clientId: p.clientId, 
      color: p.color, 
      connected: !!p.socketId,
      isMe: p.clientId === clientId 
    })),
    status: r.status,
    timeLeft: r.timeLeft,
    turn: r.game.turn() === 'w' ? 'white' : 'black',
    config: r.config,
    result: r.result,
    check: r.game.in_check()
  }
  return data
}

module.exports = { rooms, createRoomIfMissing, serialize }
