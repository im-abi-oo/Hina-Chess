import { useState } from 'react'
import dynamic from 'next/dynamic'
import { v4 as uuidv4 } from 'uuid'
const ChessRoom = dynamic(() => import('../components/ChessRoom'), { ssr: false })

export default function Home(){
  const [room, setRoom] = useState('')
  const [joined, setJoined] = useState(false)

  function createRoom(){
    const id = uuidv4().slice(0,8)
    setRoom(id)
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 style={{margin:0}}>Hina Chess — شطرنج دو نفره</h1>
          <div className="small">بدون دیتابیس — بازی بلادرنگ با Socket.IO</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div className="small">نام پروژه: <strong>Hina Chess</strong></div>
        </div>
      </div>

      {!joined ? (
        <div className="card">
          <div className="flex">
            <input placeholder="آیدی اتاق را وارد کنید یا بساز" value={room} onChange={e=>setRoom(e.target.value)} />
            <button onClick={()=>setJoined(true)} disabled={!room}>پیوستن</button>
            <button onClick={createRoom}>ایجاد اتاق جدید</button>
          </div>
          <p className="note">پس از ایجاد اتاق لینک را برای دوستتان بفرستید. اولین نفری که وارد شد سفید خواهد بود.</p>
        </div>
      ) : (
        <ChessRoom roomId={room} setRoomJoined={setJoined} />
      )}

      <div className="footer">نسخهٔ اولیه — Hina Chess</div>
    </div>
  )
}
