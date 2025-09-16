import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());
app.use(morgan('tiny'));

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

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('contact_error', e);
    return res.status(500).json({ error: 'Internal error' });
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


