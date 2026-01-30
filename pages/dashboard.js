import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { io } from 'socket.io-client';
import styles from '../styles/Dashboard.module.css';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [createMode, setCreateMode] = useState(false);
  const [config, setConfig] = useState({ time: 10, color: 'random' });
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // احراز هویت
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (!d.user) router.push('/auth');
        else setUser(d.user);
      });

    // راه‌اندازی سوکت
    const s = io();
    setSocket(s);
    
    s.emit('get-rooms');
    s.on('lobby-update', (data) => {
      setRooms(data);
    });

    return () => s.disconnect();
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  const createGame = () => {
    if (!socket) return;
    const id = Math.random().toString(36).substr(2, 6).toUpperCase();
    socket.emit('create-room', { roomId: id, config });
    router.push(`/game/${id}`);
  };

  if (!user) return null;

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60 }}>
      {/* هدر داشبورد */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 40,
        background: 'rgba(255,255,255,0.03)',
        padding: '15px 25px',
        borderRadius: '20px',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div style={{ 
            width: 55, height: 55, 
            background: 'linear-gradient(135deg, #a78bfa, #f472b6)', 
            borderRadius: '15px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.8rem', fontWeight: 'bold', color: 'white',
            boxShadow: '0 8px 20px rgba(167, 139, 250, 0.3)'
          }}>
            {user.username[0].toUpperCase()}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{user.username}</h3>
            <span style={{ color: '#a78bfa', fontSize: '0.9rem', fontWeight: '600' }}>🏆 ELO: {user.elo}</span>
          </div>
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout}>خروج از حساب</button>
      </header>

      <div className="game-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 30 }}>
        
        {/* بخش ساخت بازی */}
        <div className={styles.statsCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: '1.5rem' }}>🎯</span>
            <h3 style={{ margin: 0 }}>نبرد جدید</h3>
          </div>
          
          <button 
            className="btn" 
            onClick={() => setCreateMode(!createMode)} 
            style={{ 
              width: '100%', 
              height: 55, 
              fontSize: '1.1rem',
              background: createMode ? 'rgba(255,255,255,0.1)' : 'var(--primary)',
              border: createMode ? '1px solid rgba(255,255,255,0.2)' : 'none'
            }}
          >
            {createMode ? 'لغو ساخت' : 'ایجاد میز بازی +'}
          </button>
          
          {createMode && (
            <div style={{ 
              marginTop: 20, 
              background: 'rgba(0,0,0,0.2)', 
              padding: 20, 
              borderRadius: '15px',
              animation: 'fadeIn 0.3s ease'
            }}>
              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', color: '#9ca3af' }}>زمان بازی (دقیقه):</label>
                <input 
                  type="number" 
                  min="1" max="60"
                  value={config.time} 
                  onChange={e => setConfig({ ...config, time: e.target.value })} 
                  style={{ 
                    width: '100%', padding: '12px', borderRadius: '10px', 
                    background: 'rgba(0,0,0,0.3)', border: '1px solid #444', color: 'white' 
                  }} 
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', color: '#9ca3af' }}>انتخاب رنگ:</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {['random', 'white', 'black'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setConfig({ ...config, color: c })}
                      style={{
                        flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #444',
                        background: config.color === c ? '#a78bfa' : 'rgba(0,0,0,0.3)',
                        color: config.color === c ? 'black' : 'white',
                        cursor: 'pointer', transition: '0.2s', fontWeight: 'bold'
                      }}
                    >
                      {c === 'random' ? '🎲' : c === 'white' ? '⚪' : '⚫'}
                    </button>
                  ))}
                </div>
              </div>

              <button className="btn" onClick={createGame} style={{ width: '100%', boxShadow: '0 10px 20px rgba(167, 139, 250, 0.2)' }}>
                تایید و ساخت اتاق
              </button>
            </div>
          )}
        </div>

        {/* بخش اتاق‌های فعال */}
        <div className={styles.statsCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: '1.5rem' }}>🌍</span>
            <h3 style={{ margin: 0 }}>تختــــه‌های فــــعال</h3>
          </div>
          
          <div style={{ maxHeight: 350, overflowY: 'auto', paddingRight: 5 }}>
            {rooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                <div style={{ fontSize: '2rem', marginBottom: 10 }}>⏳</div>
                <p>در حال حاضر میزی برای بازی نیست...</p>
              </div>
            ) : (
              rooms.map(r => (
                <div key={r.id} className={styles.roomItem}>
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>اتاق #{r.id}</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <span className={styles.badge}>⏱️ {r.config.time}m</span>
                      <span className={styles.badge}>👤 ۱/۲</span>
                    </div>
                  </div>
                  <button 
                    className="btn" 
                    style={{ width: 'auto', padding: '8px 20px', fontSize: '0.9rem' }} 
                    onClick={() => router.push(`/game/${r.id}`)}
                  >
                    پیوستن
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      <footer style={{ textAlign: 'center', marginTop: 60, opacity: 0.4, fontSize: '0.8rem' }}>
        HINA CHESS PLATFORM • Created by im_abi
      </footer>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        body {
          background: linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.7)), url('/bg.webp');
          background-size: cover;
          background-position: center;
          background-attachment: fixed;
        }
      `}</style>
    </div>
  );
}
