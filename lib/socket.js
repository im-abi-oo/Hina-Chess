import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { io } from 'socket.io-client'
import { Chess } from 'chess.js'

// کامپوننت بورد
const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { 
    ssr: false,
    loading: () => <div className="flex-center" style={{height:400}}>در حال چیدن مهره‌ها...</div>
})

export default function Game() {
    const router = useRouter()
    const { id } = router.query
    const socketRef = useRef(null)

    // State های بازی
    const [game, setGame] = useState(new Chess())
    const [fen, setFen] = useState('start')
    const [players, setPlayers] = useState([])
    const [myColor, setMyColor] = useState('spectator') // w, b, or spectator
    const [timeLeft, setTimeLeft] = useState({ w: 600, b: 600 })
    const [status, setStatus] = useState('loading')
    const [result, setResult] = useState(null)
    const [turn, setTurn] = useState('w')

    // چت
    const [chat, setChat] = useState([])
    const [msg, setMsg] = useState('')

    // تم و تنظیمات
    // تم دیفالت بنفش است.
    const DEFAULT_THEME = { light: '#e0c0f8', dark: '#7c3aed', name: 'purple' }
    const CHESS_COM_THEME = { light: '#eeeed2', dark: '#769656', name: 'green' } // رنگ دقیق Chess.com
    
    const [theme, setTheme] = useState(DEFAULT_THEME)
    // برای تم کاستوم
    const [customColors, setCustomColors] = useState({ light: '#ffffff', dark: '#000000' })
    const [showSettings, setShowSettings] = useState(false)

    // تایمر کلاینت‌ساید (برای نمایش روان)
    useEffect(() => {
        let timer
        if (status === 'playing') {
            timer = setInterval(() => {
                setTimeLeft(prev => {
                    // فقط زمان کسی که نوبتش است کم شود
                    if (turn === 'w') return { ...prev, w: Math.max(0, prev.w - 1) }
                    else return { ...prev, b: Math.max(0, prev.b - 1) }
                })
            }, 1000)
        }
        return () => clearInterval(timer)
    }, [status, turn])

    useEffect(() => {
        if (!id) return

        // لود کردن تم از حافظه
        const savedTheme = localStorage.getItem('hina_theme')
        if (savedTheme) {
            try {
                const parsed = JSON.parse(savedTheme)
                setTheme(parsed)
                if(parsed.name === 'custom') setCustomColors(parsed)
            } catch(e){}
        }

        const s = io()
        socketRef.current = s

        s.emit('join', { roomId: id })

        s.on('init-game', d => {
            const g = new Chess(d.fen)
            setGame(g)
            setFen(d.fen)
            setPlayers(d.players)
            setMyColor(d.myColor)
            setStatus(d.status)
            setTimeLeft(d.timeLeft)
            setTurn(g.turn())
            if(d.result) setResult(d.result)
        })

        s.on('sync', d => {
            const g = new Chess(d.fen)
            setGame(g)
            setFen(d.fen)
            // زمان را با سرور سینک میکنیم
            setTimeLeft(d.timeLeft)
            setTurn(d.turn)
            if (d.lastMove) playSound(d.lastMove)
        })

        s.on('chat-msg', m => setChat(prev => [...prev, m]))
        
        s.on('game-over', res => {
            setResult(res)
            setStatus('finished')
            // پخش صدای پایان بازی
            playSound({ san: '#' }) // صدای چک برای پایان استفاده کنیم یا فایل جدا
        })

        s.on('error', msg => alert(msg))

        return () => s.disconnect()
    }, [id])

    const onDrop = (source, target) => {
        if (myColor === 'spectator' || game.turn() !== myColor || status !== 'playing') return false
        
        try {
            const temp = new Chess(game.fen())
            // فرض میکنیم همیشه وزیر میکنه (می‌تونید مودال انتخاب مهره بگذارید)
            const move = temp.move({ from: source, to: target, promotion: 'q' })
            
            if (!move) return false

            setGame(temp)
            setFen(temp.fen())
            // بلافاصله نوبت رو لوکال عوض میکنیم که تایمر درست نشون بده تا وقتی سرور جواب بده
            setTurn(temp.turn()) 

            socketRef.current.emit('move', { 
                roomId: id, 
                move: { from: source, to: target, promotion: 'q' } 
            })
            return true
        } catch (e) {
            return false
        }
    }

    const sendChat = (e) => {
        e.preventDefault()
        if (!msg.trim()) return
        socketRef.current.emit('chat', { roomId: id, text: msg })
        setMsg('')
    }

    const resignGame = () => {
        if (confirm("آیا مطمئنید می‌خواهید تسلیم شوید؟")) {
            socketRef.current.emit('resign', { roomId: id })
        }
    }

    const playSound = (move) => {
        let audioPath = '/sounds/move.mp3'
        if (move.san.includes('#')) audioPath = '/sounds/game-end.mp3' // اگر فایلش نیست همون چک رو بزار
        else if (move.san.includes('+')) audioPath = '/sounds/check.mp3'
        else if (move.flags && move.flags.includes('c')) audioPath = '/sounds/capture.mp3'
        
        // اگر فایل‌ها نیستند فعلا روی چک ست کن
        try {
            const audio = new Audio(audioPath)
            audio.play().catch(() => {})
        } catch (e) {}
    }

    const applyTheme = (t) => {
        setTheme(t)
        localStorage.setItem('hina_theme', JSON.stringify(t))
    }

    const handleCustomColorChange = (key, value) => {
        const newColors = { ...customColors, [key]: value, name: 'custom' }
        setCustomColors(newColors)
        applyTheme(newColors)
    }

    if (status === 'loading') return <div className="flex-center" style={{ height: '100vh', flexDirection:'column', gap:10 }}>
        <div className="spinner"></div>
        <p>در حال اتصال به سرور بازی...</p>
    </div>

    const opponent = players.find(p => p.color !== myColor) || { username: 'در انتظار حریف...' }
    const me = players.find(p => p.color === myColor) || { username: 'شما' }
    
    // تشخیص اینکه آیا نوبت من است یا نه برای نمایش گرافیکی
    const isMyTurn = turn === myColor

    return (
        <div className="container game-layout" style={{ paddingTop: 20, paddingBottom: 40, maxWidth: 1000, margin: '0 auto' }}>
            <style jsx global>{`
                .game-layout { display: grid; grid-template-columns: 300px 1fr 300px; gap: 20px; }
                @media(max-width: 900px) { .game-layout { grid-template-columns: 1fr; } .desktop-only { display: none; } }
                .theme-btn { width: 30px; height: 30px; border-radius: 50%; cursor: pointer; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: transform 0.2s; }
                .theme-btn:hover { transform: scale(1.1); }
            `}</style>

            {/* SIDEBAR LEFT - SETTINGS */}
            <div className="card">
                <h3>⚙️ تنظیمات</h3>
                
                <div style={{marginTop: 15}}>
                    <label style={{fontSize:'0.9rem', color:'#aaa'}}>انتخاب تم:</label>
                    <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'center' }}>
                        {/* بنفش (پیش فرض) */}
                        <div onClick={() => applyTheme(DEFAULT_THEME)} className="theme-btn"
                             style={{ background: 'linear-gradient(45deg, #e0c0f8 50%, #7c3aed 50%)' }} title="بنفش (پیش‌فرض)"></div>
                        
                        {/* سبز (Chess.com) */}
                        <div onClick={() => applyTheme(CHESS_COM_THEME)} className="theme-btn"
                             style={{ background: 'linear-gradient(45deg, #eeeed2 50%, #769656 50%)' }} title="کلاسیک (سبز)"></div>
                        
                        {/* کاستوم */}
                        <div onClick={() => setShowSettings(!showSettings)} className="theme-btn"
                             style={{ background: `linear-gradient(45deg, ${customColors.light} 50%, ${customColors.dark} 50%)`, border: theme.name === 'custom' ? '2px solid var(--accent)' : '2px solid #fff' }} 
                             title="شخصی‌سازی"></div>
                    </div>
                </div>

                {showSettings && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8, marginTop: 15 }}>
                        <p style={{fontSize: '0.8rem', marginBottom:5}}>ساخت تم دلخواه:</p>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5}}>
                            <span>خانه روشن:</span>
                            <input type="color" value={customColors.light} onChange={e => handleCustomColorChange('light', e.target.value)} />
                        </div>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <span>خانه تیره:</span>
                            <input type="color" value={customColors.dark} onChange={e => handleCustomColorChange('dark', e.target.value)} />
                        </div>
                    </div>
                )}

                <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '20px 0' }} />
                
                <button className="btn btn-outline" 
                        style={{ width: '100%', borderColor: '#ef4444', color: '#ef4444' }} 
                        onClick={resignGame} disabled={status !== 'playing' || myColor === 'spectator'}>
                    🏳️ تسلیم
                </button>
                <button className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => router.push('/dashboard')}>
                    بازگشت به داشبورد
                </button>
            </div>

            {/* MAIN BOARD */}
            <div style={{ width: '100%', maxWidth: 600, justifySelf: 'center' }}>
                {/* نوار حریف */}
                <PlayerBar 
                    p={opponent} 
                    time={timeLeft[myColor === 'w' ? 'b' : 'w']} 
                    isActive={status === 'playing' && turn !== myColor}
                />
                
                <div style={{ 
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)', 
                    borderRadius: 4, 
                    overflow: 'hidden',
                    position: 'relative'
                }}>
                    <Chessboard
                        position={fen}
                        onPieceDrop={onDrop}
                        boardOrientation={myColor === 'b' ? 'black' : 'white'}
                        customDarkSquareStyle={{ backgroundColor: theme.dark }}
                        customLightSquareStyle={{ backgroundColor: theme.light }}
                        animationDuration={200}
                        arePiecesDraggable={status === 'playing' && myColor !== 'spectator'}
                    />
                    
                    {/* پیام وضعیت وسط صفحه */}
                    {status === 'waiting' && (
                        <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'1.2rem', backdropFilter:'blur(2px)'}}>
                            ⏳ در انتظار حریف... لینک را به اشتراک بگذارید
                        </div>
                    )}
                </div>

                {/* نوار خودی */}
                <PlayerBar 
                    p={me} 
                    time={timeLeft[myColor === 'spectator' ? 'w' : myColor]} 
                    isMe 
                    isActive={status === 'playing' && isMyTurn}
                />
            </div>

            {/* CHAT */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400, maxHeight: '80vh' }}>
                <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>💬 گفتگو</h3>
                <div style={{ flex: 1, overflowY: 'auto', margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 8, padding: '0 5px' }}>
                    {chat.map((c, i) => (
                        <div key={i} style={{ 
                            background: c.sender === 'System' ? 'rgba(255,255,0,0.1)' : 'rgba(255,255,255,0.05)', 
                            padding: '6px 10px', 
                            borderRadius: 6, 
                            fontSize: '0.85rem',
                            borderRight: c.sender === me.username ? '2px solid var(--primary)' : 'none'
                        }}>
                            <b style={{ color: c.sender === 'System' ? '#fbbf24' : 'var(--accent)' }}>{c.sender}:</b> {c.text}
                        </div>
                    ))}
                    <div ref={el => el && el.scrollIntoView({ behavior: 'smooth' })}></div>
                </div>
                <form onSubmit={sendChat} style={{ display: 'flex', gap: 5 }}>
                    <input 
                        value={msg} 
                        onChange={e => setMsg(e.target.value)} 
                        placeholder="پیام..." 
                        style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #444', background: '#222', color: 'white' }}
                    />
                    <button className="btn" style={{ padding: '0 15px' }}>Send</button>
                </form>
            </div>

            {/* RESULT MODAL */}
            {result && (
                <div className="flex-center" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000 }}>
                    <div className="card animate-in" style={{ textAlign: 'center', padding: 40, maxWidth: 400, border: `2px solid ${result.winner === myColor ? '#10b981' : '#ef4444'}` }}>
                        <div style={{fontSize: '4rem', marginBottom:10}}>
                            {result.winner === 'draw' ? '🤝' : (result.winner === myColor ? '🏆' : '💀')}
                        </div>
                        <h1 style={{ marginBottom: 10 }}>
                            {result.winner === 'draw' ? 'بازی مساوی شد' : (result.winner === myColor ? 'شما بردید!' : 'شما باختید')}
                        </h1>
                        <p style={{ color: '#aaa', marginBottom: 30 }}>
                            {result.reason === 'checkmate' && 'به علت مات'}
                            {result.reason === 'timeout' && 'به علت اتمام زمان'}
                            {result.reason === 'resignation' && 'حریف تسلیم شد'}
                            {result.reason === 'draw' && 'تساوی'}
                        </p>
                        <button className="btn" onClick={() => router.push('/dashboard')}>بازگشت به لابی</button>
                    </div>
                </div>
            )}
        </div>
    )
}

