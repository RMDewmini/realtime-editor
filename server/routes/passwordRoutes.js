const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const User = require('../models/User');

const router = express.Router();

// Gmail email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
      ? process.env.EMAIL_PASS.replace(/\s/g, '')
      : ''
  }
});

// ======================================
// FORGOT PASSWORD
// ======================================

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        message: 'Email address is required'
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase()
    });

    // Do not reveal whether an email is registered.
    if (!user) {
      return res.json({
        message: 'If this email is registered, a reset link will be sent.'
      });
    }

    // Generate a secure random token.
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Store only the hashed token in MongoDB.
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;

    await user.save();

    const frontendUrl =
      process.env.FRONTEND_URL || 'http://localhost:5173';

    const resetLink =
      `${frontendUrl}/reset-password?token=${resetToken}`;

    try {
      await transporter.sendMail({
        from: `"Collaborative Editor" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Reset Your Password - Collaborative Editor',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 550px; margin: auto; padding: 25px;">
            <h2 style="color: #4f46e5;">Password Reset Request</h2>

            <p>Hello ${user.name},</p>

            <p>We received a request to reset your Collaborative Editor password.</p>

            <p>Click the button below to create a new password:</p>

            <a href="${resetLink}"
               style="display: inline-block; padding: 12px 22px; background: #4f46e5; color: white; text-decoration: none; border-radius: 7px;">
              Reset Password
            </a>

            <p>This link expires in 15 minutes.</p>

            <p>If you did not request this password reset, you can ignore this email.</p>

            <p>Thank you,<br>Collaborative Editor Team</p>
          </div>
        `
      });
    } catch (emailError) {
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();

      console.error('Password Reset Email Error:', emailError);

      return res.status(500).json({
        message: 'Unable to send reset email. Please check email configuration.'
      });
    }

    res.json({
      message: 'If this email is registered, a reset link will be sent.'
    });

  } catch (error) {
    console.error('Forgot Password Error:', error);

    res.status(500).json({
      message: 'Failed to process password reset request'
    });
  }
});

// ======================================
// RESET PASSWORD
// ======================================

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        message: 'Reset token and new password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters'
      });
    }

    // Hash the token received from the reset link.
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find the account with a valid, unexpired token.
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Reset link is invalid or has expired'
      });
    }

    // Hash and save the new password.
    user.password = await bcrypt.hash(password, 10);

    // Make the reset link unusable after a successful reset.
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save();

    res.json({
      message: 'Password reset successfully. You can now log in.'
    });

  } catch (error) {
    console.error('Reset Password Error:', error);

    res.status(500).json({
      message: 'Failed to reset password'
    });
  }
});

module.exports = router;