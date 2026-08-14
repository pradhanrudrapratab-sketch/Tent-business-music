require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');

const { initDb, getDb } = require('./database');
const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Init DB ---
initDb();

// --- Middleware ---
app.use(helmet({
  contentSecurityPolicy: false, // allow YouTube embeds
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Static uploads ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- NUKE MODE middleware (server-side enforcement) ---
app.use((req, res, next) => {
  // Always allow: admin routes, API routes, static assets, nuke page itself
  const allowed = [
    '/admin', '/api/', '/uploads/', '/assets/',
    '/nuke', '/favicon.ico'
  ];
  const isAllowed = allowed.some(prefix => req.path.startsWith(prefix));
  if (isAllowed) return next();

  // Check nuke status
  try {
    const db = getDb();
    const nuke = db.prepare("SELECT setting_value FROM site_settings WHERE setting_key = 'nuke_enabled'").get();
    if (nuke?.setting_value === '1') {
      return res.sendFile(path.join(__dirname, 'public', 'nuke.html'));
    }
  } catch (e) {
    // DB not ready yet, skip
  }
  next();
});

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// --- Serve public frontend (SPA-style) ---
app.use(express.static(path.join(__dirname, 'public')));

// Admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// All public routes → SPA index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`🎵 Tent Function Music running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🔐 Admin: http://localhost:${PORT}/admin`);
});
