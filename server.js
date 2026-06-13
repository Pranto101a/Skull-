import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import {
  createGame, placeCard, startBid, raiseBid, passBid,
  flipFromPlayer, loseCard, autoLoseRandom, toPublic,
} from "./engine.js";

const PORT = process.env.PORT || 3001;
const app = express();
app.use(cors());
app.get("/", (_req, res) => res.send("Skull server is alive 🏴‍☠️"));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// rooms: code -> { hostId, players: [{id,name,socketId}], game | null }
const rooms = new Map();
const code5 = () => Math.random().toString(36).slice(2, 7).toUpperCase();

function broadcast(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const lobby = {
    roomCode,
    hostId: room.hostId,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
  };
  io.to(roomCode).emit("lobby", lobby);
  if (room.game) {
    for (const p of room.players) {
      io.to(p.socketId).emit("state", { state: toPublic(room.game, p.id), yourId: p.id });
    }
  }
}

io.on("connection", (socket) => {
  let myRoom = null;
  let myId = null;

  socket.on("createRoom", ({ name }, cb) => {
    let code; do { code = code5(); } while (rooms.has(code));
    myId = socket.id;
    rooms.set(code, { hostId: myId, players: [{ id: myId, name: name || "Player", socketId: socket.id }], game: null });
    socket.join(code); myRoom = code;
    cb?.({ ok: true, roomCode: code, playerId: myId });
    broadcast(code);
  });

  socket.on("joinRoom", ({ name, roomCode }, cb) => {
    const code = (roomCode || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: "রুম পাওয়া যায়নি" });
    if (room.game) return cb?.({ ok: false, error: "গেম শুরু হয়ে গেছে" });
    if (room.players.length >= 6) return cb?.({ ok: false, error: "রুম পূর্ণ" });
    myId = socket.id;
    room.players.push({ id: myId, name: name || "Player", socketId: socket.id });
    socket.join(code); myRoom = code;
    cb?.({ ok: true, roomCode: code, playerId: myId });
    broadcast(code);
  });

  socket.on("startGame", () => {
    const room = rooms.get(myRoom); if (!room) return;
    if (room.hostId !== myId) return;
    if (room.players.length < 2) return;
    room.game = createGame(room.players.map((p) => ({ id: p.id, name: p.name, isBot: false })));
    broadcast(myRoom);
  });

  socket.on("action", (msg) => {
    const room = rooms.get(myRoom); if (!room || !room.game) return;
    const g = room.game;
    let next = g;
    try {
      switch (msg.type) {
        case "place": next = placeCard(g, myId, msg.card); break;
        case "startBid": next = startBid(g, myId, msg.amount); break;
        case "raise": next = raiseBid(g, myId, msg.amount); break;
        case "pass": next = passBid(g, myId); break;
        case "flip": next = flipFromPlayer(g, msg.targetId); break;
        case "lose": next = loseCard(g, msg.idx); break;
        case "loseRandom": next = autoLoseRandom(g); break;
        case "reset": next = createGame(room.players.map((p) => ({ id: p.id, name: p.name, isBot: false }))); break;
      }
    } catch (e) { console.error(e); }
    room.game = next;
    broadcast(myRoom);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(myRoom); if (!room) return;
    room.players = room.players.filter((p) => p.id !== myId);
    if (room.players.length === 0) { rooms.delete(myRoom); return; }
    if (room.hostId === myId) room.hostId = room.players[0].id;
    broadcast(myRoom);
  });
});

server.listen(PORT, () => console.log(`Skull server listening on ${PORT}`));
