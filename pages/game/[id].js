import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { io } from 'socket.io-client';
import { Chess } from 'chess.js';
import dynamic from 'next/dynamic';
import styles from '../../styles/Game.module.css';

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { 
    ssr: false,
    loading: () => <div className={styles.card}>در حال بارگذاری صفحه شطرنج...</div>
});

export default function GameRoom() {
    const router = useRouter();
    const { id: roomId } = router.query;
    
    const [game, setGame] = useState(new Chess());
    const [gameState, setGameState] = useState({
        players: [],
        myColor: 'spectator',
        status: 'loading',
        timeLeft: { w: 600, b: 600 },
        history: [],
        config: {}
    });
    const [chat, setChat] = useState([]);
    const [msg, setMsg] = useState('');
    const socketRef = useRef();
    const chatEndRef = useRef();

    useEffect(() => {
        if (!roomId) return;
        socketRef.current = io();
        socketRef.current.emit('join', { roomId });

        socketRef.current.on('init-game', (data) => {
            setGameState(data);
            setGame(new Chess(data.fen));
            if (data.chatHistory) setChat(data.chatHistory);
        });

        socketRef.current.on('sync', (data) => {
            setGame(new Chess(data.fen));
            setGameState(prev => ({ ...prev, timeLeft: data.timeLeft, history: data.history }));
        });

        socketRef.current.on('chat-msg', (m) => setChat(prev => [...prev, m]));

        socketRef.current.on('draw-offered', ({ from }) => {
            if (confirm(`${from} پیشنهاد تساوی داد. می‌پذیرید؟`)) {
                socketRef.current.emit('offer-draw', { roomId });
            }
        });

        return () => socketRef.current.disconnect();
    }, [roomId]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chat]);

    const onDrop = (source, target) => {
        if (gameState.status !== 'playing' || game.turn() !== gameState.myColor) return false;
        try {
            const move = { from: source, to: target, promotion: 'q' };
            const result = game.move(move);
            if (result) {
                socketRef.current.emit('move', { roomId, move });
                return true;
            }
        } catch (e) { return false; }
    };

    const sendQuickChat = (text) => {
        socketRef.current.emit('chat', { roomId, text });
    };

    if (gameState.status === 'loading') return <div className={styles.card}>اتصال به سرور...</div>;

    return (
        <div className={styles['game-grid']}>
            {/* بخش تنظیمات و کنترل‌های بازی */}
            <div className={styles.card}>
                <h3 style={{marginTop: 0}}>♟️ اتاق: {roomId}</h3>
                <div className={styles['sidebar-tabs']}>
                    <div className={styles['msg-bubble']}>زمان: {gameState.config.time} دقیقه</div>
                    <div className={styles['msg-bubble']}>پاداش: {gameState.config.increment} ثانیه</div>
                </div>
                
                <div className={styles['emoji-bar']}>
                    {['👏', '🤔', '🔥', '😂', '🤝', '🏳️'].map(e => (
                        <button key={e} className={styles['emoji-btn']} onClick={() => {
                            if (e === '🤝') socketRef.current.emit('offer-draw', { roomId });
                            else if (e === '🏳️') socketRef.current.emit('resign', { roomId });
                            else sendQuickChat(e);
                        }}>{e}</button>
                    ))}
                </div>
                
                <div className={styles['move-history-table']} style={{marginTop: '20px'}}>
                    {gameState.history.map((m, i) => (
                        <div key={i} className={styles['move-val']}>{i % 2 === 0 ? `${Math.floor(i/2)+1}.` : ''} {m}</div>
                    ))}
                </div>
            </div>

            {/* بخش بورد شطرنج و لابی */}
            <div className={styles['board-wrapper']}>
                {gameState.status === 'waiting' ? (
                    <div className={styles.card} style={{ textAlign: 'center', padding: '50px' }}>
                        <h1 style={{color: 'var(--primary)'}}>🎮 لابی انتظار</h1>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', margin: '40px 0' }}>
                            {gameState.players.map(p => (
                                <div key={p.id} className={styles.card} style={{ border: p.ready ? '2px solid var(--accent)' : '2px solid var(--danger)', minWidth: '120px' }}>
                                    <div style={{fontSize: '2rem', marginBottom: '10px'}}>{p.color === 'w' ? '⚪' : '⚫'}</div>
                                    <b style={{fontSize: '1.1rem'}}>{p.username}</b>
                                    <div style={{marginTop: '10px', fontSize: '0.8rem'}}>{p.ready ? '✅ آماده' : '⏳ منتظر...'}</div>
                                </div>
                            ))}
                        </div>
                        {gameState.players.find(p => p.id === socketRef.current?.id)?.ready ? (
                            <p className={styles['msg-bubble']}>در انتظار تایید حریف...</p>
                        ) : (
                            <button className={styles['emoji-btn']} 
                                    style={{ background: 'var(--accent)', color: '#000', padding: '15px 50px', fontSize: '1.3rem', fontWeight: 'bold' }}
                                    onClick={() => socketRef.current.emit('player-ready', { roomId })}>
                                من آماده‌ام!
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <PlayerStats 
                            user={gameState.players.find(p => p.color !== gameState.myColor)} 
                            time={gameState.timeLeft[gameState.myColor === 'w' ? 'b' : 'w']} 
                            isActive={game.turn() !== gameState.myColor} 
                        />
                        <div style={{ borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
                            <Chessboard 
                                position={game.fen()} 
                                onPieceDrop={onDrop} 
                                boardOrientation={gameState.myColor === 'b' ? 'black' : 'white'}
                                customDarkSquareStyle={{ backgroundColor: '#779556' }}
                                customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
                            />
                        </div>
                        <PlayerStats 
                            user={gameState.players.find(p => p.id === socketRef.current?.id)} 
                            time={gameState.timeLeft[gameState.myColor]} 
                            isActive={game.turn() === gameState.myColor}
                            isMe 
                        />
                    </>
                )}
            </div>

            {/* بخش چت (سایدبار راست در دسکتاپ) */}
            <div className={styles.card}>
                <div className={styles['chat-container']}>
                    <div className={styles['messages-list']}>
                        {chat.map((c, i) => (
                            <div key={i} className={styles['msg-bubble']} style={{alignSelf: c.sender === user.username ? 'flex-end' : 'flex-start'}}>
                                <small style={{display: 'block', color: 'var(--primary)', fontSize: '0.7rem'}}>{c.sender}</small>
                                {c.text}
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>
                    <form className={styles['input-group']} onSubmit={(e) => {
                        e.preventDefault();
                        if (msg.trim()) { socketRef.current.emit('chat', { roomId, text: msg }); setMsg(''); }
                    }}>
                        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="پیام بده..." />
                        <button type="submit" style={{display: 'none'}}></button>
                    </form>
                </div>
            </div>
        </div>
    );
}

function PlayerStats({ user, time, isActive, isMe }) {
    const m = Math.floor(time / 60);
    const s = time % 60;
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', alignItems: 'center' }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                <div style={{width: 35, height: 35, borderRadius: '50%', background: isActive ? 'var(--accent)' : '#444', border: isMe ? '2px solid #fff' : 'none'}}></div>
                <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{user?.username || 'تماشاچی'} {isMe && ' (شما)'}</span>
            </div>
            <div className={`${styles['timer-box']} ${isActive ? styles['timer-active'] : styles['timer-inactive']}`}>
                {m}:{s.toString().padStart(2, '0')}
            </div>
        </div>
    );
}
