const mongoose = require('mongoose');
const config = require('./config');
const Audit = require('./models/Audit');

async function connectDB() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('MongoDB connected successfully');

    // On startup, mark any Audit stuck in queued or running as failed
    const result = await Audit.updateMany(
      { status: { $in: ['queued', 'running'] } },
      { status: 'failed', error: 'Server restarted', finishedAt: new Date() }
    );

    if (result.modifiedCount > 0) {
      console.log(`Cleaned up ${result.modifiedCount} stale audits marked as failed`);
    }
  } catch (err) {
    console.error('MongoDB connection failure:', err.message);
    throw err;
  }
}

async function closeDB() {
  await mongoose.disconnect();
}

module.exports = {
  connectDB,
  closeDB
};
