import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { v4 as uuidv4 } from 'uuid'
import io from 'socket.io-client'

// Dynamic import with loading state
const ChessRoom = dynamic(() => import('../components/ChessRoom'), { 
    ssr: false,
    loading: () => <div className="container center">در حال بارگذاری صفحه شطرنج...</div>
})

export default function Home() {
  const [view, setView] = useState('auth') // auth, lobby, game
  const [user, setUser] = useState(null)
  const [roomId, setRoomId] = useState('')
  const [activeRooms, setActiveRooms] = useState([])
  
  // Auth Form State
  const [authMode, setAuthMode] = useState('login')
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)

  // Socket for Lobby
  const [lobbySocket, setLobbySocket] = useState(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(data => {
        if(data.user) {
            setUser(data.user)
            setView('lobby')
        }
    })
  }, [])

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

  function createGame() {
    const id = uuidv4().slice(0, 6)
    // Removed 'type' config as we only have human now
    lobbySocket.emit('create-room', { roomId: id, config: { public: true, time: 10 } })
    setRoomId(id)
    setView('game')
  }

  function joinGame(id) {
      if(!id) return
      setRoomId(id)
      setView('game')
  }

  if (view === 'game') {
      return <ChessRoom roomId={roomId} user={user} onLeave={() => setView('lobby')} />
  }

  if (view === 'auth') {
      return (
          <div className="container center" style={{background: 'radial-gradient(circle at center, #1e1b4b 0%, #000 100%)'}}>
              <div className="card col" style={{width: '100%', maxWidth: 350, borderTop: '4px solid var(--primary)'}}>
                  <h1 style={{textAlign:'center', fontSize: '2.5rem', marginBottom: 10}}>Hina Chess</h1>
                  <p style={{textAlign:'center', color:'var(--text-muted)', marginTop: -15}}>بازی شطرنج آنلاین سریع</p>
                  
                  <form onSubmit={handleAuth} className="col" style={{marginTop: 20}}>
                      <input placeholder="نام کاربری" onChange={e => setFormData({...formData, username: e.target.value})} required />
                      <input type="password" placeholder="رمز عبور" onChange={e => setFormData({...formData, password: e.target.value})} required />
                      <button className="btn" disabled={loading} style={{marginTop: 10}}>
                          {loading ? '...' : (authMode === 'login' ? 'ورود' : 'ثبت نام')}
                      </button>
                  </form>
                  <div style={{textAlign:'center', marginTop: 15, cursor:'pointer', color:'var(--primary)'}} onClick={() => setAuthMode(authMode==='login'?'register':'login')}>
                      {authMode === 'login' ? 'حساب ندارید؟ ثبت نام کنید' : 'حساب دارید؟ وارد شوید'}
                  </div>
              </div>
              <div className="copyright" style={{position:'absolute', bottom: 10}}>&copy; Built by <b>im_abi</b></div>
          </div>
      )
  }

  // LOBBY VIEW
  return (
    <div className="container">
        {/* Lobby Header */}
        <div className="flex between" style={{marginBottom: 30, padding: '10px 0'}}>
            <div className="flex">
                <div className="avatar" style={{background:'var(--primary)', fontSize: 18}}>
                    {user.username[0].toUpperCase()}
                </div>
                <div>
                    <div style={{fontWeight:'bold', fontSize: '1.1rem'}}>{user.username}</div>
                    <div style={{fontSize:'0.8rem', color:'var(--success)'}}>● Online</div>
                </div>
            </div>
            <button className="btn-outline btn-sm" onClick={() => { fetch('/api/auth/logout', {method:'POST'}); setView('auth'); }}>خروج</button>
        </div>

        <div style={{display:'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))'}}>
            {/* Create Game Section */}
            <div className="card col">
                <h2>شروع بازی جدید</h2>
                <button className="btn" onClick={createGame} style={{height: 70, fontSize: '1.2rem', display:'flex', alignItems:'center', justifyContent:'center', gap: 10}}>
                    <span>⚔️</span> ساخت اتاق بازی
                </button>
                
                <div style={{marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 20}}>
                    <label style={{fontSize:'0.9rem', color:'var(--text-muted)', marginBottom: 5, display:'block'}}>ورود با کد اتاق:</label>
                    <div className="flex">
                        <input placeholder="مثلاً: a4f2b1" value={roomId} onChange={e=>setRoomId(e.target.value)} />
                        <button className="btn btn-outline" onClick={() => joinGame(roomId)}>ورود</button>
                    </div>
                </div>
            </div>

            {/* Active Rooms Section */}
            <div className="card col" style={{minHeight: 300}}>
                <div className="flex between">
                    <h3>اتاق‌های فعال</h3>
                    <button className="btn-icon" style={{width:30, height:30, background:'transparent'}} onClick={()=>lobbySocket.emit('get-rooms')}>🔄</button>
                </div>
                
                <div className="col" style={{overflowY:'auto', maxHeight: 300, paddingRight: 5}}>
                    {activeRooms.length === 0 ? (
                        <div className="center" style={{height: 100, color: 'var(--text-muted)', flexDirection:'column'}}>
                            <span>📭</span>
                            <p>هیچ اتاقی پیدا نشد</p>
                        </div>
                    ) : (
                        activeRooms.map(r => (
                            <div key={r.id} className="flex between" style={{padding:12, background:'rgba(255,255,255,0.03)', borderRadius:10, border:'1px solid var(--border)'}}>
                                <div className="col" style={{gap:2}}>
                                    <span style={{fontWeight:'bold', fontFamily:'monospace', color:'var(--primary)'}}>#{r.id}</span>
                                    <span style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>{r.players}/2 بازیکن</span>
                                </div>
                                <button className="btn-outline btn-sm" onClick={() => joinGame(r.id)}>
                                    {r.players < 2 ? 'پیوستن' : 'تماشا'}
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        <div className="copyright">&copy; 2026 Hina Chess | Built with ❤️ by <b>im_abi</b></div>
    </div>
  )
}
