import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { io } from 'socket.io-client'
import { Chess } from 'chess.js'

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false })
let socket = null

export default function ChessRoom({ roomId, onLeave, config }) {
  const [game, setGame] = useState(new Chess())
  const [role, setRole] = useState('spectator')
  const [status, setStatus] = useState('waiting')
  const [players, setPlayers] = useState([])
  const [timeLeft, setTimeLeft] = useState({ white: 0, black: 0 })
  const [turn, setTurn] = useState('white')
  const [myStats, setMyStats] = useState(null)
  
  // UI
  const [chat, setChat] = useState([])
  const [msg, setMsg] = useState('')
  const [modal, setModal] = useState(null)
  const [boardWidth, setBoardWidth] = useState(300)
  const containerRef = useRef(null)
  const chatBoxRef = useRef(null)

  // Sounds (Client side optimization)
  const playSound = (type) => {
    const urls = {
      move: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/move-self.mp3',
      capture: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/capture.mp3',
      check: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/move-check.mp3',
      end: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/game-end.mp3'
    }
    new Audio(urls[type]).play().catch(() => {})
  }

  useEffect(() => {
    const resize = () => {
      if (containerRef.current) {
        setBoardWidth(Math.min(500, containerRef.current.clientWidth - 40))
      }
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    let clientId = localStorage.getItem('hina_uid')
    if (!clientId) {
      clientId = Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem('hina_uid', clientId)
    }

    socket = io({ transports: ['websocket'] })
    
    socket.emit('join', { roomId, clientId, options: config }, (res) => {
      if (res.ok) {
        setRole(res.role)
        if (res.stats) setMyStats(res.stats)
        if (res.state) sync(res.state)
      } else {
        alert(res.error || 'Error joining')
        onLeave()
      }
    })

    socket.on('state', sync)
    socket.on('time', (t) => setTimeLeft(t))
    socket.on('chat', (m) => setChat(prev => [...prev, m]))
    socket.on('chat-history', (hist) => setChat(hist))
    
    socket.on('move-effect', ({ capture, check }) => {
      if (check) playSound('check')
      else if (capture) playSound('capture')
      else playSound('move')
    })
    
    socket.on('game-over', (res) => {
      playSound('end')
      setModal(res)
    })

    // Local timer interpolation
    const timer = setInterval(() => {
      if (status === 'playing') {
        setTimeLeft(t => {
          const c = { ...t }
          if (c[turn] > 0) c[turn] = Math.max(0, c[turn] - 0.1)
          return c
        })
      }
    }, 100)

    return () => {
      socket.disconnect()
      clearInterval(timer)
    }
  }, [roomId])

  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight
  }, [chat])

  function sync(state) {
    const g = new Chess(state.fen)
    setGame(g)
    setStatus(state.status)
    setPlayers(state.players)
    setTurn(state.turn)
    // Don't overwrite time constantly to prevent jitter, rely on socket.on('time')
  }

  function onDrop(source, target) {
    if (role !== turn) return false
    try {
      const temp = new Chess(game.fen())
      const move = temp.move({ from: source, to: target, promotion: 'q' })
      if (!move) return false
      setGame(temp) // Instant feedback
      socket.emit('move', { roomId, clientId: localStorage.getItem('hina_uid'), move: { from: source, to: target, promotion: 'q' } })
      return true
    } catch { return false }
  }

  function sendChat() {
    if (!msg.trim()) return
    const id = localStorage.getItem('hina_uid')
    socket.emit('chat', { roomId, clientId: id, message: msg })
    setMsg('')
  }

  const fmtTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec < 10 ? '0' : ''}${sec}`
  }

  return (
    <div className="container" ref={containerRef}>
      <div className="header">
        <div>
          <h1>اتاق: {roomId}</h1>
          <div className="stat-box">وضعیت: {status === 'playing' ? 'در جریان' : 'انتظار'}</div>
        </div>
        {myStats && (
          <div className="card" style={{ padding: '5px 10px', fontSize: '0.8rem' }}>
             آمار شما: 
             <span className="stat-val" style={{color: '#4ade80'}}>W:{myStats.wins}</span>
             <span className="stat-val" style={{color: '#f87171'}}>L:{myStats.losses}</span>
             <span className="stat-val" style={{color: '#94a3b8'}}>D:{myStats.draws}</span>
          </div>
        )}
        <button onClick={onLeave} style={{background: '#ef4444'}}>خروج</button>
      </div>

      <div className="flex" style={{ flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
        <div className="card" style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Top Player */}
          <div className="flex" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 10 }}>
             <span>{role === 'white' ? 'سیاه (حریف)' : 'سفید (حریف)'}</span>
             <span style={{ fontFamily: 'monospace', fontSize: '1.2rem' }}>
               {fmtTime(timeLeft[role === 'white' ? 'black' : 'white'])}
             </span>
          </div>
          
          <div style={{ pointerEvents: role === 'spectator' ? 'none' : 'auto' }}>
            <Chessboard 
              position={game.fen()} 
              onPieceDrop={onDrop}
              boardOrientation={role === 'spectator' ? 'white' : role}
              boardWidth={boardWidth}
            />
          </div>

          {/* Bottom Player */}
          <div className="flex" style={{ width: '100%', justifyContent: 'space-between', marginTop: 10 }}>
             <span>{role === 'spectator' ? 'سفید' : 'شما'}</span>
             <span style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: turn === role ? 'var(--accent)' : 'inherit' }}>
               {fmtTime(timeLeft[role === 'spectator' ? 'white' : role])}
             </span>
          </div>
        </div>

        <div className="col" style={{ width: '100%', maxWidth: '350px' }}>
           <div className="card" style={{ height: '300px', display: 'flex', flexDirection: 'column' }}>
             <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10 }} ref={chatBoxRef}>
               {chat.map(c => (
                 <div key={c.id} style={{ marginBottom: 6, fontSize: '0.9rem' }}>
                   <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{c.name}: </span>
                   <span style={{ color: '#ccc' }}>{c.text}</span>
                 </div>
               ))}
             </div>
             <div className="flex">
               <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key==='Enter' && sendChat()} placeholder="پیام..." />
               <button onClick={sendChat}>OK</button>
             </div>
           </div>
           
           {status === 'playing' && role !== 'spectator' && (
             <button onClick={() => socket.emit('resign', { roomId, clientId: localStorage.getItem('hina_uid') })} style={{background: '#334155'}}>
               تسلیم
             </button>
           )}
        </div>
      </div>

      {modal && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div className="card center">
            <h2>{modal.winner === 'draw' ? 'مساوی' : `برنده: ${modal.winner}`}</h2>
            <p style={{color: '#94a3b8'}}>علت: {modal.reason}</p>
            <button onClick={() => window.location.reload()}>بازی جدید</button>
          </div>
        </div>
      )}
    </div>
  )
}
