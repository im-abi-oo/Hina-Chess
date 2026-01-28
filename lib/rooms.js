/**
 * lib/rooms.js
 * Room Logic + MongoDB Models + Fix for chess.js v1
 */

const { Chess } = require('chess.js')
const mongoose = require('mongoose')

// --- MongoDB Schema ---
const UserSchema = new mongoose.Schema({
  clientId: { type: String, required: true, unique: true, index: true },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  lastSeen: { type: Date, default: Date.now }
})
// Prevent compiling model if already compiled (Hot Reload fix)
const User = mongoose.models.User || mongoose.model('User', UserSchema)

// --- In-Memory Storage ---
const rooms = new Map()
const ROOM_TTL_MS = 5 * 60 * 1000 // 5 Minutes idle timeout (Aggressive memory saving)

function createRoomIfMissing(roomId, options = {}) {
  if (!rooms.has(roomId)) {
    const game = new Chess()
    const minutes = parseInt(options.minutes || '10', 10)
    const increment = parseInt(options.increment || '0', 10)
    
    rooms.set(roomId, {
      id: roomId,
      players: [],
      game,
      status: 'waiting',
      config: { initial: minutes * 60, increment },
      timeLeft: { white: minutes * 60, black: minutes * 60 },
      lastMoveTime: null,
      timerInterval: null,
      lastActivity: Date.now(),
      chatHistory: [], // Will be capped
      result: null
    })
    scheduleTTL(roomId)
  }
  return rooms.get(roomId)
}

function scheduleTTL(roomId) {
  setTimeout(() => {
    const r = rooms.get(roomId)
    if (!r) return
    
    const idleTime = Date.now() - r.lastActivity
    const isEmpty = r.players.every(p => !p.socketId)
    
    // Aggressive GC: Delete if empty OR idle for too long
    if (isEmpty || idleTime > ROOM_TTL_MS) {
      if (r.timerInterval) clearInterval(r.timerInterval)
      rooms.delete(roomId)
      // console.log(`[GC] Room ${roomId} deleted to free RAM.`)
    } else {
      scheduleTTL(roomId)
    }
  }, 60000)
}

// --- Helper to fix version mismatch ---
function getGameState(game) {
  // Check available methods (handles both v0.x and v1.x)
  const isCheck = typeof game.isCheck === 'function' ? game.isCheck() : (game.in_check ? game.in_check() : false)
  const isOver = typeof game.isGameOver === 'function' ? game.isGameOver() : (game.game_over ? game.game_over() : false)
  const turn = game.turn() // 'w' or 'b'
  
  return { isCheck, isOver, turn }
}

function serialize(roomId, clientId = null) {
  const r = rooms.get(roomId)
  if (!r) return null
  
  const { isCheck, isOver, turn } = getGameState(r.game)
  const history = r.game.history({ verbose: true })

  return {
    fen: r.game.fen(),
    lastMove: history.length ? history[history.length - 1] : null,
    players: r.players.map(p => ({ 
      clientId: p.clientId, 
      color: p.color, 
      connected: !!p.socketId,
      isMe: p.clientId === clientId
    })),
    status: r.status,
    timeLeft: r.timeLeft,
    turn: turn === 'w' ? 'white' : 'black',
    isCheck,
    config: r.config,
    result: r.result
  }
}

async function updateStats(winnerId, loserId, isDraw = false) {
  if (!mongoose.connection.readyState) return
  try {
    if (isDraw) {
      if (winnerId) await User.updateOne({ clientId: winnerId }, { $inc: { draws: 1 }, $set: { lastSeen: new Date() } }, { upsert: true })
      if (loserId) await User.updateOne({ clientId: loserId }, { $inc: { draws: 1 }, $set: { lastSeen: new Date() } }, { upsert: true })
    } else {
      if (winnerId) await User.updateOne({ clientId: winnerId }, { $inc: { wins: 1 }, $set: { lastSeen: new Date() } }, { upsert: true })
      if (loserId) await User.updateOne({ clientId: loserId }, { $inc: { losses: 1 }, $set: { lastSeen: new Date() } }, { upsert: true })
    }
  } catch (e) {
    console.error('DB Update Error:', e.message)
  }
}

async function getUserStats(clientId) {
  if (!mongoose.connection.readyState) return { wins:0, losses:0, draws:0 }
  const u = await User.findOne({ clientId }).select('wins losses draws').lean()
  return u || { wins: 0, losses: 0, draws: 0 }
}

module.exports = { rooms, createRoomIfMissing, serialize, updateStats, getUserStats }
