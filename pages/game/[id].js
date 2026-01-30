import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { io } from 'socket.io-client';
import { Chess } from 'chess.js';
import dynamic from 'next/dynamic';
import styles from '../../styles/Game.module.css';

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { 
    ssr: false,
    loading: () => <div className={styles.card}>در حال چیدن میز بازی...</div>
});

export default function ChessGame() {
    const router = useRouter();
    const { id: roomId } = router.query;
    
    // --- States ---
    const [game, setGame] = useState(new Chess());
    const [gameState, setGameState] = useState({
        players: [],
        myColor: 'spectator',
        status: 'loading',
        timeLeft: { w: 600, b: 600 },
        history: [],
        config: {},
        result: null
    });

    const [chat, setChat] = useState([]);
    const [msg, setMsg] = useState('');
    const [activeTab, setActiveTab] = useState('chat');
    const [highlights, setHighlights] = useState({});
    
    const socketRef = useRef();
    const chatEndRef = useRef();

    // --- Audio System ---
    const playSound = useCallback((move) => {
        const audio = new Audio();
        if (move?.san?.includes('#')) audio.src = '/sounds/game-end.mp3';
        else if (move?.san?.includes('+')) audio.src = '/sounds/check.mp3';
        else if (move?.flags?.includes('c')) audio.src = '/sounds/capture.mp3';
        else audio.src = '/sounds/move.mp3';
        audio.play().catch(() => {});
    }, []);

    // --- Timer Logic (Smooth Client-side Countdown) ---
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

    // --- Socket & Initialization ---
    useEffect(() => {
        if (!roomId) return;
        socketRef.current = io();

        socketRef.current.emit('join', { roomId });

        socketRef.current.on('init-game', (data) => {
            const newGame = new Chess(data.fen);
            setGame(newGame);
            setGameState(data);
            if (data.chatHistory) setChat(data.chatHistory);
            updateHighlights(newGame);
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
            updateHighlights(newGame, data.lastMove);
            if (data.lastMove) playSound(data.lastMove);
        });

        socketRef.current.on('chat-msg', (m) => setChat(prev => [...prev, m]));

        socketRef.current.on('game-over', (res) => {
            setGameState(prev => ({ ...prev, status: 'finished', result: res }));
            playSound({ san: '#' });
        });

        return () => socketRef.current.disconnect();
    }, [roomId, playSound]);

    // --- Move & UI Handlers ---
    const updateHighlights = (currentGame, lastMove = null) => {
        const newHighlights = {};
        if (lastMove) {
            newHighlights[lastMove.from] = { background: 'rgba(255, 255, 0, 0.35)' };
            newHighlights[lastMove.to] = { background: 'rgba(255, 255, 0, 0.35)' };
        }
        if (currentGame.isCheck()) {
            const board = currentGame.board();
            board.forEach(row => row.forEach(sq => {
                if (sq && sq.type === 'k' && sq.color === currentGame.turn()) {
                    newHighlights[sq.square] = {
                        background: 'radial-gradient(circle, rgba(239, 68, 68, 0.8) 0%, transparent 75%)',
                        borderRadius: '50%'
                    };
                }
            }));
        }
        setHighlights(newHighlights);
    };

    const onDrop = (source, target) => {
        if (gameState.status !== 'playing' || game.turn() !== gameState.myColor) return false;
        try {
            const moveData = { from: source, to: target, promotion: 'q' };
            const move = game.move(moveData);
            if (!move) return false;

            socketRef.current.emit('move', { roomId, move: moveData });
            return true;
        } catch (e) { return false; }
    };

    // --- Render Helpers ---
    if (gameState.status === 'loading') return <div className={styles.card}>در حال اتصال به برج مراقبت...</div>;

    return (
        <div className={styles['game-grid']}>
            {/* ستون چپ: تنظیمات */}
            <div className={`${styles.card} styles.desktopOnly`}>
                <h3 style={{ borderBottom: '1px solid #444', paddingBottom: '10px' }}>⚙️ تنظیمات</h3>
                <div className={styles['sidebar-tabs']} style={{ flexDirection: 'column', gap: '8px' }}>
                    <div className={styles['msg-bubble']}>زمان: <b>{gameState.config.time}m</b></div>
                    <div className={styles['msg-bubble']}>پاداش: <b>{gameState.config.increment}s</b></div>
                </div>
                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button className={styles['emoji-btn']} style={{ background: 'var(--info)' }} onClick={() => socketRef.current.emit('offer-draw', { roomId })}>🤝 تساوی</button>
                    <button className={styles['emoji-btn']} style={{ background: 'var(--danger)' }} onClick={() => confirm('تسلیم می‌شوید؟') && socketRef.current.emit('resign', { roomId })}>🏳️ تسلیم</button>
                </div>
            </div>

            {/* ستون وسط: بورد */}
            <div className={styles['board-wrapper']}>
                {gameState.status === 'waiting' ? (
                    <Lobby players={gameState.players} socket={socketRef.current} roomId={roomId} />
                ) : (
                    <>
                        <PlayerRow 
                            user={gameState.players.find(p => p.color !== gameState.myColor)} 
                            time={gameState.timeLeft[gameState.myColor === 'w' ? 'b' : 'w']} 
                            active={game.turn() !== gameState.myColor} 
                        />
                        <div style={{ position: 'relative' }}>
                            <Chessboard 
                                position={game.fen()} 
                                onPieceDrop={onDrop} 
                                boardOrientation={gameState.myColor === 'b' ? 'black' : 'white'}
                                customSquareStyles={highlights}
                                customDarkSquareStyle={{ backgroundColor: '#779556' }}
                                customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
                            />
                            {gameState.status === 'finished' && <GameOverModal result={gameState.result} />}
                        </div>
                        <PlayerRow 
                            user={gameState.players.find(p => p.id === socketRef.current?.id)} 
                            time={gameState.timeLeft[gameState.myColor]} 
                            active={game.turn() === gameState.myColor}
                            isMe 
                        />
                    </>
                )}
            </div>

            {/* ستون راست: چت و تاریخچه */}
            <div className={styles.card}>
                <div className={styles['sidebar-tabs']}>
                    <button className={`${styles['tab-btn']} ${activeTab === 'chat' ? styles.active : ''}`} onClick={() => setActiveTab('chat')}>💬 گفتگو</button>
                    <button className={`${styles['tab-btn']} ${activeTab === 'moves' ? styles.active : ''}`} onClick={() => setActiveTab('moves')}>📜 حرکات</button>
                </div>
                {activeTab === 'chat' ? (
                    <ChatSystem chat={chat} msg={msg} setMsg={setMsg} socket={socketRef.current} roomId={roomId} chatEndRef={chatEndRef} />
                ) : (
                    <MoveHistory history={gameState.history} />
                )}
            </div>
        </div>
    );
}

