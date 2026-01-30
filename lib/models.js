const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' }, // فیلد موبایل به جای ایمیل
  elo: { type: Number, default: 1200 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
})

// این خط خیلی مهمه که توی Next.js باگ نخوری
const User = mongoose.models.User || mongoose.model('User', UserSchema)
module.exports = { User }
