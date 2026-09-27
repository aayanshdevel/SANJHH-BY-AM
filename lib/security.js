/**
 * Security helpers: admin sessions, constant-time comparison,
 * input sanitisation / validation, and a simple in-memory rate limiter.
 * Secrets come exclusively from environment variables — never from client code.
 */
const crypto = require('crypto');

/* ── admin sessions (in-memory, 8h expiry) ─────────────────────────── */
const sessions = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000;

function createSession(email) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { email, expires: Date.now() + SESSION_TTL });
  return token;
}
function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(token); return null; }
  return s;
}
function destroySession(token) { sessions.delete(token); }

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // still perform a comparison to keep timing uniform
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/* ── validation / sanitisation ─────────────────────────────────────── */
const strip = (v, max = 300) =>
  String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

const stripMultiline = (v, max = 1000) =>
  String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max);

const isEmail = (v) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(String(v || ''));
const isPhone = (v) => /^[6-9]\d{9}$/.test(String(v || '').replace(/[\s-]/g, ''));
const isPincode = (v) => /^[1-9]\d{5}$/.test(String(v || '').trim());

const escapeHtml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ── rate limiter ──────────────────────────────────────────────────── */
const buckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    }
    arr.push(now);
    buckets.set(key, arr);
    next();
  };
}

module.exports = {
  createSession, getSession, destroySession, safeEqual,
  strip, stripMultiline, isEmail, isPhone, isPincode, escapeHtml, rateLimit,
};
