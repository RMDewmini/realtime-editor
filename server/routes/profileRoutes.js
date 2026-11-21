const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');

const router = express.Router();

const uploadDirectory = path.join(__dirname, '..', 'uploads');

// Create uploads folder automatically
if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
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

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findById(decoded.userId);

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
// MULTER STORAGE
// ======================================

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const filename = `avatar-${req.user._id}-${Date.now()}${extension}`;

    callback(null, filename);
  }
});

// ======================================
// IMAGE FILE FILTER
// ======================================

const fileFilter = (req, file, callback) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(
      new Error('Only JPG, PNG and WEBP images are allowed')
    );
  }
};

// ======================================
// MULTER CONFIGURATION
// ======================================

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// ======================================
// UPLOAD PROFILE PICTURE
// ======================================

router.post(
  '/upload-avatar',
  authenticateToken,

  (req, res, next) => {
    upload.single('avatar')(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          message: error.message || 'Image upload failed'
        });
      }

      next();
    });
  },

  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: 'Please select an image'
        });
      }

      const avatar = `/uploads/${req.file.filename}`;

      const user = await User.findByIdAndUpdate(
        req.user._id,
        {
          $set: { avatar }
        },
        {
          new: true
        }
      ).select('-password');

      res.json({
        message: 'Profile picture uploaded successfully',
        user
      });

    } catch (error) {
      console.error('Avatar Upload Error:', error);

      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }

      res.status(500).json({
        message: 'Failed to upload profile picture'
      });
    }
  }
);

// ======================================
// EXPORT ROUTER
// ======================================

module.exports = router;