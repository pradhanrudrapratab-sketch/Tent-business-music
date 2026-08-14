const express = require('express');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');

const router = express.Router();

const suggestionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many suggestions. Please try again later.' }
});

const ratingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many rating requests.' }
});

// GET /api/settings - public site config
router.get('/settings', (req, res) => {
  const db = getDb();
  const publicKeys = [
    'site_name', 'site_logo', 'search_placeholder',
    'nuke_enabled', 'nuke_title', 'nuke_message', 'nuke_icon',
    'glass_opacity', 'glass_blur', 'glass_border_opacity', 'glass_border_radius',
    'light_background', 'dark_background'
  ];
  const rows = db.prepare(`SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN (${publicKeys.map(() => '?').join(',')})`).all(...publicKeys);
  const settings = {};
  for (const row of rows) settings[row.setting_key] = row.setting_value;
  res.json(settings);
});

// GET /api/menu
router.get('/menu', (req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM menu_items WHERE is_visible = 1 ORDER BY sort_order ASC').all();
  res.json(items);
});

// GET /api/categories
router.get('/categories', (req, res) => {
  const db = getDb();
  const categories = db.prepare(`
    SELECT c.*, COUNT(f.id) as function_count
    FROM categories c
    LEFT JOIN functions f ON f.category_id = c.id AND f.is_visible = 1
    WHERE c.is_visible = 1
    GROUP BY c.id
    ORDER BY c.sort_order ASC
  `).all();
  res.json(categories);
});

// GET /api/categories/:slug
router.get('/categories/:slug', (req, res) => {
  const db = getDb();
  const category = db.prepare('SELECT * FROM categories WHERE slug = ? AND is_visible = 1').get(req.params.slug);
  if (!category) return res.status(404).json({ error: 'Category not found' });

  const functions = db.prepare(`
    SELECT f.*, COUNT(ps.song_id) as song_count
    FROM functions f
    LEFT JOIN playlists pl ON pl.function_id = f.id
    LEFT JOIN playlist_songs ps ON ps.playlist_id = pl.id
    WHERE f.category_id = ? AND f.is_visible = 1
    GROUP BY f.id
    ORDER BY f.sort_order ASC
  `).all(category.id);

  res.json({ category, functions });
});

// GET /api/functions/:slug
router.get('/functions/:slug', (req, res) => {
  const db = getDb();
  const func = db.prepare(`
    SELECT f.*, c.name as category_name, c.slug as category_slug
    FROM functions f
    LEFT JOIN categories c ON c.id = f.category_id
    WHERE f.slug = ? AND f.is_visible = 1
  `).get(req.params.slug);
  if (!func) return res.status(404).json({ error: 'Function not found' });

  const playlists = db.prepare(`
    SELECT pl.*, COUNT(ps.song_id) as song_count
    FROM playlists pl
    LEFT JOIN playlist_songs ps ON ps.playlist_id = pl.id
    WHERE pl.function_id = ? AND pl.is_visible = 1
    GROUP BY pl.id
    ORDER BY pl.sort_order ASC
  `).all(func.id);

  // If no playlists, get songs directly assigned to this function
  const directSongs = db.prepare(`
    SELECT * FROM songs
    WHERE function_id = ? AND status = 'active'
    ORDER BY play_count DESC
  `).all(func.id);

  res.json({ function: func, playlists, directSongs });
});

// GET /api/playlists/featured
router.get('/playlists/featured', (req, res) => {
  const db = getDb();
  const playlists = db.prepare(`
    SELECT pl.*, c.name as category_name, c.icon as category_icon,
           COUNT(ps.song_id) as song_count
    FROM playlists pl
    LEFT JOIN categories c ON c.id = pl.category_id
    LEFT JOIN playlist_songs ps ON ps.playlist_id = pl.id
    WHERE pl.is_featured = 1 AND pl.is_visible = 1
    GROUP BY pl.id
    ORDER BY pl.sort_order ASC
    LIMIT 12
  `).all();
  res.json(playlists);
});

// GET /api/playlists/popular
router.get('/playlists/popular', (req, res) => {
  const db = getDb();
  const playlists = db.prepare(`
    SELECT pl.*, c.name as category_name, c.icon as category_icon,
           COUNT(ps.song_id) as song_count
    FROM playlists pl
    LEFT JOIN categories c ON c.id = pl.category_id
    LEFT JOIN playlist_songs ps ON ps.playlist_id = pl.id
    WHERE pl.is_visible = 1
    GROUP BY pl.id
    ORDER BY pl.play_count DESC
    LIMIT 10
  `).all();
  res.json(playlists);
});

// GET /api/playlists/:slug
router.get('/playlists/:slug', (req, res) => {
  const db = getDb();
  const playlist = db.prepare(`
    SELECT pl.*, c.name as category_name, f.name as function_name
    FROM playlists pl
    LEFT JOIN categories c ON c.id = pl.category_id
    LEFT JOIN functions f ON f.id = pl.function_id
    WHERE pl.slug = ? AND pl.is_visible = 1
  `).get(req.params.slug);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

  const songs = db.prepare(`
    SELECT s.*, ps.sort_order as playlist_order
    FROM songs s
    JOIN playlist_songs ps ON ps.song_id = s.id
    WHERE ps.playlist_id = ? AND s.status = 'active'
    ORDER BY ps.sort_order ASC
  `).all(playlist.id);

  res.json({ playlist, songs });
});

