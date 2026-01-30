const { rooms, createRoom, getRoom } = require('./rooms');

module.exports = function socketHandler(io) {
    io.on('connection', (socket) => {
        // دریافت اطلاعات کاربر از سیستم احراز هویت شما
        const user = socket.user || { username: `Player_${socket.id.slice(0, 4)}`, id: socket.id };

        socket.on('join', ({ roomId }) => {
            let room = getRoom(roomId);
            if (!room) {
                room = createRoom(roomId);
            }

            room.lastActivity = Date.now();

            // بررسی اتصال مجدد (Reconnect)
            const existingPlayer = room.players.find(p => p.id === user.id);
            if (existingPlayer) {
                existingPlayer.socketId = socket.id;
                socket.join(roomId);
                return emitGameUpdate(io, room);
            }

            // اضافه کردن بازیکن جدید اگر ظرفیت (۲ نفر) تکمیل نباشد
            if (room.players.length < 2) {
                let color = 'w';
                if (room.players.length === 1) {
                    color = room.players[0].color === 'w' ? 'b' : 'w';
                } else {
                    if (room.config.color === 'white') color = 'w';
                    else if (room.config.color === 'black') color = 'b';
                    else color = Math.random() > 0.5 ? 'w' : 'b';
                }

                room.players.push({
                    socketId: socket.id,
                    id: user.id,
                    username: user.username,
                    color: color,
                    ready: false,
                    drawOffered: false
                });
            }

            socket.join(roomId);
            emitGameUpdate(io, room);
        });

        // رویداد اعلام آمادگی در لابی
        socket.on('player-ready', ({ roomId }) => {
            const room = getRoom(roomId);
            if (!room || room.status !== 'waiting') return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (player) {
                player.ready = true;
                
                // اگر هر دو بازیکن آماده شدند، بازی شروع شود
                if (room.players.length === 2 && room.players.every(p => p.ready)) {
                    room.status = 'playing';
                    room.lastMoveTime = Date.now();
                    startGameTimer(io, room);
                    io.to(roomId).emit('chat-msg', { sender: 'System', text: '🎮 بازی شروع شد! موفق باشید.' });
                }
                emitGameUpdate(io, room);
            }
        });

        // مدیریت حرکت مهره‌ها
        socket.on('move', ({ roomId, move }) => {
            const room = getRoom(roomId);
            if (!room || room.status !== 'playing') return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player || room.game.turn() !== player.color) return;

            try {
                const moveResult = room.game.move(move);
                if (moveResult) {
                    // با هر حرکت، پیشنهاد تساوی قبلی باطل می‌شود
                    room.players.forEach(p => p.drawOffered = false);
                    
                    // اعمال پاداش زمانی (Increment)
                    room.timeLeft[player.color] += room.config.increment;
                    room.lastMoveTime = Date.now();

                    // بررسی وضعیت مات یا تساوی فنی
                    checkGameOver(io, room);

                    // همگام‌سازی وضعیت جدید برای همه (بازیکنان و تماشاچی‌ها)
                    io.to(roomId).emit('sync', {
                        fen: room.game.fen(),
                        timeLeft: room.timeLeft,
                        lastMove: moveResult,
                        turn: room.game.turn(),
                        history: room.game.history()
                    });
                }
            } catch (err) {
                socket.emit('error', 'حرکت غیرمجاز است');
            }
        });

        // مدیریت چت و اموجی‌های سریع
        socket.on('chat', ({ roomId, text }) => {
            const room = getRoom(roomId);
            if (room) {
                const message = { sender: user.username, text: text.substring(0, 150) };
                room.chat.push(message);
                io.to(roomId).emit('chat-msg', message);
            }
        });

        // مدیریت پیشنهاد تساوی
        socket.on('offer-draw', ({ roomId }) => {
            const room = getRoom(roomId);
            if (!room || room.status !== 'playing') return;

            const player = room.players.find(p => p.socketId === socket.id);
            const opponent = room.players.find(p => p.socketId !== socket.id);
            
            if (player && opponent) {
                player.drawOffered = true;
                if (opponent.drawOffered) {
                    endGame(io, room, 'draw', 'agreement');
                } else {
                    io.to(opponent.socketId).emit('draw-offered', { from: player.username });
                    io.to(roomId).emit('chat-msg', { sender: 'System', text: `🤝 ${player.username} پیشنهاد تساوی داد.` });
                }
            }
        });

        // مدیریت تسلیم شدن (Resign)
        socket.on('resign', ({ roomId }) => {
            const room = getRoom(roomId);
            if (room && room.status === 'playing') {
                const player = room.players.find(p => p.socketId === socket.id);
                if (player) {
                    endGame(io, room, player.color === 'w' ? 'b' : 'w', 'resignation');
                }
            }
        });

        socket.on('disconnect', () => {
            // در اینجا می‌توان منطق وقفه بازی برای ریکانکت را اضافه کرد
        });
    });
};

// --- توابع کمکی موتور بازی ---

function startGameTimer(io, room) {
    if (room.timerInterval) clearInterval(room.timerInterval);
    room.timerInterval = setInterval(() => {
        if (room.status !== 'playing') return clearInterval(room.timerInterval);

        const currentTurn = room.game.turn();
        room.timeLeft[currentTurn]--;

        if (room.timeLeft[currentTurn] <= 0) {
            room.timeLeft[currentTurn] = 0;
            endGame(io, room, currentTurn === 'w' ? 'b' : 'w', 'timeout');
        }
    }, 1000);
}

function checkGameOver(io, room) {
    if (room.game.isCheckmate()) {
        endGame(io, room, room.game.turn() === 'w' ? 'b' : 'w', 'checkmate');
    } else if (room.game.isDraw() || room.game.isStalemate() || room.game.isThreefoldRepetition()) {
        endGame(io, room, 'draw', 'technical_draw');
    }
}

function endGame(io, room, winner, reason) {
    if (room.status === 'finished') return;
    room.status = 'finished';
    room.result = { winner, reason };
    clearInterval(room.timerInterval);
    io.to(room.id).emit('game-over', room.result);
    emitGameUpdate(io, room);
}

function emitGameUpdate(io, room) {
    room.players.forEach(p => {
        io.to(p.socketId).emit('init-game', {
            fen: room.game.fen(),
            players: room.players,
            timeLeft: room.timeLeft,
            status: room.status,
            myColor: p.color,
            config: room.config,
            history: room.game.history(),
            result: room.result,
            chatHistory: room.chat
        });
    });
}
