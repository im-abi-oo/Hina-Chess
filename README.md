# Hina Chess

یک پروژهٔ شرنج ساده  با **Next.js** و **Socket.IO** که **دیتابیس طالس** اجرا می‌شود.

ویژگی‌ها:
- ساخت اتاق 
- چت داخلی
- تایمر بازی
- نمایش تاریخچه حرکت‌ها و گرفتن قطعات
- دکمه بازنشانی و تسلیم

## اجرا (محلی)
1. نصب وابستگی‌ها:
```bash
npm install
```
2. اجرای حالت توسعه:
```bash
npm run dev
```
3. باز کردن `http://localhost:3000` و ساخت یا پیوستن به یک اتاق.

## کانتینر (Docker)
```bash
docker build -t hina-chess .
docker run -p 3000:3000 hina-chess
```

## نکات توسعه
- این پروژه به‌صورت محلی/آزمایشی ساخته شده و برای استفادهٔ عمومی نیاز به بررسی امنیتی، محدودسازی CORS و اضافه کردن SSL دارد.
- برای اجرا روی Render/Heroku/Vercel نیاز به تنظیمات خاص سرویس‌دهنده‌ها است (مثلاً deployment بدون custom server روی Vercel نیاز به تبدیل socket.io به راه‌حل serverless).

اگر خواستی ویژگی‌های بیشتری اضافه کنم (تایم کنترل‌های مختلف، ذخیرهٔ بازی، لیدربورد، مشاهده بازپخش)، بگو تا برات اضافه کنم.
# Hina Chess — Real-time two-player chess (Next.js + Express + Socket.IO)

این repo شامل نسخهٔ production-ready از Hina Chess است:
- Next.js front-end
- Custom Express server + Socket.IO
- Server-authoritative game state (chess.js)
- Server-side timers و validation
- Dockerfile برای deploy روی Render / Docker-based services

## Quick start (local)

1. نصب:
```bash
npm ci
توسعه:

npm run dev
# open http://localhost:3000
ساخت و اجرای production:

npm run build
npm start
با Docker:

docker build -t hina-chess .
docker run --rm -p 3000:3000 hina-chess
Events (Socket.IO)
Client -> Server:

join : { roomId, clientId?, timePerPlayer? } -> cb({ok, role, clientId, state})

move : { roomId, clientId, move } -> cb({ok})

chat : { roomId, clientId, message }

reset : { roomId, clientId }

resign: { roomId, clientId }

Server -> Client:

state : full room state (fen, history, players, status, timeLeft, turn)

move : validated move object (verbose)

time : { white, black }

chat : { from, message, ts }

resign, player-left, spectator-left

Deploy to Render.com
گزینه 1: Deploy Docker image (recommended)

گزینه 2: Deploy from GitHub (Render will run npm run build and npm start)

تنظیمات environment: PORT, TIME_PER_PLAYER, ALLOWED_ORIGIN

Notes
State in-memory → برای persistence و scale نیاز به Redis/DB دارید

clientId در localStorage ذخیره می‌شود؛ برای Auth واقعی باید حساب کاربری اضافه کنید


