import { useEffect, useState, useRef, useMemo } from 'react'
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
  const [msg, setMsg] = useState('')
  const [activeTab, setActiveTab] = useState('chat') // 'chat' | 'settings' | 'moves'
  const chatEndRef = useRef(null)

  // Gameplay State (Highlights & Clicks)
  const [moveFrom, setMoveFrom] = useState(null)
  const [optionSquares, setOptionSquares] = useState({})
  const [lastMoveSquares, setLastMoveSquares] = useState({})
  
  // Customization
  const [boardTheme, setBoardTheme] = useState({ light: '#e0e7ff', dark: '#6366f1' })

  const THEMES = [
    { name: 'کلاسیک چوبی', light: '#eedc97', dark: '#a66d4f' },
    { name: 'اقیانوسی (پیش‌فرض)', light: '#e0e7ff', dark: '#6366f1' },
    { name: 'جنگلی', light: '#f0fff4', dark: '#4ade80' },
    { name: 'تاریک', light: '#94a3b8', dark: '#1e293b' },
    { name: 'آبنباتی', light: '#fce7f3', dark: '#ec4899' },
  ]

  useEffect(() => {
    socket = io({ transports: ['websocket'] })
    setupOnlineGame()

    return () => {
        socket.disconnect()
    }
  }, [roomId])

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chat, activeTab])

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
        
        // Highlight last move from server
        if (data.lastMove) {
            setLastMoveSquares({
                [data.lastMove.from]: { background: 'rgba(255, 255, 0, 0.4)' },
                [data.lastMove.to]: { background: 'rgba(255, 255, 0, 0.4)' }
            })
        }

        const me = data.players.find(p => p.username === user.username)
        if(me) setMyColor(me.color)
    })

    socket.on('move-sound', ({ check, capture }) => playSound(check ? 'check' : (capture ? 'capture' : 'move')))
    socket.on('chat-msg', (m) => setChat(p => [...p, m]))
    socket.on('time-sync', (t) => setTimeLeft(t))
  }

  // --- GAMEPLAY LOGIC ---

  function getMoveOptions(square) {
    const moves = game.moves({ square, verbose: true })
    if (moves.length === 0) {
      setOptionSquares({})
      return false
    }

    const newOptions = {}
    moves.map((move) => {
      newOptions[move.to] = {
        background:
          game.get(move.to) && game.get(move.to).color !== game.get(square).color
            ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
        borderRadius: '50%',
      }
      return move
    })
    
    // Also highlight the selected square
    newOptions[square] = { background: 'rgba(255, 255, 0, 0.4)' }
    setOptionSquares(newOptions)
    return true
  }

  function onSquareClick(square) {
    if (status !== 'playing' || (myColor !== game.turn() && myColor !== 'spectator')) return

    // 1. If clicking on a square we can move TO (and we have a piece selected)
    if (optionSquares[square] && moveFrom) {
        const move = { from: moveFrom, to: square, promotion: 'q' }
        makeMove(move)
        setMoveFrom(null)
        setOptionSquares({})
        return
    }

    // 2. If clicking on our own piece, select it
    // (Spectators cannot select)
    if (myColor !== 'spectator') {
        const piece = game.get(square)
        if (piece && piece.color === myColor) {
            setMoveFrom(square)
            getMoveOptions(square)
            return
        }
    }

    // 3. Click elsewhere -> Deselect
    setMoveFrom(null)
    setOptionSquares({})
  }

  function onPieceDrop(source, target) {
    if (status !== 'playing' || myColor !== game.turn()) return false
    const move = makeMove({ from: source, to: target, promotion: 'q' })
    setMoveFrom(null)
    setOptionSquares({})
    return move !== null
  }

  function makeMove(moveObj) {
    try {
        const tempGame = new Chess(game.fen())
        const move = tempGame.move(moveObj)
        if (!move) return null

        // Optimistic Update
        setGame(tempGame)
        setFen(tempGame.fen())
        setLastMoveSquares({
            [move.from]: { background: 'rgba(255, 255, 0, 0.4)' },
            [move.to]: { background: 'rgba(255, 255, 0, 0.4)' }
        })

        socket.emit('move', { roomId, move: moveObj })
        return move
    } catch(e) { return null }
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
            const turn = game.turn() 
            if(t[turn] <= 0) return t
            return { ...t, [turn]: t[turn] - 0.1 }
        })
    }, 100)
    return () => clearInterval(interval)
  }, [status, game]) 

  function formatTime(s) {
    const min = Math.floor(s/60); const sec = Math.floor(s%60)
    return `${min}:${sec.toString().padStart(2,'0')}`
  }

  function sendMessage() {
      if(!msg.trim()) return
      socket.emit('chat', {roomId, text: msg})
      setMsg('')
  }

  // --- RENDER HELPERS ---
  const opponent = players.find(p => p.color !== myColor)
  const me = players.find(p => p.username === user.username)

  return (
    <div className="container animate-in game-layout">
        {/* HEADER */}
        <div className="game-header flex between">
            <div>
                <h2 style={{margin:0, fontSize:'1.2rem'}}>Hina Chess</h2>
                <span className="badge">Room: {roomId}</span>
            </div>
            <button className="btn btn-danger btn-sm" onClick={onLeave}>خروج</button>
        </div>

        {/* BOARD AREA */}
        <div className="board-area">
            {/* Opponent Info */}
            <div className="player-strip">
                <div className="flex">
                    <div className="avatar" style={{background:'#334155'}}>{opponent?.username?.[0]?.toUpperCase() || '?'}</div>
                    <div className="col" style={{gap:0}}>
                        <span className="username">{opponent?.username || 'در انتظار حریف...'}</span>
                        <span className="status-text">{!opponent ? 'Waiting' : (opponent.connected ? 'Online' : 'Offline')}</span>
                    </div>
                </div>
                <div className={`timer ${game.turn() === (myColor==='w'?'b':'w') ? 'active' : ''}`}>
                    {formatTime(timeLeft[myColor === 'w' ? 'b' : 'w'])}
                </div>
            </div>

            <div className="chessboard-wrapper">
                <Chessboard 
                    position={fen} 
                    onPieceDrop={onPieceDrop}
                    onSquareClick={onSquareClick}
                    boardOrientation={myColor === 'w' || myColor === 'spectator' ? 'white' : 'black'}
                    customDarkSquareStyle={{backgroundColor: boardTheme.dark}}
                    customLightSquareStyle={{backgroundColor: boardTheme.light}}
                    customSquareStyles={{
                        ...optionSquares,
                        ...lastMoveSquares
                    }}
                    animationDuration={200}
                    arePiecesDraggable={myColor === game.turn()}
                />
            </div>

            {/* My Info */}
            <div className="player-strip">
                <div className="flex">
                    <div className="avatar" style={{background:'var(--primary)'}}>{user.username[0].toUpperCase()}</div>
                    <div className="col" style={{gap:0}}>
                        <span className="username">{user.username} (You)</span>
                        <span className="status-text">{myColor === 'spectator' ? 'Spectating' : 'Playing'}</span>
                    </div>
                </div>
                <div className={`timer ${game.turn() === myColor ? 'active' : ''}`} style={{color: timeLeft[myColor] < 30 ? '#ef4444' : 'inherit'}}>
                    {formatTime(timeLeft[myColor === 'spectator' ? 'w' : myColor])}
                </div>
            </div>
        </div>

        {/* CONTROLS & CHAT (Mobile Friendly Tabs) */}
        <div className="controls-area card">
            <div className="tabs">
                <button className={`tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={()=>setActiveTab('chat')}>💬 چت</button>
                <button className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={()=>setActiveTab('settings')}>🎨 ظاهر</button>
                <button className={`tab ${activeTab === 'info' ? 'active' : ''}`} onClick={()=>setActiveTab('info')}>ℹ️ بازی</button>
            </div>

            <div className="tab-content">
                {activeTab === 'chat' && (
                    <div className="chat-box">
                        <div className="messages">
                            {chat.length === 0 && <div className="empty-state">هنوز پیامی نیست...</div>}
                            {chat.map((c, i) => (
                                <div key={i} className={`msg ${c.sender === user.username ? 'me' : 'other'}`}>
                                    <b>{c.sender}</b>: {c.text}
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                        <div className="chat-input-area">
                            <input 
                                value={msg} 
                                onChange={e=>setMsg(e.target.value)} 
                                onKeyDown={e=>e.key==='Enter' && sendMessage()} 
                                placeholder="پیام بنویسید..." 
                            />
                            <button className="btn-icon" onClick={sendMessage}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="settings-box">
                        <h3>رنگ صفحه بازی</h3>
                        <div className="theme-grid">
                            {THEMES.map((t, i) => (
                                <button key={i} className="theme-btn" onClick={() => setBoardTheme(t)} style={{border: boardTheme.dark === t.dark ? '2px solid white' : '2px solid transparent'}}>
                                    <div className="theme-preview">
                                        <div style={{background: t.light}}></div>
                                        <div style={{background: t.dark}}></div>
                                    </div>
                                    <span>{t.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'info' && (
                   <div className="info-box">
                       <h3>وضعیت بازی</h3>
                       <p>نوبت: <span className="badge">{game.turn() === 'w' ? 'سفید' : 'سیاه'}</span></p>
                       <p>وضعیت: {status === 'waiting' ? 'در انتظار حریف' : 'در حال بازی'}</p>
                       <p>تماشاگران: {players.length > 2 ? players.length - 2 : 0}</p>
                       <div style={{marginTop: 20, fontSize: '0.8rem', opacity: 0.7}}>
                            Move method: Drag & Drop OR Click squares
                       </div>
                   </div>
                )}
            </div>
        </div>

        {/* FOOTER */}
        <div className="copyright">
            &copy; 2026 Hina Chess | Built with ❤️ by <b>im_abi</b>
        </div>

        {/* MODALS */}
        {result && (
            <div className="modal-overlay animate-in">
                <div className="card modal-content">
                    <h1>
                        {result.winner === 'draw' ? '🤝 تساوی!' : (result.winner === myColor ? '🎉 پیروزی!' : '💔 شکست')}
                    </h1>
                    <p className="reason-text">علت: {result.reason}</p>
                    <button className="btn" onClick={onLeave}>بازگشت به لابی</button>
                </div>
            </div>
        )}
    </div>
  )
}
