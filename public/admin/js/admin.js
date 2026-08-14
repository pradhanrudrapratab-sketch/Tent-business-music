/* ============ STATE ============ */
const ADMIN = {
  token: localStorage.getItem('tfm_admin_token'),
  username: localStorage.getItem('tfm_admin_user'),
  currentPage: 'dashboard',
};

/* ============ API HELPER ============ */
async function api(method, path, body = null, isFormData = false) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${ADMIN.token}` },
  };
  if (body) {
    if (isFormData) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch('/api/admin' + path, opts);
  if (res.status === 401) { doLogout(); return null; }
  return res.json();
}

async function publicApi(path) {
  const res = await fetch('/api' + path);
  return res.json();
}

/* ============ INIT ============ */
document.addEventListener('DOMContentLoaded', () => {
  if (ADMIN.token) {
    verifyAndShow();
  }
  document.getElementById('login-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      loadPage(el.dataset.page);
      document.getElementById('sidebar').classList.remove('open');
    });
  });
});

async function verifyAndShow() {
  try {
    const res = await fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${ADMIN.token}` }
    });
    if (res.ok) {
      showApp();
    } else {
      doLogout();
    }
  } catch (e) { doLogout(); }
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('admin-app').classList.remove('hidden');
  document.getElementById('admin-user-badge').textContent = '👤 ' + (ADMIN.username || 'admin');
  loadPage('dashboard');
  loadSuggestionBadge();
  setInterval(loadSuggestionBadge, 30000);
}

/* ============ LOGIN / LOGOUT ============ */
async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-err');
  errEl.textContent = '';

  if (!username || !password) { errEl.textContent = 'Enter username and password'; return; }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      ADMIN.token = data.token;
      ADMIN.username = data.username;
      localStorage.setItem('tfm_admin_token', data.token);
      localStorage.setItem('tfm_admin_user', data.username);
      showApp();
    } else {
      errEl.textContent = data.error || 'Login failed';
    }
  } catch (e) {
    errEl.textContent = 'Network error';
  }
}
window.doLogin = doLogin;

function doLogout() {
  localStorage.removeItem('tfm_admin_token');
  localStorage.removeItem('tfm_admin_user');
  location.reload();
}
window.doLogout = doLogout;

/* ============ PAGE ROUTER ============ */
function loadPage(page) {
  ADMIN.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  const titles = {
    dashboard: 'Dashboard', songs: 'Songs', playlists: 'Playlists',
    categories: 'Categories', functions: 'Functions', suggestions: 'Suggestions',
    menu: 'Menu', appearance: 'Appearance', nuke: 'Nuke Mode', settings: 'Settings'
  };
  document.getElementById('page-title-bar').textContent = titles[page] || page;
  const content = document.getElementById('admin-content');
  content.innerHTML = '<div class="spinner"></div>';

  const pages = {
    dashboard: pageDashboard,
    songs: pageSongs,
    playlists: pagePlaylists,
    categories: pageCategories,
    functions: pageFunctions,
    suggestions: pageSuggestions,
    menu: pageMenu,
    appearance: pageAppearance,
    nuke: pageNuke,
    settings: pageSettings,
  };
  if (pages[page]) pages[page]();
}

