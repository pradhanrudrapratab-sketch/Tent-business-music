/* ============ STATE ============ */
const STATE = {
  settings: {},
  session_id: getOrCreateSession(),
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  shuffle: false,
  repeat: false,
  ytPlayer: null,
  ytReady: false,
  currentPage: '/',
};

function getOrCreateSession() {
  let sid = localStorage.getItem('tfm_session');
  if (!sid) {
    sid = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('tfm_session', sid);
  }
  return sid;
}

/* ============ INIT ============ */
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(localStorage.getItem('tfm_theme') || 'dark');
  await loadSettings();
  loadMenu();
  loadCategoryPills();
  loadFeaturedPlaylists();
  loadCategoriesGrid();
  startHeartbeat();
  initSearch();
  initPlayer();
  handleRoute();
  window.addEventListener('popstate', handleRoute);
});

/* ============ SETTINGS ============ */
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    STATE.settings = await res.json();
    const s = STATE.settings;

    if (s.site_name) document.getElementById('site-name').textContent = '🎵 ' + s.site_name;
    document.title = s.site_name || 'Tent Function Music';
    if (s.search_placeholder) document.getElementById('search-input').placeholder = s.search_placeholder;

    // Background
    const bg = document.getElementById('bg-layer');
    const bgKey = document.documentElement.getAttribute('data-theme') === 'dark' ? s.dark_background : s.light_background;
    if (bgKey) bg.style.backgroundImage = `url(${bgKey})`;

    // Glass CSS vars
    if (s.glass_opacity) document.documentElement.style.setProperty('--glass-bg', `rgba(255,255,255,${s.glass_opacity})`);
    if (s.glass_blur) document.documentElement.style.setProperty('--glass-blur', `${s.glass_blur}px`);
    if (s.glass_border_radius) document.documentElement.style.setProperty('--glass-radius', `${s.glass_border_radius}px`);
  } catch (e) {
    console.warn('Settings load failed', e);
  }
}

/* ============ THEME ============ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tfm_theme', theme);
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

/* ============ HAMBURGER MENU ============ */
document.getElementById('menu-btn').addEventListener('click', openMenu);

function openMenu() {
  document.getElementById('hamburger-menu').classList.remove('hidden');
  document.getElementById('hamburger-overlay').classList.remove('hidden');
}

function closeMenu() {
  document.getElementById('hamburger-menu').classList.add('hidden');
  document.getElementById('hamburger-overlay').classList.add('hidden');
}
window.closeMenu = closeMenu;

async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    const items = await res.json();
    const ul = document.getElementById('menu-items');
    ul.innerHTML = '';
    for (const item of items) {
      ul.innerHTML += `
        <li><a href="${item.redirect_url}" onclick="closeMenu(); navigate('${item.redirect_url}'); return false;">
          <span>${item.icon}</span> ${item.name}
        </a></li>
      `;
    }
  } catch (e) {}
}

/* ============ NAVIGATION (SPA) ============ */
function navigate(url, push = true) {
  if (push) history.pushState({}, '', url);
  STATE.currentPage = url;
  handleRoute();
}
window.navigate = navigate;

function handleRoute() {
  const path = location.pathname;
  STATE.currentPage = path;

  if (path === '/' || path === '/index.html') {
    showHome();
  } else if (path.startsWith('/category/')) {
    const slug = path.split('/category/')[1];
    showCategory(slug);
  } else if (path.startsWith('/function/')) {
    const slug = path.split('/function/')[1];
    showFunction(slug);
  } else if (path.startsWith('/playlist/')) {
    const slug = path.split('/playlist/')[1];
    showPlaylist(slug);
  } else if (path === '/popular') {
    showPopular();
  } else if (path === '/suggest') {
    openSuggestModal();
    showHome();
  } else {
    showHome();
  }
}

function showHome() {
  document.getElementById('app').style.display = 'block';
  document.getElementById('page-view').classList.add('hidden');
  document.getElementById('page-view').innerHTML = '';
  document.querySelector('.main-content').style.display = 'block';
}

