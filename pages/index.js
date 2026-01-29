import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { v4 as uuidv4 } from 'uuid'
import io from 'socket.io-client'

const ChessRoom = dynamic(() => import('../components/ChessRoom'), { 
    ssr: false,
    loading: () => <div className="flex-center" style={{height:'100vh'}}>در حال بارگذاری...</div>
})

export default function Home() {
  const [view, setView] = useState('auth') 
  const [user, setUser] = useState(null)
  const [roomId, setRoomId] = useState('')
  const [activeRooms, setActiveRooms] = useState([])
  
  const [authMode, setAuthMode] = useState('login')
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [isLoading, setIsLoading] = useState(false)
  const [lobbySocket, setLobbySocket] = useState(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(data => {
        if(data.user) { setUser(data.user); setView('lobby'); }
    })
  }, [])

  useEffect(() => {
    if(view === 'lobby') {
        const s = io()
        setLobbySocket(s)
        s.on('lobby-update', setActiveRooms)
        return () => s.disconnect()
    }
  }, [view])

  const handleAuth = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    const res = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    })
    const data = await res.json()
    setIsLoading(false)
    if(data.ok) { setUser(data.user); setView('lobby'); } 
    else alert(data.error)
  }

  const joinGame = (id) => { setRoomId(id); setView('game'); }

  if(view === 'game') return <ChessRoom roomId={roomId} user={user} onLeave={()=>setView('lobby')} />

  if(view === 'auth') return (
      <div className="container flex-center">
          <div className="card" style={{width: '100%', maxWidth: 400}}>
              <h1 style={{textAlign:'center', fontSize:'2.5rem', marginBottom:10}}>Hina Chess</h1>
              <p style={{textAlign:'center', color:'var(--text-muted)'}}>حرفه‌ای‌ترین پلتفرم شطرنج آنلاین</p>
              
              <form onSubmit={handleAuth} style={{display:'flex', flexDirection:'column', gap:15, marginTop:30}}>
                  <input placeholder="نام کاربری" onChange={e=>setFormData({...formData, username: e.target.value})} required />
                  <input type="password" placeholder="رمز عبور" onChange={e=>setFormData({...formData, password: e.target.value})} required />
                  <button className="btn" disabled={isLoading}>{isLoading ? '...' : (authMode==='login'?'ورود':'ثبت نام')}</button>
              </form>
              <div style={{textAlign:'center', marginTop:20, cursor:'pointer', color:'var(--primary)'}} onClick={()=>setAuthMode(authMode==='login'?'register':'login')}>
                  {authMode==='login' ? 'حساب ندارید؟ ثبت نام کنید' : 'وارد شوید'}
              </div>
          </div>
      </div>
  )

  return (
      <div className="container">
          <header className="flex-center" style={{justifyContent:'space-between', marginBottom:30}}>
              <div className="flex-center" style={{gap:10}}>
                  <div className="avatar" style={{fontSize:'1.2rem'}}>{user.username[0]}</div>
                  <div>
                      <div style={{fontWeight:'bold'}}>{user.username}</div>
                      <div style={{fontSize:'0.8rem', color:'var(--success)'}}>آنلاین</div>
                  </div>
              </div>
              <button className="btn-outline" onClick={()=>{fetch('/api/auth/logout',{method:'POST'}); setView('auth')}}>خروج</button>
          </header>

          <div style={{display:'grid', gap:20, gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))'}}>
              <div className="card">
                  <h2>🎮 شروع سریع</h2>
                  <button className="btn" onClick={()=>{const id=uuidv4().slice(0,6); lobbySocket.emit('create-room',{roomId:id}); joinGame(id)}} style={{height:60, fontSize:'1.2rem'}}>
                      ساخت اتاق جدید
                  </button>
                  <div style={{display:'flex', gap:10, marginTop:20}}>
                      <input placeholder="کد اتاق..." value={roomId} onChange={e=>setRoomId(e.target.value)} />
                      <button className="btn btn-outline" style={{width:'auto'}} onClick={()=>joinGame(roomId)}>ورود</button>
                  </div>
              </div>

              <div className="card">
                  <div className="flex-center" style={{justifyContent:'space-between'}}>
                      <h2>🌍 اتاق‌های فعال</h2>
                      <button className="btn-icon" onClick={()=>lobbySocket.emit('get-rooms')}>⟳</button>
                  </div>
                  <div style={{maxHeight:300, overflowY:'auto', display:'flex', flexDirection:'column', gap:10}}>
                      {activeRooms.length === 0 && <p style={{textAlign:'center', color:'var(--text-muted)'}}>هیچ اتاقی فعال نیست.</p>}
                      {activeRooms.map(r => (
                          <div key={r.id} style={{padding:12, background:'rgba(255,255,255,0.05)', borderRadius:10, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                              <div>
                                  <span style={{fontFamily:'monospace', color:'var(--primary)'}}>#{r.id}</span>
                                  <span style={{marginLeft:10, fontSize:'0.8rem', opacity:0.7}}>{r.players}/2</span>
                              </div>
                              <button className="btn-outline" style={{padding:'5px 10px', fontSize:'0.8rem'}} onClick={()=>joinGame(r.id)}>پیوستن</button>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
          <footer style={{textAlign:'center', marginTop:50, color:'var(--text-muted)', fontSize:'0.8rem'}}>
              Design & Built by <b>im_abi</b> | v3.0 Pro
          </footer>
      </div>
  )
}
