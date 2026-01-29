import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { io } from 'socket.io-client'
import { Chess } from 'chess.js'

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false })

let socket = null

export default function ChessRoom({ roomId, user, onLeave }) {
  const [game, setGame] = useState(new Chess())
  const [fen, setFen] = useState('start')
  const [players, setPlayers] = useState([])
  const [myColor, setMyColor] = useState('spectator')
  const [status, setStatus] = useState('waiting')
  const [timeLeft, setTimeLeft] = useState({ w: 0, b: 0 })
  const [result, setResult] = useState(null)
  
  // Chat & UI State
  const [chat, setChat] = useState([])
  const [toasts, setToasts] = useState([])
  const [msg, setMsg] = useState('')
  const [activeTab, setActiveTab] = useState('board') // 'board', 'chat', 'settings' (Mobile Only)
  
  // Visuals
  const [moveOptions, setMoveOptions] = useState({})
  const [lastMoveSquares, setLastMoveSquares] = useState({})
  const [moveFrom, setMoveFrom] = useState(null)
  const [boardTheme, setBoardTheme] = useState({ light: '#e0c0f8', dark: '#7c3aed' }) // Deep Purple Theme

  const chatEndRef = useRef(null)

  useEffect(() => {
    socket = io({ transports: ['websocket'] })
    socket.emit('join', { roomId })
    
    socket.on('sync', (data) => {
        const g = new Chess(data.fen)
        setGame(g)
        setFen(data.fen)
        setPlayers(data.players)
        setStatus(data.status)
        setTimeLeft(data.timeLeft)
        setResult(data.result)
        
        if (data.lastMove) {
            setLastMoveSquares({
                [data.lastMove.from]: { background: 'rgba(255, 255, 0, 0.3)' },
                [data.lastMove.to]: { background: 'rgba(255, 255, 0, 0.3)' }
            })
        }
        const me = data.players.find(p => p.username === user.username)
        if(me) setMyColor(me.color)
    })

    socket.on('move-sound', ({ check, capture }) => {
        const soundFile = check ? 'check.mp3' : (capture ? 'capture.mp3' : 'move.mp3')
        playLocalSound(soundFile)
    })

    socket.on('chat-msg', (m) => {
        setChat(p => [...p, m])
        if(activeTab !== 'chat') {
            addToast(`${m.sender}: ${m.text}`)
        }
    })

    socket.on('time-sync', setTimeLeft)

    return () => socket.disconnect()
  }, [roomId])

  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), [chat, activeTab])

  // --- Helpers ---

  function playLocalSound(file) {
      // Tries to play from public/sounds folder
      try {
          new Audio(`/sounds/${file}`).play().catch(e => console.log('Sound not found'))
      } catch(e) {}
  }

  function addToast(text) {
      const id = Date.now()
      setToasts(p => [...p, { id, text }])
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }

  function getMoveOptions(square) {
    const moves = game.moves({ square, verbose: true })
    if (moves.length === 0) {
      setMoveOptions({})
      return false
    }

    const newOptions = {}
    moves.map((move) => {
      newOptions[move.to] = {
        background: game.get(move.to) && game.get(move.to).color !== game.get(square).color
            ? 'radial-gradient(circle, rgba(200,0,0,.4) 85%, transparent 85%)' // Capture hint
            : 'radial-gradient(circle, rgba(0,0,0,.2) 25%, transparent 25%)', // Move hint
        borderRadius: '50%',
      }
      return move
    })
    newOptions[square] = { background: 'rgba(255, 215, 0, 0.4)' }
    setMoveOptions(newOptions)
    return true
  }

  function onSquareClick(square) {
    if (status !== 'playing' || myColor !== game.turn()) return

    // Move Logic (Click-Click)
    if (moveOptions[square] && moveFrom) {
        handleMove({ from: moveFrom, to: square, promotion: 'q' })
        setMoveFrom(null)
        setMoveOptions({})
        return
    }

    // Select Piece
    const piece = game.get(square)
    if (piece && piece.color === myColor) {
        setMoveFrom(square)
        getMoveOptions(square)
    } else {
        setMoveFrom(null)
        setMoveOptions({})
    }
  }

  function onPieceDrop(source, target) {
    if (status !== 'playing' || myColor !== game.turn()) return false
    return handleMove({ from: source, to: target, promotion: 'q' })
  }

  function handleMove(moveObj) {
    try {
        const tempGame = new Chess(game.fen())
        const move = tempGame.move(moveObj)
        if (!move) return null

        setGame(tempGame)
        setFen(tempGame.fen())
        setLastMoveSquares({
            [move.from]: { background: 'rgba(255, 255, 0, 0.4)' },
            [move.to]: { background: 'rgba(255, 255, 0, 0.4)' }
        })
        socket.emit('move', { roomId, move: moveObj })
        return true
    } catch(e) { return false }
  }

  // --- Render ---
  const opponent = players.find(p => p.color !== myColor)
  
  // Mobile Tab Content Renderer
  const isChatVisible = activeTab === 'chat'
  
  return (
    <div className="container animate-in">
        {/* Toast Notifications Overlay */}
        <div className="toast-area">
            {toasts.map(t => <div key={t.id} className="toast">{t.text}</div>)}
        </div>

        <div className="game-grid">
            
            {/* LEFT: Game Info (Desktop) / Hidden Mobile */}
            <div className="card sidebar desktop-only">
               <h3>Hina Chess Pro</h3>
               <div style={{marginTop:20}}>
                   <p>اتاق: <span style={{fontFamily:'monospace', color:'var(--primary)'}}>{roomId}</span></p>
                   <p>وضعیت: {status === 'waiting' ? 'در انتظار حریف...' : 'در حال بازی'}</p>
                   <button className="btn btn-danger" onClick={onLeave} style={{marginTop:20}}>خروج از بازی</button>
               </div>
            </div>

            {/* MIDDLE: Board */}
            <div style={{width:'100%', display: activeTab === 'board' || window.innerWidth > 1024 ? 'block' : 'none'}}>
                {/* Opponent Bar */}
                <div className="player-bar">
                    <div className="user-info">
                        <div className="avatar" style={{background:'#475569'}}>{opponent?.username?.[0] || '?'}</div>
                        <div>{opponent?.username || 'Waiting...'} <small style={{color: opponent?.connected ? '#4ade80':'#94a3b8'}}>{opponent?.connected ? '●' : '○'}</small></div>
                    </div>
                    <div className={`timer ${game.turn() === (myColor==='w'?'b':'w') ? 'active' : ''}`}>
                         {Math.floor(timeLeft[myColor==='w'?'b':'w']/60)}:{Math.floor(timeLeft[myColor==='w'?'b':'w']%60).toString().padStart(2,'0')}
                    </div>
                </div>

                <div className="board-container">
                    <Chessboard 
                        position={fen} 
                        onPieceDrop={onPieceDrop}
                        onSquareClick={onSquareClick}
                        boardOrientation={myColor === 'w' || myColor === 'spectator' ? 'white' : 'black'}
                        customDarkSquareStyle={{backgroundColor: boardTheme.dark}}
                        customLightSquareStyle={{backgroundColor: boardTheme.light}}
                        customSquareStyles={{...moveOptions, ...lastMoveSquares}}
                        animationDuration={200}
                    />
                </div>

                {/* My Bar */}
                <div className="player-bar" style={{marginTop:10}}>
                    <div className="user-info">
                        <div className="avatar">{user.username[0]}</div>
                        <div>{user.username} (شما)</div>
                    </div>
                    <div className={`timer ${game.turn() === myColor ? 'active' : ''}`}>
                         {Math.floor(timeLeft[myColor==='spectator'?'w':myColor]/60)}:{Math.floor(timeLeft[myColor==='spectator'?'w':myColor]%60).toString().padStart(2,'0')}
                    </div>
                </div>
            </div>

            {/* RIGHT: Chat & Settings (Desktop/Mobile View handled via CSS/State) */}
            <div className={`card sidebar ${activeTab === 'chat' ? '' : 'desktop-only'}`} style={{display: (activeTab==='chat' || window.innerWidth > 1024) ? 'flex' : 'none'}}>
                <div className="flex-center" style={{justifyContent:'space-between'}}>
                    <h3>💬 گفتگوی بازی</h3>
                    <button className="btn-icon mobile-only" onClick={()=>setActiveTab('board')}>✕</button>
                </div>
                
                <div className="chat-messages">
                    {chat.map((c, i) => (
                        <div key={i} className={`msg-bubble ${c.sender === user.username ? 'me' : ''}`}>
                            <b>{c.sender}</b>: {c.text}
                        </div>
                    ))}
                    <div ref={chatEndRef}></div>
                </div>
                <div style={{display:'flex', gap:5, marginTop:10}}>
                    <input value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>e.key==='Enter' && socket.emit('chat',{roomId,text:msg})} placeholder="پیام..." />
                    <button className="btn-icon" onClick={()=>{socket.emit('chat',{roomId,text:msg}); setMsg('')}}>➤</button>
                </div>
            </div>

             {/* SETTINGS TAB (Mobile Only View) */}
             {activeTab === 'settings' && (
                 <div className="card" style={{height:'100%'}}>
                     <h3>تنظیمات</h3>
                     <p>رنگ صفحه:</p>
                     <div style={{display:'flex', gap:10}}>
                         <button className="btn" style={{background:'#7c3aed'}} onClick={()=>setBoardTheme({light:'#e0c0f8', dark:'#7c3aed'})}>بنفش</button>
                         <button className="btn" style={{background:'#10b981'}} onClick={()=>setBoardTheme({light:'#ecfdf5', dark:'#059669'})}>سبز</button>
                         <button className="btn" style={{background:'#b45309'}} onClick={()=>setBoardTheme({light:'#fef3c7', dark:'#b45309'})}>چوبی</button>
                     </div>
                     <button className="btn btn-danger" style={{marginTop:50}} onClick={onLeave}>خروج از بازی</button>
                 </div>
             )}
        </div>

        {/* MOBILE NAVIGATION BAR */}
        <div className="mobile-nav lg:hidden" style={{display: window.innerWidth > 1024 ? 'none' : 'flex'}}>
             <button className={`nav-item ${activeTab==='board'?'active':''}`} onClick={()=>setActiveTab('board')}>♟️ بازی</button>
             <button className={`nav-item ${activeTab==='chat'?'active':''}`} onClick={()=>setActiveTab('chat')}>💬 چت {chat.length>0 && `(${chat.length})`}</button>
             <button className={`nav-item ${activeTab==='settings'?'active':''}`} onClick={()=>setActiveTab('settings')}>⚙️ تنظیمات</button>
        </div>

        {/* END GAME MODAL */}
        {result && (
            <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:200}} className="flex-center animate-in">
                <div className="card" style={{textAlign:'center', minWidth:300}}>
                    <h1>{result.winner === 'draw' ? 'تساوی' : (result.winner === myColor ? 'پیروزی! 🎉' : 'شکست 💔')}</h1>
                    <p style={{color:'var(--text-muted)'}}>علت: {result.reason}</p>
                    <button className="btn" onClick={onLeave} style={{marginTop:20}}>بازگشت به لابی</button>
                </div>
            </div>
        )}
    </div>
  )
}