async function showCategory(slug) {
  document.querySelector('.main-content').style.display = 'none';
  const pv = document.getElementById('page-view');
  pv.classList.remove('hidden');
  pv.innerHTML = `<div class="page-view-inner"><div class="spinner"></div></div>`;

  try {
    const res = await fetch(`/api/categories/${slug}`);
    const { category, functions } = await res.json();
    pv.innerHTML = `
      <div class="page-view-inner">
        <div class="page-back" onclick="history.back()">← Back</div>
        <div class="page-header">
          <div class="page-icon">${category.icon}</div>
          <div>
            <div class="page-title">${category.name}</div>
            <div class="page-subtitle">${functions.length} functions</div>
          </div>
        </div>
        <div class="function-grid">
          ${functions.map(f => `
            <div class="fn-chip" style="padding:0.8rem 1rem;font-size:1rem;border-radius:12px;background:var(--glass-bg);border:1px solid var(--glass-border);cursor:pointer;margin-bottom:8px;display:flex;align-items:center;gap:10px;"
              onclick="navigate('/function/${f.slug}')">
              <span>${f.icon}</span>
              <div>
                <div style="font-weight:600">${f.name}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${f.song_count || 0} songs</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (e) {
    pv.innerHTML = `<div class="page-view-inner"><p>Failed to load category.</p></div>`;
  }
}

async function showFunction(slug) {
  document.querySelector('.main-content').style.display = 'none';
  const pv = document.getElementById('page-view');
  pv.classList.remove('hidden');
  pv.innerHTML = `<div class="page-view-inner"><div class="spinner"></div></div>`;

  try {
    const res = await fetch(`/api/functions/${slug}`);
    const data = await res.json();
    const fn = data.function;
    const songs = data.directSongs;
    const playlists = data.playlists;

    let content = `
      <div class="page-view-inner">
        <div class="page-back" onclick="history.back()">← Back</div>
        <div class="page-header">
          <div class="page-icon">${fn.icon}</div>
          <div>
            <div class="page-title">${fn.name}</div>
            <div class="page-subtitle">${fn.category_name}</div>
          </div>
        </div>
    `;

    if (playlists.length > 0) {
      content += `<h3 style="margin-bottom:0.8rem;font-size:1rem">Playlists</h3>
        <div class="card-row" style="flex-wrap:wrap;overflow:visible">
        ${playlists.map(pl => `
          <div class="music-card" onclick="navigate('/playlist/${pl.slug}')">
            <div class="card-thumb">${pl.icon || '🎵'}</div>
            <div class="card-info">
              <div class="card-name">${pl.name}</div>
              <div class="card-meta">${pl.song_count} songs</div>
            </div>
          </div>
        `).join('')}
        </div>
      `;
    }

    if (songs.length > 0) {
      STATE.queue = songs;
      content += `<h3 style="margin:1rem 0 0.8rem;font-size:1rem">Songs</h3>
        <div class="song-list" id="song-list-fn">
        ${songs.map((s, i) => renderSongItem(s, i)).join('')}
        </div>
      `;
    } else if (playlists.length === 0) {
      content += `<p style="color:var(--text-muted);text-align:center;padding:2rem">No songs yet for this function.</p>`;
    }

    content += `</div>`;
    pv.innerHTML = content;
    attachSongClicks('song-list-fn');
    loadRatings(songs);
  } catch (e) {
    pv.innerHTML = `<div class="page-view-inner"><p>Failed to load function.</p></div>`;
  }
}

async function showPlaylist(slug) {
  document.querySelector('.main-content').style.display = 'none';
  const pv = document.getElementById('page-view');
  pv.classList.remove('hidden');
  pv.innerHTML = `<div class="page-view-inner"><div class="spinner"></div></div>`;

  try {
    const res = await fetch(`/api/playlists/${slug}`);
    const { playlist, songs } = await res.json();

    STATE.queue = songs;

    pv.innerHTML = `
      <div class="page-view-inner">
        <div class="page-back" onclick="history.back()">← Back</div>
        <div class="page-header">
          <div class="page-icon">${playlist.icon || '🎵'}</div>
          <div>
            <div class="page-title">${playlist.name}</div>
            <div class="page-subtitle">${songs.length} songs</div>
          </div>
        </div>
        ${songs.length > 0 ? `
        <button class="btn-primary" style="margin-bottom:1rem" onclick="playAll()">▶ Play All</button>
        <div class="song-list" id="song-list-pl">
          ${songs.map((s, i) => renderSongItem(s, i)).join('')}
        </div>` : `<p style="color:var(--text-muted);text-align:center;padding:2rem">No songs in this playlist yet.</p>`}
      </div>
    `;

    // Increment playlist play count
    if (songs.length > 0) {
      fetch(`/api/songs/${songs[0].id}/play`, { method: 'POST' });
    }
    attachSongClicks('song-list-pl');
    loadRatings(songs);
  } catch (e) {
    pv.innerHTML = `<div class="page-view-inner"><p>Failed to load playlist.</p></div>`;
  }
}

async function showPopular() {
  document.querySelector('.main-content').style.display = 'none';
  const pv = document.getElementById('page-view');
  pv.classList.remove('hidden');
  pv.innerHTML = `<div class="page-view-inner"><div class="spinner"></div></div>`;

  try {
    const res = await fetch('/api/playlists/popular');
    const playlists = await res.json();
    pv.innerHTML = `
      <div class="page-view-inner">
        <div class="page-back" onclick="history.back()">← Back</div>
        <div class="page-header"><div class="page-icon">🔥</div><div class="page-title">Popular Playlists</div></div>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          ${playlists.map(pl => `
            <div class="music-card" style="width:calc(50% - 6px)" onclick="navigate('/playlist/${pl.slug}')">
              <div class="card-thumb">${pl.icon || '🎵'}</div>
              <div class="card-info">
                <div class="card-name">${pl.name}</div>
                <div class="card-meta">${pl.song_count} songs • ${pl.play_count} plays</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (e) {}
}

/* ============ HOME PAGE DATA ============ */
async function loadCategoryPills() {
  try {
    const res = await fetch('/api/categories');
    const cats = await res.json();
    const container = document.getElementById('category-pills');
    container.innerHTML = `<div class="pill active" onclick="showHome()">🎵 All</div>`;
    cats.forEach(cat => {
      container.innerHTML += `
        <div class="pill" onclick="navigate('/category/${cat.slug}')">
          ${cat.icon} ${cat.name.split('/')[0].trim()}
        </div>
      `;
    });
  } catch (e) {}
}

async function loadFeaturedPlaylists() {
  try {
    const res = await fetch('/api/playlists/featured');
    const playlists = await res.json();
    const container = document.getElementById('featured-playlists');
    if (playlists.length === 0) {
      document.getElementById('featured-section').style.display = 'none';
      return;
    }
    container.innerHTML = playlists.map(pl => `
      <div class="music-card" onclick="navigate('/playlist/${pl.slug}')">
        <div class="card-thumb">${pl.icon || pl.category_icon || '🎵'}</div>
        <div class="card-info">
          <div class="card-name">${pl.name}</div>
          <div class="card-meta">${pl.song_count || 0} songs</div>
        </div>
      </div>
    `).join('');
  } catch (e) {}
}

async function loadCategoriesGrid() {
  try {
    const res = await fetch('/api/categories');
    const cats = await res.json();
    const container = document.getElementById('categories-list');
    container.innerHTML = '';

    for (const cat of cats) {
      const funcRes = await fetch(`/api/categories/${cat.slug}`);
      const { functions } = await funcRes.json();

      container.innerHTML += `
        <div class="category-card">
          <div class="category-header" onclick="toggleCategory('cat-${cat.id}')">
            <div class="category-left">
              <span class="category-icon">${cat.icon}</span>
              <span>${cat.name}</span>
            </div>
            <span class="category-toggle" id="toggle-cat-${cat.id}">›</span>
          </div>
          <div class="functions-list" id="cat-${cat.id}">
            ${functions.map(f => `
              <div class="fn-chip" onclick="navigate('/function/${f.slug}')">
                ${f.icon} ${f.name}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  } catch (e) {}
}

function toggleCategory(id) {
  const el = document.getElementById(id);
  const toggle = document.getElementById('toggle-' + id);
  if (el) {
    el.classList.toggle('open');
    toggle?.classList.toggle('open');
  }
}
window.toggleCategory = toggleCategory;

/* ============ SEARCH ============ */
function initSearch() {
  const input = document.getElementById('search-input');
  const clear = document.getElementById('search-clear');
  let debounceTimer;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clear.classList.toggle('hidden', !q);
    clearTimeout(debounceTimer);
    if (q.length < 2) {
      document.getElementById('search-results').classList.add('hidden');
      document.getElementById('cat-section').classList.remove('hidden');
      document.getElementById('featured-section').classList.remove('hidden');
      document.getElementById('categories-section').classList.remove('hidden');
      return;
    }
    debounceTimer = setTimeout(() => runSearch(q), 300);
  });

  clear.addEventListener('click', () => {
    input.value = '';
    clear.classList.add('hidden');
    document.getElementById('search-results').classList.add('hidden');
    document.getElementById('cat-section').classList.remove('hidden');
    document.getElementById('featured-section').classList.remove('hidden');
    document.getElementById('categories-section').classList.remove('hidden');
  });
}

async function runSearch(q) {
  try {
    const res = await fetch(`/api/songs/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const section = document.getElementById('search-results');
    const content = document.getElementById('search-results-content');
    section.classList.remove('hidden');
    document.getElementById('cat-section').classList.add('hidden');
    document.getElementById('featured-section').classList.add('hidden');
    document.getElementById('categories-section').classList.add('hidden');

    let html = '';

    if (data.categories.length) {
      html += `<div class="search-group"><div class="search-group-title">Categories</div>
        ${data.categories.map(c => `<div class="search-item" onclick="navigate('/category/${c.slug}')">${c.icon} ${c.name}</div>`).join('')}
      </div>`;
    }
    if (data.functions.length) {
      html += `<div class="search-group"><div class="search-group-title">Functions</div>
        ${data.functions.map(f => `<div class="search-item" onclick="navigate('/function/${f.slug}')">${f.icon} ${f.name} <span style="color:var(--text-muted);font-size:0.8rem;margin-left:4px">${f.category_name}</span></div>`).join('')}
      </div>`;
    }
    if (data.playlists.length) {
      html += `<div class="search-group"><div class="search-group-title">Playlists</div>
        ${data.playlists.map(pl => `<div class="search-item" onclick="navigate('/playlist/${pl.slug}')">🎵 ${pl.name}</div>`).join('')}
      </div>`;
    }
    if (data.songs.length) {
      STATE.queue = data.songs;
      html += `<div class="search-group"><div class="search-group-title">Songs</div>
        <div class="song-list" id="song-list-search">
          ${data.songs.map((s, i) => renderSongItem(s, i)).join('')}
        </div>
      </div>`;
    }

    if (!html) html = `<p style="color:var(--text-muted);text-align:center;padding:2rem">No results found.</p>`;
    content.innerHTML = html;
    if (data.songs.length) attachSongClicks('song-list-search');
  } catch (e) {}
}

/* ============ SONG RENDERING ============ */
function renderSongItem(song, index) {
  const thumb = song.thumbnail
    ? `<img src="${song.thumbnail}" alt="" loading="lazy">`
    : song.function_name?.[0] || '🎵';
  const rating = song.average_rating > 0
    ? `⭐ ${song.average_rating.toFixed(1)}`
    : '';

  return `
    <div class="song-item" id="song-${song.id}" data-index="${index}" data-id="${song.id}">
      <div class="song-thumb">${song.thumbnail ? `<img src="${song.thumbnail}" alt="" loading="lazy">` : (song.function_name?.[0] || '🎵')}</div>
      <div class="song-details">
        <div class="song-title">${song.title}</div>
        <div class="song-artist">${song.artist || 'Unknown Artist'}</div>
      </div>
      <div class="song-right">
        <div class="song-rating">${rating}</div>
        <div class="song-plays">${song.play_count || 0} plays</div>
      </div>
      <button class="btn-play-small" data-index="${index}">▶</button>
    </div>
  `;
}

function attachSongClicks(listId) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.querySelectorAll('[data-index]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      playSong(idx);
    });
  });
}

function loadRatings(songs) {
  // Ratings are shown inline; full rating UI shown in player
}

/* ============ MUSIC PLAYER ============ */
function initPlayer() {
  document.getElementById('btn-play').addEventListener('click', togglePlay);
  document.getElementById('btn-prev').addEventListener('click', prevSong);
  document.getElementById('btn-next').addEventListener('click', nextSong);
  document.getElementById('btn-shuffle').addEventListener('click', toggleShuffle);
  document.getElementById('btn-repeat').addEventListener('click', toggleRepeat);
  document.getElementById('vol-slider').addEventListener('input', (e) => setVolume(e.target.value));
  document.getElementById('progress-input').addEventListener('input', (e) => seekTo(e.target.value));

  // Load YouTube IFrame API
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function () {
  STATE.ytReady = true;
  const container = document.getElementById('yt-container');
  STATE.ytPlayer = new YT.Player(container, {
    width: '1', height: '1',
    playerVars: { autoplay: 0, controls: 0 },
    events: {
      onStateChange: onYTStateChange,
    }
  });
};

function onYTStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    if (STATE.repeat) {
      STATE.ytPlayer.seekTo(0);
      STATE.ytPlayer.playVideo();
    } else {
      nextSong();
    }
  }
  if (event.data === YT.PlayerState.PLAYING) {
    STATE.isPlaying = true;
    document.getElementById('btn-play').textContent = '⏸';
    startProgressTracker();
  }
  if (event.data === YT.PlayerState.PAUSED) {
    STATE.isPlaying = false;
    document.getElementById('btn-play').textContent = '▶';
  }
}

function playSong(index) {
  if (STATE.queue.length === 0) return;
  STATE.currentIndex = index;
  const song = STATE.queue[index];
  if (!song) return;

  // Update player UI
  document.getElementById('player-bar').classList.remove('hidden');
  document.getElementById('player-title').textContent = song.title;
  document.getElementById('player-artist').textContent = song.artist || 'Unknown Artist';

  const img = document.getElementById('player-thumb-img');
  if (song.thumbnail) { img.src = song.thumbnail; img.style.display = 'block'; }
  else img.style.display = 'none';

  // Increment play count
  fetch(`/api/songs/${song.id}/play`, { method: 'POST' });

  // Highlight active song
  document.querySelectorAll('.song-item').forEach(el => el.classList.remove('playing'));
  const activeEl = document.querySelector(`[data-id="${song.id}"]`);
  if (activeEl) activeEl.classList.add('playing');

  // Play based on source type
  if (song.source_type === 'youtube' && song.source_url) {
    const ytId = extractYouTubeId(song.source_url);
    if (ytId && STATE.ytReady && STATE.ytPlayer) {
      STATE.ytPlayer.loadVideoById(ytId);
      STATE.ytPlayer.playVideo();
      document.getElementById('yt-container').innerHTML = `
        <iframe width="1" height="1" src="https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1" allow="autoplay"></iframe>
      `;
    }
  } else if (song.source_type === 'audio' && song.audio_file) {
    playAudioFile(song.audio_file);
  }

  STATE.isPlaying = true;
  document.getElementById('btn-play').textContent = '⏸';
}

function playAudioFile(url) {
  if (STATE.audioEl) { STATE.audioEl.pause(); STATE.audioEl.remove(); }
  STATE.audioEl = new Audio(url);
  STATE.audioEl.volume = (document.getElementById('vol-slider').value || 80) / 100;
  STATE.audioEl.play();
  STATE.audioEl.addEventListener('ended', () => STATE.repeat ? STATE.audioEl.play() : nextSong());
  STATE.audioEl.addEventListener('timeupdate', updateAudioProgress);
}

function updateAudioProgress() {
  if (!STATE.audioEl) return;
  const pct = (STATE.audioEl.currentTime / STATE.audioEl.duration) * 100 || 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-input').value = pct;
}

function startProgressTracker() {
  clearInterval(STATE.progressTimer);
  STATE.progressTimer = setInterval(() => {
    if (!STATE.ytPlayer?.getCurrentTime) return;
    try {
      const dur = STATE.ytPlayer.getDuration();
      const cur = STATE.ytPlayer.getCurrentTime();
      const pct = dur > 0 ? (cur / dur) * 100 : 0;
      document.getElementById('progress-fill').style.width = pct + '%';
      document.getElementById('progress-input').value = pct;
    } catch (e) {}
  }, 1000);
}

function togglePlay() {
  if (!STATE.ytPlayer && !STATE.audioEl) return;
  if (STATE.isPlaying) {
    if (STATE.ytPlayer?.pauseVideo) STATE.ytPlayer.pauseVideo();
    if (STATE.audioEl) STATE.audioEl.pause();
    STATE.isPlaying = false;
    document.getElementById('btn-play').textContent = '▶';
  } else {
    if (STATE.ytPlayer?.playVideo) STATE.ytPlayer.playVideo();
    if (STATE.audioEl) STATE.audioEl.play();
    STATE.isPlaying = true;
    document.getElementById('btn-play').textContent = '⏸';
  }
}

function nextSong() {
  if (STATE.queue.length === 0) return;
  let next = STATE.shuffle
    ? Math.floor(Math.random() * STATE.queue.length)
    : (STATE.currentIndex + 1) % STATE.queue.length;
  playSong(next);
}

function prevSong() {
  if (STATE.queue.length === 0) return;
  const prev = STATE.currentIndex > 0 ? STATE.currentIndex - 1 : STATE.queue.length - 1;
  playSong(prev);
}

function toggleShuffle() {
  STATE.shuffle = !STATE.shuffle;
  document.getElementById('btn-shuffle').style.opacity = STATE.shuffle ? '1' : '0.5';
}

function toggleRepeat() {
  STATE.repeat = !STATE.repeat;
  document.getElementById('btn-repeat').style.opacity = STATE.repeat ? '1' : '0.5';
}

function setVolume(val) {
  if (STATE.ytPlayer?.setVolume) STATE.ytPlayer.setVolume(val);
  if (STATE.audioEl) STATE.audioEl.volume = val / 100;
}

function seekTo(pct) {
  if (STATE.ytPlayer?.getDuration) {
    const dur = STATE.ytPlayer.getDuration();
    STATE.ytPlayer.seekTo((pct / 100) * dur);
  }
  if (STATE.audioEl) {
    STATE.audioEl.currentTime = (pct / 100) * STATE.audioEl.duration;
  }
}

function playAll() {
  if (STATE.queue.length > 0) playSong(0);
}
window.playAll = playAll;

function extractYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* ============ SUGGEST MUSIC ============ */
async function openSuggestModal() {
  document.getElementById('suggest-modal').classList.remove('hidden');
  // Load functions for dropdown
  try {
    const res = await fetch('/api/categories');
    const cats = await res.json();
    const sel = document.getElementById('sug-function');
    for (const cat of cats) {
      const fr = await fetch(`/api/categories/${cat.slug}`);
      const { functions } = await fr.json();
      const optgrp = document.createElement('optgroup');
      optgrp.label = cat.name;
      functions.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = `${f.icon} ${f.name}`;
        optgrp.appendChild(opt);
      });
      sel.appendChild(optgrp);
    }
  } catch (e) {}
}
window.openSuggestModal = openSuggestModal;

function closeSuggestModal() {
  document.getElementById('suggest-modal').classList.add('hidden');
}
window.closeSuggestModal = closeSuggestModal;

async function submitSuggestion() {
  const title = document.getElementById('sug-title').value.trim();
  const artist = document.getElementById('sug-artist').value.trim();
  const fn = document.getElementById('sug-function').value;
  const url = document.getElementById('sug-url').value.trim();
  const msg = document.getElementById('sug-message').value.trim();
  const msgEl = document.getElementById('sug-msg');

  if (!title) { msgEl.textContent = 'Song name is required'; msgEl.className = 'form-msg error'; return; }

  try {
    const res = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggested_title: title, artist, function_id: fn || null, suggested_url: url, message: msg })
    });
    const data = await res.json();
    if (res.ok) {
      msgEl.textContent = data.message || 'Suggestion submitted!';
      msgEl.className = 'form-msg success';
      setTimeout(closeSuggestModal, 2000);
    } else {
      msgEl.textContent = data.error || 'Failed to submit';
      msgEl.className = 'form-msg error';
    }
  } catch (e) {
    msgEl.textContent = 'Network error';
    msgEl.className = 'form-msg error';
  }
}
window.submitSuggestion = submitSuggestion;

/* ============ HEARTBEAT ============ */
function startHeartbeat() {
  sendHeartbeat();
  setInterval(sendHeartbeat, 30000); // every 30s
}

async function sendHeartbeat() {
  try {
    const res = await fetch('/api/visitors/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: STATE.session_id, current_page: location.pathname })
    });
    const data = await res.json();
    document.getElementById('online-count').textContent = data.online || 0;
  } catch (e) {}
}
