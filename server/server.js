require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const User = require('./models/User');
const Version = require('./models/Version');
const Document = require('./models/Document');
const ChatMessage = require('./models/ChatMessage');
const profileRoutes = require('./routes/profileRoutes');
const passwordRoutes = require('./routes/passwordRoutes');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Serve uploaded profile pictures
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('JWT_SECRET is missing from .env file');
  process.exit(1);
}

// ======================================
// AUTHENTICATION MIDDLEWARE
// ======================================

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authentication required'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({
        message: 'User not found'
      });
    }

    req.user = user;
    next();

  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired token'
    });
  }
};

// ======================================
// DOCUMENT PERMISSIONS
// ======================================

const getDocumentRole = (document, userId) => {
  if (document.owner && document.owner.toString() === userId.toString()) {
    return 'Owner';
  }

  const collaborator = document.collaborators.find(
    (item) => item.user &&
      item.user.toString() === userId.toString()
  );

  return collaborator ? collaborator.role : null;
};

const canEdit = (role) => {
  return role === 'Owner' || role === 'Editor';
};

const getAccessibleDocument = async (roomId, userId) => {
  const document = await Document.findOne({ roomId });

  if (!document) return null;

  const role = getDocumentRole(document, userId);

  if (!role) return null;

  return { document, role };
};

// ======================================
// REGISTER
// ======================================

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'All fields are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'Email already registered'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword
    });

    const token = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    });

  } catch (error) {
    console.error('Registration Error:', error);

    res.status(500).json({
      message: 'Registration failed'
    });
  }
});

// ======================================
// LOGIN
// ======================================

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required'
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase()
    });

    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const passwordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordValid) {
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    });

  } catch (error) {
    console.error('Login Error:', error);

    res.status(500).json({
      message: 'Login failed'
    });
  }
});

// ======================================
// GET CURRENT USER PROFILE
// ======================================

app.get('/api/profile', authenticateToken, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar
    }
  });
});

// ======================================
// UPDATE PROFILE
// ======================================

app.patch('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { name, avatar } = req.body;

    const updates = {};

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({
          message: 'Name cannot be empty'
        });
      }

      updates.name = name.trim();
    }

    if (avatar !== undefined) {
      updates.avatar = avatar;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user
    });

  } catch (error) {
    console.error('Profile Update Error:', error);

    res.status(500).json({
      message: 'Profile update failed'
    });
  }
});

// ======================================
// PROFILE PICTURE UPLOAD ROUTES
// ======================================

app.use('/api/profile', profileRoutes);

// ======================================
// passwordRoutes
// ======================================
app.use('/api/auth', passwordRoutes);

// ======================================
// DOCUMENTS - GET ALL ACCESSIBLE DOCUMENTS
// ======================================

app.get('/api/documents', authenticateToken, async (req, res) => {
  try {
    await Document.updateMany(
      {
        $or: [
          { owner: null },
          { owner: { $exists: false } }
        ]
      },
      {
        $set: { owner: req.user._id }
      }
    );

    const documents = await Document.find({
      $or: [
        { owner: req.user._id },
        { 'collaborators.user': req.user._id }
      ]
    }).sort({ createdAt: -1 });

    const result = documents.map((document) => ({
      ...document.toObject(),
      role: getDocumentRole(document, req.user._id)
    }));

    res.json(result);

  } catch (error) {
    console.error('Get Documents Error:', error);

    res.status(500).json({
      message: 'Failed to get documents'
    });
  }
});

// ======================================
// CREATE DOCUMENT
// ======================================

app.post('/api/documents', authenticateToken, async (req, res) => {
  try {
    const roomId = `document-${new mongoose.Types.ObjectId()}`;

    const document = await Document.create({
      roomId,
      name: 'Untitled Document',
      code: '',
      type: req.body.type === 'Whiteboard' ? 'Whiteboard' : 'Code',
      owner: req.user._id
    });

    res.status(201).json({
      message: 'Document created successfully',
      document
    });

  } catch (error) {
    console.error('Create Document Error:', error);

    res.status(500).json({
      message: 'Failed to create document'
    });
  }
});

