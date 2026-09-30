"use client";

import { io, type Socket } from "socket.io-client";
import { create } from "zustand";
import type { DiceColors, Difficulty, HistoryGame, Identity, PublicRoom, RoomSettings, RollResult } from "./types";
import { sfx, music } from "./sound";

export { sfx, music };

const LS_ID = "dado-loco:identity";
const LS_ROOM = "dado-loco:room";
const LS_SOUND = "dado-loco:sound";
const LS_NAME = "dado-loco:name";
const LS_MUSIC = "dado-loco:music";
const LS_DICE = "dado-loco:dice";
const LS_THEME = "dado-loco:theme";

/** Presets de color para el dado. */
export const DICE_PRESETS: DiceColors[] = [
  { id: "clasico",   name: "Clásico",    face: "#ffffff", face2: "#cfcfd6", pip: "#18181b" },
  { id: "sangre",    name: "Sangre",     face: "#ef4444", face2: "#991b1b", pip: "#ffffff" },
  { id: "noche",     name: "Noche",      face: "#27272a", face2: "#09090b", pip: "#fafafa" },
  { id: "oro",       name: "Oro",        face: "#fbbf24", face2: "#b45309", pip: "#451a03" },
  { id: "esmeralda", name: "Esmeralda",  face: "#34d399", face2: "#065f46", pip: "#052e16" },
  { id: "rosa",      name: "Rosa",       face: "#f9a8d4", face2: "#be185d", pip: "#500724" },
  { id: "cielo",     name: "Cielo",      face: "#7dd3fc", face2: "#0369a1", pip: "#082f49" },
  { id: "violeta",   name: "Violeta",    face: "#c4b5fd", face2: "#6d28d9", pip: "#2e1065" },
];

export const DEFAULT_DICE: DiceColors = DICE_PRESETS[0];

export function loadDiceColors(): DiceColors {
  if (typeof window === "undefined") return DEFAULT_DICE;
  try {
    const raw = localStorage.getItem(LS_DICE);
    if (!raw) return DEFAULT_DICE;
    const d = JSON.parse(raw) as DiceColors;
    if (!d || typeof d.face !== "string" || typeof d.pip !== "string") return DEFAULT_DICE;
    return d;
  } catch {
    return DEFAULT_DICE;
  }
}

export type Theme = "light" | "dark";

interface GameStore {
  ready: boolean;
  connected: boolean;
  identity: Identity | null;
  room: PublicRoom | null;
  lastRoll: RollResult | null;
  rollCount: number;
  clockOffset: number;
  history: HistoryGame[];
  soundOn: boolean;
  musicOn: boolean;
  diceColors: DiceColors;
  theme: Theme;
  /** Nivel oculto de la mesa — llega SOLO al admin vía room:admin-settings. */
  adminDifficulty: Difficulty | null;
  /** % de que salga 1 por nivel — SOLO admin, mismo canal privado. */
  adminOnesPct: { facil: number; medio: number; dificil: number } | null;
}

export const useGame = create<GameStore>(() => ({
  ready: false,
  connected: false,
  identity: null,
  room: null,
  lastRoll: null,
  rollCount: 0,
  clockOffset: 0,
  history: [],
  soundOn: true,
  musicOn: false,
  diceColors: DEFAULT_DICE,
  theme: "light",
  adminDifficulty: null,
  adminOnesPct: null,
}));

export function loadIdentity(): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_ID);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}
export function saveIdentity(identity: Identity) {
  localStorage.setItem(LS_ID, JSON.stringify(identity));
}
export function loadSavedName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LS_NAME) ?? "";
}
export function saveName(name: string) {
  localStorage.setItem(LS_NAME, name);
}
export function savedRoomCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_ROOM);
}

let socket: Socket | null = null;
let lastSoundEventId = "";

/**
 * Configuración de conexión según el entorno:
 *  - Local / vista previa (gateway con query XTransformPort): se pasa por el proxy.
 *  - Producción (Docker en Render/Railway/VPS): mismo origen, el reverse proxy
 *    enruta /socket.io hacia el game-service.
 */
