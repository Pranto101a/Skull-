# 💀 SKULL — Online Multiplayer Server

এটি SKULL bluffing গেমের জন্য **authoritative WebSocket server** (Node.js + Socket.IO)। সব গেম-state সার্ভারে থাকে — তাই cheat সম্ভব না, এবং কেউ disconnect হলে rejoin করতে পারে।

---

## 📦 ফাইলগুলো

| ফাইল | কাজ |
|---|---|
| `server.js` | Express + Socket.IO server, room management |
| `game.js` | Skull game engine (পুরো নিয়ম authoritative) |
| `package.json` | Dependencies |
| `render.yaml` | Render.com auto-deploy blueprint |
| `.gitignore` | Git ignore rules |

---

## 🚀 STEP 1 — GitHub-এ আপলোড

### Option A: GitHub Web UI (সহজ)

1. https://github.com/new -এ গিয়ে একটা নতুন repository বানাও — নাম দাও `skull-server` (Public বা Private দু'টোই চলবে)।
2. "uploading an existing file" link-এ ক্লিক করো।
3. এই zip ফাইলটা **extract** করে ভেতরের ফাইলগুলো (server.js, game.js, package.json, render.yaml, .gitignore) drag-and-drop করো। **`node_modules` ফোল্ডারটা আপলোড কোরো না** (যদি থাকে)।
4. নিচে "Commit changes" চাপো।

### Option B: Git Command Line

```bash
unzip skull-server.zip
cd skull-server
git init
git add .
git commit -m "Initial Skull server"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/skull-server.git
git push -u origin main
```

---

## ☁️ STEP 2 — Render-এ Deploy

1. https://render.com -এ লগইন করো (GitHub দিয়ে sign up করতে পারো — free)।
2. Dashboard থেকে **"New +"** → **"Web Service"** ক্লিক করো।
3. তোমার `skull-server` repository select করো ("Connect" চাপতে হতে পারে GitHub permission দেওয়ার জন্য)।
4. নিচের settings দাও (বেশিরভাগ auto fill হবে):
   - **Name**: `skull-server` (যেকোনো নাম)
   - **Region**: Singapore (বা তোমার কাছাকাছি)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free**
5. **"Create Web Service"** চাপো।
6. ৩–৫ মিনিট wait করো। Build হলে উপরে একটা URL দেখাবে — দেখতে এরকম:
   ```
   https://skull-server-xxxx.onrender.com
   ```
7. সেই URL-এ ব্রাউজারে গিয়ে test করো — দেখাবে:
   ```json
   { "ok": true, "service": "skull-server", "rooms": 0 }
   ```

> ⚠️ **Free tier note**: ১৫ মিনিট inactivity-র পর Render server "sleep" করে। প্রথম request আসলে ৩০–৫০ sec time নেয় ঘুম থেকে উঠতে। প্রথম খেলোয়াড়কে একটু wait করতে হবে।

---

## 🔌 STEP 3 — Lovable Frontend-এ Connect

তোমার Lovable app-এ গিয়ে আমাকে বলো:

> "আমার server URL: `https://skull-server-xxxx.onrender.com` — Online mode connect করে দাও"

আমি `socket.io-client` add করব, online lobby UI বানাবো (room create / join), এবং এই URL-টা environment variable হিসেবে set করব।

---

## 🔒 Production-এ CORS Restrict করতে

Render dashboard → তোমার service → **Environment** ট্যাব → **Add Environment Variable**:

- **Key**: `CORS_ORIGIN`
- **Value**: তোমার Lovable published URL (যেমন `https://skull.lovable.app`)

Save করলে server auto-restart হবে।

---

## 🧪 Local-এ Test (optional)

```bash
unzip skull-server.zip
cd skull-server
npm install
npm start
# → SKULL server listening on :3001
```

ব্রাউজারে http://localhost:3001 খুলে test করতে পারো।

---

## 📡 Socket.IO Events (reference)

| Client → Server | Payload | Response |
|---|---|---|
| `room:create` | `{ name }` | `{ ok, code, playerId }` |
| `room:join` | `{ code, name }` | `{ ok, code, playerId }` |
| `room:start` | — | `{ ok }` |
| `game:place` | `{ card: "rose" \| "skull" }` | `{ ok }` |
| `game:bid` | `{ amount }` | `{ ok }` |
| `game:pass` | — | `{ ok }` |
| `game:flip` | `{ targetId }` | `{ ok }` |
| `game:loseCard` | `{ idx }` | `{ ok }` |
| `game:rematch` | — | `{ ok }` |

| Server → Client | Payload |
|---|---|
| `state` | `{ lobby, game, youId }` — sanitized per viewer (অন্যের hand দেখা যাবে না) |

---

কোনো সমস্যা হলে আমাকে error message screenshot সহ পাঠাও — fix করে দেব। 💀