// ======================================
// DUPLICATE DOCUMENT
// ======================================

app.post(
  '/api/documents/:roomId/duplicate',
  authenticateToken,
  async (req, res) => {
    try {
      const result = await getAccessibleDocument(
        req.params.roomId,
        req.user._id
      );

      if (!result) {
        return res.status(404).json({
          message: 'Document not found'
        });
      }

      const original = result.document;

      const duplicated = await Document.create({
        roomId: `document-${new mongoose.Types.ObjectId()}`,
        name: `Copy of ${original.name}`,
        type: original.type,
        code: original.code,
        language: original.language,
        whiteboardData: original.whiteboardData,
        owner: req.user._id
      });

      res.status(201).json({
        message: 'Document duplicated successfully',
        document: duplicated
      });

    } catch (error) {
      console.error('Duplicate Error:', error);

      res.status(500).json({
        message: 'Failed to duplicate document'
      });
    }
  }
);

// ======================================
// RENAME DOCUMENT - OWNER ONLY
// ======================================

app.patch(
  '/api/documents/:roomId',
  authenticateToken,
  async (req, res) => {
    try {
      const { name } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({
          message: 'Document name is required'
        });
      }

      const result = await getAccessibleDocument(
        req.params.roomId,
        req.user._id
      );

      if (!result) {
        return res.status(404).json({
          message: 'Document not found'
        });
      }

      if (result.role !== 'Owner') {
        return res.status(403).json({
          message: 'Only the owner can rename this document'
        });
      }

      const document = await Document.findOneAndUpdate(
        { roomId: req.params.roomId },
        { $set: { name: name.trim() } },
        { new: true }
      );

      res.json({
        message: 'Document renamed successfully',
        document
      });

    } catch (error) {
      console.error('Rename Error:', error);

      res.status(500).json({
        message: 'Failed to rename document'
      });
    }
  }
);

// ======================================
// DELETE DOCUMENT - OWNER ONLY
// ======================================

app.delete(
  '/api/documents/:roomId',
  authenticateToken,
  async (req, res) => {
    try {
      const result = await getAccessibleDocument(
        req.params.roomId,
        req.user._id
      );

      if (!result) {
        return res.status(404).json({
          message: 'Document not found'
        });
      }

      if (result.role !== 'Owner') {
        return res.status(403).json({
          message: 'Only the owner can delete this document'
        });
      }

      await Document.deleteOne({
        roomId: req.params.roomId
      });

      await Version.deleteMany({
        roomId: req.params.roomId
      });

      await ChatMessage.deleteMany({
        roomId: req.params.roomId
      });

      io.to(req.params.roomId).emit('document-deleted');

      res.json({
        message: 'Document deleted successfully'
      });

    } catch (error) {
      console.error('Delete Error:', error);

      res.status(500).json({
        message: 'Failed to delete document'
      });
    }
  }
);

// ======================================
// SHARE DOCUMENT - OWNER ONLY
// ======================================

app.post(
  '/api/documents/:roomId/collaborators',
  authenticateToken,
  async (req, res) => {
    try {
      const { email, role } = req.body;

      if (!email || !['Editor', 'Viewer'].includes(role)) {
        return res.status(400).json({
          message: 'Valid email and role are required'
        });
      }

      const document = await Document.findOne({
        roomId: req.params.roomId
      });

      if (!document) {
        return res.status(404).json({
          message: 'Document not found'
        });
      }

      if (document.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          message: 'Only the owner can share this document'
        });
      }

      const invitedUser = await User.findOne({
        email: email.trim().toLowerCase()
      });

      if (!invitedUser) {
        return res.status(404).json({
          message: 'User account not found. Ask them to register first.'
        });
      }

      if (invitedUser._id.toString() === req.user._id.toString()) {
        return res.status(400).json({
          message: 'You are already the owner'
        });
      }

      const existing = document.collaborators.find(
        (item) => item.user.toString() === invitedUser._id.toString()
      );

      if (existing) {
        existing.role = role;
      } else {
        document.collaborators.push({
          user: invitedUser._id,
          role
        });
      }

      await document.save();

      res.json({
        message: 'Collaborator added successfully',
        document
      });

    } catch (error) {
      console.error('Share Error:', error);

      res.status(500).json({
        message: 'Failed to share document'
      });
    }
  }
);

