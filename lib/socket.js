/**
 * lib/socket.js
 * Game Logic Controller
 */
const { rooms, createRoom, getRoom, getActiveRooms, User } = require('./rooms')
const { Chess } = require('chess.js')

module.exports = function socketHandler(io) {
    io.on('connection', (socket) => {
        
        // --- LOBBY ---
        socket.on('get-rooms', () => socket.emit('lobby-update', getActiveRooms()))
        
        socket.on('create-room', ({ roomId, config }) => {
            if(rooms.has(roomId)) return
            createRoom(roomId, config)
            io.emit('lobby-update', getActiveRooms())
        })

        // --- JOIN & GAME ---
        socket.on('join', ({ roomId }) => {
            let room = getRoom(roomId)
            if(!room) {
                // Auto create if joining via link and not exists (optional, mostly via create)
                return socket.emit('error', 'اتاق پیدا نشد')
            }

            socket.join(roomId)
            const user = socket.user // Attached in server.js

            // Check if reconnection
            let player = room.players.find(p => p.username === user.username)
            
            if (player) {
                player.socketId = socket.id
                player.connected = true
            } else if (room.players.length < 2) {
                // New Player
                const color = room.players.length === 0 ? 'w' : 'b'
                player = { 
                    socketId: socket.id, 
                    userId: user.id || 'guest',
                    username: user.username, 
                    color, 
                    connected: true 
                }
                room.players.push(player)
            } else {
                // Spectator
                room.spectators.push({ socketId: socket.id, username: user.username })
                socket.emit('spectator-mode')
            }

            // Start Game Trigger
            if (room.players.length === 2 && room.status === 'waiting') {
                room.status = 'playing'
                room.lastMoveTime = Date.now()
                // Start Timer
                if(!room.timer) {
                    room.timer = setInterval(() => {
                        if(room.status !== 'playing') return
                        const turn = room.game.turn()
                        room.timeLeft[turn] -= 0.1
                        if(room.timeLeft[turn] <= 0) {
                            endGame(room, io, turn === 'w' ? 'b' : 'w', 'timeout')
                        }
                    }, 100)
                }
            }

            room.lastActivity = Date.now()
            io.to(roomId).emit('sync', serialize(room))
            io.emit('lobby-update', getActiveRooms())
        })

        socket.on('move', ({ roomId, move }) => {
            const room = getRoom(roomId)
            if(!room || room.status !== 'playing') return

            const player = room.players.find(p => p.socketId === socket.id)
            if(!player || room.game.turn() !== player.color) return

            try {
                const result = room.game.move(move) // Validate move
                if(result) {
                    room.lastMove = result
                    room.lastActivity = Date.now()
                    
                    // Broadcast
                    io.to(roomId).emit('sync', serialize(room))
                    io.to(roomId).emit('move-sound', { check: room.game.inCheck(), capture: !!result.captured })

                    if(room.game.isGameOver()) {
                        let winner = null
                        let reason = ''
                        if(room.game.isCheckmate()) { winner = player.color; reason = 'checkmate'; }
                        else if(room.game.isDraw()) { winner = 'draw'; reason = 'draw'; }
                        else if(room.game.isStalemate()) { winner = 'draw'; reason = 'stalemate'; }
                        
                        endGame(room, io, winner, reason)
                    }
                }
            } catch(e) {}
        })

        socket.on('chat', ({ roomId, text }) => {
            const room = getRoom(roomId)
            if(room) {
                const msg = { sender: socket.user.username, text, time: Date.now() }
                room.chat.push(msg)
                io.to(roomId).emit('chat-msg', msg)
            }
        })

        socket.on('disconnect', () => {
            // Find room
            rooms.forEach((room) => {
                const p = room.players.find(p => p.socketId === socket.id)
                if(p) {
                    p.connected = false
                    io.to(room.id).emit('sync', serialize(room))
                    // Could implement auto-resign after 30s disconnect
                }
            })
        })
    })

    function endGame(room, io, winner, reason) {
        room.status = 'finished'
        room.result = { winner, reason }
        clearInterval(room.timer)
        
        // ELO Logic Here (Simplified)
        if(winner !== 'draw' && winner) {
            // Update DB...
        }
        
        io.to(room.id).emit('sync', serialize(room))
    }

    function serialize(room) {
        return {
            fen: room.game.fen(),
            players: room.players.map(p => ({ username: p.username, color: p.color, connected: p.connected })),
            status: room.status,
            timeLeft: room.timeLeft,
            lastMove: room.lastMove,
            result: room.result
        }
    }
}
