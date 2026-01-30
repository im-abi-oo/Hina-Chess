import os from 'os';
import mongoose from 'mongoose';

export default async function handler(req, res) {
    // محاسبه آپتایم سرور به فرمت خوانا
    const uptime = process.uptime();
    const days = Math.floor(uptime / (24 * 3600));
    const hours = Math.floor((uptime % (24 * 3600)) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    // وضعیت اتصال دیتابیس
    // 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
    const dbStatus = {
        0: "🔴 قطع",
        1: "🟢 متصل",
        2: "🟡 در حال اتصال",
        3: "🟠 در حال قطع اتصال"
    };

    const statusData = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: {
            platform: os.platform(),
            cpu_load: os.loadavg(),
            free_memory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            total_memory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            uptime: `${days} روز و ${hours} ساعت و ${minutes} دقیقه`
        },
        database: {
            state: dbStatus[mongoose.connection.readyState] || "نامشخص",
            name: mongoose.connection.name
        },
        application: {
            node_version: process.version,
            env: process.env.NODE_ENV,
            memory_usage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
        }
    };

    // اگر دیتابیس قطع بود، وضعیت کد ۵۰۳ برگردانیم
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ ...statusData, status: 'service unavailable' });
    }

    res.status(200).json(statusData);
}
