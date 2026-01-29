/**
 * lib/models.js
 * Database Schemas
 */
const mongoose = require('mongoose')

// User Schema with Friends
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, minlength: 3 },
  password: { type: String, required: true },
  elo: { type: Number, default: 1200 },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{ 
      from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      username: String 
  }],
  createdAt: { type: Date, default: Date.now }
})

// Private Messages Schema
const MessageSchema = new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
})

// Prevent model overwrite in dev mode
const User = mongoose.models.User || mongoose.model('User', UserSchema)
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema)

module.exports = { User, Message }
