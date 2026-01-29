/**
 * lib/socket.js
 * Comprehensive Socket Controller: Chess Logic + Social System + Private Chat
 */
const { rooms, createRoom, getRoom, getActiveRooms } = require('./rooms')
const { User, Message } = require('./models')
const xss = require('xss')

module.exports = function socketHandler(io) {
    io.on('connection', (socket) => {
        console.log(`🔌 New Connection: ${socket.user.username} (${socket.id})`)

        // پیوستن به اتاق شخصی برای دریافت نوتیفیکیشن‌ها و پیام‌های خصوصی
        if (!socket.user.isGuest) {
            socket.join(`user-${socket.user.id}`)
        }

        // --- لابی ---
        socket.on('get-rooms', () => {
            socket.emit('lobby-update', getActiveRooms())
        })

        // --- سیستم چت خصوصی (خارج از بازی) ---
        socket.on('private-msg', async ({ toUserId, text }) => {
            if (socket.user.isGuest) return;
            const cleanText = xss(text).trim();
            if (!cleanText) return;

            try {
                const msg = await Message.create({
                    from: socket.user.id,
                    to: toUserId,
                    text: cleanText
                });

                // ارسال به فرستنده برای تایید
                socket.emit('private-msg-sent', msg);

                // ارسال به گیرنده (اگر آنلاین باشد)
                io.to(`user-${toUserId}`).emit('private-msg-receive', {
                    ...msg.toObject(),
                    senderUsername: socket.user.username
                });
            } catch (err) {
                console.error('PM Error:', err);
            }
        });

        // --- مدیریت اتاق و بازی ---
        socket.on('create-room', ({ roomId, config }) => {
            if (rooms.has(roomId)) return socket.emit('error', 'این اتاق قبلاً ساخته شده است');
            createRoom(roomId, config);
            io.emit('lobby-update', getActiveRooms());
        });

        socket.on('join', ({ roomId }) => {
            const room = getRoom(roomId);
            if (!room) return socket.emit('error', 'اتاق یافت نشد');

            socket.join(roomId);

            // بررسی اینکه آیا کاربر بازیکن است یا تماشاچی
            let player = room.players.find(p => p.userId === socket.user.id);
            
            if (!player && room.players.length < 2 && !socket.user.isGuest) {
                // اضافه کردن به عنوان بازیکن جدید
                player = {
                    socketId: socket.id,
                    userId: socket.user.id,
                    username: socket.user.username,
                    color: room.players.length === 0 ? 'w' : 'b',
                    connected: true
                };
                room.players.push(player);
                
                // شروع بازی اگر دو نفر تکمیل شدند
                if (room.players.length === 2) {
                    room.status = 'playing';
                    room.lastMoveTime = Date.now();
                    startTimer(room, io);
                }
            } else if (player) {
                // بازگشت بازیکن قطع شده (Reconnection)
                player.socketId = socket.id;
                player.connected = true;
            }

            // همگام‌سازی اطلاعات اتاق برای کاربر
            socket.emit('init-game', {
                fen: room.game.fen(),
                history: room.game.history(),
                players: room.players,
                myColor: player ? player.color : 'spectator',
                status: room.status,
                config: room.config,
                timeLeft: room.timeLeft
            });

            io.to(roomId).emit('player-update', room.players);
            io.emit('lobby-update', getActiveRooms());
        });

        // --- منطق حرکت مهره‌ها ---
        socket.on('move', async ({ roomId, move }) => {
            const room = getRoom(roomId);
            if (!room || room.status !== 'playing') return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player || room.game.turn() !== player.color) return;

            try {
                const result = room.game.move(move);
                if (result) {
                    // محاسبه زمان مصرف شده
                    const now = Date.now();
                    const consumed = Math.floor((now - room.lastMoveTime) / 1000);
                    room.timeLeft[player.color] -= consumed;
                    room.lastMoveTime = now;

                    // بررسی پایان بازی
                    if (room.game.isGameOver()) {
                        await finishGame(room, io);
                    } else {
                        io.to(roomId).emit('sync', {
                            fen: room.game.fen(),
                            move: result,
                            timeLeft: room.timeLeft,
                            turn: room.game.turn()
                        });
                    }
                }
            } catch (e) {
                socket.emit('error', 'حرکت غیرمجاز');
            }
        });

        // --- چت داخل اتاق بازی ---
        socket.on('chat', ({ roomId, text }) => {
            const cleanText = xss(text).substring(0, 200);
            io.to(roomId).emit('chat-msg', {
                sender: socket.user.username,
                text: cleanText,
                time: new Date().toLocaleTimeString('fa-IR')
            });
        });

        // --- قطع اتصال ---
        socket.on('disconnect', () => {
            rooms.forEach(async (room, roomId) => {
                const player = room.players.find(p => p.socketId === socket.id);
                if (player) {
                    player.connected = false;
                    io.to(roomId).emit('player-update', room.players);
                    
                    // اگر هر دو بازیکن رفتند، بعد از ۵ دقیقه اتاق حذف شود (در rooms.js مدیریت می‌شود)
                }
            });
        });
    });

    // --- توابع کمکی ---

    function startTimer(room, io) {
        if (room.timer) clearInterval(room.timer);
        room.timer = setInterval(async () => {
            if (room.status !== 'playing') return clearInterval(room.timer);

            const turn = room.game.turn();
            room.timeLeft[turn]--;

            if (room.timeLeft[turn] <= 0) {
                room.timeLeft[turn] = 0;
                room.status = 'finished';
                room.result = {
                    winner: turn === 'w' ? 'b' : 'w',
                    reason: 'زمان به پایان رسید'
                };
                await finishGame(room, io);
            }

            // ارسال آپدیت زمان هر ۵ ثانیه یکبار برای بهینه‌سازی (یا در هر حرکت)
            if (room.timeLeft[turn] % 5 === 0) {
                io.to(room.id).emit('time-update', room.timeLeft);
            }
        }, 1000);
    }

    async function finishGame(room, io) {
        room.status = 'finished';
        if (room.timer) clearInterval(room.timer);

        // اگر مات شده باشد
        if (room.game.isCheckmate()) {
            const winnerColor = room.game.turn() === 'w' ? 'b' : 'w';
            room.result = { winner: winnerColor, reason: 'کیش و مات' };
        } else if (room.game.isDraw()) {
            room.result = { winner: 'draw', reason: 'تساوی' };
        }

        // بروزرسانی دیتابیس و ELO
        if (room.players.length === 2) {
            const p1 = room.players[0];
            const p2 = room.players[1];
            
            try {
                if (room.result.winner === 'draw') {
                    await User.updateMany({ _id: { $in: [p1.userId, p2.userId] } }, { $inc: { draws: 1 } });
                } else {
                    const winId = room.result.winner === p1.color ? p1.userId : p2.userId;
                    const loseId = room.result.winner === p1.color ? p2.userId : p1.userId;
                    
                    await User.findByIdAndUpdate(winId, { $inc: { elo: 15, wins: 1 } });
                    await User.findByIdAndUpdate(loseId, { $inc: { elo: -10, losses: 1 } });
                }
            } catch (e) { console.error('DB Update Error:', e); }
        }

        io.to(room.id).emit('game-over', room.result);
        io.emit('lobby-update', getActiveRooms());
    }
};
