import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Mock database (in production, use a real database)
const users = [];
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());
app.use(morgan('tiny'));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '../public')));

app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

app.get('/download', (req, res) => {
  const isoUrl = process.env.ISO_URL;
  if (!isoUrl) return res.status(500).json({ error: 'ISO_URL not configured' });

  const ua = req.headers['user-agent'] || '';
  const ref = req.headers['referer'] || '';
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();

  console.log(JSON.stringify({
    event: 'download_redirect',
    ts: new Date().toISOString(),
    ip,
    ua,
    ref
  }));

  res.redirect(302, isoUrl);
});
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body || {};
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) return res.status(400).json({ error: 'Invalid email' });

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    global.__contactHits ||= new Map();
    const hits = global.__contactHits.get(ip) || [];
    const now = Date.now();
    const recent = hits.filter((t) => now - t < 60_000);
    if (recent.length >= 5) return res.status(429).json({ error: 'Too many requests' });
    recent.push(now);
    global.__contactHits.set(ip, recent);

    const MAIL_TO = process.env.MAIL_TO;
    const MAIL_FROM = process.env.MAIL_FROM || 'no-reply@securewipe.local';
    if (!MAIL_TO) return res.status(500).json({ error: 'MAIL_TO not configured' });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
      secure: false,
      auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });

    const html = `
      <h2>New contact message</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
      <p><strong>Subject:</strong> ${subject}</p>
      <p style="white-space:pre-wrap"><strong>Message:</strong> ${message}</p>
      <hr/>
      <small>IP: ${ip}</small>
    `;

    await transporter.sendMail({
      from: MAIL_FROM,
      to: MAIL_TO,
      subject: `[SecureWipe] ${subject}`,
      replyTo: email,
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || '-'}\nSubject: ${subject}\n\n${message}\n\nIP: ${ip}`,
      html
    });

    // Persist a copy server-side for admin view
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const storePath = path.join(__dirname, 'messages.json');
      let list = [];
      if (fs.existsSync(storePath)) {
        try { list = JSON.parse(fs.readFileSync(storePath, 'utf-8')); } catch {}
      }
      list.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        ts: new Date().toISOString(),
        name, email, phone: phone || '', subject, message, ip
      });
      fs.writeFileSync(storePath, JSON.stringify(list, null, 2));
    } catch (e) {
      console.error('messages_store_error', e);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('contact_error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// --- Authentication endpoints ---
// Register new user
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    // Check if user already exists
    const existingUser = users.find(user => user.email === email);
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = {
      id: uuidv4(),
      name,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      stats: {
        totalWipes: 0,
        devicesWiped: 0,
        dataSecured: 0,
        certificatesGenerated: 0
      }
    };

    users.push(user);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({
      message: 'User created successfully',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const user = users.find(user => user.email === email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Google OAuth login/signup
app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name, googleId, picture } = req.body;

    // Validate input
    if (!email || !name || !googleId) {
      return res.status(400).json({ message: 'Google authentication data is incomplete' });
    }

    // Find existing user
    let user = users.find(user => user.email === email);

    if (user) {
      // Update existing user with Google ID if not already set
      if (!user.googleId) {
        user.googleId = googleId;
        user.picture = picture;
      }
    } else {
      // Create new user
      user = {
        id: uuidv4(),
        name,
        email,
        googleId,
        picture,
        createdAt: new Date().toISOString(),
        stats: {
          totalWipes: 0,
          devicesWiped: 0,
          dataSecured: 0,
          certificatesGenerated: 0
        }
      };
      users.push(user);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      message: 'Google authentication successful',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user stats
app.get('/api/user/stats', (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: 'Invalid or expired token' });
      }

      const user = users.find(user => user.id === decoded.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json(user.stats);
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Forgot password (placeholder)
app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  
  // In production, send password reset email
  res.json({ message: 'Password reset instructions sent to your email' });
});

// --- Admin endpoints ---
function requireAuth(req, res, next){
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = process.env.ADMIN_USER;
  const p = process.env.ADMIN_PASS;
  if (!u || !p) return res.status(500).json({ error: 'Admin credentials not configured' });
  if (username !== u || password !== p) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ sub: u, role: 'admin' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '12h' });
  res.json({ token });
});

app.get('/api/admin/messages', requireAuth, (req, res) => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const storePath = path.join(__dirname, 'messages.json');
    if (!fs.existsSync(storePath)) return res.json([]);
    const list = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    res.json(list.slice().reverse());
  } catch (e) {
    console.error('messages_read_error', e);
    res.status(500).json({ error: 'Failed to read messages' });
  }
});

app.delete('/api/admin/messages/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const storePath = path.join(__dirname, 'messages.json');
    const list = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf-8')) : [];
    const next = list.filter(m => m.id !== id);
    fs.writeFileSync(storePath, JSON.stringify(next, null, 2));
    res.json({ ok: true });
  } catch (e) {
    console.error('messages_delete_error', e);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});
app.get('/api/releases/latest', (req, res) => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const jsonPath = path.join(__dirname, 'releases.json');
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(raw);
    if (data.iso_url === '${ISO_URL}' && process.env.ISO_URL) {
      data.iso_url = process.env.ISO_URL;
    }
    res.json(data);
  } catch (e) {
    console.error('releases_error', e);
    res.status(500).json({ error: 'Failed to read releases' });
  }
});

app.listen(PORT, () => {
  console.log(`SecureWipe backend listening on http://localhost:${PORT}`);
});


