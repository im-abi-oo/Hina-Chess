import { useState } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/Auth.module.css';

export default function Auth() {
  const router = useRouter();
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [form, setForm] = useState({ username: '', password: '', phone: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      
      if (data.ok) {
        router.push('/dashboard');
      } else {
        setErr(data.error || 'خطایی رخ داد. دوباره تلاش کنید.');
      }
    } catch (error) {
      setErr('اتصال به سرور برقرار نشد.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container flex-center" style={{ minHeight: '100vh', padding: '20px' }}>
      <div className={styles.authCard}>
        {/* هدر فرم */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '10px' }}>⚡</div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: '800', margin: 0 }}>
            {mode === 'login' ? 'خوش برگشتی!' : 'ساخت حساب جدید'}
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '5px' }}>
            {mode === 'login' ? 'وارد حساب کاربری خود شوید' : 'به جمع شطرنج‌بازان HINA بپیوندید'}
          </p>
        </div>

        {/* سوئیچ بین ورود و ثبت‌نام */}
        <div className={styles.tabContainer}>
          <button 
            className={`${styles.tabBtn} ${mode === 'login' ? styles.tabBtnActive : ''}`} 
            onClick={() => setMode('login')}
          >
            ورود
          </button>
          <button 
            className={`${styles.tabBtn} ${mode === 'register' ? styles.tabBtnActive : ''}`} 
            onClick={() => setMode('register')}
          >
            ثبت‌نام
          </button>
        </div>

        {/* فرم */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <input 
            className={styles.inputField}
            placeholder="نام کاربری" 
            required 
            onChange={e => setForm({ ...form, username: e.target.value })} 
          />
          
          {mode === 'register' && (
            <input 
              className={styles.inputField}
              placeholder="شماره موبایل (اختیاری)" 
              onChange={e => setForm({ ...form, phone: e.target.value })} 
            />
          )}
          
          <input 
            className={styles.inputField}
            type="password" 
            placeholder="رمز عبور" 
            required 
            onChange={e => setForm({ ...form, password: e.target.value })} 
          />
          
          {err && (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.1)', 
              color: 'var(--danger)', 
              padding: '10px', 
              borderRadius: '8px', 
              fontSize: '0.85rem', 
              textAlign: 'center',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              ⚠️ {err}
            </div>
          )}

          <button 
            className="btn" 
            disabled={loading}
            style={{ 
              fontSize: '1.1rem', 
              padding: '14px', 
              borderRadius: '12px',
              marginTop: '10px'
            }}
          >
            {loading ? 'در حال پردازش...' : 'تایید و ادامه'}
          </button>
        </form>
        
        {/* فوتر فرم */}
        {mode === 'login' && (
          <div style={{ textAlign: 'center', marginTop: '25px' }}>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
              فراموشی رمز عبور؟
            </p>
            <a 
              href="mailto:im.abi.cma@gmail.com" 
              style={{ color: 'var(--primary)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: '600' }}
            >
              ارتباط با پشتیبانی: im.abi.cma@gmail.com
            </a>
          </div>
        )}
      </div>

      {/* استایل کلی برای پس‌زمینه (اگر قبلاً ست نشده) */}
      <style jsx global>{`
        body {
          background: linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url('/bg.webp');
          background-size: cover;
          background-position: center;
          background-attachment: fixed;
        }
      `}</style>
    </div>
  );
}