// ======================================
// REMOVE COLLABORATOR - OWNER ONLY
// ======================================

app.delete(
  '/api/documents/:roomId/collaborators/:userId',
  authenticateToken,
  async (req, res) => {
    try {
      const document = await Document.findOne({
        roomId: req.params.roomId
      });

      if (!document) {
        return res.status(404).json({
          message: 'Document not found'
        });
      }

      if (document.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          message: 'Only the owner can remove collaborators'
        });
      }

      document.collaborators = document.collaborators.filter(
        (item) => item.user.toString() !== req.params.userId
      );

      await document.save();

      res.json({
        message: 'Collaborator removed successfully'
      });

    } catch (error) {
      console.error('Remove Collaborator Error:', error);

      res.status(500).json({
        message: 'Failed to remove collaborator'
      });
    }
  }
);

// ======================================
// SAVE DOCUMENT VERSION
// ======================================

// ======================================
// SAVE DOCUMENT VERSION
// ======================================

app.post(
  '/api/documents/:roomId/versions',
  authenticateToken,
  async (req, res) => {
    try {
      const { code, message } = req.body;
      const roomId = req.params.roomId;

      if (typeof code !== 'string') {
        return res.status(400).json({
          message: 'Valid code is required'
        });
      }

      const result = await getAccessibleDocument(
        roomId,
        req.user._id
      );

      if (!result) {
        return res.status(404).json({
          message: 'Document not found'
        });
      }

      if (!canEdit(result.role)) {
        return res.status(403).json({
          message: 'You do not have permission to save versions'
        });
      }

      const latestVersion = await Version.findOne({ roomId })
        .sort({ versionNumber: -1 });

      // Prevent consecutive duplicate versions.
      if (latestVersion && latestVersion.code === code) {
        return res.json({
          message: 'This code is already saved',
          version: latestVersion,
          duplicate: true
        });
      }

      const nextVersionNumber = latestVersion
        ? latestVersion.versionNumber + 1
        : 1;

      const version = await Version.create({
        roomId,
        code,
        author: req.user.name,
        authorId: req.user._id,
        message: message || '',
        versionNumber: nextVersionNumber
      });

      res.status(201).json({
        message: 'Version saved successfully',
        version
      });

    } catch (error) {
      console.error('Save Version Error:', error);

      res.status(500).json({
        message: 'Failed to save version'
      });
    }
  }
);

// ======================================
// GET VERSION HISTORY
// ======================================

app.get(
  '/api/documents/:roomId/versions',
  authenticateToken,
  async (req, res) => {
    try {
      const result = await getAccessibleDocument(
        req.params.roomId,
        req.user._id
      );

      if (!result) {
        return res.status(404).json({
          message: 'Document not found'
        });
      }

      const versions = await Version.find({
        roomId: req.params.roomId
      }).sort({ versionNumber: -1 });

      res.json(versions);

    } catch (error) {
      console.error('Get Versions Error:', error);

      res.status(500).json({
        message: 'Failed to get version history'
      });
    }
  }
);

// ======================================
// RESTORE VERSION - OWNER / EDITOR
// ======================================

// ======================================
// RESTORE VERSION - OWNER / EDITOR
// ======================================

