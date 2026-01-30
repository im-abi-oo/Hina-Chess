/**
 * lib/socket.js
 * Engine: Game Logic + Chat + Presence
 */
const { rooms, createRoom, getRoom, getActiveRooms } = require('./rooms') // فرض بر این است که rooms.js را دارید
const { User, Message } = require('./models')
const xss = require('xss')

module.exports = function socketHandler(io) {
    io.on('connection', (socket) => {
        // احراز هویت سوکت
        const user = socket.user || { username: 'Guest', id: 'guest_' + socket.id.slice(0, 5), isGuest: true };
        console.log(`🔌 Connect: ${user.username} (${socket.id})`);

        // پیوستن به کانال شخصی (برای نوتیفیکیشن)
        if (!user.isGuest) socket.join(`user-${user.id}`);

        // --- LOBBY EVENTS ---
        socket.on('get-rooms', () => {
            socket.emit('lobby-update', getActiveRooms());
        });

        socket.on('create-room', ({ roomId, config }) => {
            // جلوگیری از ساخت اتاق تکراری
            if (rooms.has(roomId)) return socket.emit('error', 'این اتاق وجود دارد');
            
            // تنظیمات پیش‌فرض اگر کاربر چیزی نفرستاد
            const safeConfig = {
                time: parseInt(config?.time) || 10, // دقیقه
                color: config?.color || 'random'    // white, black, random
            };

            createRoom(roomId, safeConfig);
            io.emit('lobby-update', getActiveRooms());
        });

        // --- GAME EVENTS ---
        socket.on('join', ({ roomId }) => {
            const room = getRoom(roomId);
            if (!room) return socket.emit('error', 'اتاق پیدا نشد یا بازی تمام شده است.');

            socket.join(roomId);

            // آیا کاربر قبلاً در اتاق بوده؟ (Reconnect)
            let player = room.players.find(p => p.userId === user.id);

            if (player) {
                player.socketId = socket.id;
                player.connected = true;
            } else if (room.players.length < 2) {
                // تعیین رنگ بازیکن جدید
                let color = 'w';
                if (room.players.length === 0) {
                    // نفر اول: طبق تنظیمات اتاق
                    if (room.config.color === 'white') color = 'w';
                    else if (room.config.color === 'black') color = 'b';
                    else color = Math.random() > 0.5 ? 'w' : 'b';
                } else {
                    // نفر دوم: رنگ مخالف نفر اول
                    color = room.players[0].color === 'w' ? 'b' : 'w';
                }

                player = {
                    socketId: socket.id,
                    userId: user.id,
                    username: user.username,
                    elo: user.elo || 1200,
                    color: color,
                    connected: true
                };
                room.players.push(player);
            } else {
                // اتاق پر است -> تماشاچی
                socket.emit('init-game', { ...getRoomState(room), myColor: 'spectator' });
                return;
            }

            // بررسی شروع بازی
            if (room.players.length === 2 && room.status === 'waiting') {
                room.status = 'playing';
                room.lastMoveTime = Date.now();
                startTimer(room, io);
            }

            // ارسال وضعیت به همه
            io.to(roomId).emit('player-update', room.players);
            // ارسال وضعیت بازی به شخصی که جوین شده
            socket.emit('init-game', { ...getRoomState(room), myColor: player.color });
            io.emit('lobby-update', getActiveRooms());
        });

        socket.on('move', ({ roomId, move }) => {
            const room = getRoom(roomId);
            if (!room || room.status !== 'playing') return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player || room.game.turn() !== player.color) return; // نوبت این بازیکن نیست

            try {
                // اعمال حرکت در chess.js
                const result = room.game.move(move); 
                if (result) {
                    // آپدیت زمان
                    const now = Date.now();
                    const timeSpent = (now - room.lastMoveTime) / 1000;
                    room.timeLeft[player.color] -= timeSpent;
                    if(room.timeLeft[player.color] < 0) room.timeLeft[player.color] = 0;
                    room.lastMoveTime = now;

                    // بررسی پایان بازی
                    if (room.game.isGameOver()) {
                        handleGameOver(room, io, getGameOverReason(room.game));
                    } else {
                        // ارسال حرکت به حریف
                        io.to(roomId).emit('sync', {
                            fen: room.game.fen(),
                            lastMove: result, // برای هایلایت و صدا
                            timeLeft: room.timeLeft,
                            turn: room.game.turn()
                        });
                    }
                }
            } catch (e) {
                console.error("Move Error:", e);
                socket.emit('sync', { fen: room.game.fen() }); // بازگرداندن کلاینت به حالت صحیح
            }
        });

        socket.on('chat', ({ roomId, text }) => {
            const clean = xss(text).trim().substring(0, 200);
            if(!clean) return;
            io.to(roomId).emit('chat-msg', { sender: user.username, text: clean });
        });

        socket.on('disconnect', () => {
            rooms.forEach((room) => {
                const p = room.players.find(p => p.socketId === socket.id);
                if (p) {
                    p.connected = false;
                    io.to(room.id).emit('player-update', room.players);
                }
            });
        });
    });

    // --- Helpers ---
    function startTimer(room, io) {
        if (room.timer) clearInterval(room.timer);
        room.timer = setInterval(() => {
            if (room.status !== 'playing') { clearInterval(room.timer); return; }
            
            const turn = room.game.turn();
            room.timeLeft[turn] -= 1;

            if (room.timeLeft[turn] <= 0) {
                room.timeLeft[turn] = 0;
                handleGameOver(room, io, { winner: turn === 'w' ? 'b' : 'w', reason: 'زمان تمام شد' });
            }
        }, 1000);
    }

    async function handleGameOver(room, io, result) {
        room.status = 'finished';
        room.result = result;
        if (room.timer) clearInterval(room.timer);

        // آپدیت دیتابیس (Elo)
        if (result.winner !== 'draw' && room.players.length === 2) {
            const winner = room.players.find(p => p.color === result.winner);
            const loser = room.players.find(p => p.color !== result.winner);
            if (winner && loser && !winner.userId.startsWith('guest')) {
                try {
                    await User.findByIdAndUpdate(winner.userId, { $inc: { elo: 10, wins: 1 } });
                    await User.findByIdAndUpdate(loser.userId, { $inc: { elo: -10, losses: 1 } });
                } catch(e) { console.error('DB Error', e); }
            }
        }

        io.to(room.id).emit('game-over', result);
        io.emit('lobby-update', getActiveRooms());
    }

    function getRoomState(room) {
        return {
            fen: room.game.fen(),
            players: room.players,
            status: room.status,
            timeLeft: room.timeLeft,
            config: room.config,
            lastMove: room.game.history({ verbose: true }).pop()
        };
    }

    function getGameOverReason(game) {
        if (game.isCheckmate()) return { winner: game.turn() === 'w' ? 'b' : 'w', reason: 'کیش و مات' };
        if (game.isDraw()) return { winner: 'draw', reason: 'تساوی' };
        return { winner: 'draw', reason: 'پایان بازی' };
    }
};
