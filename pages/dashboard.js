import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { io } from 'socket.io-client'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [activeRooms, setActiveRooms] = useState([])
  
  // تنظیمات ساخت بازی
  const [modalOpen, setModalOpen] = useState(false)
  const [gameConfig, setGameConfig] = useState({ time: 10, color: 'random' })

  useEffect(() => {
    // چک کردن لاگین
    fetch('/api/auth/me').then(r => r.json()).then(data => {
        if(!data.user) router.push('/auth')
        else setUser(data.user)
    })
    
    // سوکت لابی
    const socket = io()
    socket.on('lobby-update', setActiveRooms)
    socket.emit('get-rooms')
    return () => socket.disconnect()
  }, [])

  const createGame = () => {
      const roomId = Math.random().toString(36).substring(2, 8);
      // ارسال تنظیمات به سرور (باید سوکت هندلر این را دریافت کند)
      const socket = io()
      socket.emit('create-room', { roomId, config: gameConfig })
      
      // هدایت به صفحه بازی با ID مشخص
      router.push(`/game/${roomId}`)
  }

  if(!user) return null

  return (
    <div className="container" style={{paddingTop: 40}}>
      <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:40}}>
          <div className="flex-center" style={{gap:15}}>
              <div className="avatar" style={{width:60, height:60, fontSize:'1.5rem'}}>{user.username[0]}</div>
              <div>
                  <h2 style={{margin:0}}>{user.username}</h2>
                  <span style={{color:'var(--primary)'}}>ELO: {user.elo}</span>
              </div>
          </div>
          <button className="btn-outline" onClick={()=>{fetch('/api/auth/logout',{method:'POST'}); router.push('/')}}>خروج</button>
      </header>

      <div className="game-grid">
          {/* بخش بازی جدید */}
          <div className="card">
              <h3>🔥 شروع بازی</h3>
              <button className="btn" onClick={() => setModalOpen(true)} style={{height: 80, fontSize:'1.3rem', marginTop:20}}>
                  ساخت اتاق جدید
              </button>
              
              {modalOpen && (
                  <div style={{marginTop: 20, padding: 15, background:'rgba(0,0,0,0.3)', borderRadius:15}}>
                      <label style={{display:'block', marginBottom:5}}>زمان بازی (دقیقه):</label>
                      <input type="number" value={gameConfig.time} onChange={e=>setGameConfig({...gameConfig, time:e.target.value})} />
                      
                      <label style={{display:'block', margin:'10px 0 5px'}}>رنگ شما:</label>
                      <select value={gameConfig.color} onChange={e=>setGameConfig({...gameConfig, color:e.target.value})} style={{width:'100%'}}>
                          <option value="random">تــصادفی 🎲</option>
                          <option value="white">سفید ⚪</option>
                          <option value="black">سیاه ⚫</option>
                      </select>
                      
                      <button className="btn" onClick={createGame} style={{marginTop:15}}>ایجاد اتاق</button>
                      <button className="btn-outline" onClick={()=>setModalOpen(false)} style={{marginTop:10}}>انصراف</button>
                  </div>
              )}
          </div>

          {/* لیست اتاق‌ها */}
          <div className="card">
              <h3>🌍 بازی‌های فعال</h3>
              <div style={{marginTop:20, display:'flex', flexDirection:'column', gap:10}}>
                  {activeRooms.length === 0 && <p className="text-muted">اتاقی یافت نشد.</p>}
                  {activeRooms.map(room => (
                      <div key={room.id} style={{display:'flex', justifyContent:'space-between', background:'rgba(255,255,255,0.05)', padding:10, borderRadius:10}}>
                          <span>اتاق {room.id}</span>
                          <button className="btn-outline" style={{padding:'5px 15px'}} onClick={()=>router.push(`/game/${room.id}`)}>تماشا / بازی</button>
                      </div>
                  ))}
              </div>
          </div>
          
          {/* بخش دوستان (می‌توانید تکمیل کنید) */}
          <div className="card">
              <h3>👥 دوستان</h3>
              <p style={{fontSize:'0.9rem', color:'var(--text-muted)'}}>لیست دوستان شما خالی است.</p>
          </div>
      </div>
    </div>
  )
}
