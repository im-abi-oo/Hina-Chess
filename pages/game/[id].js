import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { io } from 'socket.io-client'
import { Chess } from 'chess.js'

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false })

export default function Game() {
  const router = useRouter()
  const { id } = router.query
  const socketRef = useRef(null)

  const [game, setGame] = useState(new Chess())
  const [fen, setFen] = useState('start')
  const [players, setPlayers] = useState([])
  const [myColor, setMyColor] = useState('spectator')
  const [timeLeft, setTimeLeft] = useState({w:0, b:0})
  const [status, setStatus] = useState('loading')
  const [result, setResult] = useState(null)
  
  // Chat
  const [chat, setChat] = useState([])
  const [msg, setMsg] = useState('')

  // Theme
  const [theme, setTheme] = useState({ light: '#e0c0f8', dark: '#7c3aed' })
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if(!id) return
    const saved = localStorage.getItem('theme'); if(saved) setTheme(JSON.parse(saved))

    const s = io()
    socketRef.current = s
    s.emit('join', { roomId: id })

    s.on('init-game', d => {
        const g = new Chess(d.fen)
        setGame(g); setFen(d.fen); setPlayers(d.players);
        setMyColor(d.myColor); setStatus(d.status); setTimeLeft(d.timeLeft);
    })

    s.on('sync', d => {
        const g = new Chess(d.fen)
        setGame(g); setFen(d.fen); setTimeLeft(d.timeLeft);
        if(d.lastMove) playSound(d.lastMove)
    })

    s.on('player-update', setPlayers)
    s.on('chat-msg', m => setChat(prev => [...prev, m]))
    s.on('game-over', res => { setResult(res); setStatus('finished') })
    s.on('error', e => { alert(e); router.push('/dashboard') })

    return () => s.disconnect()
  }, [id])

  const onDrop = (source, target) => {
      if(game.turn() !== myColor || status !== 'playing') return false
      try {
          const temp = new Chess(game.fen())
          const move = temp.move({ from: source, to: target, promotion: 'q' })
          if(!move) return false
          setGame(temp); setFen(temp.fen())
          socketRef.current.emit('move', { roomId: id, move: { from: source, to: target, promotion: 'q' } })
          return true
      } catch(e) { return false }
  }

  const sendChat = (e) => {
      e.preventDefault(); if(!msg) return;
      socketRef.current.emit('chat', { roomId: id, text: msg })
      setMsg('')
  }

  const playSound = (move) => {
      try { new Audio(move.san.includes('+')?'/sounds/check.mp3':'/sounds/move.mp3').play().catch(()=>{}) } catch(e){}
  }

  if(status === 'loading') return <div className="flex-center" style={{height:'100vh'}}>در حال اتصال...</div>

  const opponent = players.find(p => p.color !== myColor)
  const me = players.find(p => p.color === myColor)

  return (
    <div className="container game-grid" style={{paddingTop:20}}>
        {/* SIDEBAR */}
        <div className="card desktop-only">
            <h3>تنظیمات</h3>
            <button className="btn btn-outline" onClick={()=>setShowSettings(!showSettings)}>🎨 شخصی سازی</button>
            {showSettings && (
                <div style={{display:'flex', gap:5, marginTop:10}}>
                    <div onClick={()=>{setTheme({light:'#e0c0f8',dark:'#7c3aed'});localStorage.setItem('theme',JSON.stringify({light:'#e0c0f8',dark:'#7c3aed'}))}} style={{width:20,height:20,background:'#7c3aed',borderRadius:'50%'}}></div>
                    <div onClick={()=>{setTheme({light:'#ecfdf5',dark:'#059669'});localStorage.setItem('theme',JSON.stringify({light:'#ecfdf5',dark:'#059669'}))}} style={{width:20,height:20,background:'#059669',borderRadius:'50%'}}></div>
                </div>
            )}
            <button className="btn btn-outline" style={{marginTop:10, borderColor:'var(--danger)', color:'var(--danger)'}} onClick={()=>router.push('/dashboard')}>خروج</button>
        </div>

        {/* BOARD */}
        <div style={{width:'100%', maxWidth:600, margin:'0 auto'}}>
             <PlayerBar p={opponent} time={timeLeft[myColor==='w'?'b':'w']} />
             <div style={{boxShadow:`0 0 20px ${theme.dark}80`, borderRadius:4}}>
                <Chessboard 
                    position={fen} 
                    onPieceDrop={onDrop}
                    boardOrientation={myColor==='w'?'white':'black'}
                    customDarkSquareStyle={{backgroundColor: theme.dark}}
                    customLightSquareStyle={{backgroundColor: theme.light}}
                    animationDuration={200}
                />
             </div>
             <PlayerBar p={me} time={timeLeft[myColor]} isMe />
        </div>

        {/* CHAT */}
        <div className="card" style={{display:'flex', flexDirection:'column', height:'80vh', maxHeight:600}}>
            <h3>گفتگو</h3>
            <div style={{flex:1, overflowY:'auto', margin:'10px 0', display:'flex', flexDirection:'column', gap:5}}>
                {chat.map((c,i) => <div key={i} style={{background:'rgba(255,255,255,0.05)', padding:'5px 10px', borderRadius:5}}><b>{c.sender}:</b> {c.text}</div>)}
            </div>
            <form onSubmit={sendChat} style={{display:'flex', gap:5}}>
                <input value={msg} onChange={e=>setMsg(e.target.value)} placeholder="پیام..." />
                <button className="btn" style={{width:'auto'}}>></button>
            </form>
        </div>

        {/* RESULT MODAL */}
        {result && (
            <div className="flex-center" style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:100}}>
                <div className="card" style={{textAlign:'center', border:`2px solid ${result.winner===myColor?'#10b981':'#ef4444'}`}}>
                    <h1>{result.winner === 'draw' ? 'تساوی' : (result.winner === myColor ? 'پیروزی! 🎉' : 'شکست 💔')}</h1>
                    <p>{result.reason}</p>
                    <button className="btn" onClick={()=>router.push('/dashboard')}>بازگشت</button>
                </div>
            </div>
        )}
    </div>
  )
}

function PlayerBar({ p, time, isMe }) {
    const m = Math.floor(time/60)||0; const s = Math.floor(time%60)||0
    return (
        <div style={{display:'flex', justifyContent:'space-between', padding:10, background: isMe?'rgba(139, 92, 246, 0.2)':'rgba(0,0,0,0.3)', borderRadius:8, margin:'10px 0', border: isMe?'1px solid var(--primary)':'none'}}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
                <div className="avatar" style={{width:30,height:30}}>{p?.username?.[0]||'?'}</div>
                <span>{p?.username||'در انتظار...'}</span>
            </div>
            <span style={{fontFamily:'monospace', fontSize:'1.2rem', background:'#111', padding:'2px 6px', borderRadius:4}}>{m}:{s.toString().padStart(2,'0')}</span>
        </div>
    )
}
