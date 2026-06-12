// Authoritative Skull game engine — server-side mirror of the client engine.
// All hidden information (each player's hand contents, stack contents) stays
// on the server. Clients receive a sanitized view via toPublic().

import { randomUUID } from "node:crypto";

export const POINTS_TO_WIN = 2;

export function createGame(playerSpecs) {
  const players = playerSpecs.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: !!p.isBot,
    connected: true,
    hand: ["rose", "rose", "rose", "skull"],
    stack: [],
    revealed: [],
    points: 0,
    eliminated: false,
  }));
  return {
    players,
    currentPlayerIdx: 0,
    phase: "placing",
    bid: null,
    reveal: null,
    pendingLoss: null,
    round: 1,
    log: ["গেম শুরু! প্রথমে সবাই একটা করে কার্ড রাখো।"],
    startingPlayerId: players[0].id,
    winnerId: null,
  };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

export function activePlayers(g) {
  return g.players.filter((p) => !p.eliminated);
}

function nextActiveIdx(g, fromIdx) {
  const n = g.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromIdx + i) % n;
    if (!g.players[idx].eliminated) return idx;
  }
  return fromIdx;
}

export function totalCardsOnTable(g) {
  return g.players.reduce((s, p) => s + p.stack.length, 0);
}

function log(g, msg) {
  g.log = [...g.log.slice(-40), msg];
}

export function placeCard(g, playerId, card) {
  if (g.phase !== "placing") return g;
  const ng = clone(g);
  const p = ng.players.find((x) => x.id === playerId);
  if (!p || ng.players[ng.currentPlayerIdx].id !== playerId) return g;
  const idx = p.hand.indexOf(card);
  if (idx < 0) return g;
  p.hand.splice(idx, 1);
  p.stack.push(card);
  log(ng, `${p.name} একটা কার্ড রাখলো।`);
  ng.currentPlayerIdx = nextActiveIdx(ng, ng.currentPlayerIdx);
  return ng;
}

export function startBid(g, playerId, amount) {
  if (g.phase !== "placing") return g;
  const total = totalCardsOnTable(g);
  if (amount < 1 || amount > total) return g;
  const allPlaced = activePlayers(g).every((p) => p.stack.length >= 1);
  if (!allPlaced) return g;
  const ng = clone(g);
  ng.phase = "bidding";
  ng.bid = { amount, bidderId: playerId, passed: [] };
  const p = ng.players.find((x) => x.id === playerId);
  log(ng, `${p.name} বাজি ধরলো: ${amount} কার্ড উল্টাবে!`);
  ng.currentPlayerIdx = nextActiveIdx(ng, ng.players.findIndex((x) => x.id === playerId));
  return maybeStartReveal(ng);
}

export function raiseBid(g, playerId, amount) {
  if (g.phase !== "bidding" || !g.bid) return g;
  if (g.bid.passed.includes(playerId)) return g;
  if (amount <= g.bid.amount) return g;
  if (amount > totalCardsOnTable(g)) return g;
  const ng = clone(g);
  ng.bid = { ...ng.bid, amount, bidderId: playerId };
  const p = ng.players.find((x) => x.id === playerId);
  log(ng, `${p.name} বাজি বাড়ালো: ${amount}!`);
  ng.currentPlayerIdx = nextActiveIdx(ng, ng.players.findIndex((x) => x.id === playerId));
  while (ng.bid.passed.includes(ng.players[ng.currentPlayerIdx].id)) {
    ng.currentPlayerIdx = nextActiveIdx(ng, ng.currentPlayerIdx);
  }
  return maybeStartReveal(ng);
}

export function passBid(g, playerId) {
  if (g.phase !== "bidding" || !g.bid) return g;
  if (g.bid.bidderId === playerId) return g;
  const ng = clone(g);
  ng.bid.passed = [...ng.bid.passed, playerId];
  const p = ng.players.find((x) => x.id === playerId);
  log(ng, `${p.name} পাস করলো।`);
  ng.currentPlayerIdx = nextActiveIdx(ng, ng.players.findIndex((x) => x.id === playerId));
  while (ng.bid.passed.includes(ng.players[ng.currentPlayerIdx].id)) {
    ng.currentPlayerIdx = nextActiveIdx(ng, ng.currentPlayerIdx);
  }
  return maybeStartReveal(ng);
}

function maybeStartReveal(g) {
  if (g.phase !== "bidding" || !g.bid) return g;
  const actives = activePlayers(g).map((p) => p.id);
  const others = actives.filter((id) => id !== g.bid.bidderId);
  const allPassed = others.every((id) => g.bid.passed.includes(id));
  if (!allPassed) return g;
  const ng = clone(g);
  ng.phase = "revealing";
  const bidder = ng.players.find((p) => p.id === ng.bid.bidderId);
  ng.reveal = { bidderId: bidder.id, target: ng.bid.amount, flipped: 0, hitSkull: false };
  log(ng, `${bidder.name} কে ${ng.bid.amount} কার্ড উল্টাতে হবে। নিজের স্ট্যাক দিয়ে শুরু!`);
  return autoFlipOwn(ng);
}

function autoFlipOwn(g) {
  let ng = g;
  while (
    ng.phase === "revealing" &&
    ng.reveal &&
    !ng.reveal.hitSkull &&
    ng.reveal.flipped < ng.reveal.target
  ) {
    const bidder = ng.players.find((p) => p.id === ng.reveal.bidderId);
    if (bidder.stack.length === 0) break;
    ng = flipFromPlayer(ng, bidder.id);
  }
  return ng;
}

