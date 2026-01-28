import { useState } from 'react'
import ChessRoom from '../components/ChessRoom'
import { v4 as uuidv4 } from 'uuid'

export default function Home() {
  const [roomId, setRoomId] = useState('')
  const [inGame, setInGame] = useState(false)
  const [config, setConfig] = useState({ minutes: 10, increment: 0 })

  if (inGame) {
    return <ChessRoom roomId={roomId} config={config} onLeave={() => setInGame(false)} />
  }

  const create = () => {
    const id = uuidv4().slice(0, 6)
    setRoomId(id)
    setInGame(true)
  }

  return (
    <div className="container center" style={{ justifyContent: 'center' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
        <h1>Hina Chess ♟️</h1>
        <p style={{ color: '#94a3b8' }}>نسخه بهینه شده با پشتیبانی MongoDB</p>
        
        <div className="col" style={{ marginTop: 20 }}>
          <div className="flex">
            <select onChange={e => setConfig({...config, minutes: +e.target.value})}>
              <option value="5">۵ دقیقه</option>
              <option value="10" selected>۱۰ دقیقه</option>
              <option value="30">۳۰ دقیقه</option>
            </select>
            <select onChange={e => setConfig({...config, increment: +e.target.value})}>
              <option value="0">بدون افزایش</option>
              <option value="2">۲ ثانیه</option>
              <option value="5">۵ ثانیه</option>
            </select>
          </div>

          <button onClick={create}>ساخت اتاق جدید</button>
          <div style={{ margin: '10px 0', opacity: 0.5 }}>--- یا ---</div>
          <div className="flex">
            <input placeholder="کد اتاق..." value={roomId} onChange={e => setRoomId(e.target.value)} />
            <button onClick={() => roomId && setInGame(true)} disabled={!roomId}>ورود</button>
          </div>
        </div>
      </div>
    </div>
  )
}
