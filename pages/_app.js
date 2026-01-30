import '../styles/globals.css'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // سیستم لودینگ ساده بین جابه‌جایی صفحات
  useEffect(() => {
    const handleStart = () => setLoading(true)
    const handleComplete = () => setLoading(false)

    router.events.on('routeChangeStart', handleStart)
    router.events.on('routeChangeComplete', handleComplete)
    router.events.on('routeChangeError', handleComplete)

    return () => {
      router.events.off('routeChangeStart', handleStart)
      router.events.off('routeChangeComplete', handleComplete)
      router.events.off('routeChangeError', handleComplete)
    }
  }, [router])

  return (
    <>
      <Head>
        <title>Hina Chess | پلتفرم حرفه‌ای شطرنج</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0d0e14" />
        <meta name="description" content="بازی آنلاین شطرنج با سرعت بالا و سیستم رتبه بندی" />
      </Head>

      {/* اگر صفحه در حال لود بود، یک نوار باریک بالای صفحه نشان داده شود */}
      {loading && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: '3px',
          background: 'var(--primary)', zIndex: 9999, transition: '0.3s'
        }} />
      )}

      <div className="app-container">
        <Component {...pageProps} />
      </div>

      <style jsx global>{`
        .app-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </>
  )
}
