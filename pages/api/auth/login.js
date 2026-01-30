import { User } from '../../../lib/models';
import dbConnect from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: "متد غیرمجاز" });
  }

  try {
    await dbConnect();

    const { username, password } = req.body;

    // ۱. پیدا کردن کاربر در دیتابیس
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ ok: false, error: "نام کاربری یا رمز عبور اشتباه است" });
    }

    // ۲. مقایسه رمز عبور وارد شده با رمز هش شده در دیتابیس
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ ok: false, error: "نام کاربری یا رمز عبور اشتباه است" });
    }

    // در صورت موفقیت
    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "خطای سرور در ورود" });
  }
}
