import { useEffect, useState, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { io } from 'socket.io-client'
import { Chess } from 'chess.js'

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false })

let socket = null

export default function ChessRoom({ roomId, user, onLeave, isBot }) {
  const [game, setGame] = useState(new Chess())
  const [fen, setFen] = useState('start')
  const [players, setPlayers] = useState([])
  const [myColor, setMyColor] = useState('spectator')
  const [status, setStatus] = useState('waiting')
  const [timeLeft, setTimeLeft] = useState({ w: 0, b: 0 })
  const [chat, setChat] = useState([])
  const [msg, setMsg] = useState('')
  const [result, setResult] = useState(null)
  
  // Bot Engine
  const engine = useRef(null)

  useEffect(() => {
    // Socket Setup
    socket = io({ transports: ['websocket'] })

    if (isBot) {
        setupBotGame()
    } else {
        setupOnlineGame()
    }

    return () => {
        socket.disconnect()
        if(engine.current) engine.current.terminate()
    }
  }, [roomId])

  // --- ONLINE MODE ---
  function setupOnlineGame() {
    socket.emit('join', { roomId })
    
    socket.on('sync', (data) => {
        const g = new Chess(data.fen)
        setGame(g)
        setFen(data.fen)
        setPlayers(data.players)
        setStatus(data.status)
        setTimeLeft(data.timeLeft)
        setResult(data.result)
        
        // Find my color
        const me = data.players.find(p => p.username === user.username)
        if(me) setMyColor(me.color)
    })

    socket.on('move-sound', ({ check, capture }) => playSound(check ? 'check' : (capture ? 'capture' : 'move')))
    socket.on('chat-msg', (m) => setChat(p => [...p, m]))
    socket.on('time-sync', (t) => setTimeLeft(t))
  }

  // --- BOT MODE (Stockfish) ---
  function setupBotGame() {
    setMyColor('w')
    setStatus('playing')
    setPlayers([{username: 'You', color: 'w'}, {username: 'Stockfish 16', color: 'b'}])
    setTimeLeft({ w: 600, b: 600 })
    
    // Load Worker from CDN
    try {
        const worker = new Worker('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.0/stockfish.js')
        engine.current = worker
        
        worker.onmessage = (e) => {
            const msg = e.data
            if(typeof msg === 'string' && msg.startsWith('bestmove')) {
                const bestMove = msg.split(' ')[1]
                const g = new Chess(game.fen())
                g.move(bestMove)
                setGame(g)
                setFen(g.fen())
                playSound(g.isCheck() ? 'check' : 'move')
            }
        }
        worker.postMessage('uci')
    } catch(e) { console.error("Bot Error", e) }
  }

  // --- INTERACTION ---
  function onDrop(source, target) {
    if (status !== 'playing') return false
    if (!isBot && myColor !== game.turn()) return false
    
    try {
        const tempGame = new Chess(game.fen())
        const move = tempGame.move({ from: source, to: target, promotion: 'q' })
        if (!move) return false

        // Optimistic Update
        setGame(tempGame)
        setFen(tempGame.fen())

        if (isBot) {
            playSound(tempGame.isCheck() ? 'check' : (move.captured ? 'capture' : 'move'))
            setTimeout(() => {
                if(engine.current) {
                    engine.current.postMessage('position fen ' + tempGame.fen())
                    engine.current.postMessage('go depth 10')
                }
            }, 500)
        } else {
            socket.emit('move', { roomId, move: { from: source, to: target, promotion: 'q' } })
        }
        return true
    } catch(e) { return false }
  }

  function playSound(type) {
    const audios = {
        move: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/move-self.mp3',
        capture: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/capture.mp3',
        check: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/move-check.mp3'
    }
    new Audio(audios[type]).play().catch(()=>{})
  }

  // Timer Animation
  useEffect(() => {
    if(status !== 'playing') return
    const interval = setInterval(() => {
        setTimeLeft(t => {
            const turn = game.turn() // 'w' or 'b'
            if(t[turn] <= 0) return t
            return { ...t, [turn]: t[turn] - 0.1 }
        })
    }, 100)
    return () => clearInterval(interval)
  }, [status, game, fen]) // depend on game state to switch turn

  function formatTime(s) {
    const min = Math.floor(s/60); const sec = Math.floor(s%60)
    return `${min}:${sec.toString().padStart(2,'0')}`
  }

  return (
    <div className="container animate-in">
        <div className="flex between">
            <div>
                <h1>Hina Chess {isBot ? '(Vs Bot)' : ''}</h1>
                <div style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>Room: {roomId}</div>
            </div>
            <button className="btn btn-danger" onClick={onLeave}>بازگشت به لابی</button>
        </div>

        <div className="game-grid">
            {/* BOARD */}
            <div className="card center col" style={{background: 'rgba(0,0,0,0.2)'}}>
                {/* Opponent Info */}
                <div className="flex between w-100" style={{width:'100%', marginBottom: 10}}>
                    <div className="flex">
                        <div style={{width:32, height:32, background:'#334155', borderRadius:8}}></div>
                        <span>{players.find(p => p.color !== myColor)?.username || 'Waiting...'}</span>
                    </div>
                    <div className="btn-outline" style={{padding:'4px 8px'}}>
                        {formatTime(timeLeft[myColor === 'w' ? 'b' : 'w'])}
                    </div>
                </div>

                <div style={{width:'100%', maxWidth:'500px', aspectRatio:'1'}}>
                    <Chessboard 
                        position={fen} 
                        onPieceDrop={onDrop}
                        boardOrientation={myColor === 'w' || myColor === 'spectator' ? 'white' : 'black'}
                        customDarkSquareStyle={{backgroundColor: '#6366f1'}}
                        customLightSquareStyle={{backgroundColor: '#e0e7ff'}}
                        animationDuration={200}
                    />
                </div>

                {/* My Info */}
                <div className="flex between w-100" style={{width:'100%', marginTop: 10}}>
                    <div className="flex">
                        <div style={{width:32, height:32, background:'#6366f1', borderRadius:8}}></div>
                        <span>{user.username} (You)</span>
                    </div>
                    <div className="btn-outline" style={{padding:'4px 8px', color: timeLeft[myColor] < 30 ? 'red' : 'inherit'}}>
                        {formatTime(timeLeft[myColor === 'spectator' ? 'w' : myColor])}
                    </div>
                </div>
            </div>

            {/* SIDEBAR */}
            <div className="col">
                <div className="card" style={{height:'100%', display:'flex', flexDirection:'column'}}>
                    <h3>چت اتاق</h3>
                    <div style={{flex:1, overflowY:'auto', margin:'10px 0', paddingRight:5}}>
                        {chat.map((c, i) => (
                            <div key={i} style={{marginBottom:8, fontSize:'0.9rem'}}>
                                <span style={{color:'var(--primary)', fontWeight:'bold'}}>{c.sender}: </span>
                                <span style={{color:'var(--text-muted)'}}>{c.text}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex">
                        <input value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>e.key==='Enter' && socket.emit('chat', {roomId, text:msg})} placeholder="پیام..." />
                    </div>
                </div>
            </div>
        </div>

        {result && (
            <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:50}} className="center animate-in">
                <div className="card center col" style={{minWidth:300}}>
                    <h2>{result.winner === 'draw' ? 'تساوی!' : (result.winner === myColor ? 'شما بردید! 🎉' : 'باختید 😔')}</h2>
                    <p>{result.reason}</p>
                    <button className="btn" onClick={onLeave}>بازگشت</button>
                </div>
            </div>
        )}
    </div>
  )
}
