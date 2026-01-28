import '../styles/globals.css'
import Head from 'next/head'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Hina Chess | شطرنج آنلاین</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <meta name="description" content="بازی شطرنج آنلاین دو نفره سریع و مدرن" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
