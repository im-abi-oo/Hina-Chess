const withPWA = require('next-pwa')({
  dest: 'public',           // محل ذخیره فایل‌های Service Worker و سایر فایل‌های PWA
  register: true,           // به صورت خودکار Service Worker ثبت می‌شود
  skipWaiting: true,        // بعد از آپدیت Service Worker جدید، بلافاصله جایگزین می‌شود
  disable: process.env.NODE_ENV === 'production', // در حالت توسعه، PWA غیرفعال است
  // runtimeCaching: []     // اگر بخوای می‌تونی کش سفارشی برای فایل‌ها تعریف کنی
});

module.exports = withPWA({
  reactStrictMode: true,    // بررسی سخت‌گیرانه React برای پیدا کردن باگ‌ها
  swcMinify: true,          // استفاده از SWC برای کاهش حجم کد
  images: {
    domains: [],            // اگر تصاویر از دامنه‌های خارجی استفاده می‌کنید، اینجا اضافه کنید
  },
  // سایر تنظیمات Next.js مثل redirects یا rewrites هم اینجا اضافه می‌شوند
});