app.post(
  '/api/documents/:roomId/restore/:versionId',
  authenticateToken,
  async (req, res) => {
    try {
      const { roomId, versionId } = req.params;

      const result = await getAccessibleDocument(
        roomId,
        req.user._id
      );

      if (!result) {
        return res.status(404).json({
          message: 'Document not found'
        });
      }

      if (!canEdit(result.role)) {
        return res.status(403).json({
          message: 'You do not have permission to restore versions'
        });
      }

      const selectedVersion = await Version.findOne({
        _id: versionId,
        roomId
      });

      if (!selectedVersion) {
        return res.status(404).json({
          message: 'Version not found'
        });
      }

      // Restore the selected code without creating a new version.
      const document = await Document.findOneAndUpdate(
        { roomId },
        { $set: { code: selectedVersion.code } },
        { new: true }
      );

      io.to(roomId).emit('code-update', selectedVersion.code);

      res.json({
        message: 'Version restored successfully',
        document,
        version: selectedVersion
      });

    } catch (error) {
      console.error('Restore Error:', error);

      res.status(500).json({
        message: 'Failed to restore version'
      });
    }
  }
);

// ======================================
// GET CHAT MESSAGES
// ======================================

app.get(
  '/api/documents/:roomId/messages',
  authenticateToken,
  async (req, res) => {
    try {
      const result = await getAccessibleDocument(
        req.params.roomId,
        req.user._id
      );

      if (!result) {
        return res.status(404).json({
          message: 'Document not found'
        });
      }

      const messages = await ChatMessage.find({
        roomId: req.params.roomId
      })
        .populate('sender', 'name email')
        .sort({ createdAt: 1 })
        .limit(200);

      res.json(messages);

    } catch (error) {
      console.error('Get Chat Error:', error);

      res.status(500).json({
        message: 'Failed to get messages'
      });
    }
  }
);

// ======================================
// SOCKET.IO AUTHENTICATION
// ======================================

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.user = user;
    next();

  } catch (error) {
    next(new Error('Invalid or expired token'));
  }
});

// ======================================
// SOCKET.IO REAL-TIME COLLABORATION
// ======================================

// Send the names of users currently inside a document room.
const emitRoomUsers = async (roomId, excludedSocketId = null) => {
  try {
    const sockets = await io.in(roomId).fetchSockets();
    const uniqueUsers = new Map();

    sockets.forEach((connectedSocket) => {
      if (connectedSocket.id === excludedSocketId) return;

      const user = connectedSocket.data.user;

      if (user) {
        uniqueUsers.set(user.id, {
          id: user.id,
          name: user.name
        });
      }
    });

    const onlineUsers = Array.from(uniqueUsers.values());

    io.to(roomId).emit('online-users', onlineUsers);
    io.to(roomId).emit('users-count', onlineUsers.length);

  } catch (error) {
    console.error('Online Users Error:', error);
  }
};

