const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    -- Admins
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Categories (Wedding, Puja, Death, Birthday, etc.)
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT '🎵',
      thumbnail TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      is_visible INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Functions (Haldi, Baraat, Ganesh Puja, etc.)
    CREATE TABLE IF NOT EXISTS functions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT '🎶',
      thumbnail TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      is_visible INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    -- Playlists
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      category_id INTEGER,
      function_id INTEGER,
      thumbnail TEXT,
      icon TEXT DEFAULT '🎵',
      sort_order INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      is_visible INTEGER DEFAULT 1,
      play_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (function_id) REFERENCES functions(id) ON DELETE SET NULL
    );

    -- Songs
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT,
      source_type TEXT NOT NULL DEFAULT 'youtube',
      source_url TEXT,
      audio_file TEXT,
      thumbnail TEXT,
      category_id INTEGER,
      function_id INTEGER,
      tags TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      play_count INTEGER DEFAULT 0,
      average_rating REAL DEFAULT 0,
      rating_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (function_id) REFERENCES functions(id) ON DELETE SET NULL
    );

    -- Playlist <-> Songs mapping
    CREATE TABLE IF NOT EXISTS playlist_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      song_id INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0,
      UNIQUE(playlist_id, song_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    -- Ratings
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      session_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(song_id, session_id),
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    -- Music Suggestions from public
    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggested_title TEXT NOT NULL,
      artist TEXT,
      function_id INTEGER,
      suggested_url TEXT,
      message TEXT,
      status TEXT DEFAULT 'pending',
      admin_source_type TEXT,
      admin_source_url TEXT,
      admin_audio_file TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME,
      FOREIGN KEY (function_id) REFERENCES functions(id) ON DELETE SET NULL
    );

    -- Hamburger menu items
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '📄',
      redirect_url TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_visible INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Global site settings (key-value)
    CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Per-page appearance settings
    CREATE TABLE IF NOT EXISTS page_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_key TEXT UNIQUE NOT NULL,
      light_background TEXT,
      dark_background TEXT,
      title TEXT,
      description TEXT,
      settings_json TEXT DEFAULT '{}',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Live visitor presence (heartbeat-based)
    CREATE TABLE IF NOT EXISTS visitor_presence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      current_page TEXT DEFAULT '/',
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category_id);
    CREATE INDEX IF NOT EXISTS idx_songs_function ON songs(function_id);
    CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status);
    CREATE INDEX IF NOT EXISTS idx_functions_category ON functions(category_id);
    CREATE INDEX IF NOT EXISTS idx_visitor_last_seen ON visitor_presence(last_seen);
    CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
  `);

  // Seed default admin
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const existingAdmin = db.prepare('SELECT id FROM admins WHERE username = ?').get(adminUser);
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPass, 12);
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(adminUser, hash);
    console.log(`✅ Admin created: ${adminUser}`);
  }

  // Seed default site settings
  const defaultSettings = [
    ['site_name', 'Tent Function Music'],
    ['site_logo', ''],
    ['search_placeholder', 'Search songs, wedding, puja, birthday...'],
    ['nuke_enabled', '0'],
    ['nuke_title', 'Website Temporarily Unavailable'],
    ['nuke_message', 'Please check back soon.'],
    ['nuke_icon', '🔧'],
    ['glass_opacity', '0.15'],
    ['glass_blur', '12'],
    ['glass_border_opacity', '0.25'],
    ['glass_border_radius', '16'],
    ['light_background', ''],
    ['dark_background', ''],
    ['visitor_timeout_minutes', '5'],
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO site_settings (setting_key, setting_value) VALUES (?, ?)
  `);
  for (const [key, value] of defaultSettings) {
    insertSetting.run(key, value);
  }

  // Seed default menu items
  const menuCount = db.prepare('SELECT COUNT(*) as c FROM menu_items').get();
  if (menuCount.c === 0) {
    const menuItems = [
      ['Home', '🏠', '/', 1],
      ['Wedding', '💍', '/category/wedding', 2],
      ['Puja', '🛕', '/category/puja', 3],
      ['Mourning', '🕊️', '/category/mourning', 4],
      ['Birthday', '🎂', '/category/birthday', 5],
      ['Anniversary', '🎉', '/category/anniversary', 6],
      ['Popular', '🔥', '/popular', 7],
      ['Suggest Music', '💡', '/suggest', 8],
    ];
    const insertMenu = db.prepare(`
      INSERT INTO menu_items (name, icon, redirect_url, sort_order) VALUES (?, ?, ?, ?)
    `);
    for (const item of menuItems) insertMenu.run(...item);
  }

  // Seed default categories
  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (catCount.c === 0) {
    const categories = [
      ['Wedding / Marriage', 'wedding', '💍', 1],
      ['Puja / Religious', 'puja', '🛕', 2],
      ['Death / Mourning', 'mourning', '🕊️', 3],
      ['Birthday', 'birthday', '🎂', 4],
      ['Anniversary', 'anniversary', '🎉', 5],
      ['Festival', 'festival', '🎊', 6],
    ];
    const insertCat = db.prepare(`
      INSERT INTO categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)
    `);
    const weddingId = db.prepare('SELECT id FROM categories WHERE slug = ?');

    for (const [name, slug, icon, order] of categories) {
      insertCat.run(name, slug, icon, order);
    }

    // Seed wedding functions
    const weddingCat = db.prepare('SELECT id FROM categories WHERE slug = ?').get('wedding');
    const pujaCat = db.prepare('SELECT id FROM categories WHERE slug = ?').get('puja');
    const mourningCat = db.prepare('SELECT id FROM categories WHERE slug = ?').get('mourning');

    const insertFunc = db.prepare(`
      INSERT INTO functions (category_id, name, slug, icon, sort_order) VALUES (?, ?, ?, ?, ?)
    `);

    const weddingFunctions = [
      ['Haldi', 'haldi', '💛', 1],
      ['Mehendi', 'mehendi', '🌿', 2],
      ['Sangeet', 'sangeet', '🎤', 3],
      ['Baraat', 'baraat', '🥁', 4],
      ['Groom Entry', 'groom-entry', '🤵', 5],
      ['Bride Entry', 'bride-entry', '👰', 6],
      ['Jaimala', 'jaimala', '💐', 7],
      ['Reception', 'reception', '🎊', 8],
      ['Bidai', 'bidai', '🥺', 9],
      ['Wedding Dance', 'wedding-dance', '💃', 10],
      ['Anniversary', 'anniversary-wedding', '❤️', 11],
    ];

    const pujaFunctions = [
      ['Ganesh Puja', 'ganesh-puja', '🐘', 1],
      ['Lakshmi Puja', 'lakshmi-puja', '🪔', 2],
      ['Saraswati Puja', 'saraswati-puja', '📚', 3],
      ['Satyanarayan Puja', 'satyanarayan-puja', '🙏', 4],
      ['Durga Puja', 'durga-puja', '⚔️', 5],
      ['Jagran', 'jagran', '🎶', 6],
      ['Kirtan', 'kirtan', '🎵', 7],
      ['Aarti', 'aarti', '🪔', 8],
    ];

    const mourningFunctions = [
      ['Prayer', 'prayer', '🙏', 1],
      ['Shanti Path', 'shanti-path', '☮️', 2],
      ['Condolence', 'condolence', '🕊️', 3],
      ['Shraddha', 'shraddha', '🌸', 4],
    ];

    for (const [name, slug, icon, order] of weddingFunctions) {
      insertFunc.run(weddingCat.id, name, slug, icon, order);
    }
    for (const [name, slug, icon, order] of pujaFunctions) {
      insertFunc.run(pujaCat.id, name, slug, icon, order);
    }
    for (const [name, slug, icon, order] of mourningFunctions) {
      insertFunc.run(mourningCat.id, name, slug, icon, order);
    }

    console.log('✅ Default categories and functions seeded');
  }

  console.log('✅ Database initialized');
  return db;
}

module.exports = { getDb, initDb };
