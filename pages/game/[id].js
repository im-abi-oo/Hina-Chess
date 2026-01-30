import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { io } from 'socket.io-client';
import { Chess } from 'chess.js';
import dynamic from 'next/dynamic';
import styles from '../../styles/Game.module.css';

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { 
    ssr: false,
    loading: () => <div className={styles.loader}>در حال چیدن میز بازی...</div>
});

export default function ChessGame() {
    const router = useRouter();
    const { id: roomId } = router.query;
    
    const [game, setGame] = useState(new Chess());
    const [gameState, setGameState] = useState({
        players: [],
        myColor: 'spectator',
        status: 'loading',
        timeLeft: { w: 600, b: 600 },
        history: [],
        config: { time: 10 },
        result: null
    });

    const [chat, setChat] = useState([]);
    const [msg, setMsg] = useState('');
    const [activeTab, setActiveTab] = useState('chat');
    const [moveSquares, setMoveSquares] = useState({});
    const [optionSquares, setOptionSquares] = useState({});
    
    const socketRef = useRef();
    const chatEndRef = useRef();

    // --- سیستم اسکرول چت ---
    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chat]);

    // --- پخش صدا ---
    const playSound = useCallback((move) => {
        const audio = new Audio();
        if (move?.san?.includes('#')) audio.src = '/sounds/game-end.mp3';
        else if (move?.san?.includes('+')) audio.src = '/sounds/check.mp3';
        else if (move?.flags?.includes('c')) audio.src = '/sounds/capture.mp3';
        else audio.src = '/sounds/move.mp3';
        audio.play().catch(() => {});
    }, []);

    // --- تایمر کلاینت ---
    useEffect(() => {
        let timer;
        if (gameState.status === 'playing') {
            timer = setInterval(() => {
                setGameState(prev => ({
                    ...prev,
                    timeLeft: {
                        ...prev.timeLeft,
                        [game.turn()]: Math.max(0, prev.timeLeft[game.turn()] - 1)
                    }
                }));
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [gameState.status, game]);

    // --- ارتباط با سرور ---
    useEffect(() => {
        if (!roomId) return;
        socketRef.current = io();

        socketRef.current.emit('join', { roomId });

        socketRef.current.on('init-game', (data) => {
            setGame(new Chess(data.fen));
            setGameState(data);
            if (data.chatHistory) setChat(data.chatHistory);
        });

        socketRef.current.on('sync', (data) => {
            const newGame = new Chess(data.fen);
            setGame(newGame);
            setGameState(prev => ({ 
                ...prev, 
                timeLeft: data.timeLeft, 
                history: data.history,
                status: 'playing' 
            }));
            if (data.lastMove) playSound(data.lastMove);
            setMoveSquares({
                [data.lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
                [data.lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
            });
        });

        socketRef.current.on('chat-msg', (m) => setChat(prev => [...prev, m]));

        socketRef.current.on('game-over', (res) => {
            setGameState(prev => ({ ...prev, status: 'finished', result: res }));
            playSound({ san: '#' });
        });

        return () => socketRef.current?.disconnect();
    }, [roomId, playSound]);

    // --- منطق حرکت و هایلایت ---
    function onPieceClick(piece, square) {
        if (gameState.status !== 'playing' || game.turn() !== gameState.myColor) return;
        
        const moves = game.moves({ square, verbose: true });
        if (moves.length === 0) return;

        const newSquares = {};
        moves.map((move) => {
            newSquares[move.to] = {
                background: "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
                borderRadius: "50%",
            };
            return move;
        });
        setOptionSquares(newSquares);
    }

    function onDrop(source, target) {
        if (gameState.status !== 'playing' || game.turn() !== gameState.myColor) return false;
        
        try {
            const moveData = { from: source, to: target, promotion: 'q' };
            const move = game.move(moveData);
            if (!move) return false;

            setGame(new Chess(game.fen()));
            socketRef.current.emit('move', { roomId, move: moveData });
            setOptionSquares({});
            return true;
        } catch (e) { return false; }
    }

    // --- استفاده از Memo برای جلوگیری از لگ زدن بورد حین آپدیت تایمر ---
    const boardComponent = useMemo(() => (
        <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop}
            onPieceClick={onPieceClick}
            boardOrientation={gameState.myColor === 'b' ? 'black' : 'white'}
            customSquareStyles={{ ...moveSquares, ...optionSquares }}
            customDarkSquareStyle={{ backgroundColor: '#779556' }}
            customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
            animationDuration={200}
        />
    ), [game, gameState.myColor, moveSquares, optionSquares]);

    if (gameState.status === 'loading') return <div className={styles.fullPageLoader}>⚡ در حال برقراری اتصال امن...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.gameLayout}>
                
                {/* بخش ابزارها (چپ) */}
                <aside className={styles.sidebarLeft}>
                    <div className={styles.glassCard}>
                        <h3>⚙️ تنظیمات میز</h3>
                        <div className={styles.infoRow}>
                            <span>زمان کل:</span>
                            <span className={styles.badge}>{gameState.config.time}m</span>
                        </div>
                        <div className={styles.actionButtons}>
                            <button className={styles.btnDraw} onClick={() => socketRef.current.emit('offer-draw', { roomId })}>🤝 پیشنهاد تساوی</button>
                            <button className={styles.btnResign} onClick={() => confirm('آیا از تسلیم شدن اطمینان دارید؟') && socketRef.current.emit('resign', { roomId })}>🏳️ تسلیم</button>
                        </div>
                    </div>
                </aside>

                {/* بخش اصلی بورد (وسط) */}
                <main className={styles.boardContainer}>
                    {gameState.status === 'waiting' ? (
                        <Lobby players={gameState.players} socket={socketRef.current} roomId={roomId} />
                    ) : (
                        <div className={styles.boardWrapper}>
                            <PlayerRow 
                                user={gameState.players.find(p => p.color !== gameState.myColor)} 
                                time={gameState.timeLeft[gameState.myColor === 'w' ? 'b' : 'w']} 
                                active={game.turn() !== gameState.myColor} 
                            />
                            
                            <div className={styles.relativeBoard}>
                                {boardComponent}
                                {gameState.status === 'finished' && <GameOverModal result={gameState.result} />}
                            </div>

                            <PlayerRow 
                                user={gameState.players.find(p => p.id === socketRef.current?.id)} 
                                time={gameState.timeLeft[gameState.myColor]} 
                                active={game.turn() === gameState.myColor}
                                isMe 
                            />
                        </div>
                    )}
                </main>

                {/* بخش چت و حرکات (راست) */}
                <aside className={styles.sidebarRight}>
                    <div className={styles.glassCard}>
                        <div className={styles.tabs}>
                            <button className={activeTab === 'chat' ? styles.activeTab : ''} onClick={() => setActiveTab('chat')}>💬 گفتگو</button>
                            <button className={activeTab === 'moves' ? styles.activeTab : ''} onClick={() => setActiveTab('moves')}>📜 تاریخچه</button>
                        </div>
                        
                        {activeTab === 'chat' ? (
                            <ChatSystem chat={chat} msg={msg} setMsg={setMsg} socket={socketRef.current} roomId={roomId} chatEndRef={chatEndRef} />
                        ) : (
                            <MoveHistory history={gameState.history} />
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

// --- اجزای کوچک‌تر (Sub-Components) ---

function PlayerRow({ user, time, active, isMe }) {
    const min = Math.floor(time / 60);
    const sec = time % 60;
    return (
        <div className={`${styles.playerRow} ${active ? styles.playerActive : ''}`}>
            <div className={styles.playerInfo}>
                <div className={styles.miniAvatar}>{user?.username?.[0]?.toUpperCase() || '?'}</div>
                <div className={styles.nameZone}>
                    <span className={styles.username}>{user?.username || 'در انتظار حریف...'}</span>
                    {isMe && <span className={styles.meBadge}>شما</span>}
                </div>
            </div>
            <div className={`${styles.timer} ${active ? styles.timerTicking : ''} ${time < 30 ? styles.timerUrgent : ''}`}>
                {min}:{sec.toString().padStart(2, '0')}
            </div>
        </div>
    );
}

function Lobby({ players, socket, roomId }) {
    const isReady = players.find(p => p.id === socket?.id)?.ready;
    return (
        <div className={styles.lobbyCard}>
            <h2>🎮 لابی انتظار</h2>
            <p>منتظر حریف بمانید تا هر دو آماده شوید</p>
            <div className={styles.lobbyPlayers}>
                {players.map(p => (
                    <div key={p.id} className={`${styles.lobbyPlayer} ${p.ready ? styles.readyBorder : ''}`}>
                        <div className={styles.playerColor}>{p.color === 'w' ? '⚪ سفید' : '⚫ سیاه'}</div>
                        <div className={styles.playerName}>{p.username}</div>
                        <div className={styles.readyTag}>{p.ready ? '✅ آماده' : '⏳ منتظر'}</div>
                    </div>
                ))}
            </div>
            <button className={styles.btnReady} onClick={() => socket.emit('player-ready', { roomId })} disabled={isReady}>
                {isReady ? 'در انتظار تایید حریف...' : 'آماده نبرد هستم!'}
            </button>
        </div>
    );
}

function GameOverModal({ result }) {
    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <h2 className={styles.modalTitle}>پایان بازی</h2>
                <div className={styles.winnerName}>{result.winner === 'draw' ? 'تساوی!' : `برنده: ${result.winner === 'w' ? 'سفید' : 'سیاه'}`}</div>
                <p className={styles.reasonText}>{result.reason}</p>
                <button className={styles.btnHome} onClick={() => window.location.href = '/dashboard'}>بازگشت به لابی</button>
            </div>
        </div>
    );
}

function ChatSystem({ chat, msg, setMsg, socket, roomId, chatEndRef }) {
    return (
        <div className={styles.chatWrapper}>
            <div className={styles.chatMessages}>
                {chat.map((c, i) => (
                    <div key={i} className={styles.msgLine}>
                        <span className={styles.msgSender}>{c.sender}:</span>
                        <span className={styles.msgText}>{c.text}</span>
                    </div>
                ))}
                <div ref={chatEndRef} />
            </div>
            <form className={styles.chatInput} onSubmit={(e) => { e.preventDefault(); if(msg.trim()) { socket.emit('chat', { roomId, text: msg }); setMsg(''); } }}>
                <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="پیام بنویسید..." />
                <button type="submit">ارسال</button>
            </form>
        </div>
    );
}

function MoveHistory({ history }) {
    return (
        <div className={styles.historyWrapper}>
            <div className={styles.historyGrid}>
                {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => (
                    <div key={i} className={styles.historyRow}>
                        <span className={styles.moveIndex}>{i + 1}.</span>
                        <span className={styles.moveValue}>{history[i * 2]}</span>
                        <span className={styles.moveValue}>{history[i * 2 + 1] || ''}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
