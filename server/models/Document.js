
const mongoose = require('mongoose');

const collaboratorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  role: {
    type: String,
    enum: ['Editor', 'Viewer'],
    default: 'Viewer'
  }
}, {
  _id: false
});

const documentSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true
  },

  name: {
    type: String,
    default: 'Untitled Document',
    trim: true
  },

  type: {
    type: String,
    enum: ['Code', 'Whiteboard'],
    default: 'Code'
  },

  code: {
    type: String,
    default: ''
  },

  language: {
    type: String,
    default: 'javascript'
  },

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  collaborators: {
    type: [collaboratorSchema],
    default: []
  },

  whiteboardData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('Document', documentSchema);
