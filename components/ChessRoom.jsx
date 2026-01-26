import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { io } from 'socket.io-client'

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), { ssr: false })

let socket = null

export default function ChessRoom({ roomId, setRoomJoined }) {
  const containerRef = useRef(null)
  const [role, setRole] = useState('spectator')
  const [fen, setFen] = useState('start')
  const [moveHistory, setMoveHistory] = useState([])
  const [chat, setChat] = useState([])
  const [msg, setMsg] = useState('')
  const [players, setPlayers] = useState([])
  const [status, setStatus] = useState('waiting')
  const [orientation, setOrientation] = useState('white')
  const [timeLeft, setTimeLeft] = useState({ white: 300, black: 300 })
  const [turn, setTurn] = useState('white')
  const localClientIdRef = useRef(null)
  const chatBoxRef = useRef(null)
  const [boardWidth, setBoardWidth] = useState(420)

  useEffect(() => {
    function measure() {
      const w = containerRef.current ? containerRef.current.clientWidth : 480
      const width = Math.min(520, Math.max(300, Math.floor(w * 0.6)))
      setBoardWidth(width)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    if (!roomId) return
    let clientId = localStorage.getItem('hina_cid')
    if (!clientId) {
      clientId = crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
      localStorage.setItem('hina_cid', clientId)
    }
    localClientIdRef.current = clientId

    if (!socket) socket = io()

    socket.emit('join', { roomId, clientId }, (res) => {
      if (!res || !res.ok) {
        alert('خطا هنگام پیوستن: ' + (res && res.reason ? res.reason : 'unknown'))
        return
      }
      const assignedRole = res.role || 'spectator'
      setRole(assignedRole)
      setOrientation(assignedRole === 'black' ? 'black' : 'white')
      if (res.state) applyState(res.state)
    })

    socket.on('state', (s) => { if (s) applyState(s) })
    socket.on('time', (t) => setTimeLeft(t))
    socket.on('chat', (m) => {
      setChat(c => [...c, { from: m.from, text: m.message, ts: m.ts }])
    })
    socket.on('player-left', ({ clientId: leftClientId, players: roomPlayers }) => {
      setPlayers(roomPlayers || [])
      setStatus('waiting')
    })
    socket.on('resign', ({ by, color }) => {
      setStatus('resigned')
      alert(`بازیکن ${color} تسلیم شد.`)
    })
    socket.on('move', (m) => {
      // moves are applied via state updates; state handler will set fen/history
    })

    return () => {
      if (socket) {
        socket.disconnect()
        socket = null
      }
    }
  }, [roomId])

  useEffect(() => {
    // auto-scroll chat to bottom
    if (!chatBoxRef.current) return
    chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight
  }, [chat])

  function applyState(state) {
    if (!state) return
    setFen(state.fen || 'start')
    setMoveHistory(state.history || [])
    setPlayers(state.players || [])
    setStatus(state.status || 'waiting')
    setTimeLeft(state.timeLeft || { white: 300, black: 300 })
    setTurn(state.turn || 'white')

    const me = state.players && state.players.find(p => p.clientId === localClientIdRef.current)
    const roleNow = me ? me.color : 'spectator'
    setRole(roleNow)
    setOrientation(roleNow === 'black' ? 'black' : 'white')
  }

  function onPieceDrop(sourceSquare, targetSquare) {
    if (role === 'spectator') return false
    if (role !== turn) return false
    const move = { from: sourceSquare, to: targetSquare, promotion: 'q' }
    socket.emit('move', { roomId, clientId: localClientIdRef.current, move }, (res) => {
      if (!res || !res.ok) {
        // optionally show reason
      } else {
        // optimistic UI: rely on server state update for canonical position
      }
    })
    return true
  }

  function sendChat() {
    if (!msg) return
    // optimistic append
    setChat(c => [...c, { from: 'me', text: msg, ts: Date.now() }])
    socket.emit('chat', { roomId, clientId: localClientIdRef.current, message: msg })
    setMsg('')
  }

  function resetGame() {
    if (!confirm('آیا می‌خواهید بازی را بازنشانی کنید؟')) return
    socket.emit('reset', { roomId, clientId: localClientIdRef.current })
  }

  function resign() {
    if (!confirm('می‌خواهید تسلیم شوید؟')) return
    socket.emit('resign', { roomId, clientId: localClientIdRef.current })
  }

  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 520px', minWidth: 320 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong>اتاق:</strong> {roomId} &nbsp; <span className="small">نقش: {role}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={resetGame}>بازنشانی</button>
              {role !== 'spectator' && <button onClick={resign}>تسلیم</button>}
              <button onClick={() => { setRoomJoined(false); if (socket) { socket.disconnect(); socket = null } }}>خروج</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 auto', minWidth: 300 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="small">سفید</div>
                  <div style={{ fontSize: 14 }}>{formatTime(timeLeft.white)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="small">نوبت</div>
                  <div style={{ fontWeight: '600' }}>{turn}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="small">سیاه</div>
                  <div style={{ fontSize: 14 }}>{formatTime(timeLeft.black)}</div>
                </div>
              </div>

              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
                <Chessboard
                  id="hina-board"
                  position={fen}
                  onPieceDrop={(s, t) => onPieceDrop(s, t)}
                  boardOrientation={orientation}
                  arePiecesDraggable={status === 'playing' && role !== 'spectator'}
                  customBoardStyle={{ width: boardWidth }}
                />
              </div>

              <div style={{ marginTop: 8 }} className="small">تاریخچه حرکت‌ها:</div>
              <div className="note" style={{ maxHeight: 140, overflow: 'auto', padding: 8 }}>
                {moveHistory.length === 0 ? <div className="small">هیچ حرکتی ثبت نشده</div> :
                  moveHistory.map((m, i) => (
                    <div key={i}>{i + 1}. {m.san}</div>
                  ))
                }
              </div>
            </div>

            <div style={{ width: 340, minWidth: 280 }}>
              <div className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><strong>بازیکنان</strong></div>
                  <div className="small">حاضر: {players.length}</div>
                </div>
                <div style={{ marginTop: 8 }}>
                  {players.length === 0 && <div className="small">هنوز بازیکنی حاضر نیست</div>}
                  {players.map(p => (
                    <div key={p.clientId} style={{ marginTop: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div className="small">{p.color}</div>
                        <div className="small">{p.clientId === localClientIdRef.current ? 'من' : p.clientId.slice(0,8)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card" style={{ marginTop: 12, padding: 12 }}>
                <strong>چت</strong>
                <div ref={chatBoxRef} className="chat-box" style={{ marginTop: 8 }}>
                  {chat.map((c, i) => (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <b style={{ fontSize: 12 }}>{c.from === localClientIdRef.current ? 'من' : c.from.slice(0,8)}:</b>
                      <span style={{ fontSize: 13, marginLeft: 6 }}>{c.text}</span>
                      <div style={{ fontSize: 11, color: '#9aa4b2' }}>{new Date(c.ts).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="پیام..." />
                  <button onClick={sendChat}>ارسال</button>
                </div>
              </div>

              <div className="card" style={{ marginTop: 12, padding: 12 }}>
                <div className="small">وضعیت: {status}</div>
                <div style={{ marginTop: 8 }} className="small">نکته: بازی اعتبارسنجی‌شده سرور دارد و تایمر سرور-محور است.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
