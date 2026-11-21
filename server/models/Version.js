
const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true
  },

  code: {
    type: String,
    default: ''
  },

  versionNumber: {
    type: Number,
    required: true
  },

  author: {
    type: String,
    default: 'Unknown'
  },

  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  message: {
    type: String,
    default: ''
  }

}, {
  timestamps: true
});

versionSchema.index(
  { roomId: 1, versionNumber: 1 },
  { unique: true }
);

module.exports = mongoose.model('Version', versionSchema);
