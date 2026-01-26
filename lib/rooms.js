/**
 * lib/rooms.js
 * Room storage + garbage collection + serializer
 */

const { Chess } = require('chess.js')

const rooms = new Map()
const ROOM_TTL_MS = 10 * 60 * 1000 // delete room if idle for 10 minutes

function createRoomIfMissing(roomId, timePerPlayer = 300) {
  if (!rooms.has(roomId)) {
    const room = {
      players: [], // { clientId, socketId, color, lastSeen }
      game: new Chess(),
      status: 'waiting',
      timeLeft: { white: timePerPlayer, black: timePerPlayer },
      turnStartedAt: Date.now(),
      timerInterval: null,
      lastActivity: Date.now()
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
    if (Date.now() - r.lastActivity > ROOM_TTL_MS) {
      if (r.timerInterval) clearInterval(r.timerInterval)
      rooms.delete(roomId)
      console.log('room gc:', roomId)
    } else {
      scheduleTTL(roomId)
    }
  }, ROOM_TTL_MS)
}

function serialize(roomId) {
  const r = rooms.get(roomId)
  if (!r) return null
  return {
    fen: r.game.fen(),
    history: r.game.history({ verbose: true }),
    players: r.players.map(p => ({ clientId: p.clientId, color: p.color, connected: !!p.socketId })),
    status: r.status,
    timeLeft: r.timeLeft,
    turn: r.game.turn() === 'w' ? 'white' : 'black'
  }
}

module.exports = { rooms, createRoomIfMissing, serialize }
