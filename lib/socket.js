// socket.js
const {
  createRoom,
  getRoom,
  assignColor,
  removePlayer,
  startGameIfReady,
  handleMove,
  rooms
} = require('./rooms')

module.exports = function attachSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('socket connected', socket.id)

    socket.on('join', ({ roomId, username }) => {
      if (!roomId) {
        socket.emit('error', 'roomId missing')
        return
      }

      const room = createRoom(roomId)
      socket.join(roomId)
      const player = assignColor(room, socket.id, username || `P-${socket.id.slice(0,4)}`)

      // ارسال init فقط برای همین بازیکن (myColor مشخص)
      socket.emit('init-game', {
        fen: room.game.fen(),
        players: room.players.map(p => ({ username: p.username, color: p.color })),
        myColor: player.color,
        status: room.status,
        timeLeft: room.timeLeft
      })

      // اطلاع همه درباره لیست بازیکنان
      io.to(roomId).emit('player-update', room.players.map(p => ({ username: p.username, color: p.color })))

      // اگر دو بازیکن داریم، شروع کن
      startGameIfReady(io, room)
    })

    socket.on('move', ({ roomId, move }) => {
      const r = handleMove(io, roomId, socket.id, move)
      if (!r.ok) {
        socket.emit('error', r.err)
      }
    })

    socket.on('chat', ({ roomId, text }) => {
      const room = getRoom(roomId)
      if (!room) return
      const p = room.players.find(pp => pp.id === socket.id) || { username: 'تماشاچی' }
      const msg = { sender: p.username, text, at: Date.now() }
      io.to(roomId).emit('chat-msg', msg)
    })

    socket.on('resign', ({ roomId }) => {
      const room = getRoom(roomId)
      if (!room) return
      const p = room.players.find(pp => pp.id === socket.id)
      if (!p || room.status !== 'playing') return
      room.status = 'finished'
      room.result = { winner: p.color === 'w' ? 'b' : 'w', reason: 'تسلیم' }
      if (room.timer) { clearInterval(room.timer); room.timer = null }
      io.to(roomId).emit('game-over', room.result)
    })

    socket.on('leave', ({ roomId }) => {
      const room = getRoom(roomId)
      if (!room) return
      removePlayer(room, socket.id)
      socket.leave(roomId)
      io.to(roomId).emit('player-update', room.players.map(p => ({ username: p.username, color: p.color })))
    })

    socket.on('disconnect', () => {
      // برای هر اتاقی که بازیکن عضوشه، حذفش کن
      for (const room of rooms.values()) {
        const found = room.players.find(p => p.id === socket.id)
        if (found) {
          removePlayer(room, socket.id)
          io.to(room.id).emit('player-update', room.players.map(p => ({ username: p.username, color: p.color })))
          if (room.status === 'waiting') {
            io.to(room.id).emit('init-game', {
              fen: room.game.fen(),
              players: room.players.map(p => ({ username: p.username, color: p.color })),
              myColor: 'spectator',
              status: room.status,
              timeLeft: room.timeLeft
            })
          }
        }
      }
      console.log('socket disconnected', socket.id)
    })
  })
}
