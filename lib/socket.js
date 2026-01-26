/**
 * lib/socket.js
 * All socket logic in one module (modular, testable)
 *
 * Responsibilities:
 *  - join/assign players (clientId)
 *  - server-side validation (chess.js)
 *  - server timers (authoritative)
 *  - chat with basic rate-limit + sanitization
 *  - broadcast canonical state
 */

const { v4: uuidv4 } = require('uuid')
const { createRoomIfMissing, serialize, rooms } = require('./rooms')
const { Chess } = require('chess.js')
const xss = require('xss')

const MESSAGE_MAX_LEN = 1000
const CHAT_RATE_LIMIT_MS = 600 // per-client minimal spacing

module.exports = function socketHandler(io) {
  const lastChatAt = new Map()

  io.on('connection', (socket) => {
    console.log('socket connected', socket.id)

    socket.on('join', (payload, cb) => {
      try {
        const { roomId, clientId: rawClientId, timePerPlayer } = payload || {}
        if (!roomId) return cb && cb({ ok: false, reason: 'no-room-id' })
        const clientId = rawClientId || uuidv4()
        socket.join(roomId)
        const room = createRoomIfMissing(roomId, parseInt(timePerPlayer || process.env.TIME_PER_PLAYER || '300', 10))

        let player = room.players.find(p => p.clientId === clientId)
        if (player) {
          player.socketId = socket.id
          player.lastSeen = Date.now()
        } else if (room.players.length < 2) {
          player = { clientId, socketId: socket.id, color: null, lastSeen: Date.now() }
          room.players.push(player)
        } else {
          // spectator joins via socket only
        }

        // assign colors deterministically
        room.players.forEach((p, i) => p.color = i === 0 ? 'white' : 'black')

        if (room.players.length >= 2 && room.status === 'waiting') {
          room.status = 'playing'
          room.turnStartedAt = Date.now()
          startTimerForRoom(roomId, io)
        }

        const role = player ? player.color : 'spectator'
        cb && cb({ ok: true, role, clientId, state: serialize(roomId) })

        io.to(roomId).emit('state', serialize(roomId))
      } catch (err) {
        console.error('join error', err)
        cb && cb({ ok: false, reason: 'server-error' })
      }
    })

    socket.on('move', ({ roomId, clientId, move }, cb) => {
      try {
        const room = rooms.get(roomId)
        if (!room) return cb && cb({ ok: false, reason: 'no-room' })
        const player = room.players.find(p => p.clientId === clientId)
        if (!player) return cb && cb({ ok: false, reason: 'not-player' })
        const currentTurn = room.game.turn() === 'w' ? 'white' : 'black'
        if (player.color !== currentTurn) return cb && cb({ ok: false, reason: 'not-your-turn' })
        if (room.status !== 'playing') return cb && cb({ ok: false, reason: 'not-playing' })

        // deduct elapsed time
        const elapsed = Math.floor((Date.now() - room.turnStartedAt) / 1000)
        if (elapsed > 0) {
          room.timeLeft[currentTurn] = Math.max(0, room.timeLeft[currentTurn] - elapsed)
        }

        const res = room.game.move(move)
        if (!res) return cb && cb({ ok: false, reason: 'invalid-move' })

        room.turnStartedAt = Date.now()
        room.lastActivity = Date.now()

        io.to(roomId).emit('move', res)
        io.to(roomId).emit('state', serialize(roomId))

        if (room.game.game_over()) {
          room.status = 'finished'
          stopTimerForRoom(roomId)
          io.to(roomId).emit('state', serialize(roomId))
        }

        cb && cb({ ok: true })
      } catch (err) {
        console.error('move error', err)
        cb && cb({ ok: false, reason: 'server-error' })
      }
    })

    socket.on('chat', ({ roomId, clientId, message }) => {
      try {
        if (!roomId || !message) return
        const now = Date.now()
        const last = lastChatAt.get(clientId) || 0
        if (now - last < CHAT_RATE_LIMIT_MS) return
        lastChatAt.set(clientId, now)

        const clean = xss(String(message).slice(0, MESSAGE_MAX_LEN))
        io.to(roomId).emit('chat', { from: clientId, message: clean, ts: now })
        const room = rooms.get(roomId)
        if (room) room.lastActivity = Date.now()
      } catch (e) {
        console.error('chat error', e)
      }
    })

    socket.on('reset', ({ roomId, clientId }) => {
      const room = rooms.get(roomId)
      if (!room) return
      const p = room.players.find(x => x.clientId === clientId)
      if (!p) return
      room.game = new Chess()
      room.status = 'waiting'
      const t = parseInt(process.env.TIME_PER_PLAYER || '300', 10)
      room.timeLeft = { white: t, black: t }
      room.turnStartedAt = Date.now()
      stopTimerForRoom(roomId)
      io.to(roomId).emit('state', serialize(roomId))
    })

    socket.on('resign', ({ roomId, clientId }) => {
      const room = rooms.get(roomId)
      if (!room) return
      const p = room.players.find(x => x.clientId === clientId)
      if (!p) return
      room.status = 'resigned'
      stopTimerForRoom(roomId)
      io.to(roomId).emit('resign', { by: clientId, color: p.color })
      io.to(roomId).emit('state', serialize(roomId))
    })

    socket.on('disconnecting', () => {
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) continue
        const room = rooms.get(roomId)
        if (!room) continue
        const idx = room.players.findIndex(p => p.socketId === socket.id)
        if (idx !== -1) {
          room.players[idx].socketId = null
          room.players[idx].lastSeen = Date.now()
          io.to(roomId).emit('player-left', {
            clientId: room.players[idx].clientId,
            players: room.players.map(p => ({ clientId: p.clientId, color: p.color }))
          })
        } else {
          io.to(roomId).emit('spectator-left', { socketId: socket.id })
        }
      }
    })

    socket.on('disconnect', () => {
      // on disconnect, we do not immediately delete rooms — TTL handles it
      // but we can remove empty rooms early
      for (const [roomId, room] of rooms.entries()) {
        const anyConnected = room.players.some(p => p.socketId) || (io.sockets.adapter.rooms.get(roomId) && io.sockets.adapter.rooms.get(roomId).size > 0)
        if (!anyConnected) {
          if (room.timerInterval) clearInterval(room.timerInterval)
          rooms.delete(roomId)
          console.log('room removed after disconnect:', roomId)
        }
      }
    })
  })

  // helpers
  function startTimerForRoom(roomId, ioRef) {
    const room = rooms.get(roomId)
    if (!room) return
    if (room.timerInterval) return
    room.turnStartedAt = Date.now()
    room.timerInterval = setInterval(() => {
      const turn = room.game.turn() === 'w' ? 'white' : 'black'
      const elapsed = Math.floor((Date.now() - room.turnStartedAt) / 1000)
      if (elapsed > 0) {
        room.timeLeft[turn] = Math.max(0, room.timeLeft[turn] - elapsed)
        room.turnStartedAt = Date.now()
        ioRef.to(roomId).emit('time', room.timeLeft)
        if (room.timeLeft[turn] <= 0) {
          room.status = 'timeout'
          clearInterval(room.timerInterval)
          room.timerInterval = null
          ioRef.to(roomId).emit('state', serialize(roomId))
        }
      }
    }, 1000)
  }

  function stopTimerForRoom(roomId) {
    const room = rooms.get(roomId)
    if (!room) return
    if (room.timerInterval) {
      clearInterval(room.timerInterval)
      room.timerInterval = null
    }
  }
}
