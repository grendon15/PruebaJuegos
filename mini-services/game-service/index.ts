/**
 * ============================================================
 *  DADO LOCO ONLINE — Game Service (Socket.io)
 * ============================================================
 *  Motor autoritativo del juego. Pensado, Desarrollado y Ejecutado por Empresas El BroThanosAPI.
 *  - Salas con código, lobby y partida en tiempo real
 *  - Dado lanzado SIEMPRE en el servidor (anti-trampas)
 *  - Cartera virtual persistente (SQLite vía bun:sqlite + espejo opcional Postgres/Neon vía GAME_DB_URL)
 *  - Reglas de reparto configuradas por el administrador
 *  - Desempates automáticos, timer de turno, reconexión
 * ============================================================
 */
import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { Database } from "bun:sqlite";
import { randomUUID, randomInt, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------
const PORT = Number(process.env.PORT || 3003);
const START_BALANCE = 1000;          // saldo inicial virtual
const MAX_NAME = 16;
const MAX_CHAT = 200;
const CODE_LEN = 4;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;        // sala vacía 2h → se borra
const FINISHED_TTL_MS = 60 * 60 * 1000;         // sala terminada 1h sin conexión → se borra
const DISC_TURN_GRACE_MS = 8_000;               // jugador desconectado en su turno → auto-pasar
const ADMIN_TAKEOVER_MS = 30_000;               // admin ausente en lobby → transferir
const ROLL_COOLDOWN_MS = 350;
const CHAT_COOLDOWN_MS = 800;

// ------------------------------------------------------------
// Persistencia (SQLite)
// ------------------------------------------------------------
const DATA_DIR = join(import.meta.dir, "data");
mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, "game.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    player_id TEXT PRIMARY KEY,
    token     TEXT NOT NULL,
    name      TEXT NOT NULL,
    balance   INTEGER NOT NULL,
    updated   INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rooms (
    code    TEXT PRIMARY KEY,
    data    TEXT NOT NULL,
    updated INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS history (
    id   TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    at   INTEGER NOT NULL,
    data TEXT NOT NULL
  );
`);

// ------------------------------------------------------------
// Base de datos externa opcional (Postgres / Neon) — GAME_DB_URL
// Si se define, TODO se espeja a esa base y al arrancar se
// hidrata desde ella: saldo, salas e historial sobreviven a
// reinicios, redespliegues y "dormidas" del plan gratis.
// Si no se define o falla, el juego sigue 100% con SQLite.
// ------------------------------------------------------------
const EXT_DB_URL = process.env.GAME_DB_URL || "";
let extSql: any = null;

async function initExternalDb() {
  if (!EXT_DB_URL) {
    console.log("🗄️ Sin GAME_DB_URL: persistencia solo local (SQLite).");
    return;
  }
  try {
    const { default: postgres } = await import("postgres");
    // prepare:false → compatible con poolers de Neon/Supabase; onnotice → logs limpios
    extSql = postgres(EXT_DB_URL, { max: 3, idle_timeout: 20, connect_timeout: 15, prepare: false, onnotice: () => {} });
    await extSql.unsafe(
      `CREATE TABLE IF NOT EXISTS wallets (player_id TEXT PRIMARY KEY, token TEXT NOT NULL, name TEXT NOT NULL, balance INTEGER NOT NULL, updated BIGINT NOT NULL)`
    );
    await extSql.unsafe(
      `CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated BIGINT NOT NULL)`
    );
    await extSql.unsafe(
      `CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, code TEXT NOT NULL, at BIGINT NOT NULL, data TEXT NOT NULL)`
    );
    console.log("🗄️ Base de datos externa conectada (Postgres/Neon): saldo y salas persistentes.");
  } catch (err: any) {
    console.error("⚠️ [ext-db] no se pudo conectar, sigo solo con SQLite:", err?.message ?? err);
    extSql = null;
  }
}

function extFire(p: Promise<any>, what: string) {
  p.catch((err: any) =>
    console.error(`⚠️ [ext-db] fallo guardando ${what}:`, err?.message ?? err)
  );
}
function mirrorWallet(w: Wallet, updated: number) {
  if (!extSql) return;
  extFire(
    extSql`
    INSERT INTO wallets (player_id, token, name, balance, updated)
    VALUES (${w.id}, ${w.token}, ${w.name}, ${w.balance}, ${updated})
    ON CONFLICT (player_id) DO UPDATE
      SET token = EXCLUDED.token, name = EXCLUDED.name, balance = EXCLUDED.balance, updated = EXCLUDED.updated
  `,
    "cartera"
  );
}
function mirrorRoom(code: string, data: string, updated: number) {
  if (!extSql) return;
  extFire(
    extSql`
    INSERT INTO rooms (code, data, updated) VALUES (${code}, ${data}, ${updated})
    ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated = EXCLUDED.updated
  `,
    "sala"
  );
}
function mirrorDeleteRoom(code: string) {
  if (!extSql) return;
  extFire(extSql`DELETE FROM rooms WHERE code = ${code}`, "borrado de sala");
}
function mirrorHistory(id: string, code: string, at: number, data: string) {
  if (!extSql) return;
  extFire(
    extSql`
    INSERT INTO history (id, code, at, data) VALUES (${id}, ${code}, ${at}, ${data})
    ON CONFLICT (id) DO NOTHING
  `,
    "historial"
  );
}

function saveWallet(w: Wallet) {
  const updated = Date.now();
  db.query(
    `INSERT OR REPLACE INTO wallets (player_id, token, name, balance, updated) VALUES (?,?,?,?,?)`
  ).run(w.id, w.token, w.name, w.balance, updated);
  mirrorWallet(w, updated);
}
function saveRoom(room: Room) {
  room.updatedAt = Date.now();
  const data = JSON.stringify(room);
  db.query(`INSERT OR REPLACE INTO rooms (code, data, updated) VALUES (?,?,?)`).run(
    room.code, data, room.updatedAt
  );
  mirrorRoom(room.code, data, room.updatedAt);
}
function deleteRoomRow(code: string) {
  db.query(`DELETE FROM rooms WHERE code = ?`).run(code);
  mirrorDeleteRoom(code);
}
function saveHistory(room: Room) {
  const id = randomUUID();
  const at = Date.now();
  const data = JSON.stringify(room.results);
  db.query(`INSERT OR REPLACE INTO history (id, code, at, data) VALUES (?,?,?,?)`).run(
    id, room.code, at, data
  );
  mirrorHistory(id, room.code, at, data);
}

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------
type Phase = "lobby" | "playing" | "tiebreak" | "finished";
type PayoutMode = "winner" | "top2" | "custom";
type ExactReward = "money" | "double" | "both";
type Difficulty = "facil" | "medio" | "dificil";
/** Porcentaje editable (por el admin) de que salga 1 en cada nivel oculto. */
type OnesPct = { facil: number; medio: number; dificil: number };

interface Wallet {
  id: string;
  token: string;
  name: string;
  balance: number;
}

interface RoomSettings {
  buyIn: number;              // entrada por jugador ($ virtuales)
  rounds: number;             // sesiones por jugador (default 10)
  maxPlayers: number;         // 2..16
  turnSeconds: number;        // timer por turno (0 = sin límite)
  payoutMode: PayoutMode;
  custom: { first: number; second: number; third: number };
  exactEnabled: boolean;      // bono por alcanzar puntos exactos
  exactTarget: number;        // número objetivo (default 21)
  exactReward: ExactReward;   // dinero / duplicar / ambos
  exactMoney: number;         // $ del premio instantáneo (0..10000)
  difficulty: Difficulty;     // NIVEL OCULTO: sesga el dado hacia el 1 (nunca se envía a clientes)
  onesPct: OnesPct;           // NIVEL OCULTO: % editable de que salga 1 por nivel (nunca se envía)
}

interface Player {
  id: string;
  token: string;
  name: string;
  isAdmin: boolean;
  connected: boolean;
  socketId: string | null;
  lastSeen: number;
  joinedAt: number;
}

interface FeedEvent {
  id: string;
  ts: number;
  kind: "join" | "leave" | "kick" | "roll" | "bust" | "hold" | "start" | "round" | "turn" | "finish" | "tiebreak" | "system" | "chat" | "bonus";
  text: string;
  playerId?: string;
  value?: number;
}

interface ChatMsg {
  id: string;
  ts: number;
  from: string;
  playerId: string;
  text: string;
}

interface Tiebreak {
  players: string[];
  rolls: Record<string, number>;
  stage: number;
}

interface GameState {
  round: number;
  currentPlayerIdx: number;
  turnTotal: number;
  dice: number | null;
  turnEndsAt: number | null;
  tiebreak: Tiebreak | null;
}

interface FinalResults {
  ranking: { playerId: string; name: string; position: number; points: number; amount: number }[];
  pot: number;
  mode: PayoutMode;
  finishedAt: number;
}

interface Room {
  code: string;
  createdAt: number;
  updatedAt: number;
  settings: RoomSettings;
  players: Player[];
  phase: Phase;
  game: GameState;
  scores: Record<string, number>;
  bonus: Record<string, number>;  // dinero de bonos exactos por jugador (esta partida)
  events: FeedEvent[];
  chat: ChatMsg[];
  pot: number;
  results: FinalResults | null;
}

const DEFAULT_SETTINGS: RoomSettings = {
  buyIn: 100,
  rounds: 10,
  maxPlayers: 8,
  turnSeconds: 60,
  payoutMode: "winner",
  custom: { first: 60, second: 25, third: 15 },
  exactEnabled: false,
  exactTarget: 21,
  exactReward: "both",
  exactMoney: 50,
  difficulty: "facil",
  onesPct: { facil: 17, medio: 25, dificil: 40 },
};

// ------------------------------------------------------------
// Estado global en memoria
// ------------------------------------------------------------
const rooms = new Map<string, Room>();
const wallets = new Map<string, Wallet>();
const sessions = new Map<string, { playerId: string; code: string | null }>(); // socketId → sesión
const playerSockets = new Map<string, Set<string>>();                          // playerId → socketIds
const tiebreakTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastAction = new Map<string, number>();                                  // rate-limit por socket

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
const now = () => Date.now();
const shortId = () => randomBytes(6).toString("hex");
function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}
function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
function newCode(): string {
  for (let i = 0; i < 9999; i++) {
    let c = "";
    for (let j = 0; j < CODE_LEN; j++) c += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return shortId().toUpperCase().slice(0, 6);
}
function pushEvent(room: Room, kind: FeedEvent["kind"], text: string, extra?: { playerId?: string; value?: number }) {
  room.events.push({ id: shortId(), ts: now(), kind, text, ...extra });
  if (room.events.length > 60) room.events = room.events.slice(-60);
}
function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
/** Valida los % editables de que salga 1 (0..90 por nivel). */
function sanitizeOnesPct(raw: any): OnesPct {
  const d = DEFAULT_SETTINGS.onesPct;
  return {
    facil: clampInt(raw?.facil, 0, 90, d.facil),
    medio: clampInt(raw?.medio, 0, 90, d.medio),
    dificil: clampInt(raw?.dificil, 0, 90, d.dificil),
  };
}
function sanitizeSettings(input: any): RoomSettings {
  const s = input ?? {};
  const payoutMode: PayoutMode = ["winner", "top2", "custom"].includes(s.payoutMode) ? s.payoutMode : "winner";
  const custom = {
    first: clampInt(s.custom?.first, 0, 100, DEFAULT_SETTINGS.custom.first),
    second: clampInt(s.custom?.second, 0, 100, DEFAULT_SETTINGS.custom.second),
    third: clampInt(s.custom?.third, 0, 100, DEFAULT_SETTINGS.custom.third),
  };
  if (custom.first + custom.second + custom.third > 100) {
    const f = 100 / (custom.first + custom.second + custom.third);
    custom.first = Math.floor(custom.first * f);
    custom.second = Math.floor(custom.second * f);
    custom.third = 100 - custom.first - custom.second;
  }
  return {
    buyIn: clampInt(s.buyIn, 0, 50000, DEFAULT_SETTINGS.buyIn),
    rounds: clampInt(s.rounds, 1, 20, DEFAULT_SETTINGS.rounds),
    maxPlayers: clampInt(s.maxPlayers, 2, 16, DEFAULT_SETTINGS.maxPlayers),
    turnSeconds: clampInt(s.turnSeconds, 0, 300, DEFAULT_SETTINGS.turnSeconds),
    payoutMode,
    custom,
    exactEnabled: s.exactEnabled === true,
    exactTarget: clampInt(s.exactTarget, 5, 99, DEFAULT_SETTINGS.exactTarget),
    exactReward: (["money", "double", "both"] as const).includes(s.exactReward) ? s.exactReward : "both",
    exactMoney: clampInt(s.exactMoney, 0, 10000, DEFAULT_SETTINGS.exactMoney),
    difficulty: (["facil", "medio", "dificil"] as const).includes(s.difficulty) ? s.difficulty : "facil",
    onesPct: sanitizeOnesPct(s.onesPct),
  };
}
function getWalletOrCreate(playerId: string): Wallet {
  let w = wallets.get(playerId);
  if (!w) {
    w = { id: playerId, token: randomBytes(16).toString("hex"), name: "Jugador", balance: START_BALANCE };
    wallets.set(playerId, w);
    saveWallet(w);
  }
  return w;
}

// ------------------------------------------------------------
// Serialización pública
// ------------------------------------------------------------
function serializeRoom(room: Room) {
  const g = room.game;
  // El nivel de dificultad y sus porcentajes NUNCA salen por el socket:
  // los jugadores no pueden percibirlos.
  const { difficulty: _oculto, onesPct: _ocultoPct, ...publicSettings } = room.settings;
  return {
    code: room.code,
    createdAt: room.createdAt,
    settings: publicSettings,
    pot: room.pot,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isAdmin: p.isAdmin,
      connected: p.connected,
      joinedAt: p.joinedAt,
    })),
    scores: room.scores,
    bonus: room.bonus ?? {},
    game: {
      round: g.round,
      totalRounds: room.settings.rounds,
      currentPlayerId: room.players[g.currentPlayerIdx]?.id ?? null,
      turnTotal: g.turnTotal,
      dice: g.dice,
      turnEndsAt: g.turnEndsAt,
      tiebreak: g.tiebreak ? { players: g.tiebreak.players, rolls: g.tiebreak.rolls, stage: g.tiebreak.stage } : null,
    },
    events: room.events.slice(-40),
    chat: room.chat.slice(-60),
    results: room.results,
    serverNow: now(),
  };
}

function emitState(room: Room) {
  io.to(room.code).emit("room:state", { room: serializeRoom(room) });
}
function emitWallet(playerId: string) {
  const w = wallets.get(playerId);
  if (!w) return;
  const sockets = playerSockets.get(playerId);
  if (!sockets) return;
  for (const sid of sockets) io.to(sid).emit("wallet:update", { balance: w.balance });
}

/** Configuración COMPLETA (con difficulty) — SOLO sockets del administrador. */
function emitAdminSettings(room: Room, onlySocketId?: string) {
  for (const p of room.players) {
    if (!p.isAdmin) continue;
    for (const sid of playerSockets.get(p.id) ?? []) {
      if (onlySocketId && sid !== onlySocketId) continue;
      io.to(sid).emit("room:admin-settings", { settings: room.settings });
    }
  }
}
function playerBySocket(room: Room, socketId: string | null): Player | undefined {
  const sess = socketId ? sessions.get(socketId) : null;
  if (!sess) return undefined;
  return room.players.find((p) => p.id === sess.playerId);
}
function bindSocketToRoom(socket: Socket, room: Room, player: Player) {
  socket.join(room.code);
  const sess = sessions.get(socket.id);
  if (sess) sess.code = room.code;
  player.connected = true;
  player.socketId = socket.id;
  player.lastSeen = now();
}

// ------------------------------------------------------------
// Motor: turnos
// ------------------------------------------------------------
// NIVEL OCULTO DE LA MESA: solo el servidor lo conoce. El administrador edita el
// % de que salga 1 en cada nivel; las caras 2..6 se reparten el resto por igual.
//   facil (17%)  → dado casi limpio (16.7% natural)
//   medio (25%)  → el 1 asoma más
//   dificil (40%)→ el 1 acecha a cada tiro
function rollValue(difficulty: Difficulty, onesPct: OnesPct): number {
  const p = Math.max(0, Math.min(90, onesPct?.[difficulty] ?? 17)); // % del 1
  const rest = (100 - p) / 5;
  const w = [p, rest, rest, rest, rest, rest];
  const total = w.reduce((a, b) => a + b, 0);
  const r = (randomInt(1, 1000001) / 1000000) * total; // aleatorio criptográfico en (0, total]
  let acc = 0;
  for (let i = 0; i < w.length; i++) {
    acc += w[i];
    if (r < acc) return i + 1;
  }
  return 6;
}

function startTurn(room: Room, idx: number, emit = true) {
  const g = room.game;
  g.currentPlayerIdx = idx;
  g.turnTotal = 0;
  g.dice = null;
  const p = room.players[idx];
  g.turnEndsAt = room.settings.turnSeconds > 0 ? now() + room.settings.turnSeconds * 1000 : null;
  if (p) {
    pushEvent(room, "turn", `🎯 Turno de ${p.name} · Ronda ${g.round}/${room.settings.rounds}`, { playerId: p.id });
  }
  if (emit) emitState(room);
}

function advanceTurn(room: Room) {
  const g = room.game;
  let idx = g.currentPlayerIdx + 1;
  if (idx >= room.players.length) {
    idx = 0;
    g.round++;
    if (g.round > room.settings.rounds) {
      beginEndgame(room);
      return;
    }
    pushEvent(room, "round", `— Ronda ${g.round} de ${room.settings.rounds} —`);
  }
  startTurn(room, idx, false);
  emitState(room);
}

function doRoll(room: Room, player: Player) {
  const g = room.game;
  const value = rollValue(room.settings.difficulty, room.settings.onesPct); // dado criptográfico con sesgo oculto
  g.dice = value;

  let exactBonus: { target: number; reward: ExactReward; money: number; doubled: boolean; banked: number } | undefined;
  let bonusHit = false;

  if (value === 1) {
    const lost = g.turnTotal;
    g.turnTotal = 0;
    pushEvent(room, "bust", `💥 ¡${player.name} sacó 1! Pierde ${lost} pts del turno`, { playerId: player.id, value: 1 });
  } else {
    g.turnTotal += value;
    const s = room.settings;
    if (s.exactEnabled && g.turnTotal === s.exactTarget) {
      // ¡BONO EXACTO! Premio instantáneo y asegurado automático del pozo.
      bonusHit = true;
      const wantsDouble = s.exactReward === "double" || s.exactReward === "both";
      const wantsMoney = (s.exactReward === "money" || s.exactReward === "both") && s.exactMoney > 0;
      let money = 0;
      if (wantsDouble) g.turnTotal = s.exactTarget * 2;
      if (wantsMoney) {
        money = s.exactMoney;
        const w = getWalletOrCreate(player.id);
        w.balance += money;
        saveWallet(w);
        emitWallet(player.id);
        room.bonus = room.bonus ?? {};
        room.bonus[player.id] = (room.bonus[player.id] ?? 0) + money;
      }
      exactBonus = { target: s.exactTarget, reward: s.exactReward, money, doubled: wantsDouble, banked: g.turnTotal };
      const parts: string[] = [];
      if (wantsDouble) parts.push(`¡puntos duplicados ${s.exactTarget} → ${g.turnTotal}!`);
      if (money > 0) parts.push(`+$${money} al instante`);
      pushEvent(room, "bonus", `🎯 ¡EXACTO ${s.exactTarget} para ${player.name}! ${parts.join(" · ")}`, { playerId: player.id, value: s.exactTarget });
      room.scores[player.id] = (room.scores[player.id] ?? 0) + g.turnTotal;
      pushEvent(room, "hold", `🔒 ${player.name} asegura ${g.turnTotal} pts (total ${room.scores[player.id]})`, { playerId: player.id, value: g.turnTotal });
      g.turnTotal = 0;
    } else {
      pushEvent(room, "roll", `🎲 ${player.name} sacó ${value} → lleva ${g.turnTotal} pts en juego`, { playerId: player.id, value });
      if (room.settings.turnSeconds > 0) g.turnEndsAt = now() + room.settings.turnSeconds * 1000;
    }
  }

  io.to(room.code).emit("game:roll-result", {
    playerId: player.id, name: player.name, value, ts: now(),
    ...(exactBonus ? { exactBonus } : {}),
  });

  if (value === 1 || bonusHit) {
    advanceTurn(room);
    saveRoom(room);
  } else {
    saveRoom(room);
    emitState(room);
  }
}

function doHold(room: Room, player: Player, auto = false) {
  const g = room.game;
  const banked = g.turnTotal;
  if (banked > 0) {
    room.scores[player.id] = (room.scores[player.id] ?? 0) + banked;
    pushEvent(room, "hold", `🔒 ${player.name} asegura ${banked} pts (total ${room.scores[player.id]})`, { playerId: player.id, value: banked });
  } else {
    pushEvent(room, "hold", `➡️ ${player.name} pasa sin puntos${auto ? " (tiempo agotado)" : ""}`, { playerId: player.id });
  }
  g.turnTotal = 0;
  advanceTurn(room);
}

// ------------------------------------------------------------
// Motor: pagos y desempates
// ------------------------------------------------------------
function payoutPcts(s: RoomSettings, n: number): number[] {
  let base: number[];
  if (s.payoutMode === "winner") base = [100];
  else if (s.payoutMode === "top2") base = [70, 30];
  else base = [s.custom.first, s.custom.second, s.custom.third];
  base = base.map((v) => Math.max(0, Math.min(100, Math.round(v))));
  const out = Array.from({ length: n }, (_, i) => base[i] ?? 0);
  const sum = out.reduce((a, b) => a + b, 0);
  if (sum > 100) {
    const f = 100 / sum;
    return out.map((v) => Math.floor(v * f));
  }
  return out;
}

/** Devuelve los ids de jugadores empatados cuyo orden afecta los premios. */
function findTiedForPay(room: Room): string[] | null {
  const n = room.players.length;
  const pcts = payoutPcts(room.settings, n);
  const sorted = [...room.players].sort((a, b) => (room.scores[b.id] ?? 0) - (room.scores[a.id] ?? 0));
  const need: string[] = [];
  let pos = 0;
  while (pos < sorted.length) {
    let end = pos;
    while (end + 1 < sorted.length && (room.scores[sorted[end + 1].id] ?? 0) === (room.scores[sorted[pos].id] ?? 0)) end++;
    const groupLen = end - pos + 1;
    if (groupLen > 1) {
      const groupPcts = pcts.slice(pos, end + 1);
      const allSame = groupPcts.every((x) => x === groupPcts[0]);
      if (!allSame) need.push(...sorted.slice(pos, end + 1).map((p) => p.id));
    }
    pos = end + 1;
  }
  return need.length ? need : null;
}

function beginEndgame(room: Room) {
  const tied = findTiedForPay(room);
  if (tied && tied.length > 1) runTiebreak(room, tied);
  else finalize(room);
}

function runTiebreak(room: Room, ids: string[]) {
  room.phase = "tiebreak";
  room.game.tiebreak = { players: ids, rolls: {}, stage: 1 };
  const names = ids.map((id) => room.players.find((p) => p.id === id)?.name ?? "?").join(", ");
  pushEvent(room, "tiebreak", `⚔️ ¡Empate! Desempate entre: ${names}`);
  saveRoom(room);
  emitState(room);
  tiebreakStep(room);
}

function tiebreakStep(room: Room) {
  const tb = room.game.tiebreak;
  if (!tb) return;
  for (const id of tb.players) {
    if (tb.rolls[id] == null) {
      const v = randomInt(1, 7);
      tb.rolls[id] = v;
      const p = room.players.find((x) => x.id === id);
      pushEvent(room, "tiebreak", `⚔️ ${p?.name ?? "?"} saca ${v} en el desempate`, { playerId: id, value: v });
    }
  }
  saveRoom(room);
  emitState(room);
  const max = Math.max(...Object.values(tb.rolls));
  const winners = tb.players.filter((id) => tb.rolls[id] === max);
  if (winners.length === 1) {
    const w = winners[0];
    tiebreakTimers.set(room.code, setTimeout(() => {
      tiebreakTimers.delete(room.code);
      if (rooms.get(room.code) !== room) return;
      room.game.tiebreak = null;
      finalize(room, w);
    }, 1600));
  } else {
    tiebreakTimers.set(room.code, setTimeout(() => {
      tiebreakTimers.delete(room.code);
      if (rooms.get(room.code) !== room) return;
      const tb2 = room.game.tiebreak;
      if (!tb2) return;
      tb2.players = winners;
      tb2.rolls = {};
      tb2.stage++;
      pushEvent(room, "tiebreak", `🤝 Sigue el empate — ronda ${tb2.stage} de desempate`);
      saveRoom(room);
      emitState(room);
      tiebreakStep(room);
    }, 1800));
  }
}

function finalize(room: Room, tieWinnerId?: string) {
  const s = room.settings;
  const n = room.players.length;
  const ordered = [...room.players].sort((a, b) => (room.scores[b.id] ?? 0) - (room.scores[a.id] ?? 0));
  if (tieWinnerId) {
    const score = room.scores[tieWinnerId] ?? 0;
    const groupStart = ordered.findIndex((p) => (room.scores[p.id] ?? 0) === score);
    const idx = ordered.findIndex((p) => p.id === tieWinnerId);
    if (idx > groupStart) {
      const [p] = ordered.splice(idx, 1);
      ordered.splice(groupStart, 0, p);
    }
  }
  const pcts = payoutPcts(s, n);
  const amounts = pcts.map((p) => Math.floor((room.pot * p) / 100));
  const remainder = room.pot - amounts.reduce((a, b) => a + b, 0);
  if (amounts.length > 0) amounts[0] += remainder;

  const ranking = ordered.map((p, i) => ({
    playerId: p.id,
    name: p.name,
    position: i + 1,
    points: room.scores[p.id] ?? 0,
    amount: amounts[i] ?? 0,
  }));
  for (const r of ranking) {
    const w = wallets.get(r.playerId);
    if (w && r.amount > 0) {
      w.balance += r.amount;
      saveWallet(w);
    }
  }
  room.results = { ranking, pot: room.pot, mode: s.payoutMode, finishedAt: now() };
  room.phase = "finished";
  const champ = ranking[0];
  pushEvent(room, "finish", `🏆 ¡${champ.name} gana con ${champ.points} pts! Se lleva $${amounts[0] ?? 0}`, { playerId: champ.playerId });
  saveHistory(room);
  saveRoom(room);
  emitState(room);
  for (const p of room.players) emitWallet(p.id);
}

// ------------------------------------------------------------
// Scanner: timers de turno, admin ausente, limpieza
// ------------------------------------------------------------
setInterval(() => {
  const t = now();
  for (const room of Array.from(rooms.values())) {
    const anyoneConnected = room.players.some((p) => p.connected);

    // Partida en curso: auto-asegurar por tiempo o desconexión
    if (room.phase === "playing" && anyoneConnected) {
      const cur = room.players[room.game.currentPlayerIdx];
      if (cur) {
        let deadline = room.game.turnEndsAt ?? Infinity;
        if (!cur.connected) deadline = Math.min(deadline, cur.lastSeen + DISC_TURN_GRACE_MS);
        if (t > deadline) {
          pushEvent(room, "system", `⏱️ Tiempo agotado para ${cur.name}`);
          doHold(room, cur, true);
        }
      }
    }

    // Lobby: transferir admin ausente
    if (room.phase === "lobby" && anyoneConnected) {
      const admin = room.players.find((p) => p.isAdmin);
      if (admin && !admin.connected && t > admin.lastSeen + ADMIN_TAKEOVER_MS) {
        const next = room.players.find((p) => p.connected && p.id !== admin.id);
        if (next) {
          admin.isAdmin = false;
          next.isAdmin = true;
          pushEvent(room, "system", `👑 ${next.name} es el nuevo administrador`);
          saveRoom(room);
          emitState(room);
        }
      }
    }

    // Limpieza de salas abandonadas
    if (!anyoneConnected) {
      const idleLimit = room.phase === "finished" ? FINISHED_TTL_MS : ROOM_IDLE_MS;
      if (t > room.updatedAt + idleLimit) {
        for (const timer of [tiebreakTimers.get(room.code)]) if (timer) clearTimeout(timer);
        tiebreakTimers.delete(room.code);
        rooms.delete(room.code);
        deleteRoomRow(room.code);
      }
    }
  }
}, 700);

// ------------------------------------------------------------
// Socket.io
// ------------------------------------------------------------
const httpServer = createServer();
// SOCKET_PATH: en producción (Docker/Render) se enruta /socket.io → game-service.
// En local/vista previa se usa "/" con el truco XTransformPort del proxy.
const io = new Server(httpServer, {
  path: process.env.SOCKET_PATH || "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e5,
});

function rateLimited(socket: Socket, key: string, gapMs: number): boolean {
  const id = `${socket.id}:${key}`;
  const last = lastAction.get(id) ?? 0;
  const t = now();
  if (t - last < gapMs) return true;
  lastAction.set(id, t);
  return false;
}

io.on("connection", (socket) => {
  sessions.set(socket.id, { playerId: "", code: null });

  // ---------- Identidad ----------
  socket.on("session:identify", (payload: any, cb: any) => {
    try {
      const rawId = typeof payload?.playerId === "string" ? payload.playerId.slice(0, 64) : "";
      const rawToken = typeof payload?.token === "string" ? payload.token.slice(0, 64) : "";
      const name = cleanName(payload?.name);

      let wallet: Wallet | undefined = rawId ? wallets.get(rawId) : undefined;
      if (wallet && rawToken && wallet.token !== rawToken) wallet = undefined; // token inválido

      if (!wallet) {
        const id = rawId && !wallets.has(rawId) ? rawId : randomUUID();
        wallet = { id, token: randomBytes(16).toString("hex"), name: name || `Jugador-${shortId().slice(0, 4)}`, balance: START_BALANCE };
        wallets.set(wallet.id, wallet);
        saveWallet(wallet);
      } else if (name) {
        wallet.name = name;
        saveWallet(wallet);
      }

      sessions.set(socket.id, { playerId: wallet.id, code: null });
      if (!playerSockets.has(wallet.id)) playerSockets.set(wallet.id, new Set());
      playerSockets.get(wallet.id)!.add(socket.id);

      // Reconexión a sala activa
      let room: Room | undefined;
      for (const r of rooms.values()) {
        const p = r.players.find((x) => x.id === wallet!.id);
        if (p) {
          room = r;
          bindSocketToRoom(socket, r, p);
          break;
        }
      }

      cb?.({
        ok: true,
        identity: { playerId: wallet.id, token: wallet.token, name: wallet.name, balance: wallet.balance },
        roomCode: room?.code ?? null,
        serverNow: now(),
      });
      if (room) {
        saveRoom(room);
        emitState(room);
        socket.emit("room:state", { room: serializeRoom(room) });
        if (room.players.find((p) => p.id === wallet.id)?.isAdmin) {
          socket.emit("room:admin-settings", { settings: room.settings });
        }
      }
    } catch (e) {
      cb?.({ ok: false, error: "Error de identidad" });
    }
  });

  const requireRoom = (): { room: Room; player: Player } | null => {
    const sess = sessions.get(socket.id);
    if (!sess?.playerId || !sess.code) return null;
    const room = rooms.get(sess.code);
    if (!room) return null;
    const player = room.players.find((p) => p.id === sess.playerId);
    if (!player) return null;
    return { room, player };
  };

  const leaveCurrentRoom = (socketId: string) => {
    const sess = sessions.get(socketId);
    if (!sess?.code) return;
    const room = rooms.get(sess.code);
    socket.leave(sess.code);
    if (room) {
      const p = room.players.find((x) => x.id === sess.playerId);
      if (p) {
        p.connected = false;
        p.lastSeen = now();
      }
      saveRoom(room);
      emitState(room);
    }
    sess.code = null;
  };

  // ---------- Crear sala ----------
  socket.on("room:create", (payload: any, cb: any) => {
    try {
      const sess = sessions.get(socket.id);
      if (!sess?.playerId) return cb?.({ ok: false, error: "Identifícate primero" });
      if (rateLimited(socket, "create", 1000)) return cb?.({ ok: false, error: "Demasiado rápido" });
      const name = cleanName(payload?.name);
      if (!name) return cb?.({ ok: false, error: "Escribe tu nombre" });

      leaveCurrentRoom(socket.id);

      const wallet = getWalletOrCreate(sess.playerId);
      wallet.name = name;
      saveWallet(wallet);

      const room: Room = {
        code: newCode(),
        createdAt: now(),
        updatedAt: now(),
        settings: sanitizeSettings(payload?.settings),
        players: [],
        phase: "lobby",
        game: { round: 1, currentPlayerIdx: 0, turnTotal: 0, dice: null, turnEndsAt: null, tiebreak: null },
        scores: {},
        bonus: {},
        events: [],
        chat: [],
        pot: 0,
        results: null,
      };
      const player: Player = {
        id: wallet.id,
        token: wallet.token,
        name,
        isAdmin: true,
        connected: true,
        socketId: socket.id,
        lastSeen: now(),
        joinedAt: now(),
      };
      room.players.push(player);
      rooms.set(room.code, room);
      saveRoom(room);
      bindSocketToRoom(socket, room, player);
      pushEvent(room, "system", `👑 ${name} creó la sala ${room.code}`);
      emitState(room);
      emitAdminSettings(room, socket.id);
      cb?.({ ok: true, code: room.code });
    } catch {
      cb?.({ ok: false, error: "No se pudo crear la sala" });
    }
  });

  // ---------- Unirse a sala ----------
  socket.on("room:join", (payload: any, cb: any) => {
    try {
      const sess = sessions.get(socket.id);
      if (!sess?.playerId) return cb?.({ ok: false, error: "Identifícate primero" });
      if (rateLimited(socket, "join", 800)) return cb?.({ ok: false, error: "Demasiado rápido" });
      const code = cleanText(payload?.code, 8).toUpperCase();
      const name = cleanName(payload?.name);
      if (!name) return cb?.({ ok: false, error: "Escribe tu nombre" });
      const room = rooms.get(code);
      if (!room) return cb?.({ ok: false, error: "La sala no existe. Verifica el código." });
      if (room.phase === "playing" || room.phase === "tiebreak") {
        return cb?.({ ok: false, error: "La partida ya comenzó. Pide que terminen o crea otra sala." });
      }
      if (room.phase === "lobby" && room.players.length >= room.settings.maxPlayers) {
        return cb?.({ ok: false, error: "La sala está llena" });
      }

      leaveCurrentRoom(socket.id);

      const wallet = getWalletOrCreate(sess.playerId);
      wallet.name = name;
      saveWallet(wallet);

      let player = room.players.find((p) => p.id === wallet.id);
      if (player) {
        player.name = name;
        player.connected = true;
        player.socketId = socket.id;
        player.lastSeen = now();
        if (room.phase === "finished") {
          // sala terminada: vuelve a ver resultados
        }
      } else {
        if (room.phase === "finished") {
          return cb?.({ ok: false, error: "Esta sala ya terminó su partida. Crea una nueva." });
        }
        player = {
          id: wallet.id, token: wallet.token, name, isAdmin: false,
          connected: true, socketId: socket.id, lastSeen: now(), joinedAt: now(),
        };
        room.players.push(player);
        pushEvent(room, "join", `👋 ${name} se unió a la sala`, { playerId: wallet.id });
      }

      bindSocketToRoom(socket, room, player);
      saveRoom(room);
      emitState(room);
      cb?.({ ok: true, code: room.code });
    } catch {
      cb?.({ ok: false, error: "No se pudo unir a la sala" });
    }
  });

  // ---------- Configuración (solo admin, solo lobby) ----------
  socket.on("room:update-settings", (payload: any, cb: any) => {
    const ctx = requireRoom();
    if (!ctx) return cb?.({ ok: false, error: "No estás en una sala" });
    const { room, player } = ctx;
    if (!player.isAdmin) return cb?.({ ok: false, error: "Solo el administrador puede cambiar la configuración" });
    if (room.phase !== "lobby") return cb?.({ ok: false, error: "Solo durante el lobby" });
    const prevDiff = room.settings.difficulty;
    const prevPct = room.settings.onesPct;
    room.settings = sanitizeSettings(payload?.settings);
    // El nivel oculto (y sus %) solo cambian si el payload los trae explícitos
    // (los clientes normales nunca los envían → se preservan al editar otras reglas).
    const reqDiff = payload?.settings?.difficulty;
    room.settings.difficulty = (["facil", "medio", "dificil"] as const).includes(reqDiff) ? reqDiff : prevDiff;
    room.settings.onesPct = payload?.settings?.onesPct && typeof payload.settings.onesPct === "object"
      ? sanitizeOnesPct(payload.settings.onesPct)
      : prevPct;
    if (room.settings.maxPlayers < room.players.length) room.settings.maxPlayers = room.players.length;
    pushEvent(room, "system", "⚙️ El administrador actualizó las reglas de la partida");
    saveRoom(room);
    emitState(room);
    emitAdminSettings(room);
    cb?.({ ok: true });
  });

  // ---------- Nivel oculto de la mesa (solo admin; nunca se emite a jugadores) ----------
  // Acepta { difficulty } y/o { onesPct: { facil, medio, dificil } } (porcentajes editables).
  socket.on("room:set-difficulty", (payload: any, cb: any) => {
    const ctx = requireRoom();
    if (!ctx) return cb?.({ ok: false, error: "No estás en una sala" });
    const { room, player } = ctx;
    if (!player.isAdmin) return cb?.({ ok: false, error: "Solo el administrador" });
    const d = payload?.difficulty;
    const pct = payload?.onesPct;
    const dOk = (["facil", "medio", "dificil"] as const).includes(d);
    if (!dOk && !pct) return cb?.({ ok: false, error: "Nivel inválido" });
    if (dOk) room.settings.difficulty = d;
    if (pct && typeof pct === "object") room.settings.onesPct = sanitizeOnesPct(pct);
    room.updatedAt = now();
    saveRoom(room);
    emitAdminSettings(room, socket.id);
    cb?.({ ok: true, difficulty: room.settings.difficulty, onesPct: room.settings.onesPct });
  });

  // ---------- Expulsar (solo admin, solo lobby) ----------
  socket.on("room:kick", (payload: any, cb: any) => {
    const ctx = requireRoom();
    if (!ctx) return cb?.({ ok: false, error: "No estás en una sala" });
    const { room, player } = ctx;
    if (!player.isAdmin) return cb?.({ ok: false, error: "Solo el administrador" });
    if (room.phase !== "lobby") return cb?.({ ok: false, error: "Solo durante el lobby" });
    const target = room.players.find((p) => p.id === payload?.playerId);
    if (!target || target.isAdmin) return cb?.({ ok: false, error: "Jugador inválido" });
    room.players = room.players.filter((p) => p.id !== target.id);
    pushEvent(room, "kick", `🚪 ${target.name} fue expulsado de la sala`);
    for (const sid of playerSockets.get(target.id) ?? []) {
      const s = sessions.get(sid);
      if (s?.code === room.code) s.code = null;
      io.to(sid).emit("room:state", { room: null });
    }
    saveRoom(room);
    emitState(room);
    cb?.({ ok: true });
  });

  // ---------- Salir ----------
  socket.on("room:leave", (_p: any, cb: any) => {
    const ctx = requireRoom();
    if (!ctx) return cb?.({ ok: true });
    const { room, player } = ctx;
    if (room.phase === "playing" || room.phase === "tiebreak") {
      return cb?.({ ok: false, error: "No puedes salir durante una partida. Usa el botón de abandonar si estás seguro." });
    }
    room.players = room.players.filter((p) => p.id !== player.id);
    pushEvent(room, "leave", `🚪 ${player.name} salió de la sala`);
    if (player.isAdmin && room.players.length > 0) {
      const next = room.players.find((p) => p.connected) ?? room.players[0];
      next.isAdmin = true;
      pushEvent(room, "system", `👑 ${next.name} es el nuevo administrador`);
    }
    const sess = sessions.get(socket.id);
    if (sess) sess.code = null;
    if (room.players.length === 0) {
      rooms.delete(room.code);
      deleteRoomRow(room.code);
    } else {
      saveRoom(room);
      emitState(room);
    }
    cb?.({ ok: true });
  });

  // ---------- Iniciar partida ----------
  socket.on("game:start", (_p: any, cb: any) => {
    const ctx = requireRoom();
    if (!ctx) return cb?.({ ok: false, error: "No estás en una sala" });
    const { room, player } = ctx;
    if (!player.isAdmin) return cb?.({ ok: false, error: "Solo el administrador puede iniciar" });
    if (room.phase !== "lobby") return cb?.({ ok: false, error: "La partida ya está en curso" });

    const eligible = room.players.filter((p) => p.connected && (wallets.get(p.id)?.balance ?? 0) >= room.settings.buyIn);
    if (eligible.length < 2) {
      return cb?.({ ok: false, error: "Se necesitan al menos 2 jugadores conectados y con saldo suficiente" });
    }

    room.players = eligible;
    let charged = 0;
    for (const p of room.players) {
      const w = wallets.get(p.id)!;
      w.balance -= room.settings.buyIn;
      saveWallet(w);
      charged += room.settings.buyIn;
    }
    room.pot = charged;
    room.scores = {};
    room.bonus = {};
    room.results = null;
    room.phase = "playing";
    room.game = { round: 1, currentPlayerIdx: 0, turnTotal: 0, dice: null, turnEndsAt: null, tiebreak: null };
    pushEvent(room, "start", `🎮 ¡Comienza la partida! Entrada: $${room.settings.buyIn} · Bote: $${room.pot}`);
    pushEvent(room, "round", `— Ronda 1 de ${room.settings.rounds} —`);
    startTurn(room, 0, false);
    saveRoom(room);
    emitState(room);
    for (const p of room.players) emitWallet(p.id);
    cb?.({ ok: true });
  });

  // ---------- Lanzar dado ----------
  socket.on("game:roll", (_p: any, cb: any) => {
    const ctx = requireRoom();
    if (!ctx) return cb?.({ ok: false, error: "No estás en una sala" });
    const { room, player } = ctx;
    if (room.phase !== "playing") return cb?.({ ok: false, error: "La partida no está en curso" });
    const cur = room.players[room.game.currentPlayerIdx];
    if (!cur || cur.id !== player.id) return cb?.({ ok: false, error: "No es tu turno" });
    if (!player.connected) return cb?.({ ok: false, error: "Estás desconectado" });
    if (rateLimited(socket, "roll", ROLL_COOLDOWN_MS)) return cb?.({ ok: false, error: "Espera un momento" });
    doRoll(room, player);
    cb?.({ ok: true });
  });

  // ---------- Asegurar / pasar ----------
  socket.on("game:hold", (_p: any, cb: any) => {
    const ctx = requireRoom();
    if (!ctx) return cb?.({ ok: false, error: "No estás en una sala" });
    const { room, player } = ctx;
    if (room.phase !== "playing") return cb?.({ ok: false, error: "La partida no está en curso" });
    const cur = room.players[room.game.currentPlayerIdx];
    if (!cur || cur.id !== player.id) return cb?.({ ok: false, error: "No es tu turno" });
    if (rateLimited(socket, "hold", ROLL_COOLDOWN_MS)) return cb?.({ ok: false, error: "Espera un momento" });
    doHold(room, player);
    saveRoom(room);
    cb?.({ ok: true });
  });

  // ---------- Revancha (reiniciar a lobby) ----------
  socket.on("game:rematch", (_p: any, cb: any) => {
    const ctx = requireRoom();
    if (!ctx) return cb?.({ ok: false, error: "No estás en una sala" });
    const { room, player } = ctx;
    if (!player.isAdmin) return cb?.({ ok: false, error: "Solo el administrador" });
    if (room.phase !== "finished") return cb?.({ ok: false, error: "La partida no ha terminado" });
    room.phase = "lobby";
    room.scores = {};
    room.bonus = {};
    room.pot = 0;
    room.results = null;
    room.game = { round: 1, currentPlayerIdx: 0, turnTotal: 0, dice: null, turnEndsAt: null, tiebreak: null };
    pushEvent(room, "system", `🔄 ¡Revancha! ${player.name} reinició la sala. Configura y juega de nuevo.`);
    saveRoom(room);
    emitState(room);
    cb?.({ ok: true });
  });

  // ---------- Chat ----------
  socket.on("game:chat", (payload: any, cb: any) => {
    const ctx = requireRoom();
    if (!ctx) return cb?.({ ok: false, error: "No estás en una sala" });
    const { room, player } = ctx;
    if (rateLimited(socket, "chat", CHAT_COOLDOWN_MS)) return cb?.({ ok: false, error: "Espera un momento" });
    const text = cleanText(payload?.text, MAX_CHAT);
    if (!text) return cb?.({ ok: false, error: "Mensaje vacío" });
    room.chat.push({ id: shortId(), ts: now(), from: player.name, playerId: player.id, text });
    if (room.chat.length > 80) room.chat = room.chat.slice(-80);
    saveRoom(room);
    emitState(room);
    cb?.({ ok: true });
  });

  // ---------- Recarga de fichas virtuales ----------
  socket.on("wallet:refill", (_p: any, cb: any) => {
    const sess = sessions.get(socket.id);
    if (!sess?.playerId) return cb?.({ ok: false, error: "Sin identidad" });
    if (rateLimited(socket, "refill", 30000)) return cb?.({ ok: false, error: "Espera un momento" });
    const w = getWalletOrCreate(sess.playerId);
    // Se puede recargar cuando el saldo queda por debajo de $1.000 o cuando no
    // alcanza para pagar la entrada de la sala en la que está (lobby).
    const room = sess.code ? rooms.get(sess.code) : undefined;
    const threshold = Math.max(1000, room && room.phase === "lobby" ? room.settings.buyIn : 0);
    if (w.balance >= threshold) return cb?.({ ok: false, error: "Aún tienes saldo suficiente" });
    w.balance += 1000;
    saveWallet(w);
    emitWallet(w.id);
    cb?.({ ok: true, balance: w.balance });
  });

  // ---------- Historial de partidas ----------
  socket.on("wallet:history", (_p: any, cb: any) => {
    const sess = sessions.get(socket.id);
    if (!sess?.playerId) return cb?.({ ok: false, error: "Sin identidad" });
    const rows = db.query(`SELECT id, code, at, data FROM history ORDER BY at DESC LIMIT 40`).all() as any[];
    const mine = rows
      .filter((r) => {
        try {
          const data = JSON.parse(r.data);
          return data.ranking?.some((x: any) => x.playerId === sess.playerId);
        } catch {
          return false;
        }
      })
      .slice(0, 10)
      .map((r) => {
        const data = JSON.parse(r.data);
        const me = data.ranking.find((x: any) => x.playerId === sess.playerId);
        return { id: r.id, code: r.code, at: r.at, pot: data.pot, position: me?.position, points: me?.points, amount: me?.amount };
      });
    const w = wallets.get(sess.playerId);
    cb?.({ ok: true, games: mine, balance: w?.balance ?? 0 });
  });

  // ---------- Abandonar partida en curso (forzado) ----------
  socket.on("game:abandon", (_p: any, cb: any) => {
    const ctx = requireRoom();
    if (!ctx) return cb?.({ ok: true });
    const { room, player } = ctx;
    if (room.phase === "playing" || room.phase === "tiebreak") {
      if (room.game.currentPlayerId !== undefined) { /* noop, mantenido por compat */ }
      const cur = room.players[room.game.currentPlayerIdx];
      player.connected = false;
      player.lastSeen = now() - DISC_TURN_GRACE_MS - 1000; // será auto-pasado rápido
      pushEvent(room, "leave", `🏃 ${player.name} abandonó la partida (sus turnos se pasarán automáticamente)`);
      if (cur && cur.id === player.id) {
        cur.lastSeen = player.lastSeen;
      }
      const sess = sessions.get(socket.id);
      if (sess) sess.code = null;
      socket.leave(room.code);
      saveRoom(room);
      emitState(room);
      return cb?.({ ok: true });
    }
    cb?.({ ok: true });
  });

  // ---------- Desconexión ----------
  socket.on("disconnect", () => {
    const sess = sessions.get(socket.id);
    sessions.delete(socket.id);
    lastAction.clear();
    if (!sess?.playerId) return;
    const set = playerSockets.get(sess.playerId);
    set?.delete(socket.id);
    if (set && set.size === 0) playerSockets.delete(sess.playerId);
    if (!sess.code) return;
    const room = rooms.get(sess.code);
    if (!room) return;
    // Solo marcar desconectado si no hay otro socket activo del mismo jugador
    const stillConnected = (set && set.size > 0) || false;
    const p = room.players.find((x) => x.id === sess.playerId);
    if (p && !stillConnected) {
      p.connected = false;
      p.lastSeen = now();
      pushEvent(room, "leave", `📡 ${p.name} se desconectó`);
      saveRoom(room);
      emitState(room);
    }
  });
});

// ------------------------------------------------------------
// Carga inicial desde SQLite (+ hidratación desde la base externa)
// ------------------------------------------------------------
function reviveRoom(data: string): Room | null {
  try {
    const room = JSON.parse(data) as Room;
    for (const p of room.players) {
      p.connected = false;
      p.socketId = null;
    }
    if (room.phase === "tiebreak") {
      // resolver al azar al reiniciar el servidor
      const tb = room.game?.tiebreak;
      if (tb) {
        const winner = tb.players[randomInt(0, tb.players.length)];
        room.game.tiebreak = null;
        finalize(room, winner);
        return null; // finalize ya guarda sala e historial
      }
    }
    return room;
  } catch {
    return null; // sala corrupta: se ignora
  }
}

function loadState() {
  const walletRows = db.query(`SELECT * FROM wallets`).all() as any[];
  for (const r of walletRows) {
    wallets.set(r.player_id, { id: r.player_id, token: r.token, name: r.name, balance: r.balance });
  }
  const roomRows = db.query(`SELECT code, data FROM rooms`).all() as any[];
  for (const r of roomRows) {
    const room = reviveRoom(r.data);
    if (room) rooms.set(room.code, room);
  }
}

async function mergeExternal() {
  if (!extSql) return;
  try {
    // 1) Carteras: gana la fila más nueva (ext vs local)
    const wRows = await extSql`SELECT player_id, token, name, balance, updated FROM wallets`;
    for (const r of wRows) {
      const pid = String(r.player_id);
      const local = db.query(`SELECT updated FROM wallets WHERE player_id = ?`).get(pid) as any;
      if (local && Number(local.updated) > Number(r.updated)) {
        const w = wallets.get(pid);
        if (w) {
          mirrorWallet(w, Number(local.updated)); // local más nuevo → se respalda a la ext
          continue;
        }
      }
      db.query(
        `INSERT OR REPLACE INTO wallets (player_id, token, name, balance, updated) VALUES (?,?,?,?,?)`
      ).run(pid, String(r.token), String(r.name), Number(r.balance), Number(r.updated));
      wallets.set(pid, { id: pid, token: String(r.token), name: String(r.name), balance: Number(r.balance) });
    }
    // 2) Salas
    const rRows = await extSql`SELECT code, data, updated FROM rooms`;
    for (const r of rRows) {
      const code = String(r.code);
      const local = db.query(`SELECT updated FROM rooms WHERE code = ?`).get(code) as any;
      if (local && Number(local.updated) > Number(r.updated)) {
        const room = rooms.get(code);
        if (room) {
          mirrorRoom(code, JSON.stringify(room), Number(local.updated));
          continue;
        }
      }
      db.query(`INSERT OR REPLACE INTO rooms (code, data, updated) VALUES (?,?,?)`).run(
        code, String(r.data), Number(r.updated)
      );
      const room = reviveRoom(String(r.data));
      if (room) rooms.set(code, room);
    }
    // 3) Historial: insertar lo que falte localmente
    const hRows = await extSql`SELECT id, code, at, data FROM history ORDER BY at DESC LIMIT 200`;
    for (const h of hRows) {
      const exists = db.query(`SELECT id FROM history WHERE id = ?`).get(String(h.id));
      if (!exists) {
        db.query(`INSERT OR REPLACE INTO history (id, code, at, data) VALUES (?,?,?,?)`).run(
          String(h.id), String(h.code), Number(h.at), String(h.data)
        );
      }
    }
    // 4) Backfill: empujar a la ext lo que solo existe local
    for (const [pid, w] of wallets) {
      if (!wRows.some((x: any) => String(x.player_id) === pid)) mirrorWallet(w, Date.now());
    }
    for (const [code, room] of rooms) {
      if (!rRows.some((x: any) => String(x.code) === code)) mirrorRoom(code, JSON.stringify(room), Date.now());
    }
    console.log("🗄️ Hidratación desde la base externa completada.");
  } catch (err: any) {
    console.error("⚠️ [ext-db] hidratación falló (sigo con SQLite):", err?.message ?? err);
  }
}

loadState();

async function boot() {
  await initExternalDb();
  if (extSql) await mergeExternal();
  httpServer.listen(PORT, () => {
    console.log(`🎲 Dadito — game service corriendo en puerto ${PORT}`);
  });
}
boot().catch((err) => {
  console.error("⚠️ Error de arranque (escucho de todos modos):", err);
  httpServer.listen(PORT, () => {
    console.log(`🎲 Dadito — game service corriendo en puerto ${PORT}`);
  });
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
