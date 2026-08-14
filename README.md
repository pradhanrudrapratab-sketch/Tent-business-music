# 🎵 Tent Function Music

Event music library for Indian tent/function businesses.

## 🚀 Deploy on Render (Free)

### Step 1 — GitHub pe push karo

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOURUSERNAME/tent-function-music.git
git push -u origin main
```

### Step 2 — Render pe deploy karo

1. [render.com](https://render.com) pe login karo
2. **New → Web Service** click karo
3. GitHub repo connect karo
4. Yeh settings use karo:

| Field | Value |
|---|---|
| Environment | Node |
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Plan | Free |

### Step 3 — Environment Variables set karo

Render dashboard → Environment tab mein yeh add karo:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | (koi bhi random string, min 32 chars) |
| `ADMIN_USERNAME` | `admin` (ya apna username) |
| `ADMIN_PASSWORD` | (strong password) |
| `DB_PATH` | `/opt/render/project/src/data.db` |

### Step 4 — Deploy!

Deploy button dabao. 2-3 min mein site live ho jayegi.

---

## 🔐 Admin Panel

URL: `https://your-site.onrender.com/admin`

Default credentials jo tumne env variables mein set kiye.

---

## 📁 Project Structure

```
tent-music/
├── server.js           ← Main Express server
├── database.js         ← SQLite schema + seeding
├── middleware/
│   └── auth.js         ← JWT authentication
├── routes/
│   ├── auth.js         ← Login / password change
│   ├── public.js       ← Public API endpoints
│   └── admin.js        ← Admin CRUD endpoints
├── public/
│   ├── index.html      ← Public website (SPA)
│   ├── nuke.html       ← Nuke mode page
│   ├── assets/
│   │   ├── css/main.css
│   │   └── js/app.js
│   └── admin/
│       ├── index.html  ← Admin panel
│       └── js/
│           ├── admin.js
│           └── admin.css
├── uploads/            ← User uploaded files
├── render.yaml         ← Render config
└── package.json
```

---

## ⚠️ Important — Render Free Tier

Render free tier ka **disk ephemeral** hai — iska matlab:
- Server restart hone pe uploaded files delete ho jayenge
- Database (data.db) bhi reset ho sakti hai

**Production ke liye:**
- Database: Render ka free PostgreSQL use karo
- Files: Cloudinary ya Backblaze B2 (free) pe store karo

Abhi development/testing ke liye SQLite + local uploads theek hai.

---

## 🎵 Features

- ✅ Categories (Wedding, Puja, Death, Birthday, etc.)
- ✅ Functions (Haldi, Baraat, Ganesh Puja, etc.)
- ✅ Playlists management
- ✅ YouTube + Audio file support
- ✅ Search (songs, categories, functions, playlists)
- ✅ Star ratings (no login needed)
- ✅ Song suggestions from public
- ✅ Live visitor count (heartbeat)
- ✅ Hamburger menu (admin configurable)
- ✅ Dark/Light mode
- ✅ Liquid Glass UI
- ✅ Sticky music player
- ✅ Nuke Mode (emergency redirect)
- ✅ Full Admin Panel (Dashboard, all CRUD)
- ✅ Secure JWT auth + bcrypt passwords