function socketConfig(): { url: string; path: string } {
  if (typeof window === "undefined") return { url: "/", path: "/socket.io" };
  const { hostname, protocol } = window.location;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  if (isLocal) {
    // Dev directo (Next :3000 sin proxy) → conecta directo al game-service.
    return { url: `${protocol}//localhost:3003`, path: "/" };
  }
  const isPreview = /(^|\.)space-z\.ai$/.test(hostname) || /(^|\.)z\.ai$/.test(hostname);
  if (isPreview) {
    // Gateway de vista previa: enruta con query XTransformPort.
    return { url: "/?XTransformPort=3003", path: "/" };
  }
  // Producción (Render/Railway/VPS): mismo origen, Caddy enruta /socket.io.
  return { url: window.location.origin, path: "/socket.io" };
}

export function getSocket(): Socket {
  if (socket) return socket;
  const cfg = socketConfig();
  socket = io(cfg.url, {
    path: cfg.path,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
    timeout: 10000,
  });

  socket.on("connect", () => {
    useGame.setState({ connected: true });
    identify();
  });
  socket.on("disconnect", () => useGame.setState({ connected: false }));

  socket.on("room:state", ({ room }: { room: PublicRoom | null }) => {
    if (!room) {
      useGame.setState({ room: null });
      localStorage.removeItem(LS_ROOM);
      return;
    }
    // Sonidos por eventos nuevos
    const idx = room.events.findIndex((e) => e.id === lastSoundEventId);
    const fresh = idx === -1 ? room.events.slice(-2) : room.events.slice(idx + 1);
    for (const ev of fresh) {
      if (ev.kind === "bust") sfx.bust();
      else if (ev.kind === "hold" && ev.value) sfx.coin();
      else if (ev.kind === "finish") sfx.win();
      else if (ev.kind === "join") sfx.pop();
      else if (ev.kind === "tiebreak") sfx.drum();
      else if (ev.kind === "start") sfx.start();
      else if (ev.kind === "bonus") sfx.jackpot();
    }
    if (fresh.length) lastSoundEventId = fresh[fresh.length - 1].id;

    const prev = useGame.getState().room;
    if (prev && prev.phase !== "finished" && room.phase === "finished") sfx.win();
    useGame.setState({
      room,
      clockOffset: room.serverNow - Date.now(),
    });
    localStorage.setItem(LS_ROOM, room.code);
  });

  socket.on("game:roll-result", (r: RollResult) => {
    useGame.setState((s) => ({ lastRoll: r, rollCount: s.rollCount + 1 }));
    if (r.value !== 1) sfx.roll();
  });

  // Configuración privada del admin (incluye el nivel oculto de la mesa).
  socket.on("room:admin-settings", ({ settings }: { settings: RoomSettings }) => {
    if (settings?.difficulty) useGame.setState({ adminDifficulty: settings.difficulty });
    if (settings?.onesPct) useGame.setState({ adminOnesPct: settings.onesPct });
  });

  socket.on("wallet:update", ({ balance }: { balance: number }) => {
    const id = useGame.getState().identity;
    if (id) useGame.setState({ identity: { ...id, balance } });
  });

  return socket;
}

function identify() {
  const saved = loadIdentity();
  getSocket().emit(
    "session:identify",
    { playerId: saved?.playerId, token: saved?.token, name: loadSavedName() },
    (res: any) => {
      if (res?.ok) {
        saveIdentity(res.identity);
        useGame.setState({ ready: true, identity: res.identity, clockOffset: res.serverNow - Date.now() });
      } else {
        useGame.setState({ ready: true });
      }
    }
  );
}

function ack(event: string, payload: unknown = {}): Promise<any> {
  return new Promise((resolve) => {
    getSocket().emit(event, payload, (res: any) => resolve(res ?? { ok: false, error: "Sin respuesta del servidor" }));
  });
}

// ---------------- Acciones ----------------

export async function createRoom(name: string, settings: RoomSettings) {
  const res = await ack("room:create", { name, settings });
  if (res.ok) {
    saveName(name);
    syncIdentityName(name);
  }
  return res;
}

/** Nivel oculto de la mesa (solo admin; los jugadores no reciben nada).
 *  Acepta % editables: setDifficulty("dificil", { facil: 17, medio: 25, dificil: 60 }). */
export async function setDifficulty(difficulty: Difficulty, onesPct?: { facil: number; medio: number; dificil: number }) {
  const res = await ack("room:set-difficulty", onesPct ? { difficulty, onesPct } : { difficulty });
  if (res.ok) {
    useGame.setState({ adminDifficulty: res.difficulty ?? difficulty });
    if (res.onesPct) useGame.setState({ adminOnesPct: res.onesPct });
  }
  return res;
}

