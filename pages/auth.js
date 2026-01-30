import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

export default function Auth() {
  const router = useRouter()
  const [mode, setMode] = useState('login') // login, register
  const [form, setForm] = useState({ username: '', password: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('');
    
    const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
    })
    const data = await res.json()
    setLoading(false)
    
    if (data.ok) {
        router.push('/dashboard')
    } else {
        setError(data.error || 'خطایی رخ داد')
    }
  }

  return (
    <div className="container flex-center">
      <div className="card" style={{width: '100%', maxWidth: 400}}>
          <h1 style={{textAlign:'center', marginBottom:10}}>Hina Chess</h1>
          
          <div style={{display:'flex', marginBottom:20, background:'rgba(0,0,0,0.2)', borderRadius:10, padding:5}}>
              <button className={`btn ${mode==='login'?'':'btn-outline'}`} onClick={()=>setMode('login')} style={{flex:1}}>ورود</button>
              <button className={`btn ${mode==='register'?'':'btn-outline'}`} onClick={()=>setMode('register')} style={{flex:1}}>ثبت نام</button>
          </div>

          <form onSubmit={handleSubmit} style={{display:'flex', flexDirection:'column', gap:15}}>
              <input placeholder="نام کاربری" required value={form.username} onChange={e=>setForm({...form, username:e.target.value})} />
              
              {mode === 'register' && (
                  <input type="email" placeholder="ایمیل (برای بازیابی رمز - اختیاری)" value={form.email} onChange={e=>setForm({...form, email:e.target.value})} />
              )}

              <input type="password" placeholder="رمز عبور" required value={form.password} onChange={e=>setForm({...form, password:e.target.value})} />
              
              {error && <div style={{color:'var(--danger)', fontSize:'0.9rem'}}>{error}</div>}
              
              <button className="btn" disabled={loading}>
                  {loading ? 'صبر کنید...' : (mode==='login' ? 'ورود به حساب' : 'ساخت حساب جدید')}
              </button>
          </form>

          {mode === 'login' && (
              <p style={{textAlign:'center', fontSize:'0.8rem', marginTop:20, color:'var(--text-muted)'}}>
                  رمز عبور را فراموش کردید؟ ایمیل بزنید: <br/>
                  <a href="mailto:im.abi.cma@gmail.com" style={{color:'var(--primary)'}}>im.abi.cma@gmail.com</a>
              </p>
          )}
      </div>
    </div>
  )
}