io.on('connection', (socket) => {
  socket.data.user = {
    id: socket.user._id.toString(),
    name: socket.user.name
  };

  console.log('Authenticated User Connected:', socket.user.email);

  // JOIN ROOM
  socket.on('join-room', async (roomId) => {
    try {
      if (typeof roomId !== 'string' || !roomId.trim()) return;

      // Leave the previous document room if this socket changes documents.
      const previousRoomId = socket.data.roomId;

      if (previousRoomId && previousRoomId !== roomId) {
        await socket.leave(previousRoomId);
        socket.data.roomId = null;
        socket.data.role = null;
        await emitRoomUsers(previousRoomId);
      }

      let document = await Document.findOne({ roomId });

      if (!document && roomId === 'document-1') {
        document = await Document.create({
          roomId,
          name: 'Untitled Document',
          owner: socket.user._id,
          code: ''
        });
      }

      if (!document) {
        socket.emit('room-error', 'Document not found');
        return;
      }

      if (!document.owner) {
        document.owner = socket.user._id;
        await document.save();
      }

      const role = getDocumentRole(document, socket.user._id);

      if (!role) {
        socket.emit('room-error', 'You do not have access to this document');
        return;
      }

      await socket.join(roomId);

      socket.data.roomId = roomId;
      socket.data.role = role;

      socket.emit('document-content', document.code || '');

      socket.emit('document-details', {
        roomId: document.roomId,
        name: document.name,
        type: document.type,
        language: document.language,
        whiteboardData: document.whiteboardData,
        role
      });

      await emitRoomUsers(roomId);

      console.log(
        `${socket.user.name} joined ${roomId} as ${role}`
      );

    } catch (error) {
      console.error('Join Room Error:', error);
      socket.emit('room-error', 'Unable to join document');
    }
  });

  // LEAVE ROOM
  socket.on('leave-room', async (roomId) => {
    try {
      if (socket.data.roomId !== roomId) return;

      await socket.leave(roomId);

      socket.data.roomId = null;
      socket.data.role = null;

      await emitRoomUsers(roomId);

    } catch (error) {
      console.error('Leave Room Error:', error);
    }
  });

  // CODE CHANGE
  socket.on('code-change', async ({ roomId, code }) => {
    try {
      if (
        !socket.rooms.has(roomId) ||
        socket.data.roomId !== roomId
      ) return;

      if (!canEdit(socket.data.role)) {
        socket.emit('permission-error', 'You have read-only access');
        return;
      }

      if (typeof code !== 'string') return;

      await Document.findOneAndUpdate(
        { roomId },
        { $set: { code } }
      );

      socket.to(roomId).emit('code-update', code);

    } catch (error) {
      console.error('Code Change Error:', error);
    }
  });

  // LANGUAGE CHANGE
  // Only the document owner or an editor can change the language.
  // The selected language is saved in MongoDB and shared with other users.
  socket.on('language-change', async ({ roomId, language }) => {
    try {
      const supportedLanguages = [
        'javascript',
        'python',
        'java',
        'cpp',
        'html',
        'css',
        'typescript',
        'json'
      ];

      if (
        typeof roomId !== 'string' ||
        !socket.rooms.has(roomId) ||
        socket.data.roomId !== roomId
      ) return;

      if (!canEdit(socket.data.role)) {
        socket.emit('permission-error', 'You have read-only access');
        return;
      }

      if (!supportedLanguages.includes(language)) {
        socket.emit('language-error', 'Unsupported programming language');
        return;
      }

      const updatedDocument = await Document.findOneAndUpdate(
        { roomId },
        { $set: { language } },
        { new: true }
      );

      if (!updatedDocument) {
        socket.emit('language-error', 'Document not found');
        return;
      }

      // Notify every other collaborator in the same document room.
      socket.to(roomId).emit('language-update', language);

    } catch (error) {
      console.error('Language Change Error:', error);
      socket.emit('language-error', 'Failed to save the selected language');
    }
  });

  // WHITEBOARD CHANGE
  socket.on('whiteboard-change', async ({ roomId, whiteboardData }) => {
    try {
      if (
        !socket.rooms.has(roomId) ||
        socket.data.roomId !== roomId
      ) return;

      if (!canEdit(socket.data.role)) {
        socket.emit('permission-error', 'You have read-only access');
        return;
      }

      await Document.findOneAndUpdate(
        { roomId },
        { $set: { whiteboardData } }
      );

      socket.to(roomId).emit('whiteboard-update', whiteboardData);

    } catch (error) {
      console.error('Whiteboard Change Error:', error);
    }
  });

  // CHAT MESSAGE
  socket.on('chat-message', async ({ roomId, message }) => {
    try {
      if (
        !socket.rooms.has(roomId) ||
        socket.data.roomId !== roomId
      ) return;

      if (
        typeof message !== 'string' ||
        !message.trim() ||
        message.length > 2000
      ) return;

      const savedMessage = await ChatMessage.create({
        roomId,
        sender: socket.user._id,
        message: message.trim()
      });

      const populatedMessage = await savedMessage.populate(
        'sender',
        'name email'
      );

      io.to(roomId).emit('new-chat-message', populatedMessage);

    } catch (error) {
      console.error('Chat Message Error:', error);
    }
  });

  // DISCONNECTING
  socket.on('disconnecting', async () => {
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) {
        await emitRoomUsers(roomId, socket.id);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User Disconnected:', socket.user.email);
  });
});

// ======================================
// START SERVER
// ======================================

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected Successfully!');

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB Connection Error:', error.message);
    process.exit(1);
  });