import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { io } from 'socket.io-client'
import { Chess } from 'chess.js'

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false })

export default function GameRoom() {
  const router = useRouter()
  const { id: roomId } = router.query
  const [socket, setSocket] = useState(null)
  
  // وضعیت بازی
  const [game, setGame] = useState(new Chess())
  const [fen, setFen] = useState('start')
  const [myColor, setMyColor] = useState('spectator')
  const [players, setPlayers] = useState([])
  const [status, setStatus] = useState('loading')
  const [timeLeft, setTimeLeft] = useState({ w: 0, b: 0 })
  
  // تنظیمات ظاهری (ذخیره در LocalStorage)
  const [boardTheme, setBoardTheme] = useState({ light: '#e0c0f8', dark: '#7c3aed' })
  const [showSettings, setShowSettings] = useState(false)
  const [customColor, setCustomColor] = useState('#7c3aed')

  // لود تنظیمات کاربر
  useEffect(() => {
      const savedTheme = localStorage.getItem('hina_theme')
      if(savedTheme) setBoardTheme(JSON.parse(savedTheme))
  }, [])

  useEffect(() => {
      if(!roomId) return;

      const s = io()
      setSocket(s)
      
      // اتصال به محض ورود
      s.emit('join', { roomId })

      s.on('init-game', (data) => {
          const g = new Chess(data.fen)
          setGame(g); setFen(data.fen); setPlayers(data.players); 
          setMyColor(data.myColor); setStatus(data.status);
          setTimeLeft(data.timeLeft || {w:0, b:0});
      })

      s.on('sync', (data) => {
          const g = new Chess(data.fen)
          setGame(g); setFen(data.fen); setTimeLeft(data.timeLeft);
          if(data.lastMove) playSound(data.move) // پخش صدا
      })

      s.on('error', (msg) => { alert(msg); router.push('/dashboard'); })

      return () => s.disconnect()
  }, [roomId])

  // تابع پخش صدا با فال‌بک
  const playSound = (move) => {
      try {
          // اگر فایل وجود نداشت ارور نده
          const audio = new Audio(move.san.includes('+') ? '/sounds/check.mp3' : '/sounds/move.mp3')
          audio.volume = 0.5
          audio.play().catch(() => {}) 
      } catch(e) {}
  }

  const onDrop = (source, target) => {
      if(game.turn() !== myColor) return false
      
      try {
          const tempGame = new Chess(game.fen())
          const move = tempGame.move({ from: source, to: target, promotion: 'q' })
          if(!move) return false
          
          setGame(tempGame); setFen(tempGame.fen())
          socket.emit('move', { roomId, move: { from: source, to: target, promotion: 'q' } })
          return true
      } catch(e) { return false }
  }

  const changeTheme = (light, dark) => {
      const theme = { light, dark }
      setBoardTheme(theme)
      localStorage.setItem('hina_theme', JSON.stringify(theme))
  }

  if(status === 'loading') return <div className="flex-center" style={{height:'100vh'}}>در حال اتصال...</div>

  return (
    <div className="container game-grid" style={{paddingTop: 20}}>
        
        {/* ستون چپ: اطلاعات */}
        <div className="card desktop-only">
            <h3>Hina Chess</h3>
            <p>اتاق: {roomId}</p>
            <button className="btn btn-outline" onClick={()=>setShowSettings(!showSettings)}>🎨 شخصی سازی میز</button>
            <button className="btn btn-danger" onClick={()=>router.push('/dashboard')} style={{marginTop:10}}>خروج</button>
            
            {showSettings && (
                <div style={{marginTop:20, animation:'slideUp 0.3s'}}>
                    <p>تم‌های آماده:</p>
                    <div style={{display:'flex', gap:5, flexWrap:'wrap'}}>
                        <div onClick={()=>changeTheme('#e0c0f8','#7c3aed')} style={{width:30,height:30,background:'#7c3aed',borderRadius:'50%',cursor:'pointer'}}></div>
                        <div onClick={()=>changeTheme('#ecfdf5','#059669')} style={{width:30,height:30,background:'#059669',borderRadius:'50%',cursor:'pointer'}}></div>
                        <div onClick={()=>changeTheme('#fef3c7','#b45309')} style={{width:30,height:30,background:'#b45309',borderRadius:'50%',cursor:'pointer'}}></div>
                        <div onClick={()=>changeTheme('#e0f2fe','#0284c7')} style={{width:30,height:30,background:'#0284c7',borderRadius:'50%',cursor:'pointer'}}></div>
                        <div onClick={()=>changeTheme('#fce7f3','#db2777')} style={{width:30,height:30,background:'#db2777',borderRadius:'50%',cursor:'pointer'}}></div>
                    </div>
                    <p style={{marginTop:10}}>رنگ سفارشی:</p>
                    <input type="color" value={customColor} onChange={e=>{setCustomColor(e.target.value); changeTheme('#ffffff', e.target.value)}} style={{height:40, padding:0}} />
                </div>
            )}
        </div>

        {/* ستون وسط: برد */}
        <div className="board-area">
            {/* نوار حریف */}
            <PlayerBar player={players.find(p => p.color !== myColor)} time={timeLeft[myColor==='w'?'b':'w']} />
            
            <div className="board-container" style={{boxShadow: `0 0 30px ${boardTheme.dark}80`}}>
                <Chessboard 
                    position={fen} 
                    onPieceDrop={onDrop}
                    boardOrientation={myColor === 'w' ? 'white' : 'black'}
                    customDarkSquareStyle={{backgroundColor: boardTheme.dark}}
                    customLightSquareStyle={{backgroundColor: boardTheme.light}}
                    animationDuration={200}
                />
            </div>
            
            {/* نوار خودی */}
            <PlayerBar player={players.find(p => p.color === myColor) || {username: 'شما (تماشاچی)'}} time={timeLeft[myColor]} isMe />
        </div>

        {/* ستون راست: چت (ساده شده) */}
        <div className="card" style={{height: '80vh'}}>
             {/* کامپوننت چت را اینجا قرار دهید */}
             <div style={{textAlign:'center', color:'var(--text-muted)'}}>چت بازی</div>
        </div>
    </div>
  )
}

function PlayerBar({ player, time, isMe }) {
    const mins = Math.floor(time / 60) || 0
    const secs = Math.floor(time % 60) || 0
    return (
        <div className="player-bar" style={{marginBottom:10, marginTop: isMe?10:0, display:'flex', justifyContent:'space-between', background:'rgba(0,0,0,0.3)', padding:10, borderRadius:12}}>
            <div className="flex-center" style={{gap:10}}>
                <div className="avatar" style={{width:35, height:35}}>{player?.username?.[0] || '?'}</div>
                <span>{player?.username || 'در انتظار...'}</span>
            </div>
            <div className="timer" style={{fontFamily:'monospace', fontSize:'1.2rem', background:'#111', padding:'2px 8px', borderRadius:5}}>
                {mins}:{secs.toString().padStart(2, '0')}
            </div>
        </div>
    )
}