/** Solo actualiza los % del nivel oculto (el nivel se mantiene). */
export async function setOnesPct(onesPct: { facil: number; medio: number; dificil: number }) {
  const res = await ack("room:set-difficulty", { onesPct });
  if (res.ok && res.onesPct) useGame.setState({ adminOnesPct: res.onesPct });
  return res;
}

export async function joinRoom(code: string, name: string) {
  const res = await ack("room:join", { code, name });
  if (res.ok) {
    saveName(name);
    syncIdentityName(name);
  }
  return res;
}

/** Mantén el nombre de la identidad del store en sync con lo que dice el servidor. */
function syncIdentityName(name: string) {
  const id = useGame.getState().identity;
  if (id && id.name !== name) useGame.setState({ identity: { ...id, name } });
}

export async function updateSettings(settings: RoomSettings) {
  return ack("room:update-settings", { settings });
}

export async function kickPlayer(playerId: string) {
  return ack("room:kick", { playerId });
}

export async function leaveRoom() {
  const res = await ack("room:leave", {});
  if (res.ok) {
    useGame.setState({ room: null, adminDifficulty: null, adminOnesPct: null });
    localStorage.removeItem(LS_ROOM);
  }
  return res;
}

export async function abandonGame() {
  const res = await ack("game:abandon", {});
  if (res.ok) {
    useGame.setState({ room: null, adminDifficulty: null, adminOnesPct: null });
    localStorage.removeItem(LS_ROOM);
  }
  return res;
}

export async function startGame() {
  return ack("game:start", {});
}

export async function rollDice() {
  return ack("game:roll", {});
}

export async function holdPoints() {
  return ack("game:hold", {});
}

export async function sendChat(text: string) {
  return ack("game:chat", { text });
}

export async function rematch() {
  return ack("game:rematch", {});
}

export async function fetchHistory() {
  const res = await ack("wallet:history", {});
  if (res.ok) {
    useGame.setState({ history: res.games ?? [] });
    const id = useGame.getState().identity;
    if (id && typeof res.balance === "number") {
      useGame.setState({ identity: { ...id, balance: res.balance } });
    }
  }
  return res;
}

export async function refillWallet() {
  const res = await ack("wallet:refill", {});
  if (res.ok && typeof res.balance === "number") {
    const id = useGame.getState().identity;
    if (id) useGame.setState({ identity: { ...id, balance: res.balance } });
  }
  return res;
}

export function setSound(on: boolean) {
  sfx.enabled = on;
  localStorage.setItem(LS_SOUND, on ? "1" : "0");
  useGame.setState({ soundOn: on });
  if (!on && music.playing) setMusic(false);
}

export function restoreSound() {
  const on = localStorage.getItem(LS_SOUND) !== "0";
  sfx.enabled = on;
  useGame.setState({ soundOn: on });
}

/** Música de fondo (estilo cazafantasmas). */
export function setMusic(on: boolean) {
  if (on) music.start();
  else music.stop();
  localStorage.setItem(LS_MUSIC, on ? "1" : "0");
  useGame.setState({ musicOn: music.playing });
}

export function restoreMusic() {
  const on = localStorage.getItem(LS_MUSIC) === "1";
  useGame.setState({ musicOn: on });
  // No arranca sola: requiere gesto del usuario (política de autoplay).
}

/** Color del dado. */
export function setDiceColors(colors: DiceColors) {
  localStorage.setItem(LS_DICE, JSON.stringify(colors));
  useGame.setState({ diceColors: colors });
}

// ---------------- Tema (claro por defecto / modo nocturno) ----------------

function applyThemeClass(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", t === "light");
}

export function setTheme(t: Theme) {
  localStorage.setItem(LS_THEME, t);
  applyThemeClass(t);
  useGame.setState({ theme: t });
}

export function restoreTheme() {
  let t: Theme = "light";
  try {
    const saved = localStorage.getItem(LS_THEME);
    if (saved === "dark" || saved === "light") t = saved;
  } catch {
    /* localStorage bloqueado → claro */
  }
  applyThemeClass(t);
  useGame.setState({ theme: t });
}

/** Inicializa la conexión (idempotente). */
export function initGameClient() {
  getSocket();
  restoreSound();
  restoreMusic();
  restoreTheme();
  useGame.setState({ diceColors: loadDiceColors() });
}
