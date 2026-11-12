const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120
  },
  website: {
    type: String,
    required: true,
    trim: true
  },
  productsServices: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 500
  },
  industry: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  location: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 254
  },
  consent: {
    type: Boolean,
    required: true,
    validate: {
      validator: (v) => v === true,
      message: 'Consent must be true'
    }
  },
  auditId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Audit'
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Lead', leadSchema);
