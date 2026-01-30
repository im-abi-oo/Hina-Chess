# مرحله اول: بیلد (Builder)
FROM node:18-alpine AS builder
WORKDIR /app

# تنظیم متغیر محیطی برای بیلد بهینه
ENV NODE_ENV=production

# نصب وابستگی‌ها با استفاده از Lock-file برای پایداری
COPY package*.json ./
RUN npm ci --silent

# کپی کل پروژه به محیط بیلد داکر
COPY . .

# اجرای بیلد Next.js
RUN npm run build

# مرحله دوم: اجرا (Runner)
FROM node:18-alpine AS runner
WORKDIR /app

# تنظیم متغیر محیطی برای زمان اجرا
ENV NODE_ENV=production

# کپی وابستگی‌های نصب شده و پوشه بیلد شده از مرحله قبل
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./

# کپی فایل‌های زیرساختی و سرور اختصاصی
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/lib ./lib

# کپی پوشه پابلیک (حیاتی برای صداهای شطرنج، آیکون‌ها و Manifest)
COPY --from=builder /app/public ./public

# کپی صفحات و استایل‌ها (مورد نیاز برای رندرینگ و سرور اکسپرس)
COPY --from=builder /app/pages ./pages
COPY --from=builder /app/styles ./styles

# نکته: پوشه components حذف شد تا خطای "not found" برطرف شود.

# باز کردن پورت ۳۰۰۰
EXPOSE 3000

# سیستم بررسی سلامت (Healthcheck) - هماهنگ با فایل health.js پروژه
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# دستور نهایی برای اجرای پروژه با استفاده از سرور اکسپرس
CMD ["node", "server.js"]
