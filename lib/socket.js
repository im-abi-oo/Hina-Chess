const { rooms, createRoom, getRoom, getActiveRooms } = require('./rooms') // Note: User is now in models.js

module.exports = function socketHandler(io, MessageModel) {
    io.on('connection', (socket) => {
        
        // Join a personal room for notifications
        if (!socket.user.isGuest) {
            socket.join(`user-${socket.user.id}`)
        }

        // --- LOBBY & GAME EXISTING CODE ---
        socket.on('get-rooms', () => socket.emit('lobby-update', getActiveRooms()))
        socket.on('create-room', ({ roomId, config }) => {
            if(rooms.has(roomId)) return
            createRoom(roomId, config)
            io.emit('lobby-update', getActiveRooms())
        })
        
        socket.on('join', ({ roomId }) => {
            let room = getRoom(roomId)
            if(!room) return socket.emit('error', 'اتاق پیدا نشد')
            socket.join(roomId)
            
            // Player Logic (Simplified for brevity - keep your existing full logic here)
            // ... (Your existing join logic from previous answer) ...
            
            // Just ensuring we have the basic join for this context:
             let player = room.players.find(p => p.username === socket.user.username)
             if (!player && room.players.length < 2) {
                 player = { socketId: socket.id, username: socket.user.username, color: room.players.length===0?'w':'b', connected: true }
                 room.players.push(player)
             }
             io.to(roomId).emit('sync', { fen: room.game.fen(), players: room.players, status: room.status, timeLeft: room.timeLeft })
        })

        socket.on('move', ({ roomId, move }) => {
             const room = getRoom(roomId)
             if(room && room.status === 'playing') {
                 try {
                     const res = room.game.move(move)
                     if(res) io.to(roomId).emit('sync', { fen: room.game.fen(), players: room.players, status: room.status, timeLeft: room.timeLeft, lastMove: res })
                 } catch(e){}
             }
        })
        
        socket.on('chat', ({roomId, text}) => {
            io.to(roomId).emit('chat-msg', {sender: socket.user.username, text})
        })

        // --- NEW: PRIVATE CHAT ---
        socket.on('private-msg', async ({ toUserId, text }) => {
            if(socket.user.isGuest) return;
            
            // Save to DB
            try {
                const msg = await MessageModel.create({
                    from: socket.user.id,
                    to: toUserId,
                    text: text
                })
                
                // Send to sender (to update UI)
                socket.emit('private-msg-sent', msg)
                
                // Send to receiver
                io.to(`user-${toUserId}`).emit('private-msg-receive', {
                    ...msg.toObject(),
                    senderUsername: socket.user.username // Helper for UI
                })
            } catch(e) { console.error(e) }
        })

        socket.on('disconnect', () => { /* Cleanup */ })
    })
}
