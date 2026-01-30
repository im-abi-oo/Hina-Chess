/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'production',
  buildExcludes: [/middleware-manifest\.json$/], // رفع باگ احتمالی در بیلد PWA
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 }
      }
    },
    {
      urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'static-font-assets' }
    },
    {
      urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'static-image-assets' }
    }
  ]
})

const nextConfig = {
  reactStrictMode: false, // غیرفعال برای جلوگیری از ایجاد دو کانکشن همزمان در سوکت
  swcMinify: true, // استفاده از کامپایلر سریع Rust برای فشرده‌سازی کدها
  images: {
    domains: ['localhost'], // اگر تصاویر از جای خاصی لود می‌شوند اینجا اضافه کن
    formats: ['image/avif', 'image/webp'],
  },
  // تنظیمات برای هماهنگی با Custom Server (فایل server.js)
  publicRuntimeConfig: {
    staticFolder: '/static',
  }
}

module.exports = withPWA(nextConfig)
