# Skull Online — Release Bundle

এই zip-এ দুটো অংশ আছে:

```
skull-release/
├── frontend/   ← আপনার ওয়েবসাইট (TanStack Start + React)
└── backend/    ← Online multiplayer server (Node + Socket.IO)
```

---

## 1) Backend (Render এ deploy)

1. GitHub এ নতুন repo বানান: `skull-server`
2. `backend/` ফোল্ডারের **সব ফাইল** (node_modules বাদে) repo-তে upload করুন।
3. https://render.com → **New +** → **Web Service** → আপনার repo সিলেক্ট করুন।
4. সেটিংস:
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: **Free**
5. Create → ৩-৫ মিনিট wait → URL পাবেন যেমন `https://skull-server-xxxx.onrender.com`
6. সেই URL টা frontend এর `.env` এ বসান (নিচে দেখুন)।

---

## 2) Frontend (যে কোনো জায়গায় deploy)

### Local এ চালাতে
```bash
cd frontend
bun install        # বা npm install
bun run dev        # http://localhost:8080
```

### Online mode চালু করতে
`frontend/.env` ফাইল বানিয়ে লিখুন:
```
VITE_SOCKET_URL=https://skull-server-xxxx.onrender.com
```
(আপনার Render URL দিয়ে replace করুন)

### Build & Deploy
```bash
cd frontend
bun run build
```
Output `frontend/.output/` এ যাবে। এটাকে Vercel / Netlify / Cloudflare Pages / Render Static Site — যে কোনো জায়গায় deploy করতে পারবেন।

---

## Game Modes

- **Pass & Play** — একই ডিভাইসে ২-৬ জন (turn এর মাঝে হাত auto-hide হয়)
- **vs Bot** — ১-৫ টা AI bot এর সাথে
- **Online** — Render server এর সাথে connect হয়ে room code দিয়ে খেলা

## Rules (সংক্ষেপে)
- প্রত্যেক রাউন্ডে প্রথমে সবাই একটা করে কার্ড face-down রাখে।
- এরপর নিজের turn এ আপনি আরেকটা কার্ড রাখতে পারেন **অথবা** বাজি ধরতে পারেন।
- কেউ বাজি ধরলে বাকিদের **বাড়াতে হবে নাহয় পাস** করতে হবে।
- সর্বোচ্চ bidder নিজের stack থেকে শুরু করে target সংখ্যক rose উল্টাবে।
- Skull উল্টে গেলে একটা কার্ড হারাবে (নিজের skull হলে নিজে বেছে নেবে, অন্যের হলে blind pick)।
- ২ পয়েন্ট আগে যে পাবে সে winner।

Enjoy! 🏴‍☠️💀
