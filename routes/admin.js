const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require auth
router.use(requireAdmin);

// --- Multer setup ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'uploads/thumbnails';
    if (file.fieldname === 'audio') folder = 'uploads/audio';
    else if (file.fieldname === 'background') folder = 'uploads/backgrounds';
    const dir = path.join(__dirname, '..', folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedImages = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const allowedAudio = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.fieldname === 'audio') {
    cb(null, allowedAudio.includes(ext));
  } else {
    cb(null, allowedImages.includes(ext));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ============ DASHBOARD ============
router.get('/dashboard', (req, res) => {
  const db = getDb();
  const stats = {
    online: db.prepare("SELECT COUNT(*) as c FROM visitor_presence WHERE last_seen >= datetime('now', '-5 minutes')").get().c,
    songs: db.prepare("SELECT COUNT(*) as c FROM songs WHERE status = 'active'").get().c,
    categories: db.prepare("SELECT COUNT(*) as c FROM categories").get().c,
    functions: db.prepare("SELECT COUNT(*) as c FROM functions").get().c,
    playlists: db.prepare("SELECT COUNT(*) as c FROM playlists").get().c,
    ratings: db.prepare("SELECT COUNT(*) as c FROM ratings").get().c,
    suggestions_pending: db.prepare("SELECT COUNT(*) as c FROM suggestions WHERE status = 'pending'").get().c,
  };
  const topSongs = db.prepare("SELECT id, title, artist, play_count, average_rating FROM songs WHERE status='active' ORDER BY play_count DESC LIMIT 5").all();
  const recentSuggestions = db.prepare("SELECT * FROM suggestions ORDER BY created_at DESC LIMIT 5").all();
  res.json({ stats, topSongs, recentSuggestions });
});

// ============ CATEGORIES ============
router.get('/categories', (req, res) => {
  const db = getDb();
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
  res.json(cats);
});

router.post('/categories', (req, res) => {
  const { name, slug, icon, description, sort_order, is_visible } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO categories (name, slug, icon, description, sort_order, is_visible)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, slug, icon || '🎵', description || null, sort_order || 0, is_visible !== false ? 1 : 0);
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Slug already exists' });
  }
});