function PlayerBar({ p, time, isMe, isActive }) {
    const m = Math.floor(time / 60) || 0
    const s = Math.floor(time % 60) || 0
    const isLowTime = time < 30 && time > 0

    return (
        <div style={{
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '10px 15px', 
            background: isActive ? 'linear-gradient(90deg, rgba(139, 92, 246, 0.2), rgba(0,0,0,0))' : 'rgba(255,255,255,0.05)', 
            borderRadius: 8, 
            margin: '10px 0',
            borderRight: isActive ? '4px solid #10b981' : '4px solid transparent',
            opacity: isActive ? 1 : 0.7,
            transition: 'all 0.3s'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ 
                    width: 40, height: 40, borderRadius: 8,
                    background: isMe ? 'var(--primary)' : '#444',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight:'bold'
                }}>
                    {p?.username?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                    <div style={{ fontWeight: 'bold' }}>{p?.username || '...'}</div>
                    {isMe && <span style={{ fontSize: '0.7rem', color: '#aaa' }}> (شما)</span>}
                </div>
            </div>
            
            <div style={{ 
                fontFamily: 'monospace', 
                fontSize: '1.5rem', 
                fontWeight: 'bold',
                color: isLowTime ? '#ef4444' : (isActive ? '#fff' : '#888'),
                background: 'rgba(0,0,0,0.3)',
                padding: '5px 12px',
                borderRadius: 6
            }}>
                {m}:{s.toString().padStart(2, '0')}
            </div>
        </div>
    )
}
