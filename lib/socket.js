const { createRoom, getRoom, getActiveRooms, rooms } = require('./rooms')
const { User } = require('./models')
const xss = require('xss')

module.exports = function socketHandler(io) {
    io.on('connection', (socket) => {
        const user = socket.user

        // --- LOBBY ---
        socket.on('get-rooms', () => socket.emit('lobby-update', getActiveRooms()))

        socket.on('create-room', ({ roomId, config }) => {
            if (rooms.has(roomId)) return socket.emit('error', 'کد تکراری است')
            createRoom(roomId, config)
            io.emit('lobby-update', getActiveRooms())
        })

        // --- GAME JOIN ---
        socket.on('join', async ({ roomId }) => {
            const room = getRoom(roomId)
            if (!room) return socket.emit('error', 'اتاق یافت نشد')

            socket.join(roomId)

            // Reconnect Logic
            let player = room.players.find(p => p.userId === user.id)
            
            if (player) {
                player.socketId = socket.id
                player.connected = true
            } else if (room.players.length < 2) {
                // New Player
                let color = 'w'
                if (room.players.length === 0) {
                    // نفر اول: طبق تنظیمات
                    if (room.config.color === 'white') color = 'w'
                    else if (room.config.color === 'black') color = 'b'
                    else color = Math.random() > 0.5 ? 'w' : 'b'
                } else {
                    // نفر دوم: برعکس نفر اول
                    color = room.players[0].color === 'w' ? 'b' : 'w'
                }

                player = {
                    userId: user.id,
                    username: user.username,
                    socketId: socket.id,
                    color,
                    connected: true
                }
                room.players.push(player)
            }

            // Start Game Check
            if (room.players.length === 2 && room.status === 'waiting') {
                room.status = 'playing'
                room.lastMoveTime = Date.now()
                startTimer(room, io)
            }

            // Send Init Data
            socket.emit('init-game', {
                fen: room.game.fen(),
                players: room.players,
                myColor: player ? player.color : 'spectator',
                status: room.status,
                timeLeft: room.timeLeft,
                lastMove: room.game.history({ verbose: true }).pop()
            })
            
            io.to(roomId).emit('player-update', room.players)
            io.emit('lobby-update', getActiveRooms())
        })

        // --- MOVE ---
        socket.on('move', ({ roomId, move }) => {
            const room = getRoom(roomId)
            if (!room || room.status !== 'playing') return

            const player = room.players.find(p => p.socketId === socket.id)
            if (!player || room.game.turn() !== player.color) return

            try {
                const result = room.game.move(move)
                if (result) {
                    const now = Date.now()
                    const spent = (now - room.lastMoveTime) / 1000
                    room.timeLeft[player.color] -= spent
                    if(room.timeLeft[player.color] < 0) room.timeLeft[player.color] = 0
                    room.lastMoveTime = now

                    if (room.game.isGameOver()) {
                        finishGame(room, io)
                    } else {
                        io.to(roomId).emit('sync', {
                            fen: room.game.fen(),
                            lastMove: result,
                            timeLeft: room.timeLeft,
                            turn: room.game.turn()
                        })
                    }
                }
            } catch (e) {}
        })

        // --- CHAT ---
        socket.on('chat', ({ roomId, text }) => {
            io.to(roomId).emit('chat-msg', { 
                sender: user.username, 
                text: xss(text).substring(0, 200) 
            })
        })

        socket.on('disconnect', () => {
            rooms.forEach(room => {
                const p = room.players.find(p => p.socketId === socket.id)
                if(p) {
                    p.connected = false
                    io.to(room.id).emit('player-update', room.players)
                }
            })
        })
    })

    // Helpers
    function startTimer(room, io) {
        if(room.timer) clearInterval(room.timer)
        room.timer = setInterval(() => {
            if(room.status !== 'playing') { clearInterval(room.timer); return }
            
            const turn = room.game.turn()
            room.timeLeft[turn] -= 1
            
            if(room.timeLeft[turn] <= 0) {
                room.timeLeft[turn] = 0
                finishGame(room, io, { winner: turn==='w'?'b':'w', reason: 'اتمام زمان' })
            }
        }, 1000)
    }

    async function finishGame(room, io, forceResult) {
        room.status = 'finished'
        clearInterval(room.timer)
        
        let result = forceResult
        if (!result) {
            if (room.game.isCheckmate()) result = { winner: room.game.turn()==='w'?'b':'w', reason: 'کیش و مات' }
            else if (room.game.isDraw()) result = { winner: 'draw', reason: 'تساوی' }
            else result = { winner: 'draw', reason: 'پایان بازی' }
        }
        room.result = result

        // Update DB
        if (result.winner !== 'draw' && room.players.length === 2) {
            const winnerP = room.players.find(p => p.color === result.winner)
            const loserP = room.players.find(p => p.color !== result.winner)
            if(winnerP && loserP && !winnerP.userId.startsWith('guest')) {
                await User.findByIdAndUpdate(winnerP.userId, { $inc: { elo: 10, wins: 1 } })
                await User.findByIdAndUpdate(loserP.userId, { $inc: { elo: -10, losses: 1 } })
            }
        }

        io.to(room.id).emit('game-over', result)
        io.emit('lobby-update', getActiveRooms())
    }
}
