/**
 * lib/socket.js
 * Optimized Socket Logic + DB Integration
 */

const { createRoomIfMissing, serialize, rooms, updateStats, getUserStats } = require('./rooms')
const xss = require('xss')

const CHAT_MAX = 50 // Keep only last 50 messages to save RAM

module.exports = function socketHandler(io) {
  io.on('connection', (socket) => {
    
    // Join
    socket.on('join', async ({ roomId, clientId, options }, cb) => {
      try {
        if (!roomId || !clientId) return cb({ ok: false, error: 'Bad Request' })
        
        socket.join(roomId)
        const room = createRoomIfMissing(roomId, options)

        // Player Management
        let player = room.players.find(p => p.clientId === clientId)
        if (player) {
          player.socketId = socket.id
        } else if (room.players.length < 2) {
          const color = room.players.length === 0 ? 'white' : 'black'
          player = { clientId, socketId: socket.id, color }
          room.players.push(player)
        }

        // Start Game
        if (room.players.length === 2 && room.status === 'waiting') {
          room.status = 'playing'
          room.lastMoveTime = Date.now()
          startTimer(room, io)
        }

        // Fetch Stats
        const stats = await getUserStats(clientId)
        const role = player ? player.color : 'spectator'
        
        cb({ ok: true, role, state: serialize(roomId, clientId), stats })
        io.to(roomId).emit('state', serialize(roomId))
        
        // Send recent chat history (Optimized)
        socket.emit('chat-history', room.chatHistory || [])

      } catch (e) {
        console.error(e)
        cb({ ok: false, error: 'Server Error' })
      }
    })

    // Move
    socket.on('move', ({ roomId, clientId, move }, cb) => {
      const room = rooms.get(roomId)
      if (!room || room.status !== 'playing') return cb({ ok: false })
      
      const player = room.players.find(p => p.clientId === clientId)
      if (!player) return cb({ ok: false })
      
      // Validation
      const turnShort = room.game.turn() // 'w' or 'b'
      const turnColor = turnShort === 'w' ? 'white' : 'black'
      
      if (player.color !== turnColor) return cb({ ok: false, r: 'turn' })

      try {
        // Time Logic
        const now = Date.now()
        const delta = (now - room.lastMoveTime) / 1000
        room.timeLeft[turnColor] = Math.max(0, room.timeLeft[turnColor] - delta + room.config.increment)
        room.lastMoveTime = now

        // Apply Move
        const result = room.game.move(move) // v1: throws if invalid, returns object if valid
        if (!result) return cb({ ok: false })

        room.lastActivity = now
        
        // Check Game Over
        const isOver = typeof room.game.isGameOver === 'function' 
          ? room.game.isGameOver() 
          : room.game.game_over()
          
        const isCheck = typeof room.game.isCheck === 'function'
          ? room.game.isCheck()
          : room.game.in_check()

        if (isOver) {
          finishGame(room, io, 'rules')
        } else {
          io.to(roomId).emit('move-effect', { 
            capture: !!result.captured, 
            check: isCheck 
          })
        }

        io.to(roomId).emit('state', serialize(roomId))
        cb({ ok: true })
      } catch (e) {
        // chess.js v1 throws errors on invalid moves sometimes
        cb({ ok: false }) 
      }
    })

    // Chat
    socket.on('chat', ({ roomId, clientId, message }) => {
      if (!message || message.length > 300) return
      const room = rooms.get(roomId)
      if (!room) return

      const clean = xss(message.slice(0, 300))
      const p = room.players.find(x => x.clientId === clientId)
      const sender = p ? (p.color === 'white' ? 'White' : 'Black') : 'Spec'
      
      const msgObj = { id: Date.now(), from: clientId, name: sender, text: clean }
      
      // RAM Optimization: Cap history
      room.chatHistory.push(msgObj)
      if (room.chatHistory.length > CHAT_MAX) room.chatHistory.shift()
      
      io.to(roomId).emit('chat', msgObj)
    })

    // Resign
    socket.on('resign', ({ roomId, clientId }) => {
      const room = rooms.get(roomId)
      if (!room || room.status !== 'playing') return
      const p = room.players.find(x => x.clientId === clientId)
      if (!p) return
      
      // Opponent wins
      const winner = room.players.find(x => x.clientId !== clientId)
      room.result = { winner: winner ? winner.color : 'draw', reason: 'resign' }
      finishGame(room, io, 'resign', winner?.clientId, clientId)
    })
  })

  // --- Helpers ---
  function startTimer(room, io) {
    if (room.timerInterval) clearInterval(room.timerInterval)
    room.lastMoveTime = Date.now()
    
    room.timerInterval = setInterval(() => {
      if (room.status !== 'playing') {
        clearInterval(room.timerInterval)
        return
      }
      const turn = room.game.turn() === 'w' ? 'white' : 'black'
      const now = Date.now()
      const delta = (now - room.lastMoveTime) / 1000
      
      // Check Timeout
      if (room.timeLeft[turn] - delta <= 0) {
        room.timeLeft[turn] = 0
        const winnerColor = turn === 'white' ? 'black' : 'white'
        const winner = room.players.find(p => p.color === winnerColor)
        const loser = room.players.find(p => p.color === turn)
        
        room.result = { winner: winnerColor, reason: 'timeout' }
        finishGame(room, io, 'timeout', winner?.clientId, loser?.clientId)
      }
      
      // Sync occasionally (every 2s) to save bandwidth
      if (Math.floor(now / 1000) % 2 === 0) {
        io.to(room.id).emit('time', room.timeLeft)
      }
    }, 1000)
  }

  function finishGame(room, io, type, winnerId = null, loserId = null) {
    room.status = 'finished'
    clearInterval(room.timerInterval)
    
    // Logic for Rule-based finish (Checkmate/Draw)
    if (type === 'rules') {
      const isCheckmate = typeof room.game.isCheckmate === 'function' ? room.game.isCheckmate() : room.game.in_checkmate()
      const isDraw = typeof room.game.isDraw === 'function' ? room.game.isDraw() : room.game.in_draw()
      
      if (isCheckmate) {
        const winnerColor = room.game.turn() === 'w' ? 'black' : 'white'
        const winner = room.players.find(p => p.color === winnerColor)
        const loser = room.players.find(p => p.color !== winnerColor)
        room.result = { winner: winnerColor, reason: 'checkmate' }
        winnerId = winner?.clientId
        loserId = loser?.clientId
      } else {
        room.result = { winner: 'draw', reason: 'draw' }
      }
    }

    io.to(room.id).emit('game-over', room.result)
    io.to(room.id).emit('state', serialize(room.id))

    // Save to Atlas
    const isDraw = room.result.winner === 'draw'
    updateStats(winnerId, loserId, isDraw)
  }
}
