import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { io } from 'socket.io-client'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [rooms, setRooms] = useState([])
  const [createMode, setCreateMode] = useState(false)
  const [config, setConfig] = useState({ time: 10, color: 'random' })

  useEffect(() => {
    fetch('/api/auth/me').then(r=>r.json()).then(d => {
        if(!d.user) router.push('/auth')
        else setUser(d.user)
    })
    
    const socket = io()
    socket.emit('get-rooms')
    socket.on('lobby-update', setRooms)
    return () => socket.disconnect()
  }, [])

  const createGame = () => {
      const id = Math.random().toString(36).substr(2, 6)
      const socket = io()
      socket.emit('create-room', { roomId: id, config })
      router.push(`/game/${id}`)
  }

  if(!user) return null

  return (
    <div className="container" style={{paddingTop:30}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:30}}>
            <div className="flex-center" style={{gap:10}}>
                <div className="avatar" style={{width:50,height:50,fontSize:'1.5rem'}}>{user.username[0]}</div>
                <div>
                    <h3>{user.username}</h3>
                    <span style={{color:'var(--primary)'}}>ELO: {user.elo}</span>
                </div>
            </div>
            <button className="btn-outline" style={{width:'auto'}} onClick={()=>{fetch('/api/auth/logout',{method:'POST'}); router.push('/')}}>خروج</button>
        </div>

        <div className="game-grid">
            <div className="card">
                <h3>🎮 ساخت بازی</h3>
                <button className="btn" onClick={()=>setCreateMode(!createMode)} style={{marginTop:15, height:60, fontSize:'1.2rem'}}>بازی جدید +</button>
                
                {createMode && (
                    <div style={{marginTop:20, background:'rgba(0,0,0,0.3)', padding:15, borderRadius:10}}>
                        <label>زمان (دقیقه):</label>
                        <input type="number" value={config.time} onChange={e=>setConfig({...config, time:e.target.value})} style={{marginBottom:10}} />
                        <label>رنگ من:</label>
                        <select value={config.color} onChange={e=>setConfig({...config, color:e.target.value})} style={{width:'100%', padding:10, borderRadius:8, background:'rgba(0,0,0,0.5)', color:'white', border:'1px solid #333'}}>
                            <option value="random">تصادفی</option>
                            <option value="white">سفید</option>
                            <option value="black">سیاه</option>
                        </select>
                        <button className="btn" onClick={createGame} style={{marginTop:15}}>شروع</button>
                    </div>
                )}
            </div>

            <div className="card">
                <h3>🌍 اتاق‌های فعال</h3>
                <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:15}}>
                    {rooms.length===0 && <p style={{color:'#6b7280'}}>هیچ بازی فعالی وجود ندارد.</p>}
                    {rooms.map(r => (
                        <div key={r.id} style={{display:'flex', justifyContent:'space-between', padding:10, background:'rgba(255,255,255,0.05)', borderRadius:8}}>
                            <span>اتاق {r.id} ({r.config.time} min)</span>
                            <button className="btn-outline" style={{width:'auto', padding:'5px 10px'}} onClick={()=>router.push(`/game/${r.id}`)}>پیوستن</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  )
}
