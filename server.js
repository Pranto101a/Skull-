// =============================================================================
// SKULL — Online Multiplayer Server (Socket.IO)
// -----------------------------------------------------------------------------
// Run:    npm install && npm start
// Health: GET /              → "Skull server is alive 🏴‍☠️"
//         GET /health        → { ok: true, rooms: N }
// Socket events (client → server):
//    createRoom { name }                       → cb({ ok, roomCode, playerId })
//    joinRoom   { code, name }                 → cb({ ok, roomCode, playerId })
//    startGame                                 (host only, ≥2 players)
//    action     { type, ...args }              (place / startBid / raise / pass /
//                                               flip / lose / loseRandom / reset)
// Socket events (server → client):
//    lobby  { roomCode, hostId, players }
//    state  { state, yourId }                  (per-player, sanitized)
// =============================================================================

import express from "express";
import http    from "http";
import cors    from "cors";
import { Server } from "socket.io";
import {
  createGame, placeCard, startBid, raiseBid, passBid,
  flipFromPlayer, loseCard, autoLoseRandom, toPublic,
} from "./engine.js";

// ---------- HTTP -------------------------------------------------------------
const PORT = process.env.PORT || 3001;
const app  = express();
app.use(cors());
app.get("/",       (_req, res) => res.send("Skull server is alive 🏴‍☠️"));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: "*" } });

// ---------- Room store -------------------------------------------------------
// rooms: Map<code, { hostId, players: [{ id, name, socketId }], game | null }>
const rooms  = new Map();
const code5  = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const uidPid = () => Math.random().toString(36).slice(2, 10);

function broadcast(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // 1) lobby snapshot for everyone
  io.to(roomCode).emit("lobby", {
    roomCode,
    hostId : room.hostId,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
  });

  // 2) per-player sanitized state
  if (room.game) {
    for (const p of room.players) {
      io.to(p.socketId).emit("state", {
        state : toPublic(room.game, p.id),
        yourId: p.id,
      });
    }
  }
}

// ---------- Socket wiring ----------------------------------------------------
io.on("connection", (socket) => {
  let myRoom = null;
  let myId   = null;

  // --- create room ---
  socket.on("createRoom", ({ name }, cb) => {
    let code;
    do { code = code5(); } while (rooms.has(code));

    myId = uidPid();
    rooms.set(code, {
      hostId : myId,
      players: [{ id: myId, name: String(name || "Host").slice(0, 20), socketId: socket.id }],
      game   : null,
    });
    socket.join(code);
    myRoom = code;
    cb?.({ ok: true, roomCode: code, playerId: myId });
    broadcast(code);
  });

  // --- join room ---
  socket.on("joinRoom", ({ code, name }, cb) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room)              return cb?.({ ok: false, error: "রুম পাওয়া যায়নি" });
    if (room.game)          return cb?.({ ok: false, error: "গেম ইতিমধ্যে শুরু হয়েছে" });
    if (room.players.length >= 6) return cb?.({ ok: false, error: "রুম পূর্ণ" });

    myId = uidPid();
    room.players.push({ id: myId, name: String(name || "Player").slice(0, 20), socketId: socket.id });
    socket.join(code);
    myRoom = code;
    cb?.({ ok: true, roomCode: code, playerId: myId });
    broadcast(code);
  });

  // --- start game (host only) ---
  socket.on("startGame", () => {
    const room = rooms.get(myRoom);
    if (!room || room.hostId !== myId || room.players.length < 2) return;
    room.game = createGame(
      room.players.map((p) => ({ id: p.id, name: p.name, isBot: false })),
    );
    broadcast(myRoom);
  });

  // --- in-game actions ---
  socket.on("action", (msg) => {
    const room = rooms.get(myRoom);
    if (!room || !room.game) return;
    let next = room.game;
    try {
      switch (msg.type) {
        case "place":      next = placeCard(room.game, myId, msg.card);          break;
        case "startBid":   next = startBid(room.game, myId, msg.amount);         break;
        case "raise":      next = raiseBid(room.game, myId, msg.amount);         break;
        case "pass":       next = passBid(room.game, myId);                      break;
        case "flip":       next = flipFromPlayer(room.game, msg.targetId);       break;
        case "lose":       next = loseCard(room.game, msg.idx);                  break;
        case "loseRandom": next = autoLoseRandom(room.game);                     break;
        case "reset":
          next = createGame(room.players.map((p) => ({ id: p.id, name: p.name, isBot: false })));
          break;
      }
    } catch (e) { console.error(e); }
    room.game = next;
    broadcast(myRoom);
  });

  // --- disconnect cleanup ---
  socket.on("disconnect", () => {
    const room = rooms.get(myRoom);
    if (!room) return;
    room.players = room.players.filter((p) => p.id !== myId);
    if (room.players.length === 0) { rooms.delete(myRoom); return; }
    if (room.hostId === myId) room.hostId = room.players[0].id;
    broadcast(myRoom);
  });
});

// ---------- start ------------------------------------------------------------
server.listen(PORT, () => console.log(`Skull server listening on ${PORT}`));
