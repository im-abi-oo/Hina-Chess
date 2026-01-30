import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { io } from 'socket.io-client'
import { Chess } from 'chess.js'

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { 
    ssr: false,
    loading: () => <div className="flex-center" style={{height:400}}>در حال بارگذاری صفحه شطرنج...</div>
})

export default function Game() {
    const router = useRouter()
    const { id } = router.query
    const socketRef = useRef(null)

    // Game States
    const [game, setGame] = useState(new Chess())
    const [fen, setFen] = useState('start')
    const [players, setPlayers] = useState([])
    const [myColor, setMyColor] = useState('spectator')
    const [timeLeft, setTimeLeft] = useState({ w: 600, b: 600 })
    const [status, setStatus] = useState('loading')
    const [result, setResult] = useState(null)
    const [turn, setTurn] = useState('w')
    
    // UI States
    const [moveHistory, setMoveHistory] = useState([])
    const [lastMoveSquares, setLastMoveSquares] = useState({}) // برای هایلایت مشابه chess.com
    const [chat, setChat] = useState([])
    const [msg, setMsg] = useState('')

    // Themes
    const THEMES = {
        purple: { light: '#e0c0f8', dark: '#7c3aed', name: 'purple' },
        green: { light: '#eeeed2', dark: '#769656', name: 'green' }, // Chess.com Classic
        blue: { light: '#dee3e6', dark: '#8ca2ad', name: 'blue' }
    }
    const [theme, setTheme] = useState(THEMES.purple)

    // Timer Logic
    useEffect(() => {
        let timer
        if (status === 'playing') {
            timer = setInterval(() => {
                setTimeLeft(prev => ({
                    ...prev,
                    [turn]: Math.max(0, prev[turn] - 1)
                }))
            }, 1000)
        }
        return () => clearInterval(timer)
    }, [status, turn])

    useEffect(() => {
        if (!id) return
        
        const s = io() // آدرس سرور خود را اینجا تنظیم کنید
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
            setMoveHistory(g.history())
        })

        s.on('sync', d => {
            const g = new Chess(d.fen)
            setGame(g)
            setFen(d.fen)
            setTimeLeft(d.timeLeft)
            setTurn(d.turn)
            setMoveHistory(g.history())
            
            if (d.lastMove) {
                // هایلایت آخرین حرکت مشابه Chess.com
                setLastMoveSquares({
                    [d.lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
                    [d.lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' }
                })
                playSound(d.lastMove)
            }
        })

        s.on('game-over', res => {
            setResult(res)
            setStatus('finished')
            playSound({ san: '#' })
        })

        return () => s.disconnect()
    }, [id])

    const onDrop = (source, target) => {
        if (myColor === 'spectator' || game.turn() !== myColor || status !== 'playing') return false
        
        try {
            const move = game.move({ from: source, to: target, promotion: 'q' })
            if (!move) return false

            setFen(game.fen())
            setTurn(game.turn())
            setMoveHistory(game.history())
            setLastMoveSquares({
                [source]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
                [target]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' }
            })

            socketRef.current.emit('move', { 
                roomId: id, 
                move: { from: source, to: target, promotion: 'q' } 
            })
            return true
        } catch (e) { return false }
    }

    const playSound = (move) => {
        let audioPath = '/sounds/move.mp3'
        if (move.san.includes('#')) audioPath = '/sounds/game-end.mp3'
        else if (move.san.includes('+')) audioPath = '/sounds/check.mp3'
        else if (move.flags && move.flags.includes('c')) audioPath = '/sounds/capture.mp3'
        
        const audio = new Audio(audioPath)
        audio.play().catch(() => {})
    }

    if (status === 'loading') return <div className="loading-screen">در حال اتصال...</div>

    const opponent = players.find(p => p.color !== myColor) || { username: 'Waiting...' }
    const me = players.find(p => p.color === myColor) || { username: 'You' }

    return (
        <div className="game-container">
            <style jsx>{`
                .game-container { display: grid; grid-template-columns: 1fr 400px; gap: 20px; padding: 20px; max-width: 1200px; margin: auto; }
                .board-section { position: relative; }
                .sidebar-section { display: flex; flex-direction: column; gap: 20px; }
                .move-list { height: 200px; overflow-y: auto; background: #262421; padding: 10px; border-radius: 4px; display: grid; grid-template-columns: 40px 1fr 1fr; font-size: 0.9rem; }
                .move-num { color: #8b8987; }
                .move-item { color: #bababa; cursor: pointer; }
                .move-item:hover { background: #333; }
                @media (max-width: 1000px) { .game-container { grid-template-columns: 1fr; } }
            `}</style>

            {/* بخش بورد */}
            <div className="board-section">
                <PlayerBar p={opponent} time={timeLeft[myColor === 'w' ? 'b' : 'w']} isActive={turn !== myColor} />
                
                <Chessboard
                    position={fen}
                    onPieceDrop={onDrop}
                    boardOrientation={myColor === 'b' ? 'black' : 'white'}
                    customDarkSquareStyle={{ backgroundColor: theme.dark }}
                    customLightSquareStyle={{ backgroundColor: theme.light }}
                    customSquareStyles={lastMoveSquares}
                    animationDuration={200}
                />

                <PlayerBar p={me} time={timeLeft[myColor === 'spectator' ? 'w' : myColor]} isMe isActive={turn === myColor} />
            </div>

            {/* بخش سایدبار (ترکیب چت و لیست حرکات مشابه Chess.com) */}
            <div className="sidebar-section">
                <div className="card" style={{flex: 1}}>
                    <h3>📜 تاریخچه حرکات</h3>
                    <div className="move-list">
                        {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, i) => (
                            <>
                                <div className="move-num">{i + 1}.</div>
                                <div className="move-item">{moveHistory[i * 2]}</div>
                                <div className="move-item">{moveHistory[i * 2 + 1] || ''}</div>
                            </>
                        ))}
                    </div>
                    
                    <h3 style={{marginTop: 20}}>💬 چت</h3>
                    {/* ... کامپوننت چت شما ... */}
                </div>
                
                <div className="card">
                    <button className="btn btn-outline" style={{width:'100%'}} onClick={() => setTheme(THEMES.green)}>
                        تغییر تم به Chess.com
                    </button>
                </div>
            </div>

            {/* Modal Result */}
            {result && <ResultModal result={result} myColor={myColor} />}
        </div>
    )
}

function PlayerBar({ p, time, isMe, isActive }) {
    const m = Math.floor(time / 60)
    const s = time % 60
    return (
        <div className={`player-bar ${isActive ? 'active' : ''}`} style={{
            display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
            background: isActive ? '#312e2b' : 'transparent', borderRadius: '4px', margin: '5px 0'
        }}>
            <span style={{fontWeight: 'bold'}}>{p.username} {isMe && '(You)'}</span>
            <span style={{
                fontFamily: 'monospace', fontSize: '1.2rem', padding: '2px 8px',
                background: isActive ? '#fff' : '#444', color: isActive ? '#000' : '#fff',
                borderRadius: '3px'
            }}>
                {m}:{s.toString().padStart(2, '0')}
            </span>
        </div>
    )
}

function ResultModal({ result, myColor }) {
    return (
        <div className="modal-overlay" style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:100}}>
            <div className="card" style={{textAlign:'center', minWidth: 300}}>
                <h2>{result.winner === 'draw' ? 'Draw!' : (result.winner === myColor ? 'You Won! 🏆' : 'You Lost!')}</h2>
                <p>{result.reason}</p>
                <button className="btn" onClick={() => window.location.href='/dashboard'}>OK</button>
            </div>
        </div>
    )
}