// GET /api/songs/search?q=baraat
router.get('/songs/search', (req, res) => {
  const db = getDb();
  const q = req.query.q?.trim();
  if (!q || q.length < 2) return res.json({ songs: [], playlists: [], categories: [], functions: [] });

  const like = `%${q}%`;

  const songs = db.prepare(`
    SELECT s.*, c.name as category_name, f.name as function_name
    FROM songs s
    LEFT JOIN categories c ON c.id = s.category_id
    LEFT JOIN functions f ON f.id = s.function_id
    WHERE s.status = 'active' AND (
      s.title LIKE ? OR s.artist LIKE ? OR s.tags LIKE ?
    )
    LIMIT 20
  `).all(like, like, like);

  const playlists = db.prepare(`
    SELECT pl.*, c.name as category_name
    FROM playlists pl
    LEFT JOIN categories c ON c.id = pl.category_id
    WHERE pl.is_visible = 1 AND (pl.name LIKE ? OR pl.description LIKE ?)
    LIMIT 10
  `).all(like, like);

  const categories = db.prepare(`
    SELECT * FROM categories WHERE is_visible = 1 AND name LIKE ?
    LIMIT 5
  `).all(like);

  const functions = db.prepare(`
    SELECT f.*, c.name as category_name FROM functions f
    LEFT JOIN categories c ON c.id = f.category_id
    WHERE f.is_visible = 1 AND f.name LIKE ?
    LIMIT 10
  `).all(like);

  res.json({ songs, playlists, categories, functions });
});

// POST /api/songs/:id/play — increment play count
router.post('/songs/:id/play', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE songs SET play_count = play_count + 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/songs/:id/rating
router.post('/songs/:id/rating', ratingLimiter, (req, res) => {
  const { rating, session_id } = req.body;
  const songId = parseInt(req.params.id);

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be 1-5' });
  }
  if (!session_id) {
    return res.status(400).json({ error: 'Session ID required' });
  }

  const db = getDb();
  const song = db.prepare('SELECT id FROM songs WHERE id = ?').get(songId);
  if (!song) return res.status(404).json({ error: 'Song not found' });

  try {
    db.prepare(`
      INSERT INTO ratings (song_id, rating, session_id) VALUES (?, ?, ?)
      ON CONFLICT(song_id, session_id) DO UPDATE SET rating = excluded.rating
    `).run(songId, rating, session_id);

    // Recalculate average
    const stats = db.prepare(`
      SELECT AVG(rating) as avg, COUNT(*) as cnt FROM ratings WHERE song_id = ?
    `).get(songId);

    db.prepare(`
      UPDATE songs SET average_rating = ?, rating_count = ? WHERE id = ?
    `).run(Math.round(stats.avg * 10) / 10, stats.cnt, songId);

    res.json({ success: true, average_rating: stats.avg, rating_count: stats.cnt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

// POST /api/suggestions
router.post('/suggestions', suggestionLimiter, (req, res) => {
  const { suggested_title, artist, function_id, suggested_url, message } = req.body;

  if (!suggested_title?.trim()) {
    return res.status(400).json({ error: 'Song name is required' });
  }
  if (suggested_title.length > 200) {
    return res.status(400).json({ error: 'Song name too long' });
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO suggestions (suggested_title, artist, function_id, suggested_url, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    suggested_title.trim(),
    artist?.trim() || null,
    function_id || null,
    suggested_url?.trim() || null,
    message?.trim()?.slice(0, 500) || null
  );

  res.json({ success: true, message: 'Thank you for your suggestion!' });
});

// POST /api/visitors/heartbeat
router.post('/visitors/heartbeat', (req, res) => {
  const { session_id, current_page } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const db = getDb();
  db.prepare(`
    INSERT INTO visitor_presence (session_id, current_page, last_seen)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(session_id) DO UPDATE SET
      current_page = excluded.current_page,
      last_seen = CURRENT_TIMESTAMP
  `).run(session_id, current_page || '/');

  // Cleanup stale visitors (>5 min)
  const timeout = db.prepare("SELECT setting_value FROM site_settings WHERE setting_key = 'visitor_timeout_minutes'").get();
  const mins = parseInt(timeout?.setting_value || 5);
  db.prepare(`DELETE FROM visitor_presence WHERE last_seen < datetime('now', '-${mins} minutes')`).run();

  const onlineCount = db.prepare("SELECT COUNT(*) as count FROM visitor_presence WHERE last_seen >= datetime('now', '-5 minutes')").get();
  res.json({ online: onlineCount.count });
});

// GET /api/visitors/online
router.get('/visitors/online', (req, res) => {
  const db = getDb();
  const result = db.prepare("SELECT COUNT(*) as count FROM visitor_presence WHERE last_seen >= datetime('now', '-5 minutes')").get();
  res.json({ online: result.count });
});

module.exports = router;
