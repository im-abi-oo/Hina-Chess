const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, minlength: 3 },
  password: { type: String, required: true },
  email: { type: String, default: '' }, // اختیاری برای بازیابی
  phone: { type: String, default: '' }, // اختیاری
  elo: { type: Number, default: 1200 },
  avatar: { type: String, default: '' }, // رنگ یا آیکون
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{ 
      from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      username: String 
  }],
  // آمار دقیق
  stats: {
      wins: { type: Number, default: 0 },
      loss: { type: Number, default: 0 },
      draw: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
})

const MessageSchema = new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
})

const User = mongoose.models.User || mongoose.model('User', UserSchema)
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema)

module.exports = { User, Message }