/* ============ SUGGESTION BADGE ============ */
async function loadSuggestionBadge() {
  try {
    const data = await api('GET', '/suggestions?status=pending');
    const badge = document.getElementById('badge-suggestions');
    if (data && data.length > 0) {
      badge.textContent = data.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) {}
}

/* ============ DASHBOARD ============ */
async function pageDashboard() {
  const data = await api('GET', '/dashboard');
  if (!data) return;
  const { stats, topSongs, recentSuggestions } = data;

  document.getElementById('admin-content').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">🟢 Live Visitors</div><div class="stat-value">${stats.online}</div></div>
      <div class="stat-card"><div class="stat-label">🎵 Total Songs</div><div class="stat-value">${stats.songs}</div></div>
      <div class="stat-card"><div class="stat-label">📂 Categories</div><div class="stat-value">${stats.categories}</div></div>
      <div class="stat-card"><div class="stat-label">🎉 Functions</div><div class="stat-value">${stats.functions}</div></div>
      <div class="stat-card"><div class="stat-label">📑 Playlists</div><div class="stat-value">${stats.playlists}</div></div>
      <div class="stat-card"><div class="stat-label">⭐ Ratings</div><div class="stat-value">${stats.ratings}</div></div>
      <div class="stat-card" style="cursor:pointer" onclick="loadPage('suggestions')">
        <div class="stat-label">💡 Pending Suggestions</div>
        <div class="stat-value" style="color:var(--accent)">${stats.suggestions_pending}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div>
        <div class="admin-section-title">🔥 Top Songs</div>
        <table class="data-table">
          <thead><tr><th>Title</th><th>Plays</th><th>Rating</th></tr></thead>
          <tbody>
            ${topSongs.map(s => `
              <tr>
                <td>${s.title}<br><small style="color:var(--text-muted)">${s.artist || '—'}</small></td>
                <td>${s.play_count}</td>
                <td>${s.average_rating > 0 ? '⭐ ' + s.average_rating.toFixed(1) : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div>
        <div class="admin-section-title">💡 Recent Suggestions</div>
        <table class="data-table">
          <thead><tr><th>Song</th><th>Status</th></tr></thead>
          <tbody>
            ${recentSuggestions.map(s => `
              <tr>
                <td>${s.suggested_title}<br><small style="color:var(--text-muted)">${s.artist || '—'}</small></td>
                <td><span class="status-badge status-${s.status}">${s.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ============ SONGS PAGE ============ */
let songsPage = 1, songsSearch = '';

async function pageSongs() {
  document.getElementById('admin-content').innerHTML = `
    <div class="toolbar">
      <input type="text" class="form-input" id="songs-search" placeholder="Search songs..." value="${songsSearch}">
      <button class="btn-sm primary" onclick="openSongModal()">+ Add Song</button>
    </div>
    <div id="songs-table-wrap"><div class="spinner"></div></div>
  `;
  document.getElementById('songs-search').addEventListener('input', debounce(e => {
    songsSearch = e.target.value;
    songsPage = 1;
    loadSongsTable();
  }, 400));
  loadSongsTable();
}

async function loadSongsTable() {
  const data = await api('GET', `/songs?page=${songsPage}&q=${encodeURIComponent(songsSearch)}`);
  if (!data) return;
  const wrap = document.getElementById('songs-table-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Title / Artist</th><th>Source</th><th>Category</th><th>Status</th><th>Plays</th><th>Actions</th></tr></thead>
      <tbody>
        ${data.songs.map(s => `
          <tr>
            <td>
              <strong>${escHtml(s.title)}</strong><br>
              <small style="color:var(--text-muted)">${escHtml(s.artist || '—')}</small>
            </td>
            <td><span class="status-badge status-active">${s.source_type}</span></td>
            <td>${escHtml(s.category_name || '—')}</td>
            <td><span class="status-badge status-${s.status}">${s.status}</span></td>
            <td>${s.play_count}</td>
            <td>
              <button class="btn-sm ghost" onclick="openSongModal(${s.id})">Edit</button>
              <button class="btn-sm danger" onclick="deleteSong(${s.id})">Del</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="display:flex;align-items:center;gap:10px;margin-top:1rem">
      <button class="btn-sm ghost" onclick="songsPage--;loadSongsTable()" ${songsPage<=1?'disabled':''}>← Prev</button>
      <span style="color:var(--text-muted);font-size:0.85rem">Page ${data.page} / ${data.pages} (${data.total} songs)</span>
      <button class="btn-sm ghost" onclick="songsPage++;loadSongsTable()" ${songsPage>=data.pages?'disabled':''}>Next →</button>
    </div>
  `;
}

async function openSongModal(id = null) {
  const cats = await publicApi('/categories');
  let song = null;
  let funcs = [];

  if (id) {
    const data = await api('GET', `/songs?q=`);
    song = data?.songs?.find(s => s.id === id);
    if (song?.category_id) {
      const catData = await api('GET', `/functions`);
      funcs = catData?.filter(f => f.category_id == song.category_id) || [];
    }
  }

  const allFuncs = await api('GET', '/functions');

  showModal('songModal', id ? 'Edit Song' : 'Add Song', `
    <div class="form-group">
      <label>Title *</label>
      <input type="text" class="form-input" id="sm-title" value="${escHtml(song?.title || '')}">
    </div>
    <div class="form-group">
      <label>Artist</label>
      <input type="text" class="form-input" id="sm-artist" value="${escHtml(song?.artist || '')}">
    </div>
    <div class="form-group">
      <label>Source Type</label>
      <select class="form-input" id="sm-source-type" onchange="toggleSourceFields()">
        <option value="youtube" ${song?.source_type==='youtube'?'selected':''}>YouTube</option>
        <option value="spotify" ${song?.source_type==='spotify'?'selected':''}>Spotify</option>
        <option value="audio" ${song?.source_type==='audio'?'selected':''}>Upload Audio</option>
      </select>
    </div>
    <div id="sm-url-group" class="form-group">
      <label>Source URL</label>
      <input type="url" class="form-input" id="sm-url" value="${escHtml(song?.source_url || '')}" placeholder="https://...">
    </div>
    <div id="sm-audio-group" class="form-group hidden">
      <label>Audio File (MP3/WAV/OGG)</label>
      <input type="file" class="form-input" id="sm-audio" accept=".mp3,.wav,.ogg,.m4a,.aac">
      ${song?.audio_file ? `<small style="color:var(--text-muted)">Current: ${song.audio_file}</small>` : ''}
    </div>
    <div class="form-group">
      <label>Thumbnail</label>
      <input type="file" class="form-input" id="sm-thumb" accept="image/*">
      ${song?.thumbnail ? `<img src="${song.thumbnail}" style="height:60px;border-radius:8px;margin-top:6px">` : ''}
    </div>
    <div class="form-group">
      <label>Category</label>
      <select class="form-input" id="sm-category" onchange="loadFunctionsForCategory()">
        <option value="">None</option>
        ${cats.map(c => `<option value="${c.id}" ${song?.category_id==c.id?'selected':''}>${c.icon} ${c.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Function</label>
      <select class="form-input" id="sm-function">
        <option value="">None</option>
        ${(allFuncs||[]).map(f => `<option value="${f.id}" ${song?.function_id==f.id?'selected':''}>${f.icon} ${f.name} (${f.category_name})</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Tags (comma separated)</label>
      <input type="text" class="form-input" id="sm-tags" value="${escHtml(song?.tags || '')}" placeholder="baraat, dance, peppy">
    </div>
    <div class="form-group">
      <label>Status</label>
      <select class="form-input" id="sm-status">
        <option value="active" ${song?.status==='active'||!song?'selected':''}>Active</option>
        <option value="inactive" ${song?.status==='inactive'?'selected':''}>Inactive</option>
      </select>
    </div>
    <button class="btn-primary" onclick="saveSong(${id || 'null'})">💾 Save Song</button>
    <div id="sm-msg" class="form-msg"></div>
  `);
  toggleSourceFields();
}

function toggleSourceFields() {
  const type = document.getElementById('sm-source-type')?.value;
  document.getElementById('sm-url-group')?.classList.toggle('hidden', type === 'audio');
  document.getElementById('sm-audio-group')?.classList.toggle('hidden', type !== 'audio');
}
window.toggleSourceFields = toggleSourceFields;

async function loadFunctionsForCategory() {
  const catId = document.getElementById('sm-category')?.value;
  const allFuncs = await api('GET', '/functions');
  const sel = document.getElementById('sm-function');
  if (!sel) return;
  const filtered = catId ? allFuncs.filter(f => f.category_id == catId) : allFuncs;
  sel.innerHTML = `<option value="">None</option>` + filtered.map(f => `<option value="${f.id}">${f.icon} ${f.name}</option>`).join('');
}
window.loadFunctionsForCategory = loadFunctionsForCategory;

async function saveSong(id) {
  const form = new FormData();
  form.append('title', document.getElementById('sm-title').value.trim());
  form.append('artist', document.getElementById('sm-artist').value.trim());
  form.append('source_type', document.getElementById('sm-source-type').value);
  form.append('source_url', document.getElementById('sm-url').value.trim());
  form.append('category_id', document.getElementById('sm-category').value);
  form.append('function_id', document.getElementById('sm-function').value);
  form.append('tags', document.getElementById('sm-tags').value.trim());
  form.append('status', document.getElementById('sm-status').value);

  const thumb = document.getElementById('sm-thumb').files[0];
  if (thumb) form.append('thumbnail', thumb);
  const audio = document.getElementById('sm-audio')?.files[0];
  if (audio) form.append('audio', audio);

  const msg = document.getElementById('sm-msg');
  msg.textContent = 'Saving...'; msg.className = 'form-msg';

  const res = await api(id ? 'PUT' : 'POST', id ? `/songs/${id}` : '/songs', form, true);
  if (res) {
    msg.textContent = 'Saved!'; msg.className = 'form-msg success';
    setTimeout(() => { closeModal(); loadSongsTable(); }, 800);
  } else {
    msg.textContent = 'Error saving'; msg.className = 'form-msg error';
  }
}
window.saveSong = saveSong;

async function deleteSong(id) {
  if (!confirm('Delete this song?')) return;
  await api('DELETE', `/songs/${id}`);
  loadSongsTable();
}
window.deleteSong = deleteSong;

/* ============ PLAYLISTS ============ */
async function pagePlaylists() {
  const data = await api('GET', '/playlists');
  document.getElementById('admin-content').innerHTML = `
    <div class="toolbar">
      <button class="btn-sm primary" onclick="openPlaylistModal()">+ New Playlist</button>
    </div>
    <table class="data-table">
      <thead><tr><th>Name</th><th>Category</th><th>Function</th><th>Songs</th><th>Featured</th><th>Actions</th></tr></thead>
      <tbody>
        ${(data||[]).map(pl => `
          <tr>
            <td><strong>${escHtml(pl.name)}</strong><br><small style="color:var(--text-muted)">${pl.slug}</small></td>
            <td>${escHtml(pl.category_name||'—')}</td>
            <td>${escHtml(pl.function_name||'—')}</td>
            <td>${pl.song_count}</td>
            <td>${pl.is_featured ? '⭐' : '—'}</td>
            <td>
              <button class="btn-sm ghost" onclick="openPlaylistModal(${pl.id})">Edit</button>
              <button class="btn-sm ghost" onclick="managePlaylistSongs(${pl.id}, '${escHtml(pl.name)}')">Songs</button>
              <button class="btn-sm danger" onclick="deletePlaylist(${pl.id})">Del</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function openPlaylistModal(id = null) {
  const cats = await publicApi('/categories');
  const allFuncs = await api('GET', '/functions');
  let pl = null;
  if (id) {
    const all = await api('GET', '/playlists');
    pl = all?.find(p => p.id === id);
  }

  showModal('plModal', id ? 'Edit Playlist' : 'New Playlist', `
    <div class="form-group"><label>Name *</label><input type="text" class="form-input" id="pl-name" value="${escHtml(pl?.name||'')}"></div>
    <div class="form-group"><label>Slug *</label><input type="text" class="form-input" id="pl-slug" value="${escHtml(pl?.slug||'')}"></div>
    <div class="form-group"><label>Description</label><textarea class="form-input" id="pl-desc" rows="2">${escHtml(pl?.description||'')}</textarea></div>
    <div class="form-group">
      <label>Category</label>
      <select class="form-input" id="pl-category">
        <option value="">None</option>
        ${cats.map(c => `<option value="${c.id}" ${pl?.category_id==c.id?'selected':''}>${c.icon} ${c.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Function</label>
      <select class="form-input" id="pl-function">
        <option value="">None</option>
        ${(allFuncs||[]).map(f => `<option value="${f.id}" ${pl?.function_id==f.id?'selected':''}>${f.icon} ${f.name} (${f.category_name})</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Icon (emoji)</label><input type="text" class="form-input" id="pl-icon" value="${escHtml(pl?.icon||'🎵')}"></div>
    <div class="form-group"><label>Sort Order</label><input type="number" class="form-input" id="pl-order" value="${pl?.sort_order||0}"></div>
    <div class="form-group" style="display:flex;align-items:center;gap:10px">
      <label>Featured</label>
      <input type="checkbox" id="pl-featured" ${pl?.is_featured?'checked':''}> 
      <label>Visible</label>
      <input type="checkbox" id="pl-visible" ${pl?.is_visible!==0?'checked':''}>
    </div>
    <button class="btn-primary" onclick="savePlaylist(${id||'null'})">💾 Save</button>
    <div id="pl-msg" class="form-msg"></div>
  `);

  // Auto slug from name
  document.getElementById('pl-name').addEventListener('input', e => {
    if (!id) document.getElementById('pl-slug').value = slugify(e.target.value);
  });
}
window.openPlaylistModal = openPlaylistModal;

async function savePlaylist(id) {
  const body = {
    name: document.getElementById('pl-name').value.trim(),
    slug: document.getElementById('pl-slug').value.trim(),
    description: document.getElementById('pl-desc').value.trim(),
    category_id: document.getElementById('pl-category').value || null,
    function_id: document.getElementById('pl-function').value || null,
    icon: document.getElementById('pl-icon').value.trim() || '🎵',
    sort_order: parseInt(document.getElementById('pl-order').value) || 0,
    is_featured: document.getElementById('pl-featured').checked,
    is_visible: document.getElementById('pl-visible').checked,
  };
  const msg = document.getElementById('pl-msg');
  const res = await api(id ? 'PUT' : 'POST', id ? `/playlists/${id}` : '/playlists', body);
  if (res) { msg.textContent = 'Saved!'; msg.className = 'form-msg success'; setTimeout(() => { closeModal(); pagePlaylists(); }, 700); }
  else { msg.textContent = 'Error'; msg.className = 'form-msg error'; }
}
window.savePlaylist = savePlaylist;

async function deletePlaylist(id) {
  if (!confirm('Delete playlist?')) return;
  await api('DELETE', `/playlists/${id}`);
  pagePlaylists();
}
window.deletePlaylist = deletePlaylist;

async function managePlaylistSongs(id, name) {
  const [plData, allSongsData] = await Promise.all([
    fetch(`/api/playlists/${encodeURIComponent(name.toLowerCase().replace(/\s+/g,'-'))}`)
      .then(r => r.json()).catch(() => ({ songs: [] })),
    api('GET', '/songs?page=1&q=')
  ]);

  const plSongs = plData.songs || [];
  const plSongIds = new Set(plSongs.map(s => s.id));

  showModal('plSongsModal', `Songs in: ${name}`, `
    <div style="margin-bottom:1rem">
      <div class="admin-section-title" style="font-size:1rem">Current Songs (${plSongs.length})</div>
      <div id="pl-current-songs">
        ${plSongs.length === 0 ? '<p style="color:var(--text-muted)">No songs yet.</p>' : plSongs.map(s => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem;border-bottom:1px solid var(--glass-border)">
            <span>${escHtml(s.title)}</span>
            <button class="btn-sm danger" onclick="removeSongFromPlaylist(${id}, ${s.id})">Remove</button>
          </div>
        `).join('')}
      </div>
    </div>
    <div>
      <div class="admin-section-title" style="font-size:1rem">Add Songs</div>
      <input type="text" class="form-input" id="pl-song-search" placeholder="Search songs..." style="margin-bottom:0.5rem">
      <div id="pl-add-songs">
        ${(allSongsData?.songs||[]).filter(s => !plSongIds.has(s.id)).slice(0,20).map(s => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem;border-bottom:1px solid var(--glass-border)">
            <span>${escHtml(s.title)} <small style="color:var(--text-muted)">${escHtml(s.artist||'')}</small></span>
            <button class="btn-sm primary" onclick="addSongToPlaylist(${id}, ${s.id})">+ Add</button>
          </div>
        `).join('')}
      </div>
    </div>
  `);
}
window.managePlaylistSongs = managePlaylistSongs;

async function addSongToPlaylist(playlistId, songId) {
  await api('POST', `/playlists/${playlistId}/songs`, { song_id: songId });
  toast('Song added!');
}
async function removeSongFromPlaylist(playlistId, songId) {
  await api('DELETE', `/playlists/${playlistId}/songs/${songId}`);
  toast('Removed');
}
window.addSongToPlaylist = addSongToPlaylist;
window.removeSongFromPlaylist = removeSongFromPlaylist;

/* ============ CATEGORIES ============ */
async function pageCategories() {
  const data = await api('GET', '/categories');
  document.getElementById('admin-content').innerHTML = `
    <div class="toolbar">
      <button class="btn-sm primary" onclick="openCatModal()">+ Add Category</button>
    </div>
    <table class="data-table">
      <thead><tr><th>Icon</th><th>Name</th><th>Slug</th><th>Visible</th><th>Order</th><th>Actions</th></tr></thead>
      <tbody>
        ${(data||[]).map(c => `
          <tr>
            <td style="font-size:1.5rem">${c.icon}</td>
            <td><strong>${escHtml(c.name)}</strong></td>
            <td><small style="color:var(--text-muted)">${c.slug}</small></td>
            <td>${c.is_visible ? '✅' : '❌'}</td>
            <td>${c.sort_order}</td>
            <td>
              <button class="btn-sm ghost" onclick="openCatModal(${c.id})">Edit</button>
              <button class="btn-sm danger" onclick="deleteCat(${c.id})">Del</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function openCatModal(id = null) {
  let cat = null;
  if (id) {
    const all = await api('GET', '/categories');
    cat = all?.find(c => c.id === id);
  }
  showModal('catModal', id ? 'Edit Category' : 'Add Category', `
    <div class="form-group"><label>Name *</label><input type="text" class="form-input" id="cat-name" value="${escHtml(cat?.name||'')}"></div>
    <div class="form-group"><label>Slug *</label><input type="text" class="form-input" id="cat-slug" value="${escHtml(cat?.slug||'')}"></div>
    <div class="form-group"><label>Icon (emoji)</label><input type="text" class="form-input" id="cat-icon" value="${escHtml(cat?.icon||'🎵')}"></div>
    <div class="form-group"><label>Description</label><textarea class="form-input" id="cat-desc" rows="2">${escHtml(cat?.description||'')}</textarea></div>
    <div class="form-group"><label>Sort Order</label><input type="number" class="form-input" id="cat-order" value="${cat?.sort_order||0}"></div>
    <div class="form-group" style="display:flex;align-items:center;gap:10px">
      <label>Visible</label><input type="checkbox" id="cat-visible" ${cat?.is_visible!==0?'checked':''}>
    </div>
    <button class="btn-primary" onclick="saveCat(${id||'null'})">💾 Save</button>
    <div id="cat-msg" class="form-msg"></div>
  `);
  document.getElementById('cat-name').addEventListener('input', e => {
    if (!id) document.getElementById('cat-slug').value = slugify(e.target.value);
  });
}
window.openCatModal = openCatModal;

async function saveCat(id) {
  const body = {
    name: document.getElementById('cat-name').value.trim(),
    slug: document.getElementById('cat-slug').value.trim(),
    icon: document.getElementById('cat-icon').value.trim(),
    description: document.getElementById('cat-desc').value.trim(),
    sort_order: parseInt(document.getElementById('cat-order').value)||0,
    is_visible: document.getElementById('cat-visible').checked,
  };
  const msg = document.getElementById('cat-msg');
  const res = await api(id ? 'PUT' : 'POST', id ? `/categories/${id}` : '/categories', body);
  if (res) { msg.textContent = 'Saved!'; msg.className = 'form-msg success'; setTimeout(() => { closeModal(); pageCategories(); }, 700); }
  else { msg.textContent = 'Error (slug may exist)'; msg.className = 'form-msg error'; }
}
window.saveCat = saveCat;

async function deleteCat(id) {
  if (!confirm('Delete category? This will also delete its functions!')) return;
  await api('DELETE', `/categories/${id}`);
  pageCategories();
}
window.deleteCat = deleteCat;

/* ============ FUNCTIONS ============ */
async function pageFunctions() {
  const [data, cats] = await Promise.all([api('GET', '/functions'), api('GET', '/categories')]);
  document.getElementById('admin-content').innerHTML = `
    <div class="toolbar">
      <button class="btn-sm primary" onclick="openFuncModal()">+ Add Function</button>
    </div>
    <table class="data-table">
      <thead><tr><th>Icon</th><th>Name</th><th>Category</th><th>Visible</th><th>Order</th><th>Actions</th></tr></thead>
      <tbody>
        ${(data||[]).map(f => `
          <tr>
            <td style="font-size:1.3rem">${f.icon}</td>
            <td><strong>${escHtml(f.name)}</strong></td>
            <td>${escHtml(f.category_name||'—')}</td>
            <td>${f.is_visible ? '✅' : '❌'}</td>
            <td>${f.sort_order}</td>
            <td>
              <button class="btn-sm ghost" onclick="openFuncModal(${f.id})">Edit</button>
              <button class="btn-sm danger" onclick="deleteFunc(${f.id})">Del</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function openFuncModal(id = null) {
  const cats = await api('GET', '/categories');
  let fn = null;
  if (id) { const all = await api('GET', '/functions'); fn = all?.find(f => f.id === id); }

  showModal('fnModal', id ? 'Edit Function' : 'Add Function', `
    <div class="form-group">
      <label>Category *</label>
      <select class="form-input" id="fn-cat">
        ${(cats||[]).map(c => `<option value="${c.id}" ${fn?.category_id==c.id?'selected':''}>${c.icon} ${c.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Name *</label><input type="text" class="form-input" id="fn-name" value="${escHtml(fn?.name||'')}"></div>
    <div class="form-group"><label>Slug *</label><input type="text" class="form-input" id="fn-slug" value="${escHtml(fn?.slug||'')}"></div>
    <div class="form-group"><label>Icon (emoji)</label><input type="text" class="form-input" id="fn-icon" value="${escHtml(fn?.icon||'🎶')}"></div>
    <div class="form-group"><label>Description</label><textarea class="form-input" id="fn-desc" rows="2">${escHtml(fn?.description||'')}</textarea></div>
    <div class="form-group"><label>Sort Order</label><input type="number" class="form-input" id="fn-order" value="${fn?.sort_order||0}"></div>
    <div class="form-group" style="display:flex;align-items:center;gap:10px">
      <label>Visible</label><input type="checkbox" id="fn-visible" ${fn?.is_visible!==0?'checked':''}>
    </div>
    <button class="btn-primary" onclick="saveFunc(${id||'null'})">💾 Save</button>
    <div id="fn-msg" class="form-msg"></div>
  `);
  document.getElementById('fn-name').addEventListener('input', e => {
    if (!id) document.getElementById('fn-slug').value = slugify(e.target.value);
  });
}
window.openFuncModal = openFuncModal;

async function saveFunc(id) {
  const body = {
    category_id: document.getElementById('fn-cat').value,
    name: document.getElementById('fn-name').value.trim(),
    slug: document.getElementById('fn-slug').value.trim(),
    icon: document.getElementById('fn-icon').value.trim(),
    description: document.getElementById('fn-desc').value.trim(),
    sort_order: parseInt(document.getElementById('fn-order').value)||0,
    is_visible: document.getElementById('fn-visible').checked,
  };
  const msg = document.getElementById('fn-msg');
  const res = await api(id ? 'PUT' : 'POST', id ? `/functions/${id}` : '/functions', body);
  if (res) { msg.textContent = 'Saved!'; msg.className = 'form-msg success'; setTimeout(() => { closeModal(); pageFunctions(); }, 700); }
  else { msg.textContent = 'Error'; msg.className = 'form-msg error'; }
}
window.saveFunc = saveFunc;

async function deleteFunc(id) {
  if (!confirm('Delete function?')) return;
  await api('DELETE', `/functions/${id}`);
  pageFunctions();
}
window.deleteFunc = deleteFunc;

/* ============ SUGGESTIONS ============ */
async function pageSuggestions() {
  const data = await api('GET', '/suggestions?status=pending');
  const approved = await api('GET', '/suggestions?status=approved');
  const rejected = await api('GET', '/suggestions?status=rejected');

  document.getElementById('admin-content').innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:1rem">
      <button class="btn-sm ${sugTab==='pending'?'primary':'ghost'}" onclick="setSugTab('pending')">Pending (${(data||[]).length})</button>
      <button class="btn-sm ${sugTab==='approved'?'primary':'ghost'}" onclick="setSugTab('approved')">Approved (${(approved||[]).length})</button>
      <button class="btn-sm ${sugTab==='rejected'?'primary':'ghost'}" onclick="setSugTab('rejected')">Rejected (${(rejected||[]).length})</button>
    </div>
    <div id="sug-list"></div>
  `;
  window._sugData = { pending: data||[], approved: approved||[], rejected: rejected||[] };
  renderSugList();
  loadSuggestionBadge();
}

let sugTab = 'pending';
function setSugTab(tab) { sugTab = tab; pageSuggestions(); }
window.setSugTab = setSugTab;

function renderSugList() {
  const items = window._sugData?.[sugTab] || [];
  const el = document.getElementById('sug-list');
  if (!el) return;
  if (items.length === 0) { el.innerHTML = '<p style="color:var(--text-muted)">Nothing here.</p>'; return; }
  el.innerHTML = items.map(s => `
    <div style="border:1px solid var(--glass-border);border-radius:12px;padding:1rem;margin-bottom:0.8rem;background:var(--glass-bg)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div>
          <strong>${escHtml(s.suggested_title)}</strong>
          ${s.artist ? `<span style="color:var(--text-muted)"> — ${escHtml(s.artist)}</span>` : ''}
          ${s.function_name ? `<br><small style="color:var(--accent)">📌 ${s.function_name}</small>` : ''}
          ${s.suggested_url ? `<br><a href="${escHtml(s.suggested_url)}" target="_blank" style="color:var(--accent);font-size:0.8rem">🔗 Link</a>` : ''}
          ${s.message ? `<br><small style="color:var(--text-muted)">"${escHtml(s.message)}"</small>` : ''}
          <br><small style="color:var(--text-muted)">${new Date(s.created_at).toLocaleDateString()}</small>
        </div>
        <span class="status-badge status-${s.status}">${s.status}</span>
      </div>
      ${sugTab === 'pending' ? `
        <div style="display:flex;gap:8px;margin-top:0.8rem">
          <button class="btn-sm primary" onclick="approveSuggestion(${s.id}, '${escHtml(s.suggested_title)}', '${escHtml(s.artist||'')}', '${escHtml(s.suggested_url||'')}')">✅ Approve & Add</button>
          <button class="btn-sm danger" onclick="rejectSuggestion(${s.id})">❌ Reject</button>
          <button class="btn-sm ghost" onclick="deleteSuggestion(${s.id})">🗑 Delete</button>
        </div>
      ` : ''}
    </div>
  `).join('');
}
window.renderSugList = renderSugList;

async function approveSuggestion(id, title, artist, url) {
  const cats = await publicApi('/categories');
  const allFuncs = await api('GET', '/functions');
  showModal('sugApproveModal', 'Approve Suggestion', `
    <p style="margin-bottom:1rem;color:var(--text-muted)">Adding: <strong>${escHtml(title)}</strong></p>
    <div class="form-group"><label>Title *</label><input type="text" class="form-input" id="sa-title" value="${escHtml(title)}"></div>
    <div class="form-group"><label>Artist</label><input type="text" class="form-input" id="sa-artist" value="${escHtml(artist)}"></div>
    <div class="form-group">
      <label>Source Type *</label>
      <select class="form-input" id="sa-source-type">
        <option value="youtube">YouTube</option>
        <option value="spotify">Spotify</option>
        <option value="audio">Audio File</option>
      </select>
    </div>
    <div class="form-group"><label>Source URL</label><input type="url" class="form-input" id="sa-url" value="${escHtml(url)}"></div>
    <div class="form-group">
      <label>Category</label>
      <select class="form-input" id="sa-category">
        <option value="">None</option>
        ${cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Function</label>
      <select class="form-input" id="sa-function">
        <option value="">None</option>
        ${(allFuncs||[]).map(f => `<option value="${f.id}">${f.icon} ${f.name} (${f.category_name})</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Tags</label><input type="text" class="form-input" id="sa-tags" placeholder="comma separated"></div>
    <button class="btn-primary" onclick="submitApprove(${id})">✅ Add Song & Approve</button>
    <div id="sa-msg" class="form-msg"></div>
  `);
}
window.approveSuggestion = approveSuggestion;

async function submitApprove(id) {
  const form = new FormData();
  form.append('title', document.getElementById('sa-title').value.trim());
  form.append('artist', document.getElementById('sa-artist').value.trim());
  form.append('source_type', document.getElementById('sa-source-type').value);
  form.append('source_url', document.getElementById('sa-url').value.trim());
  form.append('category_id', document.getElementById('sa-category').value);
  form.append('function_id', document.getElementById('sa-function').value);
  form.append('tags', document.getElementById('sa-tags').value.trim());

  const msg = document.getElementById('sa-msg');
  const res = await api('POST', `/suggestions/${id}/approve`, form, true);
  if (res?.success) { msg.textContent = 'Approved!'; msg.className = 'form-msg success'; setTimeout(() => { closeModal(); pageSuggestions(); }, 700); }
  else { msg.textContent = 'Error'; msg.className = 'form-msg error'; }
}
window.submitApprove = submitApprove;

async function rejectSuggestion(id) {
  if (!confirm('Reject this suggestion?')) return;
  await api('POST', `/suggestions/${id}/reject`);
  pageSuggestions();
}
window.rejectSuggestion = rejectSuggestion;

async function deleteSuggestion(id) {
  if (!confirm('Delete suggestion?')) return;
  await api('DELETE', `/suggestions/${id}`);
  pageSuggestions();
}
window.deleteSuggestion = deleteSuggestion;

/* ============ MENU ============ */
async function pageMenu() {
  const data = await api('GET', '/menu');
  document.getElementById('admin-content').innerHTML = `
    <div class="toolbar">
      <button class="btn-sm primary" onclick="openMenuModal()">+ Add Item</button>
    </div>
    <table class="data-table">
      <thead><tr><th>Icon</th><th>Name</th><th>URL</th><th>Order</th><th>Visible</th><th>Actions</th></tr></thead>
      <tbody>
        ${(data||[]).map(m => `
          <tr>
            <td>${m.icon}</td>
            <td>${escHtml(m.name)}</td>
            <td><small>${escHtml(m.redirect_url)}</small></td>
            <td>${m.sort_order}</td>
            <td>${m.is_visible ? '✅' : '❌'}</td>
            <td>
              <button class="btn-sm ghost" onclick="openMenuModal(${m.id})">Edit</button>
              <button class="btn-sm danger" onclick="deleteMenu(${m.id})">Del</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function openMenuModal(id = null) {
  let item = null;
  if (id) { const all = await api('GET', '/menu'); item = all?.find(m => m.id === id); }
  showModal('menuModal', id ? 'Edit Menu Item' : 'Add Menu Item', `
    <div class="form-group"><label>Name *</label><input type="text" class="form-input" id="mn-name" value="${escHtml(item?.name||'')}"></div>
    <div class="form-group"><label>Icon (emoji)</label><input type="text" class="form-input" id="mn-icon" value="${escHtml(item?.icon||'📄')}"></div>
    <div class="form-group"><label>URL *</label><input type="text" class="form-input" id="mn-url" value="${escHtml(item?.redirect_url||'')}"></div>
    <div class="form-group"><label>Sort Order</label><input type="number" class="form-input" id="mn-order" value="${item?.sort_order||0}"></div>
    <div class="form-group" style="display:flex;align-items:center;gap:10px">
      <label>Visible</label><input type="checkbox" id="mn-visible" ${item?.is_visible!==0?'checked':''}>
    </div>
    <button class="btn-primary" onclick="saveMenu(${id||'null'})">💾 Save</button>
    <div id="mn-msg" class="form-msg"></div>
  `);
}
window.openMenuModal = openMenuModal;

async function saveMenu(id) {
  const body = {
    name: document.getElementById('mn-name').value.trim(),
    icon: document.getElementById('mn-icon').value.trim(),
    redirect_url: document.getElementById('mn-url').value.trim(),
    sort_order: parseInt(document.getElementById('mn-order').value)||0,
    is_visible: document.getElementById('mn-visible').checked,
  };
  const msg = document.getElementById('mn-msg');
  const res = await api(id ? 'PUT' : 'POST', id ? `/menu/${id}` : '/menu', body);
  if (res) { msg.textContent = 'Saved!'; msg.className = 'form-msg success'; setTimeout(() => { closeModal(); pageMenu(); }, 700); }
  else { msg.textContent = 'Error'; msg.className = 'form-msg error'; }
}
window.saveMenu = saveMenu;

async function deleteMenu(id) {
  if (!confirm('Delete menu item?')) return;
  await api('DELETE', `/menu/${id}`);
  pageMenu();
}
window.deleteMenu = deleteMenu;

/* ============ APPEARANCE ============ */
async function pageAppearance() {
  const s = await api('GET', '/settings');
  document.getElementById('admin-content').innerHTML = `
    <div class="admin-section-title">🎨 Glass Settings</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1.5rem">
      <div class="form-group"><label>Glass Opacity (0-1)</label><input type="number" step="0.01" min="0" max="1" class="form-input" id="ap-glass-opacity" value="${s?.glass_opacity||0.15}"></div>
      <div class="form-group"><label>Blur (px)</label><input type="number" class="form-input" id="ap-glass-blur" value="${s?.glass_blur||12}"></div>
      <div class="form-group"><label>Border Opacity (0-1)</label><input type="number" step="0.01" min="0" max="1" class="form-input" id="ap-border-opacity" value="${s?.glass_border_opacity||0.25}"></div>
      <div class="form-group"><label>Border Radius (px)</label><input type="number" class="form-input" id="ap-border-radius" value="${s?.glass_border_radius||16}"></div>
    </div>

    <div class="admin-section-title">🌞 Light Mode Background</div>
    <div class="form-group">
      <label>Current: ${s?.light_background ? `<img src="${s.light_background}" style="height:40px;border-radius:6px;vertical-align:middle">` : 'None'}</label>
      <input type="file" class="form-input" id="ap-light-bg" accept="image/*,video/*">
    </div>

    <div class="admin-section-title">🌙 Dark Mode Background</div>
    <div class="form-group">
      <label>Current: ${s?.dark_background ? `<img src="${s.dark_background}" style="height:40px;border-radius:6px;vertical-align:middle">` : 'None'}</label>
      <input type="file" class="form-input" id="ap-dark-bg" accept="image/*,video/*">
    </div>

    <button class="btn-primary" onclick="saveAppearance()">💾 Save Appearance</button>
    <div id="ap-msg" class="form-msg"></div>
  `;
}

async function saveAppearance() {
  const msg = document.getElementById('ap-msg');
  msg.textContent = 'Saving...'; msg.className = 'form-msg';

  // Upload backgrounds if selected
  const lightFile = document.getElementById('ap-light-bg').files[0];
  const darkFile = document.getElementById('ap-dark-bg').files[0];

  let lightUrl = '', darkUrl = '';

  if (lightFile) {
    const form = new FormData(); form.append('background', lightFile);
    const res = await api('POST', '/upload/background', form, true);
    lightUrl = res?.url || '';
  }
  if (darkFile) {
    const form = new FormData(); form.append('background', darkFile);
    const res = await api('POST', '/upload/background', form, true);
    darkUrl = res?.url || '';
  }

  const settings = {
    glass_opacity: document.getElementById('ap-glass-opacity').value,
    glass_blur: document.getElementById('ap-glass-blur').value,
    glass_border_opacity: document.getElementById('ap-border-opacity').value,
    glass_border_radius: document.getElementById('ap-border-radius').value,
  };
  if (lightUrl) settings.light_background = lightUrl;
  if (darkUrl) settings.dark_background = darkUrl;

  const res = await api('PUT', '/settings', settings);
  if (res) { msg.textContent = 'Saved!'; msg.className = 'form-msg success'; }
  else { msg.textContent = 'Error'; msg.className = 'form-msg error'; }
}
window.saveAppearance = saveAppearance;

/* ============ NUKE MODE ============ */
async function pageNuke() {
  const data = await api('GET', '/nuke');
  const s = await api('GET', '/settings');
  const isOn = data?.nuke_enabled;

  document.getElementById('admin-content').innerHTML = `
    <div class="nuke-card" style="margin-bottom:1.5rem">
      <div style="font-size:3rem;margin-bottom:0.5rem">☢️</div>
      <div class="nuke-title">Nuke Mode is <span style="color:${isOn?'#ef4444':'#22c55e'}">${isOn ? 'ON' : 'OFF'}</span></div>
      <div class="nuke-desc">${isOn ? 'All public pages are redirected to the nuke page.' : 'Website is running normally.'}</div>
      <button class="btn-nuke ${isOn ? 'off' : 'on'}" onclick="toggleNuke(${isOn})">
        ${isOn ? '✅ Disable Nuke Mode' : '☢️ Enable Nuke Mode'}
      </button>
    </div>

    <div class="admin-section-title">📝 Nuke Page Content</div>
    <div class="form-group"><label>Icon</label><input type="text" class="form-input" id="nuke-icon" value="${escHtml(s?.nuke_icon||'🔧')}"></div>
    <div class="form-group"><label>Title</label><input type="text" class="form-input" id="nuke-title-text" value="${escHtml(s?.nuke_title||'Website Temporarily Unavailable')}"></div>
    <div class="form-group"><label>Message</label><textarea class="form-input" id="nuke-msg-text" rows="3">${escHtml(s?.nuke_message||'Please check back soon.')}</textarea></div>
    <button class="btn-primary" onclick="saveNukePage()">💾 Save Nuke Page</button>
    <div id="nuke-save-msg" class="form-msg"></div>
  `;
}

async function toggleNuke(isOn) {
  const msg = isOn
    ? 'Disable Nuke Mode? The normal website will become available again.'
    : '⚠️ Enable Nuke Mode? All public visitors will be redirected to the Nuke page.';
  if (!confirm(msg)) return;
  await api('POST', isOn ? '/nuke/disable' : '/nuke/enable');
  pageNuke();
}
window.toggleNuke = toggleNuke;

async function saveNukePage() {
  const msg = document.getElementById('nuke-save-msg');
  const res = await api('PUT', '/settings', {
    nuke_icon: document.getElementById('nuke-icon').value.trim(),
    nuke_title: document.getElementById('nuke-title-text').value.trim(),
    nuke_message: document.getElementById('nuke-msg-text').value.trim(),
  });
  if (res) { msg.textContent = 'Saved!'; msg.className = 'form-msg success'; }
  else { msg.textContent = 'Error'; msg.className = 'form-msg error'; }
}
window.saveNukePage = saveNukePage;

/* ============ SETTINGS ============ */
async function pageSettings() {
  const s = await api('GET', '/settings');
  document.getElementById('admin-content').innerHTML = `
    <div class="admin-section-title">🌐 Site Settings</div>
    <div class="form-group"><label>Site Name</label><input type="text" class="form-input" id="set-name" value="${escHtml(s?.site_name||'')}"></div>
    <div class="form-group"><label>Search Placeholder</label><input type="text" class="form-input" id="set-placeholder" value="${escHtml(s?.search_placeholder||'')}"></div>
    <div class="form-group"><label>Visitor Timeout (minutes)</label><input type="number" class="form-input" id="set-timeout" value="${s?.visitor_timeout_minutes||5}"></div>

    <div class="admin-section-title" style="margin-top:1.5rem">🔐 Change Password</div>
    <div class="form-group"><label>Current Password</label><input type="password" class="form-input" id="pw-current"></div>
    <div class="form-group"><label>New Password</label><input type="password" class="form-input" id="pw-new"></div>
    <button class="btn-sm primary" onclick="changePassword()">Change Password</button>
    <div id="pw-msg" class="form-msg"></div>

    <br><br>
    <button class="btn-primary" onclick="saveSiteSettings()">💾 Save Settings</button>
    <div id="set-msg" class="form-msg"></div>
  `;
}

async function saveSiteSettings() {
  const msg = document.getElementById('set-msg');
  const res = await api('PUT', '/settings', {
    site_name: document.getElementById('set-name').value.trim(),
    search_placeholder: document.getElementById('set-placeholder').value.trim(),
    visitor_timeout_minutes: document.getElementById('set-timeout').value,
  });
  if (res) { msg.textContent = 'Saved!'; msg.className = 'form-msg success'; }
  else { msg.textContent = 'Error'; msg.className = 'form-msg error'; }
}
window.saveSiteSettings = saveSiteSettings;

async function changePassword() {
  const msg = document.getElementById('pw-msg');
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN.token}` },
    body: JSON.stringify({
      current_password: document.getElementById('pw-current').value,
      new_password: document.getElementById('pw-new').value,
    })
  });
  const data = await res.json();
  if (res.ok) { msg.textContent = 'Password changed!'; msg.className = 'form-msg success'; }
  else { msg.textContent = data.error || 'Error'; msg.className = 'form-msg error'; }
}
window.changePassword = changePassword;

/* ============ MODAL HELPERS ============ */
let _modalEl = null;

function showModal(id, title, bodyHtml) {
  closeModal();
  const div = document.createElement('div');
  div.className = 'admin-modal';
  div.id = id;
  div.innerHTML = `
    <div class="admin-modal-box">
      <div class="modal-head">
        <span>${title}</span>
        <button class="btn-icon" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body-inner">${bodyHtml}</div>
    </div>
  `;
  div.addEventListener('click', e => { if (e.target === div) closeModal(); });
  document.body.appendChild(div);
  _modalEl = div;
}

function closeModal() {
  if (_modalEl) { _modalEl.remove(); _modalEl = null; }
}
window.closeModal = closeModal;

/* ============ UTILS ============ */
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-');
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position:'fixed', bottom:'100px', left:'50%', transform:'translateX(-50%)',
    background:'rgba(34,197,94,0.9)', color:'#fff', padding:'0.5rem 1.2rem',
    borderRadius:'999px', zIndex:'9999', fontWeight:'600', fontSize:'0.9rem'
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
