import Link from 'next/link';
import styles from '../styles/Home.module.css'; // فرض بر این است که استایل‌ها را اینجا ریختید

export default function Home() {
  return (
    <div className="container flex-center" style={{ 
      flexDirection: 'column', 
      minHeight: '100vh', 
      padding: '40px 20px',
      position: 'relative'
    }}>
      
      {/* بخش اصلی - هیرو */}
      <div className={styles.heroCard}>
        <div className={styles.floating} style={{ fontSize: '5rem', marginBottom: '20px' }}>
          ♟️
        </div>
        
        <h1 style={{ 
          fontSize: '4rem', 
          fontWeight: '900',
          margin: '0 0 15px', 
          background: 'linear-gradient(135deg, #a78bfa 0%, #f472b6 100%)', 
          WebkitBackgroundClip: 'text', 
          color: 'transparent',
          letterSpacing: '4px'
        }}>
          HINA CHESS
        </h1>

        <p style={{ 
          color: '#d1d5db', 
          maxWidth: '600px', 
          fontSize: '1.2rem', 
          lineHeight: '1.8',
          margin: '0 auto' 
        }}>
          تجربه‌ای نوین از شطرنج آنلاین در محیطی کریستالی. 
          <br />
          بدون تاخیر، هوشمند و کاملاً رقابتی.
        </p>

        {/* دکمه‌های عملیاتی */}
        <div style={{ marginTop: 40, display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/auth">
            <button className="btn" style={{ 
              fontSize: '1.2rem', 
              padding: '18px 50px', 
              borderRadius: '15px',
              boxShadow: '0 10px 20px rgba(139, 92, 246, 0.3)',
              border: 'none',
              cursor: 'pointer'
            }}>
              شروع نبرد
            </button>
          </Link>
          
          <Link href="/auth">
            <button className="btn btn-outline" style={{ 
              fontSize: '1.2rem', 
              padding: '18px 50px',
              borderRadius: '15px',
              backdropFilter: 'blur(5px)'
            }}>
              ورود به حساب
            </button>
          </Link>
        </div>

        {/* بخش ویژگی‌ها برای پر جزئیات کردن صفحه */}
        <div className={styles.featureGrid}>
          <div className={styles.featureItem}>
            <div style={{fontSize: '1.5rem', marginBottom: '10px'}}>⚡</div>
            <h4 style={{margin: '0 0 5px'}}>سرعت بالا</h4>
            <p style={{fontSize: '0.8rem', color: '#9ca3af', margin: 0}}>تکنولوژی Real-time بدون لگ</p>
          </div>
          <div className={styles.featureItem}>
            <div style={{fontSize: '1.5rem', marginBottom: '10px'}}>🛡️</div>
            <h4 style={{margin: '0 0 5px'}}>امنیت کامل</h4>
            <p style={{fontSize: '0.8rem', color: '#9ca3af', margin: 0}}>حفاظت از ریتینگ و بازی‌ها</p>
          </div>
          <div className={styles.featureItem}>
            <div style={{fontSize: '1.5rem', marginBottom: '10px'}}>🎨</div>
            <h4 style={{margin: '0 0 5px'}}>طراحی مدرن</h4>
            <p style={{fontSize: '0.8rem', color: '#9ca3af', margin: 0}}>رابط کاربری شیشه‌ای و جذاب</p>
          </div>
        </div>
      </div>

      {/* فوتر کپی‌رایت */}
      <footer className={styles.copyright}>
        <p>
          MADE WITH 💜 BY <span style={{ color: '#f472b6', fontWeight: 'bold' }}>im_abi</span>
        </p>
        <p style={{ fontSize: '0.7rem', marginTop: '5px', opacity: 0.6 }}>
          © {new Date().getFullYear()} HINA CHESS PLATFORM. ALL RIGHTS RESERVED.
        </p>
      </footer>

      {/* استایل داخلی برای پس‌زمینه (اگر در body ست نشده باشد) */}
      <style jsx global>{`
        body {
          background: linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.4)), url('/bg.webp');
          background-size: cover;
          background-position: center;
          background-attachment: fixed;
          overflow-x: hidden;
        }
        .flex-center {
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
