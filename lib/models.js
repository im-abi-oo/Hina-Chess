const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: [true, 'نام کاربری الزامی است'], 
    unique: true,
    trim: true 
  },
  password: { 
    type: String, 
    required: [true, 'رمز عبور الزامی است'] 
  },
  // تغییر ایمیل به موبایل با اعتبارسنجی دقیق
  phone: { 
    type: String, 
    default: '',
    validate: {
      validator: function(v) {
        // اگر خالی بود (چون اختیاری است) تایید کن، اگر پر بود طبق الگوی شما چک کن
        return v === '' || /^09\d{9}$/.test(v);
      },
      message: props => `${props.value} یک شماره موبایل معتبر ایران نیست! نمونه: 09123456789`
    }
  },
  elo: { type: Number, default: 1200 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);
module.exports = { User };
