import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { io } from 'socket.io-client'
import { Chess } from 'chess.js' // استفاده برای محاسبه حرکات مجاز در کلاینت

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false })

let socket = null

export default function ChessRoom({ roomId, onLeave, config }) {
  const [game, setGame] = useState(new Chess())
  const [role, setRole] = useState('spectator')
  const [status, setStatus] = useState('waiting') // waiting, playing, finished
  const [players, setPlayers] = useState([])
  const [timeLeft, setTimeLeft] = useState({ white: 0, black: 0 })
  const [turn, setTurn] = useState('white')
  const [myId, setMyId] = useState(null)
  
  // UI States
  const [chat, setChat] = useState([])
  const [msgInput, setMsgInput] = useState('')
  const [boardWidth, setBoardWidth] = useState(480)
  const [lastMoveSquares, setLastMoveSquares] = useState({})
  const [optionSquares, setOptionSquares] = useState({})
  const [resultModal, setResultModal] = useState(null)

  const containerRef = useRef(null)
  const chatEndRef = useRef(null)
  
  // Sounds
  const playSound = (type) => {
    // برای پرهیز از افزودن فایل، از لینک‌های استاندارد استفاده می‌کنیم.
    // در نسخه پروداکشن باید فایل‌ها را دانلود و در پوشه public قرار دهید.
    const sounds = {
      move: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/move-self.mp3',
      capture: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/capture.mp3',
      check: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/move-check.mp3',
      end: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/game-end.mp3'
    }
    try { new Audio(sounds[type]).play().catch(() => {}) } catch(e){}
  }

  // --- RESIZE LOGIC ---
  useEffect(() => {
    const handleResize = () => {
      if(containerRef.current) {
        const w = containerRef.current.clientWidth
        setBoardWidth(Math.min(600, w))
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // --- SOCKET & GAME LOGIC ---
  useEffect(() => {
    let clientId = localStorage.getItem('hina_cid_v2')
    if (!clientId) {
      clientId = Math.random().toString(36).substring(2) + Date.now().toString(36)
      localStorage.setItem('hina_cid_v2', clientId)
    }
    setMyId(clientId)

    socket = io({ transports: ['websocket'] }) // Force websocket for speed

    socket.emit('join', { roomId, clientId, options: config }, (res) => {
      if (res.ok) {
        setRole(res.role)
        if (res.state) syncState(res.state)
      } else {
        alert('خطا در اتصال: ' + res.error)
        onLeave()
      }
    })

    socket.on('state', syncState)
    
    socket.on('move-sound', ({ capture, check }) => {
       if(check) playSound('check')
       else if(capture) playSound('capture')
       else playSound('move')
    })

    socket.on('time-sync', (times) => setTimeLeft(times))
    
    socket.on('chat', (msg) => {
      setChat(prev => [...prev, msg])
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    })

    socket.on('game-over', (res) => {
      playSound('end')
      setResultModal(res)
    })

    // Local Timer simulation for smoothness
    const timer = setInterval(() => {
      if (status === 'playing') {
        setTimeLeft(prev => {
          const t = { ...prev }
          if (t[turn] > 0) t[turn] = Math.max(0, t[turn] - 0.1) // 100ms update
          return t
        })
      }
    }, 100)

    return () => {
      socket.disconnect()
      clearInterval(timer)
    }
  }, [roomId])

  function syncState(state) {
    if (!state) return
    const newGame = new Chess(state.fen)
    setGame(newGame)
    setPlayers(state.players)
    setStatus(state.status)
    setTurn(state.turn)
    // Only update explicit time from server if needed, relying on local timer for smoothness usually
    setTimeLeft(state.timeLeft) 
    
    // Highlight last move
    if(state.lastMove) {
        setLastMoveSquares({
            [state.lastMove.from]: { background: 'rgba(255, 255, 0, 0.4)' },
            [state.lastMove.to]: { background: 'rgba(255, 255, 0, 0.4)' }
        })
    }
    
    if(state.result) setResultModal(state.result)
  }

  // --- BOARD INTERACTION ---
  function onPieceDrop(source, target) {
    if (role !== turn) return false
    
    // Optimistic UI Update
    try {
        const tempGame = new Chess(game.fen())
        const move = tempGame.move({ from: source, to: target, promotion: 'q' })
        if (!move) return false
        
        setGame(tempGame) // Show move immediately
        setOptionSquares({}) // Clear hints
        
        socket.emit('move', { roomId, clientId: myId, move: { from: source, to: target, promotion: 'q' } }, (res) => {
            if(!res.ok) {
                // Revert if server rejected (syncState will handle it actually)
                console.log('Move rejected')
            }
        })
        return true
    } catch(e) { return false }
  }

  function getMoveOptions(square) {
    const moves = game.moves({ square, verbose: true })
    if (moves.length === 0) {
      setOptionSquares({})
      return
    }
    const newSquares = {}
    moves.map((move) => {
      newSquares[move.to] = {
        background: game.get(move.to) && game.get(move.to).color !== game.turn()
          ? 'radial-gradient(circle, rgba(255,0,0,.5) 85%, transparent 85%)' // Capture hint
          : 'radial-gradient(circle, rgba(0,0,0,.3) 25%, transparent 25%)', // Move hint
        borderRadius: '50%'
      }
    })
    newSquares[square] = { background: 'rgba(255, 255, 0, 0.4)' }
    setOptionSquares(newSquares)
  }

  // --- ACTIONS ---
  const sendChat = () => {
    if(!msgInput.trim()) return
    socket.emit('chat', { roomId, clientId: myId, message: msgInput })
    setMsgInput('')
  }
  
  const resign = () => {
      if(confirm('آیا مطمئن هستید که می‌خواهید تسلیم شوید؟')) {
          socket.emit('resign', { roomId, clientId: myId })
      }
  }

  const formatTime = (s) => {
    const min = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  // --- RENDER HELPERS ---
  const PlayerInfo = ({ color, align }) => {
      const p = players.find(x => x.color === color)
      const isMe = p?.clientId === myId
      const isTurn = turn === color && status === 'playing'
      
      return (
          <div className={`card flex ${align === 'right' ? 'flex-row-reverse' : ''}`} style={{ padding: 12, justifyContent: 'space-between', border: isTurn ? '1px solid var(--accent)' : '1px solid transparent' }}>
             <div className="flex">
                 <div style={{ width: 40, height: 40, borderRadius: 8, background: color === 'white' ? '#e2e8f0' : '#334155', display:'grid', placeItems:'center', fontSize: 20 }}>
                     {color === 'white' ? '♔' : '♚'}
                 </div>
                 <div>
                     <div style={{fontWeight: 'bold'}}>{isMe ? 'شما' : (p ? 'حریف' : 'منتظر...')}</div>
                     <div className="text-small" style={{fontSize: 12}}>{p?.connected ? 'آنلاین' : 'آفلاین'}</div>
                 </div>
             </div>
             <div className={`timer-box ${isTurn ? 'active' : ''} ${timeLeft[color] < 30 ? 'low' : ''}`}>
                 {formatTime(timeLeft[color])}
             </div>
          </div>
      )
  }

  return (
    <div className="container" ref={containerRef}>
      <div className="header">
          <div className="brand">
              <h1>Hina Chess</h1>
              <span>Room: {roomId}</span>
          </div>
          <div>
              <button className="danger" onClick={onLeave}>خروج از اتاق</button>
          </div>
      </div>

      <div className="grid-layout">
          {/* ستون چپ: بورد */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
             <div className="w-full">
                 <PlayerInfo color={role === 'white' ? 'black' : 'white'} />
             </div>
             
             <div style={{ borderRadius: 8, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
                 <Chessboard 
                    id="Board"
                    position={game.fen()}
                    onPieceDrop={onPieceDrop}
                    boardOrientation={role === 'spectator' ? 'white' : role}
                    boardWidth={boardWidth}
                    onPieceDragBegin={(_, square) => getMoveOptions(square)}
                    onPieceDragEnd={() => setOptionSquares({})}
                    customSquareStyles={{...lastMoveSquares, ...optionSquares}}
                    animationDuration={200}
                 />
             </div>

             <div className="w-full">
                 <PlayerInfo color={role === 'spectator' ? 'white' : role} />
             </div>
          </div>

          {/* ستون راست: چت و کنترل */}
          <div className="flex-col" style={{ height: '100%' }}>
              <div className="card chat-container">
                  <div className="chat-messages">
                      {chat.map(m => (
                          <div key={m.id} className={`msg ${m.fromId === myId ? 'me' : 'them'}`}>
                              {!m.system && m.fromId !== myId && <div style={{fontSize: 10, opacity: 0.7, marginBottom: 2}}>{m.senderName}</div>}
                              {m.text}
                          </div>
                      ))}
                      <div ref={chatEndRef} />
                  </div>
                  <div className="flex" style={{ marginTop: 10 }}>
                      <input 
                        value={msgInput} 
                        onChange={e => setMsgInput(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && sendChat()}
                        placeholder="پیام..." 
                      />
                      <button onClick={sendChat}>➤</button>
                  </div>
              </div>

              <div className="card">
                  <h3 style={{marginTop:0}}>وضعیت بازی</h3>
                  <div className="flex-col">
                      <div className="flex" style={{justifyContent: 'space-between'}}>
                          <span className="text-small">وضعیت</span>
                          <span>{status === 'playing' ? 'در جریان' : (status === 'waiting' ? 'در انتظار بازیکن' : 'پایان یافته')}</span>
                      </div>
                      {status === 'playing' && role !== 'spectator' && (
                          <button className="danger w-full" onClick={resign} style={{marginTop: 8}}>تسلیم</button>
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* مودال پایان بازی */}
      {resultModal && (
          <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
          }}>
              <div className="card" style={{ width: 300, textAlign: 'center', border: '2px solid var(--accent)' }}>
                  <h2 style={{ fontSize: '2rem', margin: '0 0 10px 0' }}>
                      {resultModal.winner === 'draw' ? 'مساوی!' : (resultModal.winner === role ? 'شما بردید! 🎉' : 'شما باختید 😔')}
                  </h2>
                  <p className="text-muted">علت: {resultModal.reason}</p>
                  <button onClick={() => window.location.reload()} className="w-full">بازی جدید</button>
                  <button onClick={() => setResultModal(null)} className="w-full" style={{background: 'transparent', marginTop: 8}}>بستن</button>
              </div>
          </div>
      )}
    </div>
  )
}
