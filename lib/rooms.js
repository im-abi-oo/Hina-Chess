// rooms.js
const { Chess } = require('chess.js')

const rooms = new Map()

// پاکسازی اتاق‌های غیرفعال هر 1 دقیقه
setInterval(() => {
  const now = Date.now()
  for (const [id, room] of rooms.entries()) {
    if ((!room.players || room.players.length === 0) && (now - (room.lastActivity || 0) > 600000)) {
      if (room.timer) clearInterval(room.timer)
      rooms.delete(id)
    }
  }
}, 60000)

function createRoom(id, config = {}) {
  if (rooms.has(id)) return rooms.get(id)

  const timeInMinutes = parseInt(config.time) || 10
  const colorPref = config.color || 'random'

  const room = {
    id,
    game: new Chess(),
    players: [], // { id: socketId, username, color: 'w'|'b'|'spectator' }
    config: { time: timeInMinutes, color: colorPref },
    timeLeft: { w: timeInMinutes * 60, b: timeInMinutes * 60 },
    status: 'waiting', // waiting | playing | finished
    lastMoveTime: Date.now(),
    timer: null,
    lastActivity: Date.now(),
    result: null
  }

  rooms.set(id, room)
  return room
}

function getRoom(id) {
  return rooms.get(id)
}

function getActiveRooms() {
  return Array.from(rooms.values())
    .filter(r => r.status === 'waiting' || (r.players && r.players.length > 0))
    .map(r => ({
      id: r.id,
      playersCount: r.players.length,
      status: r.status,
      config: r.config
    }))
}

function assignColor(room, socketId, username) {
  // اگر براش رنگ خواستی بگیری از config.color بعداً
  const hasW = room.players.some(p => p.color === 'w')
  const hasB = room.players.some(p => p.color === 'b')

  let color = 'spectator'
  if (!hasW) color = 'w'
  else if (!hasB) color = 'b'

  const player = { id: socketId, username: username || 'Player', color }
  room.players = room.players.filter(p => p.id !== socketId) // duplicate safe
  room.players.push(player)
  room.lastActivity = Date.now()
  return player
}

function removePlayer(room, socketId) {
  room.players = room.players.filter(p => p.id !== socketId)
  room.lastActivity = Date.now()
  // اگر حذف باعث شد بازی متوقف بشه
  const hasW = room.players.some(p => p.color === 'w')
  const hasB = room.players.some(p => p.color === 'b')
  if (room.status === 'playing' && (!hasW || !hasB)) {
    // متوقف کن و برگرد به waiting
    room.status = 'waiting'
    room.result = { winner: 'abandoned', reason: 'یک بازیکن بازی را ترک کرد' }
    if (room.timer) clearInterval(room.timer)
    room.timer = null
  }
}

function startGameIfReady(io, room) {
  const hasW = room.players.some(p => p.color === 'w')
  const hasB = room.players.some(p => p.color === 'b')
  if (hasW && hasB && room.status !== 'playing') {
    room.status = 'playing'
    room.game = new Chess()
    room.timeLeft = { w: room.config.time * 60, b: room.config.time * 60 }
    room.lastMoveTime = Date.now()
    room.result = null

    // پاک کردن هر تایمر قبلی
    if (room.timer) clearInterval(room.timer)

    // تایمر کلی هر ثانیه: کاهش تایمِ طرفی که نوبتش است
    room.timer = setInterval(() => {
      try {
        const turn = room.game.turn() // 'w' یا 'b'
        room.timeLeft[turn] = Math.max(0, room.timeLeft[turn] - 1)
        room.lastActivity = Date.now()

        // اگر تایم صفر شد، بازی تمومه
        if (room.timeLeft[turn] <= 0) {
          room.status = 'finished'
          room.result = { winner: turn === 'w' ? 'b' : 'w', reason: 'زمان تمام شد' }
          clearInterval(room.timer)
          room.timer = null
          // اطلاع همه
          io.to(room.id).emit('game-over', room.result)
        } else {
          // هر ثانیه وضعیت تایم رو انتشار بده (sync)
          io.to(room.id).emit('sync', {
            fen: room.game.fen(),
            timeLeft: room.timeLeft,
            lastMove: null
          })
        }
      } catch (e) {
        console.error('Timer error for room', room.id, e)
      }
    }, 1000)

    // اعلام شروع بازی (برای همه)
    io.to(room.id).emit('init-game', {
      fen: room.game.fen(),
      players: room.players.map(p => ({ username: p.username, color: p.color })),
      status: room.status,
      timeLeft: room.timeLeft
    })
  }
}

function handleMove(io, roomId, socketId, moveObj) {
  const room = rooms.get(roomId)
  if (!room || room.status !== 'playing') return { ok: false, err: 'Room not playing' }

  const player = room.players.find(p => p.id === socketId)
  if (!player || (player.color !== room.game.turn())) {
    return { ok: false, err: 'Not your turn or not a player' }
  }

  // اعتبارسنجی حرکت روی نسخه‌ای از بازی
  const validMove = room.game.move(moveObj)
  if (!validMove) return { ok: false, err: 'Invalid move' }

  room.lastMoveTime = Date.now()
  // بررسی تمام‌شدنِ بازی
  if (room.game.game_over()) {
    room.status = 'finished'
    // تعیین نتیجه دقیق‌تر
    let winner = 'draw'
    let reason = 'نتیجه بازی'
    if (room.game.in_checkmate()) {
      winner = validMove.color === 'w' ? 'w' : 'b'
      // در chess.js رنگ بازیکنِ انجام دهنده حرکت در validMove.color است، اما برنده‌ش نوبت مخالف هست.
      winner = room.game.turn() === 'w' ? 'b' : 'w' // چون پس از حرکت نوبت عوض شده
      reason = 'مات'
    } else if (room.game.in_stalemate()) {
      reason = 'بن‌بست (stalemate)'
    } else if (room.game.in_threefold_repetition()) {
      reason = 'سه تکرار'
    } else if (room.game.insufficient_material()) {
      reason = 'قطعات کافی نیست'
    } else if (room.game.in_draw()) {
      reason = 'تساوی'
    }

    room.result = { winner, reason }
    if (room.timer) { clearInterval(room.timer); room.timer = null }
    io.to(room.id).emit('sync', { fen: room.game.fen(), timeLeft: room.timeLeft, lastMove: validMove })
    io.to(room.id).emit('game-over', room.result)
    return { ok: true }
  }

  // اگر بازی ادامه دارد، emit کن
  io.to(room.id).emit('sync', { fen: room.game.fen(), timeLeft: room.timeLeft, lastMove: validMove })
  return { ok: true }
}

module.exports = {
  createRoom,
  getRoom,
  getActiveRooms,
  assignColor,
  removePlayer,
  startGameIfReady,
  handleMove,
  rooms
}
