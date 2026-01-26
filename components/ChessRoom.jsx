import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'

let socket = null

export default function ChessRoom({ roomId, setRoomJoined }) {
  const [role, setRole] = useState('spectator') // 'white' | 'black' | 'spectator'
  const [fen, setFen] = useState('start')
  const gameRef = useRef(null)
  const [chat, setChat] = useState([])
  const [msg, setMsg] = useState('')
  const [players, setPlayers] = useState([])
  const [status, setStatus] = useState('waiting')
  const [orientation, setOrientation] = useState('white')
  const [capturedWhite, setCapturedWhite] = useState([])
  const [capturedBlack, setCapturedBlack] = useState([])
  const [moveHistory, setMoveHistory] = useState([])
  const [timeLeft, setTimeLeft] = useState({ white: 5*60, black: 5*60 }) // default 5 minutes each
  const timerRef = useRef(null)
  const myColorRef = useRef(null)

  useEffect(() => {
    if (!roomId) return
    gameRef.current = new Chess()
    if (!socket) socket = io()

    socket.emit('join', roomId, (res) => {
      if (!res.ok) {
        alert('خطا هنگام پیوستن: ' + (res.reason || ''))
        return
      }
      setRole(res.role || 'spectator')
      myColorRef.current = res.role
      setStatus('joined')
      setOrientation(res.role === 'black' ? 'black' : 'white')
    })

    socket.on('room-update', (data) => {
      setPlayers(data.players || [])
      // if both players present, start
      if ((data.players || []).length >= 2) {
        setStatus('playing')
      } else {
        setStatus('waiting')
      }
    })

    socket.on('move', (move) => {
      const result = gameRef.current.move(move)
      if (result) {
        setFen(gameRef.current.fen())
        setMoveHistory(gameRef.current.history({ verbose: true }))
        updateCaptured()
        // no timer sync from server — clients control timers locally
      }
    })

    socket.on('chat', (m) => {
      setChat(c => [...c, { from: 'opponent', text: m.message }])
    })

    socket.on('reset', () => {
      gameRef.current.reset()
      setFen(gameRef.current.fen())
      setMoveHistory([])
      setCapturedWhite([])
      setCapturedBlack([])
      setTimeLeft({ white: 5*60, black: 5*60 })
      setStatus('waiting')
      stopTimer()
    })

    socket.on('player-left', ({ leftSocketId, players }) => {
      setPlayers(players || [])
      setStatus('waiting')
    })

    socket.on('resign', ({ by, color }) => {
      setStatus('resigned')
      alert('بازیکن ' + (color || '') + ' تسلیم شد.')
    })

    return () => {
      if (socket) {
        socket.disconnect()
        socket = null
      }
      stopTimer()
    }
  }, [roomId])

  function updateCaptured(){
    const history = gameRef.current.history({ verbose: true })
    const captured = { w: [], b: [] }
    // naive: reconstruct from captured pieces by comparing initial and current board
    // chess.js doesn't expose captured directly, but we can track from history
    // simpler: check last move if it was a capture and push
    for(const m of history){
      if(m.captured){
        if(m.color === 'w') captured.b.push(m.captured)
        else captured.w.push(m.captured)
      }
    }
    setCapturedWhite(captured.w)
    setCapturedBlack(captured.b)
  }

  function onDropHandler(sourceSquare, targetSquare) {
    // only allow moves if playing and it's your turn
    if (role === 'spectator') return false
    const turn = gameRef.current.turn() === 'w' ? 'white' : 'black'
    if ((turn !== role) && role !== 'spectator') {
      return false
    }
    const move = { from: sourceSquare, to: targetSquare, promotion: 'q' }
    const result = gameRef.current.move(move)
    if (result) {
      setFen(gameRef.current.fen())
      setMoveHistory(gameRef.current.history({ verbose: true }))
      updateCaptured()
      socket.emit('move', { roomId, move })
      // start opponent timer locally
      startTimerForOpposite()
      return true
    }
    return false
  }

  function sendChat(){
    if(!msg) return
    setChat(c=>[...c, { from: 'me', text: msg }])
    socket.emit('chat', { roomId, message: msg })
    setMsg('')
  }

  function resetGame(){
    if(confirm('آیا می‌خواهید بازی را بازنشانی کنید؟')) {
      socket.emit('reset', roomId)
    }
  }

  function resign(){
    if(!confirm('آیا می‌خواهید تسلیم شوید؟')) return
    socket.emit('resign', roomId, role)
  }

  // simple timers: decrement active player's time every second
  function startTimerForOpposite(){
    stopTimer()
    timerRef.current = setInterval(()=>{
      setTimeLeft(prev=>{
        const turn = gameRef.current.turn() === 'w' ? 'white' : 'black'
        const next = {...prev}
        next[turn] = Math.max(0, next[turn] - 1)
        if(next[turn] === 0){
          stopTimer()
          setStatus('timeout')
          alert(turn + ' زمانش تمام شد.')
        }
        return next
      })
    },1000)
  }
  function stopTimer(){ if(timerRef.current){ clearInterval(timerRef.current); timerRef.current=null } }

  function formatTime(s){
    const m = Math.floor(s/60).toString().padStart(2,'0')
    const sec = (s%60).toString().padStart(2,'0')
    return `${m}:${sec}`
  }

  return (
    <div style={{display:'flex',gap:20}}>
      <div style={{flex:1}}>
        <div className="card" style={{padding:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <strong>اتاق:</strong> {roomId} &nbsp; <span className="small">نقش: {role}</span>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button onClick={resetGame}>بازنشانی</button>
              {role !== 'spectator' && <button onClick={resign}>تسلیم</button>}
              <button onClick={()=>{ setRoomJoined(false); if(socket){ socket.disconnect(); socket=null } }}>خروج</button>
            </div>
          </div>

          <div style={{display:'flex',gap:24,marginTop:12}}>
            <div>
              <div style={{marginBottom:8, textAlign:'center'}}>سفید <div className="small">{formatTime(timeLeft.white)}</div></div>
              <Chessboard
                position={fen}
                onPieceDrop={(sourceSquare, targetSquare) => onDropHandler(sourceSquare, targetSquare)}
                boardOrientation={orientation}
                arePiecesDraggable={status === 'playing' || role !== 'spectator'}
                customBoardStyle={{ width: 480 }}
              />
              <div style={{marginTop:8}} className="small">تاریخچه حرکت‌ها:</div>
              <div className="note" style={{maxHeight:120,overflow:'auto',padding:8}}>
                {moveHistory.map((m,i)=>(
                  <div key={i}>{i+1}. {m.san}</div>
                ))}
              </div>
            </div>

            <div style={{width:320}}>
              <div className="card" style={{padding:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div><strong>بازیکنان</strong></div>
                  <div className="small">حاضر: {players.length}</div>
                </div>
                <div style={{marginTop:8}}>
                  <div className="small">سفید گرفته‌ها: {capturedWhite.join(', ') || '-'}</div>
                  <div className="small">سیاه گرفته‌ها: {capturedBlack.join(', ') || '-'}</div>
                </div>
              </div>

              <div className="card" style={{marginTop:12,padding:12}}>
                <strong>چت</strong>
                <div className="chat-box" style={{marginTop:8}}>
                  {chat.map((c,i)=>(
                    <div key={i} style={{marginBottom:6}}>
                      <b>{c.from}:</b> {c.text}
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',gap:8,marginTop:8}}>
                  <input value={msg} onChange={(e)=>setMsg(e.target.value)} placeholder="پیام..." />
                  <button onClick={sendChat}>ارسال</button>
                </div>
              </div>

              <div className="card" style={{marginTop:12,padding:12}}>
                <div className="small">وضعیت: {status}</div>
                <div style={{marginTop:8}} className="small">نکته: این پروژه برای آزمایش و اجرا محلی ساخته شده و دیتابیسی ندارد.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