// --- Sub-Components ---
function PlayerRow({ user, time, active, isMe }) {
    const min = Math.floor(time / 60);
    const sec = time % 60;
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 40, height: 40, borderRadius: '8px', background: active ? 'var(--primary)' : '#333', display: 'flex', justifyContent: 'center', alignItems: 'center', border: isMe ? '2px solid white' : 'none' }}>
                    {user?.username?.[0]?.toUpperCase() || '?'}
                </div>
                <b>{user?.username || 'Waiting...'}</b>
            </div>
            <div className={`${styles['timer-box']} ${active ? styles['timer-active'] : ''}`}>
                {min}:{sec.toString().padStart(2, '0')}
            </div>
        </div>
    );
}

function Lobby({ players, socket, roomId }) {
    const isReady = players.find(p => p.id === socket?.id)?.ready;
    return (
        <div className={styles.card} style={{ textAlign: 'center', padding: '50px' }}>
            <h2>🎮 لابی انتظار</h2>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '30px 0' }}>
                {players.map(p => (
                    <div key={p.id} style={{ border: p.ready ? '2px solid green' : '2px solid red', padding: '15px', borderRadius: '10px' }}>
                        <div>{p.color === 'w' ? '⚪' : '⚫'}</div>
                        <b>{p.username}</b>
                    </div>
                ))}
            </div>
            <button className={styles['emoji-btn']} style={{ background: isReady ? '#444' : 'var(--accent)', width: '200px' }} 
                    onClick={() => socket.emit('player-ready', { roomId })} disabled={isReady}>
                {isReady ? 'منتظر حریف...' : 'من آماده‌ام!'}
            </button>
        </div>
    );
}

function GameOverModal({ result }) {
    return (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <h2 style={{ color: 'var(--warning)', fontSize: '2.5rem' }}>پایان بازی</h2>
            <p>{result.reason}</p>
            <button className={styles['emoji-btn']} onClick={() => window.location.href = '/'}>خروج</button>
        </div>
    );
}

function ChatSystem({ chat, msg, setMsg, socket, roomId, chatEndRef }) {
    return (
        <div className={styles['chat-container']}>
            <div className={styles['messages-list']}>
                {chat.map((c, i) => (
                    <div key={i} className={styles['msg-bubble']}>
                        <small style={{ display: 'block', color: 'var(--primary)' }}>{c.sender}</small>
                        {c.text}
                    </div>
                ))}
                <div ref={chatEndRef} />
            </div>
            <form className={styles['input-group']} onSubmit={(e) => { e.preventDefault(); if(msg.trim()) { socket.emit('chat', { roomId, text: msg }); setMsg(''); } }}>
                <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="پیام..." />
                <button type="submit" className={styles['emoji-btn']} style={{ flex: 'none' }}>⏎</button>
            </form>
        </div>
    );
}

function MoveHistory({ history }) {
    return (
        <div className={styles['move-history-table']}>
            {Array.from({ length: Math.ceil(history.length / 2) }).map((_, i) => (
                <React.Fragment key={i}>
                    <div className={styles['move-n']}>{i + 1}.</div>
                    <div className={styles['move-val']}>{history[i * 2]}</div>
                    <div className={styles['move-val']}>{history[i * 2 + 1] || ''}</div>
                </React.Fragment>
            ))}
        </div>
    );
}
