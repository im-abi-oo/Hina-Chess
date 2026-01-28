/**
 * lib/socket.js
 * Secure Logic + Anti-Cheat + Lobby
 */
const { rooms, createRoom, getRoom, getActiveRooms, User } = require('./rooms')
const xss = require('xss')

module.exports = function socketHandler(io) {
    io.on('connection', (socket) => {
        // Broadcast active rooms to lobby on connect
        socket.emit('lobby-update', getActiveRooms())

        // --- LOBBY ACTIONS ---
        socket.on('create-room', ({ roomId, config }) => {
            if(rooms.has(roomId)) return socket.emit('error', 'اتاق وجود دارد')
            createRoom(roomId, config)
            socket.emit('room-created', roomId)
            io.emit('lobby-update', getActiveRooms())
        })

        socket.on('get-rooms', () => {
            socket.emit('lobby-update', getActiveRooms())
        })

        // --- GAME ACTIONS ---
        socket.on('join', ({ roomId }) => {
            const room = getRoom(roomId)
            if(!room) return socket.emit('error', 'اتاق یافت نشد')
            
            socket.join(roomId)
            
            // Identify User
            const user = socket.user || { username: 'مهمان', id: 'guest-' + socket.id.slice(0,4) }
            
            // Check if player is reconnecting
            let player = room.players.find(p => p.userId === user.id)
            
            if (player) {
                player.socketId = socket.id
                player.connected = true
            } else if (room.players.length < 2) {
                // Add new player
                const color = room.players.length === 0 ? 'w' : 'b'
                player = { socketId: socket.id, userId: user.id, username: user.username, color, connected: true }
                room.players.push(player)
            } else {
                // Spectator
                room.spectators.push({ socketId: socket.id, username: user.username })
            }

            // Start Game Trigger
            if(room.players.length === 2 && room.status === 'waiting') {
                room.status = 'playing'
                room.lastMoveTime = Date.now()
                startGameTimer(room, io)
            }

            io.to(roomId).emit('sync', serialize(room))
            io.emit('lobby-update', getActiveRooms()) // Update lobby player counts
        })

        socket.on('move', ({ roomId, move }) => {
            const room = getRoom(roomId)
            if(!room || room.status !== 'playing') return

            const player = room.players.find(p => p.socketId === socket.id)
            if(!player) return // Spectators cannot move

            // 1. Turn Check
            if(room.game.turn() !== player.color) return 

            try {
                // 2. Time Logic
                const now = Date.now()
                const elapsed = (now - room.lastMoveTime) / 1000
                room.timeLeft[player.color] = Math.max(0, room.timeLeft[player.color] - elapsed + (room.config.increment || 0))
                
                // 3. Move Logic
                const result = room.game.move(move) // catch invalid moves
                
                room.lastMoveTime = now
                room.lastActivity = now

                // 4. Check Game Over
                if(room.game.isGameOver()) {
                   endGame(room, io)
                } else {
                    // Play sound logic handled on client
                    const isCheck = room.game.isCheck()
                    const isCapture = result.captured
                    io.to(roomId).emit('move-sound', { check: isCheck, capture: !!isCapture })
                }
                
                io.to(roomId).emit('sync', serialize(room))

            } catch(e) {
                // Invalid move, ignore
            }
        })

        socket.on('chat', ({ roomId, text }) => {
            const room = getRoom(roomId)
            if(!room) return
            const user = socket.user ? socket.user.username : 'Guest'
            const msg = { sender: user, text: xss(text.slice(0, 200)), time: Date.now() }
            room.chat.push(msg)
            io.to(roomId).emit('chat-msg', msg)
        })

        socket.on('disconnect', () => {
            rooms.forEach((room, id) => {
                const p = room.players.find(x => x.socketId === socket.id)
                if(p) {
                    p.connected = false
                    io.to(id).emit('player-disconnect', p.username)
                    // If playing, maybe start a disconnect timer? (Simpler: just show status)
                }
            })
        })
    })

    // --- HELPERS ---
    function startGameTimer(room, io) {
        if(room.timer) clearInterval(room.timer)
        room.timer = setInterval(() => {
            if(room.status !== 'playing') return clearInterval(room.timer)
            
            const turn = room.game.turn()
            const now = Date.now()
            const delta = (now - room.lastMoveTime) / 1000
            
            // Temporary calc for check
            const currentVal = room.timeLeft[turn] - delta
            
            if(currentVal <= 0) {
                room.timeLeft[turn] = 0
                room.result = { winner: turn === 'w' ? 'b' : 'w', reason: 'timeout' }
                endGame(room, io)
            }

            // Sync occasionally
            if(Math.floor(delta) % 5 === 0) {
                io.to(room.id).emit('time-sync', room.timeLeft)
            }
        }, 1000)
    }

    async function endGame(room, io) {
        room.status = 'finished'
        clearInterval(room.timer)
        
        if(!room.result) {
            if(room.game.isCheckmate()) room.result = { winner: room.game.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' }
            else if(room.game.isDraw()) room.result = { winner: 'draw', reason: 'draw' }
            else room.result = { winner: 'draw', reason: 'aborted' }
        }

        // Update DB (ELO) if both are real users
        if(room.players.length === 2 && room.players[0].userId.length > 10 && room.players[1].userId.length > 10) {
            const p1 = room.players[0]
            const p2 = room.players[1]
            const winnerId = room.result.winner === 'draw' ? null : (room.result.winner === p1.color ? p1.userId : p2.userId)
            
            // Simple DB update (Async)
            if(winnerId) {
                await User.findByIdAndUpdate(winnerId, { $inc: { wins: 1, elo: 10 } })
                await User.findByIdAndUpdate(winnerId === p1.userId ? p2.userId : p1.userId, { $inc: { losses: 1, elo: -10 } })
            } else {
                await User.findByIdAndUpdate(p1.userId, { $inc: { draws: 1 } })
                await User.findByIdAndUpdate(p2.userId, { $inc: { draws: 1 } })
            }
        }

        io.to(room.id).emit('game-over', room.result)
        io.to(room.id).emit('sync', serialize(room))
        io.emit('lobby-update', getActiveRooms())
    }

    function serialize(room) {
        return {
            fen: room.game.fen(),
            players: room.players.map(p => ({ username: p.username, color: p.color, connected: p.connected, id: p.userId })),
            turn: room.game.turn(),
            timeLeft: room.timeLeft,
            status: room.status,
            lastMove: room.game.history({ verbose: true }).pop(),
            result: room.result
        }
    }
}
