import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { v4 as uuidv4 } from 'uuid'
import io from 'socket.io-client'

const ChessRoom = dynamic(() => import('../components/ChessRoom'), { ssr: false })

export default function Home() {
  const [view, setView] = useState('auth') // auth, lobby, game
  const [user, setUser] = useState(null)
  const [roomId, setRoomId] = useState('')
  const [activeRooms, setActiveRooms] = useState([])
  const [isBot, setIsBot] = useState(false)
  
  // Auth Form State
  const [authMode, setAuthMode] = useState('login')
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)

  // Socket for Lobby
  const [lobbySocket, setLobbySocket] = useState(null)

  // Check login on load
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(data => {
        if(data.user) {
            setUser(data.user)
            setView('lobby')
        }
    })
  }, [])

  // Connect to lobby when logged in
  useEffect(() => {
    if(view === 'lobby') {
        const s = io()
        setLobbySocket(s)
        s.on('lobby-update', (rooms) => setActiveRooms(rooms))
        return () => s.disconnect()
    }
  }, [view])

  async function handleAuth(e) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    })
    const data = await res.json()
    setLoading(false)
    if(data.ok) {
        setUser(data.user)
        setView('lobby')
    } else {
        alert(data.error)
    }
  }

  function createGame(vsBot = false) {
    if(vsBot) {
        setRoomId('bot-' + uuidv4().slice(0,4))
        setIsBot(true)
        setView('game')
        return
    }
    const id = uuidv4().slice(0, 6)
    lobbySocket.emit('create-room', { roomId: id, config: { public: true, time: 10 } })
    setRoomId(id)
    setIsBot(false)
    setView('game')
  }

  function joinGame(id) {
      setRoomId(id)
      setIsBot(false)
      setView('game')
  }

  if (view === 'game') {
      return <ChessRoom roomId={roomId} user={user} isBot={isBot} onLeave={() => setView('lobby')} />
  }

  if (view === 'auth') {
      return (
          <div className="container center">
              <div className="card col" style={{width: 350}}>
                  <h1 style={{textAlign:'center', background:'linear-gradient(to right, #6366f1, #ec4899)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Hina Chess</h1>
                  <form onSubmit={handleAuth} className="col">
                      <input placeholder="نام کاربری" onChange={e => setFormData({...formData, username: e.target.value})} required />
                      <input type="password" placeholder="رمز عبور" onChange={e => setFormData({...formData, password: e.target.value})} required />
                      <button className="btn" disabled={loading}>{loading ? '...' : (authMode === 'login' ? 'ورود' : 'ثبت نام')}</button>
                  </form>
                  <div style={{textAlign:'center', fontSize:'0.9rem', cursor:'pointer', color:'var(--primary)'}} onClick={() => setAuthMode(authMode==='login'?'register':'login')}>
                      {authMode === 'login' ? 'حساب ندارید؟ ثبت نام' : 'ورود به حساب'}
                  </div>
              </div>
          </div>
      )
  }

  // LOBBY VIEW
  return (
    <div className="container">
        <div className="header flex between" style={{marginBottom: 40}}>
            <div className="flex">
                <div style={{width:40, height:40, background:'var(--primary)', borderRadius:'50%', display:'grid', placeItems:'center', fontWeight:'bold', fontSize:20}}>
                    {user.username[0].toUpperCase()}
                </div>
                <div>
                    <div style={{fontWeight:'bold'}}>{user.username}</div>
                    <div style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>ELO: {user.elo || 1200}</div>
                </div>
            </div>
            <button className="btn-outline" onClick={() => { fetch('/api/auth/logout', {method:'POST'}); setView('auth'); }}>خروج</button>
        </div>

        <div className="game-grid">
            <div className="card col">
                <h2>شروع بازی</h2>
                <button className="btn" onClick={() => createGame(false)} style={{height: 60, fontSize: '1.2rem'}}>🎮 ساخت اتاق آنلاین</button>
                <button className="btn btn-outline" onClick={() => createGame(true)}>🤖 بازی با هوش مصنوعی (Stockfish)</button>
                
                <div style={{marginTop: 20}}>
                    <h3>پیوستن با کد</h3>
                    <div className="flex">
                        <input placeholder="کد اتاق..." value={roomId} onChange={e=>setRoomId(e.target.value)} />
                        <button className="btn" onClick={() => joinGame(roomId)}>ورود</button>
                    </div>
                </div>
            </div>

            <div className="card">
                <h3>اتاق‌های فعال</h3>
                {activeRooms.length === 0 ? <p className="text-muted">اتاقی یافت نشد.</p> : (
                    <div className="col">
                        {activeRooms.map(r => (
                            <div key={r.id} className="flex between" style={{padding:10, background:'rgba(255,255,255,0.05)', borderRadius:8}}>
                                <div>
                                    <b>{r.id}</b>
                                    <span style={{fontSize:'0.8rem', marginLeft:8, opacity:0.7}}>{r.players}/2 نفر</span>
                                </div>
                                <button className="btn-outline" style={{padding:'4px 10px'}} onClick={() => joinGame(r.id)}>تماشا / بازی</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    </div>
  )
}
