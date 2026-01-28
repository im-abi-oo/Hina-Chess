/**
 * lib/rooms.js
 * Database Models + In-Memory Room Manager
 */
const mongoose = require('mongoose')
const { Chess } = require('chess.js')

// --- Mongoose Models ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  elo: { type: Number, default: 1200 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
})

const User = mongoose.models.User || mongoose.model('User', UserSchema)

// --- Room Management ---
const rooms = new Map()

// Cleanup idle rooms
setInterval(() => {
  rooms.forEach((room, id) => {
    if (Date.now() - room.lastActivity > 10 * 60 * 1000) { // 10 mins idle
        if(room.players.length === 0 || room.game.isGameOver()) {
             if(room.timer) clearInterval(room.timer)
             rooms.delete(id)
        }
    }
  })
}, 60000)

function createRoom(id, config = {}) {
    // config: { time: 10, increment: 0, public: true, type: 'human'|'bot' }
    const game = new Chess()
    const initialTime = (config.time || 10) * 60
    
    rooms.set(id, {
        id,
        game,
        players: [], // { socketId, userId, username, color, connected }
        spectators: [],
        config: { ...config, initialTime },
        timeLeft: { w: initialTime, b: initialTime },
        status: 'waiting', // waiting, playing, finished
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
    const list = []
    rooms.forEach(r => {
        if(r.config.public && r.status !== 'finished') {
            list.push({
                id: r.id,
                players: r.players.length,
                status: r.status,
                type: r.config.type || 'human'
            })
        }
    })
    return list
}

module.exports = { User, rooms, createRoom, getRoom, getActiveRooms }
