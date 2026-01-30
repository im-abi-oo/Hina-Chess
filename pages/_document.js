import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="fa" dir="rtl">
      <Head>
        {/* فونت فارسی پیشنهادی (اگر در پروژه داری لینک کن، وگرنه از فونت سیستم استفاده می‌کند) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" />
      </Head>
      <body className="antialiased dark">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
