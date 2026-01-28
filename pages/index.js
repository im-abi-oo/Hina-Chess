import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { v4 as uuidv4 } from 'uuid'
import { useRouter } from 'next/router'

const ChessRoom = dynamic(() => import('../components/ChessRoom'), { ssr: false })

export default function Home() {
  const router = useRouter()
  const [roomId, setRoomId] = useState('')
  const [inGame, setInGame] = useState(false)
  
  // Game Settings
  const [timeMin, setTimeMin] = useState(10)
  const [increment, setIncrement] = useState(0)

  useEffect(() => {
    if (router.query.room) {
      setRoomId(router.query.room)
    }
  }, [router.query])

  function handleCreate() {
    const id = uuidv4().slice(0, 8)
    // انتقال تنظیمات از طریق URL یا State داخلی (اینجا از Props استفاده می‌کنیم وقتی کامپوننت لود شود)
    // اما چون Next.js مسیریابی دارد، ما در URL پارامتر نمی‌گذاریم تا تمیز بماند
    // تنظیمات را در ChessRoom پاس می‌دهیم
    setRoomId(id)
    
    // آپدیت URL بدون رفرش
    const url = new URL(window.location.href)
    url.searchParams.set('room', id)
    window.history.pushState({}, '', url)
    
    setInGame(true)
  }

  function handleJoin() {
    if (!roomId) return
    setInGame(true)
  }

  if (inGame) {
    return (
      <ChessRoom 
        roomId={roomId} 
        onLeave={() => { setInGame(false); setRoomId(''); window.history.replaceState({}, '', '/'); }}
        config={{ minutes: parseInt(timeMin), increment: parseInt(increment) }}
      />
    )
  }

  return (
    <div className="container" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="card" style={{ width: '100%', maxWidth: '450px', textAlign: 'center' }}>
        <div className="brand" style={{ marginBottom: 24 }}>
          <h1>Hina Chess</h1>
          <span>شطرنج آنلاین حرفه‌ای</span>
        </div>

        {!router.query.room ? (
          <>
            <div style={{ textAlign: 'right', marginBottom: 16 }}>
              <label className="text-small">زمان بازی (دقیقه)</label>
              <select value={timeMin} onChange={e => setTimeMin(e.target.value)} style={{ marginBottom: 12 }}>
                <option value="1">۱ دقیقه (Bullet)</option>
                <option value="3">۳ دقیقه (Blitz)</option>
                <option value="5">۵ دقیقه (Blitz)</option>
                <option value="10">۱۰ دقیقه (Rapid)</option>
                <option value="30">۳۰ دقیقه (Classical)</option>
              </select>

              <label className="text-small">زمان افزایشی (ثانیه)</label>
              <select value={increment} onChange={e => setIncrement(e.target.value)}>
                <option value="0">بدون افزایش</option>
                <option value="1">۱ ثانیه</option>
                <option value="2">۲ ثانیه</option>
                <option value="5">۵ ثانیه</option>
              </select>
            </div>
            
            <button onClick={handleCreate} className="w-full" style={{ fontSize: '1.1rem', padding: 14 }}>
              ساخت اتاق جدید
            </button>
            
            <div className="text-small" style={{ margin: '20px 0' }}>— یا —</div>
            
            <div className="flex">
              <input 
                placeholder="کد اتاق..." 
                value={roomId} 
                onChange={e => setRoomId(e.target.value)}
              />
              <button onClick={handleJoin} disabled={!roomId}>پیوستن</button>
            </div>
          </>
        ) : (
          <div className="flex-col">
            <p>شما دعوت شده‌اید به بازی در اتاق:</p>
            <code style={{ background: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 6, fontSize: '1.2rem' }}>{roomId}</code>
            <button onClick={handleJoin} className="w-full" style={{ marginTop: 12 }}>ورود به بازی</button>
          </div>
        )}
      </div>
      <div className="text-small" style={{ marginTop: 24, opacity: 0.6 }}>نسخه ۲.۰ • بازنویسی کامل</div>
    </div>
  )
}
