// SKULL — Authoritative Online Multiplayer Server
// Express + Socket.IO. Rooms with short join codes.

import express from "express";
import http from "node:http";
import cors from "cors";
import { Server } from "socket.io";
import {
  createGame,
  placeCard,
  startBid,
  raiseBid,
  passBid,
  flipFromPlayer,
  loseCard,
  autoLoseRandom,
  toPublic,
  newPlayerId,
} from "./game.js";

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*"; // restrict in production
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.get("/", (_req, res) =>
  res.json({ ok: true, service: "skull-server", rooms: rooms.size })
);
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] },
});

/**
 * rooms: code -> {
 *   code, hostId, players: [{ id, name, socketId }],
 *   game | null, createdAt
 * }
 */
const rooms = new Map();
// socketId -> { roomCode, playerId }
const sockets = new Map();

const code6 = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
};

function newRoomCode() {
  let c;
  do { c = code6(); } while (rooms.has(c));
  return c;
}

function broadcast(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  // lobby info for everyone in the room
  const lobby = {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, connected: !!p.socketId })),
    started: !!room.game,
  };
  for (const p of room.players) {
    if (!p.socketId) continue;
    const payload = {
      lobby,
      game: room.game ? toPublic(room.game, p.id) : null,
      youId: p.id,
    };
    io.to(p.socketId).emit("state", payload);
  }
}

