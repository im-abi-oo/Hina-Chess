import Link from 'next/link'
import Head from 'next/head'

export default function Landing() {
  return (
    <div className="container flex-center" style={{minHeight: '100vh', flexDirection: 'column', textAlign: 'center'}}>
        <Head><title>Hina Chess Pro</title></Head>
        
        <h1 style={{fontSize: '4rem', marginBottom: 10, background: 'linear-gradient(to right, #c084fc, #8b5cf6)', WebkitBackgroundClip: 'text', color: 'transparent'}}>
            HINA CHESS
        </h1>
        <p style={{fontSize: '1.2rem', color: 'var(--text-muted)', maxWidth: 600, lineHeight: 1.6}}>
            تجربه‌ی نهایی شطرنج آنلاین. با دوستان خود رقابت کنید، رتینگ بگیرید و در محیطی مدرن بازی کنید.
        </p>

        <div style={{marginTop: 40, display: 'flex', gap: 20}}>
            <Link href="/auth">
                <button className="btn" style={{padding: '15px 40px', fontSize: '1.2rem'}}>شروع بازی</button>
            </Link>
            <Link href="/auth?mode=login">
                <button className="btn btn-outline" style={{padding: '15px 40px', fontSize: '1.2rem'}}>ورود به حساب</button>
            </Link>
        </div>
        
        <div style={{marginTop: 60, display: 'flex', gap: 40, opacity: 0.7}}>
            <div>⚡ سریع و سبک</div>
            <div>🛡️ کاملا امن</div>
            <div>📱 نسخه موبایل</div>
        </div>
    </div>
  )
}
