import { useState } from 'react'
import { useRouter } from 'next/router'

export default function Auth() {
  const router = useRouter()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '', email: '' })
  const [err, setErr] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(form)
    })
    const data = await res.json()
    if(data.ok) router.push('/dashboard')
    else setErr(data.error)
  }

  return (
    <div className="container flex-center" style={{minHeight:'100vh'}}>
      <div className="card" style={{width: '100%', maxWidth: 400}}>
          <h2 style={{textAlign:'center'}}>خوش آمدید</h2>
          <div style={{display:'flex', margin:'20px 0'}}>
              <button className={`btn ${mode==='login'?'':'btn-outline'}`} onClick={()=>setMode('login')}>ورود</button>
              <div style={{width:10}}></div>
              <button className={`btn ${mode==='register'?'':'btn-outline'}`} onClick={()=>setMode('register')}>ثبت نام</button>
          </div>

          <form onSubmit={handleSubmit} style={{display:'flex', flexDirection:'column', gap:15}}>
              <input placeholder="نام کاربری" required onChange={e=>setForm({...form, username:e.target.value})} />
              {mode==='register' && <input placeholder="ایمیل (اختیاری)" onChange={e=>setForm({...form, email:e.target.value})} />}
              <input type="password" placeholder="رمز عبور" required onChange={e=>setForm({...form, password:e.target.value})} />
              
              {err && <p style={{color:'var(--danger)', textAlign:'center'}}>{err}</p>}
              <button className="btn">تایید</button>
          </form>
          
          {mode==='login' && (
              <p style={{textAlign:'center', fontSize:'0.8rem', color:'#6b7280', marginTop:20}}>
                  فراموشی رمز؟ ایمیل به <br/><span style={{color:'var(--primary)'}}>im.abi.cma@gmail.com</span>
              </p>
          )}
      </div>
    </div>
  )
}