function actorGuard(roomCode, playerId, requireTurn = false) {
  const room = rooms.get(roomCode);
  if (!room || !room.game) return null;
  if (requireTurn) {
    const cur = room.game.players[room.game.currentPlayerIdx];
    if (!cur || cur.id !== playerId) return null;
  }
  return room;
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name }, cb) => {
    const playerId = newPlayerId();
    const code = newRoomCode();
    const room = {
      code,
      hostId: playerId,
      players: [{ id: playerId, name: (name || "Host").slice(0, 20), socketId: socket.id }],
      game: null,
      createdAt: Date.now(),
    };
    rooms.set(code, room);
    sockets.set(socket.id, { roomCode: code, playerId });
    socket.join(code);
    cb?.({ ok: true, code, playerId });
    broadcast(code);
  });

  socket.on("room:join", ({ code, name }, cb) => {
    code = (code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: "Room not found" });
    if (room.game) {
      // Allow rejoin if a player slot with same name exists & is disconnected
      const slot = room.players.find((p) => p.name === name && !p.socketId);
      if (slot) {
        slot.socketId = socket.id;
        sockets.set(socket.id, { roomCode: code, playerId: slot.id });
        socket.join(code);
        cb?.({ ok: true, code, playerId: slot.id, rejoined: true });
        broadcast(code);
        return;
      }
      return cb?.({ ok: false, error: "Game already started" });
    }
    if (room.players.length >= MAX_PLAYERS) return cb?.({ ok: false, error: "Room full" });
    const playerId = newPlayerId();
    room.players.push({
      id: playerId,
      name: (name || `Player ${room.players.length + 1}`).slice(0, 20),
      socketId: socket.id,
    });
    sockets.set(socket.id, { roomCode: code, playerId });
    socket.join(code);
    cb?.({ ok: true, code, playerId });
    broadcast(code);
  });

  socket.on("room:start", (_, cb) => {
    const meta = sockets.get(socket.id);
    if (!meta) return cb?.({ ok: false, error: "Not in a room" });
    const room = rooms.get(meta.roomCode);
    if (!room) return cb?.({ ok: false, error: "Room gone" });
    if (room.hostId !== meta.playerId) return cb?.({ ok: false, error: "Only host can start" });
    if (room.players.length < MIN_PLAYERS) return cb?.({ ok: false, error: `Need ${MIN_PLAYERS}+ players` });
    if (room.game) return cb?.({ ok: false, error: "Already started" });
    room.game = createGame(room.players.map((p) => ({ id: p.id, name: p.name, isBot: false })));
    cb?.({ ok: true });
    broadcast(meta.roomCode);
  });

  // --- Game actions ---
  socket.on("game:place", ({ card }, cb) => {
    const meta = sockets.get(socket.id);
    if (!meta) return;
    const room = actorGuard(meta.roomCode, meta.playerId, true);
    if (!room) return cb?.({ ok: false });
    room.game = placeCard(room.game, meta.playerId, card);
    cb?.({ ok: true });
    broadcast(meta.roomCode);
  });

  socket.on("game:bid", ({ amount }, cb) => {
    const meta = sockets.get(socket.id);
    if (!meta) return;
    const room = rooms.get(meta.roomCode);
    if (!room?.game) return cb?.({ ok: false });
    if (room.game.phase === "placing") {
      room.game = startBid(room.game, meta.playerId, amount);
    } else if (room.game.phase === "bidding") {
      room.game = raiseBid(room.game, meta.playerId, amount);
    }
    cb?.({ ok: true });
    broadcast(meta.roomCode);
  });

  socket.on("game:pass", (_, cb) => {
    const meta = sockets.get(socket.id);
    if (!meta) return;
    const room = rooms.get(meta.roomCode);
    if (!room?.game) return cb?.({ ok: false });
    room.game = passBid(room.game, meta.playerId);
    cb?.({ ok: true });
    broadcast(meta.roomCode);
  });

  socket.on("game:flip", ({ targetId }, cb) => {
    const meta = sockets.get(socket.id);
    if (!meta) return;
    const room = rooms.get(meta.roomCode);
    if (!room?.game) return cb?.({ ok: false });
    // only the bidder may flip
    if (room.game.reveal?.bidderId !== meta.playerId) return cb?.({ ok: false });
    room.game = flipFromPlayer(room.game, targetId);
    cb?.({ ok: true });
    broadcast(meta.roomCode);
  });

  socket.on("game:loseCard", ({ idx }, cb) => {
    const meta = sockets.get(socket.id);
    if (!meta) return;
    const room = rooms.get(meta.roomCode);
    if (!room?.game) return cb?.({ ok: false });
    if (room.game.pendingLoss?.loserId !== meta.playerId) return cb?.({ ok: false });
    room.game = room.game.pendingLoss.chooseFromOwnSkull
      ? loseCard(room.game, idx ?? 0)
      : autoLoseRandom(room.game);
    cb?.({ ok: true });
    broadcast(meta.roomCode);
  });

  socket.on("game:rematch", (_, cb) => {
    const meta = sockets.get(socket.id);
    if (!meta) return;
    const room = rooms.get(meta.roomCode);
    if (!room) return cb?.({ ok: false });
    if (room.hostId !== meta.playerId) return cb?.({ ok: false, error: "Only host" });
    room.game = createGame(room.players.map((p) => ({ id: p.id, name: p.name, isBot: false })));
    cb?.({ ok: true });
    broadcast(meta.roomCode);
  });

  socket.on("disconnect", () => {
    const meta = sockets.get(socket.id);
    if (!meta) return;
    sockets.delete(socket.id);
    const room = rooms.get(meta.roomCode);
    if (!room) return;
    const p = room.players.find((x) => x.id === meta.playerId);
    if (p) p.socketId = null;
    // If lobby (not started) and player leaves, remove them
    if (!room.game && p) {
      room.players = room.players.filter((x) => x.id !== meta.playerId);
      if (room.players.length === 0) {
        rooms.delete(room.code);
        return;
      }
      if (room.hostId === meta.playerId) room.hostId = room.players[0].id;
    }
    broadcast(room.code);
  });
});

// Garbage-collect idle rooms every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = room.players.some((p) => p.socketId);
    const ageH = (now - room.createdAt) / 3600000;
    if (!anyConnected && ageH > 1) rooms.delete(code);
  }
}, 30 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`SKULL server listening on :${PORT}`);
});
