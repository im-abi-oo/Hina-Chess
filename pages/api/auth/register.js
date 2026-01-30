import { User } from '../../../lib/models';
import dbConnect from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  // فقط متد POST مجاز است
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: "متد غیرمجاز" });
  }

  try {
    await dbConnect();

    const { username, password, phone } = req.body;

    // ۱. بررسی فیلدهای اجباری
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "نام کاربری و رمز عبور الزامی است" });
    }

    // ۲. اعتبارسنجی شماره موبایل (شروع با 09 و کلاً ۱۱ رقم)
    if (phone) {
      const phoneRegex = /^09\d{9}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({ ok: false, error: "فرمت موبایل نادرست است (مثال: 09123456789)" });
      }
    }

    // ۳. بررسی تکراری نبودن نام کاربری
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ ok: false, error: "این نام کاربری قبلاً گرفته شده است" });
    }

    // ۴. هش کردن رمز عبور (امنیت بالا)
    const hashedPassword = await bcrypt.hash(password, 12);

    // ۵. ذخیره در دیتابیس
    const newUser = new User({
      username,
      password: hashedPassword,
      phone: phone || '' // جایگزین ایمیل شد
    });

    await newUser.save();

    return res.status(201).json({ ok: true });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "خطای سرور در ثبت‌نام" });
  }
}
