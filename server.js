/**
 * Hina Chess - server.js
 * Next + Express + Socket.IO
 * Simple room-based real-time sync. No DB. First two joiners are players, others spectators.
 */

const express = require('express')
const next = require('next')
const http = require('http')
const { Server } = require('socket.io')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()
  const httpServer = http.createServer(server)
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  })

  // room state kept only in memory (no persistent storage)
  // For each room we track an ordered list of player socket ids (max 2).
  const roomsPlayers = new Map()

  io.on('connection', (socket) => {
    console.log('socket connected', socket.id)

    socket.on('join', (roomId, cb) => {
      if (!roomId) {
        cb({ ok: false, reason: 'no-room-id' })
        return
      }
      socket.join(roomId)
      const players = roomsPlayers.get(roomId) || []
      // If already a player and reconnecting, keep them
      if (!players.includes(socket.id) && players.length < 2) {
        players.push(socket.id)
        roomsPlayers.set(roomId, players)
      }
      const role = (players.indexOf(socket.id) === 0) ? 'white' : (players.indexOf(socket.id) === 1 ? 'black' : 'spectator')
      const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0
      cb({ ok: true, role, playersCount: roomSize })
      // inform room about players assignment and list
      io.to(roomId).emit('room-update', { players: players.slice(0,2) })
    })

    socket.on('move', ({ roomId, move }) => {
      socket.to(roomId).emit('move', move)
    })

    socket.on('chat', ({ roomId, message }) => {
      io.to(roomId).emit('chat', { from: socket.id, message })
    })

    socket.on('reset', (roomId) => {
      io.to(roomId).emit('reset')
    })

    socket.on('resign', (roomId, color) => {
      io.to(roomId).emit('resign', { by: socket.id, color })
    })

    socket.on('disconnecting', () => {
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) continue
        // remove from players list if present
        const players = roomsPlayers.get(roomId) || []
        const idx = players.indexOf(socket.id)
        if (idx !== -1) {
          players.splice(idx, 1)
          roomsPlayers.set(roomId, players)
          // notify remaining
          socket.to(roomId).emit('player-left', { leftSocketId: socket.id, players: players.slice(0,2) })
        } else {
          socket.to(roomId).emit('spectator-left', { leftSocketId: socket.id })
        }
      }
    })

    socket.on('disconnect', () => {
      // cleanup possible empty rooms
      for (const [roomId, players] of roomsPlayers.entries()) {
        const room = io.sockets.adapter.rooms.get(roomId)
        if (!room || room.size === 0) roomsPlayers.delete(roomId)
      }
    })
  })

  server.all('*', (req, res) => handle(req, res))

  const port = parseInt(process.env.PORT || '3000', 10)
  httpServer.listen(port, (err) => {
    if (err) throw err
    console.log(`> Hina Chess ready on http://localhost:${port}`)
  })
})
