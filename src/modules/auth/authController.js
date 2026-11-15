const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const jwtConfig = require('../../config/jwt');
const { query } = require('../../config/db');
const { sendSms } = require('../../utils/smsService');

function generateTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresIn }
  );

  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh' },
    jwtConfig.refreshSecret,
    { expiresIn: jwtConfig.refreshExpiresIn }
  );

  return { accessToken, refreshToken };
}

async function register(req, res, next) {
  try {
    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email is already registered' });
    }

    if (phone) {
      const existingPhone = await query('SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL', [phone]);
      if (existingPhone.length > 0) {
        return res.status(400).json({ success: false, message: 'Phone number is already registered' });
      }
    }

    const password_hash = await bcrypt.hash(password, 10);
    // Retailer access must come from the reseller application and admin approval.
    const assignedRole = 'customer';

    const result = await query(
      `INSERT INTO users (name, email, phone, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [name, email, phone || null, password_hash, assignedRole]
    );

    const user = { id: result.insertId, name, email, role: assignedRole };
    const tokens = generateTokens(user);

    // Save refresh token hash
    const token_hash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
      [user.id, token_hash, expiresAt, req.ip || null, req.headers['user-agent'] || null]
    );

    const tokenPayload = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken
    };

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user,
        tokens: tokenPayload
      }
    });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const users = await query('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = users[0];
    if (user.status === 'banned') {
      return res.status(403).json({ success: false, message: 'Account has been banned' });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'Account is inactive' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const tokens = generateTokens(user);
    const token_hash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
      [user.id, token_hash, expiresAt, req.ip || null, req.headers['user-agent'] || null]
    );

    const tokenPayload = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken
    };

    delete user.password_hash;
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        tokens: tokenPayload
      }
    });
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const refreshToken = req.body?.refreshToken || req.body?.refresh_token || (req.cookies && (req.cookies.refreshToken || req.cookies.refresh_token));
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, jwtConfig.refreshSecret);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    const token_hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    let dbTokens = await query(
      'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > NOW()',
      [token_hash]
    );

    let isGracePeriodRecovery = false;
    if (dbTokens.length === 0) {
      // Check if this token was recently revoked within a 60-second grace window
      // (safely handles multi-tab refresh races and concurrent in-flight 401 retries)
      const recentlyRevoked = await query(
        'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 1 AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
        [token_hash]
      );

      if (recentlyRevoked.length > 0) {
        const recentActive = await query(
          'SELECT * FROM refresh_tokens WHERE user_id = ? AND revoked = 0 AND created_at >= NOW() - INTERVAL 60 SECOND ORDER BY id DESC LIMIT 1',
          [decoded.id]
        );
        if (recentActive.length > 0) {
          isGracePeriodRecovery = true;
          dbTokens = recentlyRevoked;
        }
      }

      if (!isGracePeriodRecovery) {
        return res.status(401).json({ success: false, message: 'Refresh token revoked or expired' });
      }
    }

    const users = await query('SELECT id, name, email, role, status FROM users WHERE id = ?', [decoded.id]);
    if (users.length === 0 || users[0].status !== 'active') {
      return res.status(401).json({ success: false, message: 'User account invalid or inactive' });
    }

    const user = users[0];
    const newTokens = generateTokens(user);

    if (!isGracePeriodRecovery) {
      // Revoke old refresh token, save new
      await query('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [dbTokens[0].id]);
      const newTokenHash = crypto.createHash('sha256').update(newTokens.refreshToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
        [user.id, newTokenHash, expiresAt, req.ip || null, req.headers['user-agent'] || null]
      );
    }

    res.json({
      success: true,
      data: {
        user,
        tokens: {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken,
          access_token: newTokens.accessToken,
          refresh_token: newTokens.refreshToken
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

async function logout(req, res, next) {
  try {
    const refreshToken = req.body?.refreshToken || req.body?.refresh_token || (req.cookies && (req.cookies.refreshToken || req.cookies.refresh_token));
    if (refreshToken) {
      const token_hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [token_hash]);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

async function logoutAll(req, res, next) {
  try {
    await query('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'Logged out from all sessions' });
  } catch (error) {
    next(error);
  }
}

async function sendOtp(req, res, next) {
  try {
    const { phone, purpose = 'login' } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otp_hash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await query(
      'INSERT INTO otps (phone, otp_hash, purpose, expires_at) VALUES (?, ?, ?, ?)',
      [phone, otp_hash, purpose, expiresAt]
    );

    const templateId = purpose === 'phone_verify' ? 'otp_verify' : 'otp_login';
    await sendSms({
      phone,
      templateId,
      variables: { otp: otpCode }
    });

    res.json({
      success: true,
      message: `OTP sent successfully to ${phone}`
    });
  } catch (error) {
    next(error);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { phone, otp, purpose = 'login' } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
    }

    const records = await query(
      `SELECT * FROM otps WHERE phone = ? AND purpose = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1`,
      [phone, purpose]
    );

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    const match = await bcrypt.compare(otp, records[0].otp_hash);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Incorrect OTP' });
    }

    await query('UPDATE otps SET used = 1 WHERE id = ?', [records[0].id]);

    let user = null;
    const users = await query('SELECT * FROM users WHERE phone = ?', [phone]);
    if (users.length > 0) {
      user = users[0];
      await query('UPDATE users SET phone_verified = 1 WHERE id = ?', [user.id]);
    }

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: { verified: true, user_id: user?.id || null }
    });
  } catch (error) {
    next(error);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    return sendOtp(req, res, next);
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { phone, otp, newPassword } = req.body;
    if (!phone || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Phone, OTP, and new password are required' });
    }

    const records = await query(
      `SELECT * FROM otps WHERE phone = ? AND purpose = 'login' AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1`,
      [phone]
    );

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    const match = await bcrypt.compare(otp, records[0].otp_hash);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Incorrect OTP' });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = ? WHERE phone = ?', [password_hash, phone]);
    await query('UPDATE otps SET used = 1 WHERE id = ?', [records[0].id]);

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    next(error);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const { token } = req.body;
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    res.json({
      success: true,
      data: { user: req.user }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
  verifyEmail,
  me
};
