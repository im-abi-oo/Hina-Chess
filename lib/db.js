const mongoose = require('mongoose')

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return

    try {
        await mongoose.connect(process.env.MONGODB_URI)
        console.log('✅ MongoDB Connected')
    } catch (err) {
        console.error('❌ DB Error:', err)
        process.exit(1)
    }
}

module.exports = { connectDB }