router.put('/categories/:id', (req, res) => {
  const { name, slug, icon, description, sort_order, is_visible } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE categories SET name=?, slug=?, icon=?, description=?, sort_order=?, is_visible=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, slug, icon, description, sort_order, is_visible ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/categories/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ FUNCTIONS ============
router.get('/functions', (req, res) => {
  const db = getDb();
  const funcs = db.prepare(`
    SELECT f.*, c.name as category_name FROM functions f
    LEFT JOIN categories c ON c.id = f.category_id
    ORDER BY f.category_id, f.sort_order ASC
  `).all();
  res.json(funcs);
});

router.post('/functions', (req, res) => {
  const { category_id, name, slug, icon, description, sort_order, is_visible } = req.body;
  if (!category_id || !name || !slug) return res.status(400).json({ error: 'category_id, name, slug required' });
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO functions (category_id, name, slug, icon, description, sort_order, is_visible)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(category_id, name, slug, icon || '🎶', description || null, sort_order || 0, is_visible !== false ? 1 : 0);
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Slug already exists' });
  }
});

router.put('/functions/:id', (req, res) => {
  const { category_id, name, slug, icon, description, sort_order, is_visible } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE functions SET category_id=?, name=?, slug=?, icon=?, description=?, sort_order=?, is_visible=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(category_id, name, slug, icon, description, sort_order, is_visible ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/functions/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM functions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ SONGS ============
router.get('/songs', (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = req.query.q ? `%${req.query.q}%` : null;

  let query = `
    SELECT s.*, c.name as category_name, f.name as function_name
    FROM songs s
    LEFT JOIN categories c ON c.id = s.category_id
    LEFT JOIN functions f ON f.id = s.function_id
  `;
  let countQuery = 'SELECT COUNT(*) as total FROM songs s';
  const params = [];

  if (search) {
    query += ' WHERE s.title LIKE ? OR s.artist LIKE ?';
    countQuery += ' WHERE s.title LIKE ? OR s.artist LIKE ?';
    params.push(search, search);
  }

  query += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
  const songs = db.prepare(query).all(...params, limit, offset);
  const total = db.prepare(countQuery).get(...params).total;

  res.json({ songs, total, page, pages: Math.ceil(total / limit) });
});

router.post('/songs', upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), (req, res) => {
  const { title, artist, source_type, source_url, category_id, function_id, tags, status } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  const thumbnail = req.files?.thumbnail ? `/uploads/thumbnails/${req.files.thumbnail[0].filename}` : null;
  const audio_file = req.files?.audio ? `/uploads/audio/${req.files.audio[0].filename}` : null;

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO songs (title, artist, source_type, source_url, audio_file, thumbnail, category_id, function_id, tags, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, artist || null, source_type || 'youtube', source_url || null,
    audio_file, thumbnail, category_id || null, function_id || null,
    tags || '', status || 'active'
  );
  res.json({ id: result.lastInsertRowid });
});

router.put('/songs/:id', upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]), (req, res) => {
  const { title, artist, source_type, source_url, category_id, function_id, tags, status } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Song not found' });

  const thumbnail = req.files?.thumbnail
    ? `/uploads/thumbnails/${req.files.thumbnail[0].filename}`
    : existing.thumbnail;
  const audio_file = req.files?.audio
    ? `/uploads/audio/${req.files.audio[0].filename}`
    : existing.audio_file;

  db.prepare(`
    UPDATE songs SET title=?, artist=?, source_type=?, source_url=?, audio_file=?, thumbnail=?,
    category_id=?, function_id=?, tags=?, status=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(title, artist, source_type, source_url, audio_file, thumbnail,
    category_id || null, function_id || null, tags, status, req.params.id);

  res.json({ success: true });
});

router.delete('/songs/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM songs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ PLAYLISTS ============
router.get('/playlists', (req, res) => {
  const db = getDb();
  const playlists = db.prepare(`
    SELECT pl.*, c.name as category_name, f.name as function_name,
           COUNT(ps.song_id) as song_count
    FROM playlists pl
    LEFT JOIN categories c ON c.id = pl.category_id
    LEFT JOIN functions f ON f.id = pl.function_id
    LEFT JOIN playlist_songs ps ON ps.playlist_id = pl.id
    GROUP BY pl.id
    ORDER BY pl.sort_order ASC
  `).all();
  res.json(playlists);
});

router.post('/playlists', (req, res) => {
  const { name, slug, description, category_id, function_id, icon, sort_order, is_featured, is_visible } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO playlists (name, slug, description, category_id, function_id, icon, sort_order, is_featured, is_visible)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, slug, description, category_id || null, function_id || null,
      icon || '🎵', sort_order || 0, is_featured ? 1 : 0, is_visible !== false ? 1 : 0);
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Slug already exists' });
  }
});

router.put('/playlists/:id', (req, res) => {
  const { name, slug, description, category_id, function_id, icon, sort_order, is_featured, is_visible } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE playlists SET name=?, slug=?, description=?, category_id=?, function_id=?, icon=?,
    sort_order=?, is_featured=?, is_visible=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(name, slug, description, category_id || null, function_id || null, icon,
    sort_order, is_featured ? 1 : 0, is_visible ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/playlists/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM playlists WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Add song to playlist
router.post('/playlists/:id/songs', (req, res) => {
  const { song_id, sort_order } = req.body;
  const db = getDb();
  try {
    db.prepare('INSERT INTO playlist_songs (playlist_id, song_id, sort_order) VALUES (?, ?, ?)').run(req.params.id, song_id, sort_order || 0);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Song already in playlist' });
  }
});

// Remove song from playlist
router.delete('/playlists/:id/songs/:songId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?').run(req.params.id, req.params.songId);
  res.json({ success: true });
});

// ============ SUGGESTIONS ============
router.get('/suggestions', (req, res) => {
  const db = getDb();
  const status = req.query.status || 'pending';
  const suggestions = db.prepare(`
    SELECT s.*, f.name as function_name FROM suggestions s
    LEFT JOIN functions f ON f.id = s.function_id
    WHERE s.status = ? ORDER BY s.created_at DESC
  `).all(status);
  res.json(suggestions);
});

router.post('/suggestions/:id/approve', upload.single('admin_audio_file'), (req, res) => {
  const { title, artist, category_id, function_id, source_type, source_url, tags } = req.body;
  if (!title || !source_type) return res.status(400).json({ error: 'Title and source type required' });

  const db = getDb();
  const suggestion = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(req.params.id);
  if (!suggestion) return res.status(404).json({ error: 'Not found' });

  const audio_file = req.file ? `/uploads/audio/${req.file.filename}` : null;

  // Create song from suggestion
  const songResult = db.prepare(`
    INSERT INTO songs (title, artist, source_type, source_url, audio_file, category_id, function_id, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, artist || null, source_type, source_url || null, audio_file, category_id || null, function_id || null, tags || '');

  db.prepare(`
    UPDATE suggestions SET status='approved', reviewed_at=CURRENT_TIMESTAMP,
    admin_source_type=?, admin_source_url=? WHERE id=?
  `).run(source_type, source_url, req.params.id);

  res.json({ success: true, song_id: songResult.lastInsertRowid });
});

router.post('/suggestions/:id/reject', (req, res) => {
  const db = getDb();
  db.prepare("UPDATE suggestions SET status='rejected', reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

router.delete('/suggestions/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM suggestions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ MENU ============
router.get('/menu', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM menu_items ORDER BY sort_order ASC').all());
});

router.post('/menu', (req, res) => {
  const { name, icon, redirect_url, sort_order, is_visible } = req.body;
  if (!name || !redirect_url) return res.status(400).json({ error: 'Name and URL required' });
  const db = getDb();
  const result = db.prepare('INSERT INTO menu_items (name, icon, redirect_url, sort_order, is_visible) VALUES (?, ?, ?, ?, ?)').run(name, icon || '📄', redirect_url, sort_order || 0, is_visible !== false ? 1 : 0);
  res.json({ id: result.lastInsertRowid });
});

router.put('/menu/:id', (req, res) => {
  const { name, icon, redirect_url, sort_order, is_visible } = req.body;
  const db = getDb();
  db.prepare('UPDATE menu_items SET name=?, icon=?, redirect_url=?, sort_order=?, is_visible=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, icon, redirect_url, sort_order, is_visible ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/menu/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ SETTINGS ============
router.get('/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT setting_key, setting_value FROM site_settings').all();
  const settings = {};
  for (const row of rows) settings[row.setting_key] = row.setting_value;
  res.json(settings);
});

router.put('/settings', (req, res) => {
  const db = getDb();
  const update = db.prepare('UPDATE site_settings SET setting_value=?, updated_at=CURRENT_TIMESTAMP WHERE setting_key=?');
  const insert = db.prepare('INSERT OR IGNORE INTO site_settings (setting_key, setting_value) VALUES (?, ?)');

  const updateMany = db.transaction((settings) => {
    for (const [key, value] of Object.entries(settings)) {
      insert.run(key, value);
      update.run(value, key);
    }
  });
  updateMany(req.body);
  res.json({ success: true });
});

// ============ NUKE MODE ============
router.get('/nuke', (req, res) => {
  const db = getDb();
  const setting = db.prepare("SELECT setting_value FROM site_settings WHERE setting_key = 'nuke_enabled'").get();
  res.json({ nuke_enabled: setting?.setting_value === '1' });
});

router.post('/nuke/enable', (req, res) => {
  const db = getDb();
  db.prepare("UPDATE site_settings SET setting_value='1' WHERE setting_key='nuke_enabled'").run();
  res.json({ success: true, nuke_enabled: true });
});

router.post('/nuke/disable', (req, res) => {
  const db = getDb();
  db.prepare("UPDATE site_settings SET setting_value='0' WHERE setting_key='nuke_enabled'").run();
  res.json({ success: true, nuke_enabled: false });
});

// Background upload
router.post('/upload/background', upload.single('background'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/backgrounds/${req.file.filename}` });
});

router.post('/upload/thumbnail', upload.single('thumbnail'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/thumbnails/${req.file.filename}` });
});

module.exports = router;
