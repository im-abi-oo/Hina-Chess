import Link from 'next/link'

export default function Home() {
  return (
    <div className="container flex-center" style={{flexDirection:'column', minHeight:'100vh', textAlign:'center'}}>
        <h1 style={{fontSize:'3.5rem', margin:'0 0 20px', background:'linear-gradient(to right, #a78bfa, #f472b6)', WebkitBackgroundClip:'text', color:'transparent'}}>
            HINA CHESS
        </h1>
        <p style={{color:'#9ca3af', maxWidth:500, lineHeight:1.6}}>
            حرفه‌ای‌ترین پلتفرم شطرنج آنلاین. با دوستان خود رقابت کنید، رتینگ بگیرید و لذت ببرید.
        </p>
        
        <div style={{marginTop:40, display:'flex', gap:20}}>
            <Link href="/auth"><button className="btn" style={{fontSize:'1.2rem', padding:'15px 40px'}}>شروع بازی</button></Link>
            <Link href="/auth"><button className="btn btn-outline" style={{fontSize:'1.2rem', padding:'15px 40px'}}>ورود</button></Link>
        </div>
    </div>
  )
}
