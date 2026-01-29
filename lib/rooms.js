/**
 * lib/rooms.js
 * Central State Management
 */
const mongoose = require('mongoose')
const { Chess } = require('chess.js')

// User Model
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Plain text for this demo (Hash in real prod)
  elo: { type: Number, default: 1200 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
})

const User = mongoose.models.User || mongoose.model('User', UserSchema)

// Room Store
const rooms = new Map()

// Cleanup Routine (Every 1 min)
setInterval(() => {
  const now = Date.now()
  rooms.forEach((room, id) => {
    // Delete if empty and idle for 5 mins
    if (room.players.length === 0 && now - room.lastActivity > 5 * 60 * 1000) {
        if(room.timer) clearInterval(room.timer)
        rooms.delete(id)
    }
    // Delete if finished and idle for 30 mins
    if (room.status === 'finished' && now - room.lastActivity > 30 * 60 * 1000) {
        rooms.delete(id)
    }
  })
}, 60000)

function createRoom(id, config = {}) {
    const game = new Chess()
    const initialTime = (config.time || 10) * 60
    
    rooms.set(id, {
        id,
        game,
        players: [], 
        spectators: [],
        config: { ...config, initialTime },
        timeLeft: { w: initialTime, b: initialTime },
        status: 'waiting',
        lastMoveTime: null,
        timer: null,
        lastActivity: Date.now(),
        chat: [],
        result: null
    })
    return rooms.get(id)
}

function getRoom(id) {
    return rooms.get(id)
}

function getActiveRooms() {
    return Array.from(rooms.values())
        .filter(r => r.status === 'waiting' || r.status === 'playing')
        .map(r => ({
            id: r.id,
            players: r.players.length,
            status: r.status,
            type: 'standard'
        }))
}

module.exports = { rooms, createRoom, getRoom, getActiveRooms, User }