export function flipFromPlayer(g, playerId) {
  if (g.phase !== "revealing" || !g.reveal) return g;
  const ng = clone(g);
  const target = ng.players.find((p) => p.id === playerId);
  if (!target || target.stack.length === 0) return g;
  const card = target.stack.pop();
  target.revealed.push(card);
  ng.reveal.flipped += 1;
  log(ng, `${target.name} এর স্ট্যাক থেকে ${card === "skull" ? "💀 SKULL" : "🌹 গোলাপ"}!`);
  if (card === "skull") {
    ng.reveal.hitSkull = true;
    ng.reveal.skullOwnerId = target.id;
    return resolveFailure(ng);
  }
  if (ng.reveal.flipped >= ng.reveal.target) return resolveSuccess(ng);
  return ng;
}

function resolveSuccess(g) {
  const ng = clone(g);
  const bidder = ng.players.find((p) => p.id === ng.reveal.bidderId);
  bidder.points += 1;
  log(ng, `🎉 ${bidder.name} চ্যালেঞ্জ জিতলো! +১ পয়েন্ট (${bidder.points}/${POINTS_TO_WIN})`);
  if (bidder.points >= POINTS_TO_WIN) {
    ng.phase = "gameOver";
    ng.winnerId = bidder.id;
    log(ng, `👑 ${bidder.name} গেম জিতলো!`);
    return ng;
  }
  ng.startingPlayerId = bidder.id;
  return resetRound(ng);
}

function resolveFailure(g) {
  const ng = clone(g);
  const bidder = ng.players.find((p) => p.id === ng.reveal.bidderId);
  const skullOwner = ng.reveal.skullOwnerId;
  log(ng, `💀 ${bidder.name} skull-এ আঘাত পেলো! একটা কার্ড হারাবে।`);
  ng.pendingLoss = { loserId: bidder.id, chooseFromOwnSkull: skullOwner === bidder.id };
  ng.phase = "lostCardPick";
  return ng;
}

export function loseCard(g, idxInCombined) {
  if (g.phase !== "lostCardPick" || !g.pendingLoss) return g;
  const ng = clone(g);
  const loser = ng.players.find((p) => p.id === ng.pendingLoss.loserId);
  const all = [];
  loser.hand.forEach((c, i) => all.push({ from: "hand", idx: i, card: c }));
  loser.stack.forEach((c, i) => all.push({ from: "stack", idx: i, card: c }));
  loser.revealed.forEach((c, i) => all.push({ from: "revealed", idx: i, card: c }));
  if (all.length === 0) return ng;
  const pick = all[Math.max(0, Math.min(idxInCombined, all.length - 1))];
  if (pick.from === "hand") loser.hand.splice(pick.idx, 1);
  if (pick.from === "stack") loser.stack.splice(pick.idx, 1);
  if (pick.from === "revealed") loser.revealed.splice(pick.idx, 1);
  log(ng, `${loser.name} একটা ${pick.card === "skull" ? "💀 skull" : "🌹 গোলাপ"} হারালো।`);
  const totalLeft = loser.hand.length + loser.stack.length + loser.revealed.length;
  if (totalLeft === 0) {
    loser.eliminated = true;
    log(ng, `☠️ ${loser.name} বাদ পড়লো!`);
  }
  ng.pendingLoss = null;
  const alive = activePlayers(ng);
  if (alive.length === 1) {
    ng.phase = "gameOver";
    ng.winnerId = alive[0].id;
    log(ng, `👑 ${alive[0].name} শেষ পর্যন্ত টিকে গেলো — জয়ী!`);
    return ng;
  }
  ng.startingPlayerId = loser.eliminated
    ? alive[(alive.findIndex((a) => a.id === loser.id) + 1) % alive.length]?.id ?? alive[0].id
    : loser.id;
  return resetRound(ng);
}

export function autoLoseRandom(g) {
  if (g.phase !== "lostCardPick" || !g.pendingLoss) return g;
  const loser = g.players.find((p) => p.id === g.pendingLoss.loserId);
  const total = loser.hand.length + loser.stack.length + loser.revealed.length;
  if (total === 0) return loseCard(g, 0);
  return loseCard(g, Math.floor(Math.random() * total));
}

function resetRound(g) {
  const ng = clone(g);
  for (const p of ng.players) {
    p.hand = [...p.hand, ...p.stack, ...p.revealed];
    p.stack = [];
    p.revealed = [];
  }
  ng.bid = null;
  ng.reveal = null;
  ng.pendingLoss = null;
  ng.phase = "placing";
  ng.round += 1;
  const startIdx = ng.players.findIndex((p) => p.id === ng.startingPlayerId);
  ng.currentPlayerIdx =
    startIdx >= 0 && !ng.players[startIdx].eliminated
      ? startIdx
      : nextActiveIdx(ng, startIdx >= 0 ? startIdx : 0);
  log(ng, `— রাউন্ড ${ng.round} —`);
  return ng;
}

/**
 * Sanitize a game state for a specific viewer. Other players' hand contents
 * and stack contents are hidden — only counts and (for revealed cards)
 * actual values are returned.
 */
export function toPublic(g, viewerId) {
  return {
    ...g,
    players: g.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      connected: p.connected,
      points: p.points,
      eliminated: p.eliminated,
      handCount: p.hand.length,
      stackCount: p.stack.length,
      revealed: p.revealed,
      // Only the viewer sees their own hand contents
      hand: p.id === viewerId ? p.hand : null,
    })),
  };
}

export function newPlayerId() {
  return randomUUID();
}
