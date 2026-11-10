const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead'
  },
  domain: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  status: {
    type: String,
    enum: ['queued', 'running', 'done', 'failed'],
    default: 'queued',
    required: true
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  stage: {
    type: String,
    default: 'Queued'
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  error: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  finishedAt: {
    type: Date,
    default: null
  }
});

auditSchema.index({ domain: 1, createdAt: -1 });

module.exports = mongoose.model('Audit', auditSchema);
