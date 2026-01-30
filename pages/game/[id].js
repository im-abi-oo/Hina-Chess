import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { io } from 'socket.io-client'
import { Chess } from 'chess.js'

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { 
  ssr: false,
  loading: () => <div className="flex-center" style={{height:400}}>در حال بارگذاری صفحه...</div>
})

export default function Game() {
  const router = useRouter()
  const { id } = router.query
  const socketRef = useRef(null)

  const [game, setGame] = useState(new Chess())
  const [fen, setFen] = useState('start')
  const [players, setPlayers] = useState([])
  const [myColor, setMyColor] = useState('spectator') // 'w' | 'b' | 'spectator'
  const [timeLeft, setTimeLeft] = useState({ w: 0, b: 0 })
  const [status, setStatus] = useState('loading')
  const [result, setResult] = useState(null)

  // Chat
  const [chat, setChat] = useState([])
  const [msg, setMsg] = useState('')

  // UI & Theme - پیش‌فرض سبز
  const [theme, setTheme] = useState({ light: '#ecfdf5', dark: '#059669' })
  const [showSettings, setShowSettings] = useState(false)
  const [customColor, setCustomColor] = useState('#059669')

  useEffect(() => {
    if (!id) return

    // لود تم ذخیره شده
    const saved = localStorage.getItem('hina_theme')
    if (saved) setTheme(JSON.parse(saved))

    const s = io()
    socketRef.current = s

    const username = localStorage.getItem('hina_name') || `Player-${Math.random().toString(36).slice(2,6)}`
    // ارسال join با username
    s.emit('join', { roomId: id, username })

    s.on('init-game', d => {
      const g = new Chess(d.fen)
      setGame(g)
      setFen(d.fen)
      setPlayers(d.players || [])
      // اگر سرور myColor داد از اون استفاده کن، در غیر این صورت براساس players حدس بزن
      if (d.myColor) setMyColor(d.myColor)
      else {
        const me = (d.players || []).find(p => p.username === username)
        setMyColor(me ? me.color : 'spectator')
      }
      setStatus(d.status || 'waiting')
      setTimeLeft(d.timeLeft || { w:0, b:0 })
    })

    s.on('sync', d => {
      const g = new Chess(d.fen)
      setGame(g)
      setFen(d.fen)
      if (d.timeLeft) setTimeLeft(d.timeLeft)
      if (d.lastMove) playSound(d.lastMove)
    })

    s.on('player-update', (pl) => {
      setPlayers(pl || [])
    })

    s.on('chat-msg', m => setChat(prev => [...prev, m]))
    s.on('game-over', res => {
      setResult(res)
      setStatus('finished')
    })

    s.on('error', e => {
      console.error(e)
      // هدایت ملایم به لابی اگر خطا باشه
      // router.push('/dashboard')
    })

    return () => s.disconnect()
  }, [id])

  const onDrop = (source, target) => {
    // game.turn() => 'w' یا 'b'
    if (game.turn() !== myColor || status !== 'playing') return false
    try {
      const temp = new Chess(game.fen())
      const move = temp.move({ from: source, to: target, promotion: 'q' })
      if (!move) return false

      setGame(temp)
      setFen(temp.fen())
      socketRef.current.emit('move', { roomId: id, move: { from: source, to: target, promotion: 'q' } })
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

  const playSound = (move) => {
    const audioPath = (move.san && (move.san.includes('+') || move.san.includes('#'))) ? '/sounds/check.mp3' : '/sounds/move.mp3'
    try {
      const audio = new Audio(audioPath)
      audio.play().catch(() => {})
    } catch (e) {}
  }

  const changeTheme = (newTheme, persist = true) => {
    setTheme(newTheme)
    if (persist) localStorage.setItem('hina_theme', JSON.stringify(newTheme))
  }

  // helper: تبدیل هگز به rgba
  const hexToRgba = (hex, alpha=1) => {
    try {
      const h = hex.replace('#','')
      const bigint = parseInt(h.length === 3 ? h.split('').map(ch=>ch+ch).join('') : h, 16)
      const r = (bigint >> 16) & 255
      const g = (bigint >> 8) & 255
      const b = bigint & 255
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    } catch (e) {
      return `rgba(7, 89, 44, ${alpha})`
    }
  }

  if (status === 'loading') return <div className="flex-center" style={{ height: '100vh' }}>در حال اتصال به بازی...</div>

  const opponent = players.find(p => p.color !== myColor && p.color !== 'spectator') || { username: 'در انتظار حریف...' }
  const me = players.find(p => p.color === myColor) || { username: 'تماشاچی' }

  return (
    <div className="container game-grid" style={{ paddingTop: 20, paddingBottom: 40 }}>
      {/* SIDEBAR - SETTINGS */}
      <div className="card desktop-only">
        <h3 style={{ marginBottom: 15 }}>تنظیمات بازی</h3>
        <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => setShowSettings(!showSettings)}>
          🎨 شخصی‌سازی بورد
        </button>
        {showSettings && (
          <div style={{ display: 'flex', gap: 10, marginTop: 15, justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {/* تم بنفش (انتخاب سریع) */}
              <div onClick={() => changeTheme({ light: '#e0c0f8', dark: '#7c3aed' })} 
                   title="تم بنفش" 
                   style={{ width: 30, height: 30, background: '#7c3aed', borderRadius: '50%', cursor: 'pointer', border: '2px solid white' }} />
              {/* تم سبز (پیش‌فرض جدید) */}
              <div onClick={() => changeTheme({ light: '#ecfdf5', dark: '#059669' })} 
                   title="تم سبز (پیش‌فرض)" 
                   style={{ width: 30, height: 30, background: '#059669', borderRadius: '50%', cursor: 'pointer', border: '2px solid white' }} />
              {/* تم سوم: کاستوم رنگ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => {
                    setCustomColor(e.target.value)
                    const light = `${e.target.value}33` // نیمه شفاف برای خانه‌های روشن (مثال)
                    changeTheme({ light: '#ffffff', dark: e.target.value })
                  }}
                  title="انتخاب رنگ کاستوم"
                  style={{ width: 36, height: 36, border: 'none', padding: 0, cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 12 }}>کد رنگ:</div>
                  <div style={{ fontSize: 13, fontFamily: 'monospace' }}>{customColor.toUpperCase()}</div>
                </div>
              </div>
            </div>
          </div>
        )}
        <button className="btn btn-outline" 
                style={{ marginTop: 20, width: '100%', borderColor: 'var(--danger)', color: 'var(--danger)' }} 
                onClick={() => router.push('/dashboard')}>
          🏃 خروج از اتاق
        </button>
      </div>

      {/* MAIN BOARD AREA */}
      <div style={{ width: '100%', maxWidth: 600, margin: '0 auto' }}>
        <PlayerBar p={opponent} time={timeLeft[myColor === 'w' ? 'b' : 'w']} isMe={false} theme={theme} myColor={myColor} />

        <div style={{ boxShadow: `0 0 40px ${theme.dark}40`, borderRadius: 8, overflow: 'hidden', border: `4px solid ${theme.dark}20` }}>
          <Chessboard
            position={fen}
            onPieceDrop={onDrop}
            boardOrientation={myColor === 'b' ? 'black' : 'white'}
            customDarkSquareStyle={{ backgroundColor: theme.dark }}
            customLightSquareStyle={{ backgroundColor: theme.light }}
            animationDuration={300}
          />
        </div>

        <PlayerBar p={me} time={timeLeft[myColor === 'spectator' ? 'w' : myColor]} isMe theme={theme} myColor={myColor} />
      </div>

      {/* CHAT SECTION */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>
        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>گفتگو</h3>
        <div style={{ flex: 1, overflowY: 'auto', margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 8, padding: '0 5px' }}>
          {chat.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>هنوز پیامی ارسال نشده است.</p>}
          {chat.map((c, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 10, fontSize: '0.9rem' }}>
              <b style={{ color: 'var(--accent)' }}>{c.sender}:</b> {c.text}
            </div>
          ))}
        </div>
        <form onSubmit={sendChat} style={{ display: 'flex', gap: 5, marginTop: 'auto' }}>
          <input 
            value={msg} 
            onChange={e => setMsg(e.target.value)} 
            placeholder="چیزی بنویسید..." 
            style={{ flex: 1 }}
          />
          <button className="btn" style={{ width: '50px' }}>{'>'}</button>
        </form>
      </div>

      {/* RESULT MODAL */}
      {result && (
        <div className="flex-center" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
          <div className="card animate-in" style={{ textAlign: 'center', padding: 40, border: `2px solid ${result.winner === myColor ? 'var(--success)' : 'var(--danger)'}` }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: 10 }}>
              {result.winner === 'draw' ? '🤝 تساوی' : (result.winner === myColor ? '🎉 پیروزی!' : '💀 شکست')}
            </h1>
            <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: 30 }}>{result.reason}</p>
            <button className="btn" style={{ padding: '12px 40px' }} onClick={() => router.push('/dashboard')}>بازگشت به لابی</button>
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerBar({ p, time = 0, isMe = false, theme = { light: '#ecfdf5', dark: '#059669' }, myColor }) {
  const m = Math.floor(time / 60) || 0
  const s = Math.floor(time % 60) || 0
  const isLowTime = time < 30 && time > 0

  // نمایش بک‌گراند با alpha از theme.dark
  const bg = isMe ? (hexToRgbaClient(theme.dark, 0.12)) : 'rgba(255,255,255,0.03)'
  const border = isMe ? `1px solid ${theme.dark}` : '1px solid transparent'

  return (
    <div style={{
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      padding: '12px 15px', 
      background: bg, 
      borderRadius: 12, 
      margin: '12px 0',
      border,
      transition: 'all 0.3s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="avatar" style={{ 
          width: 35, 
          height: 35, 
          background: isMe ? theme.dark : '#444',
          fontSize: '1rem',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8
        }}>
          {p?.username?.[0]?.toUpperCase() || '?'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{p?.username || 'در انتظار...'}</span>
          <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{isMe ? 'شما' : 'حریف'}</span>
        </div>
      </div>
      
      <div style={{ 
        fontFamily: 'monospace', 
        fontSize: '1.4rem', 
        fontWeight: 'bold',
        color: isLowTime ? '#ef4444' : 'white',
        background: '#000',
        padding: '4px 12px',
        borderRadius: 8,
        minWidth: 80,
        textAlign: 'center',
        boxShadow: isLowTime ? '0 0 10px #ef4444' : 'none'
      }}>
        {m}:{s.toString().padStart(2, '0')}
      </div>
    </div>
  )
}

// helper client-side hex->rgba used inside PlayerBar
function hexToRgbaClient(hex, alpha=1) {
  try {
    const h = hex.replace('#','')
    const full = h.length === 3 ? h.split('').map(ch=>ch+ch).join('') : h
    const bigint = parseInt(full, 16)
    const r = (bigint >> 16) & 255
    const g = (bigint >> 8) & 255
    const b = bigint & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  } catch (e) {
    return `rgba(5,150,105,${alpha})`
  }
}
