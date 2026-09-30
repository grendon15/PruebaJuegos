"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Dices, Lock, Coins, Crown, CircleDot, WifiOff, Activity, LogOut, Zap, Swords, Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useGame, rollDice, holdPoints, abandonGame } from "@/lib/game/client";
import { cn } from "@/lib/utils";
import { Dice3D } from "./dice-3d";
import { ChatPanel } from "./chat-panel";
import { ThemeToggle } from "./theme-toggle";
import type { FeedEvent } from "@/lib/game/types";

function useServerClock() {
  const clockOffset = useGame((s) => s.clockOffset);
  return () => Date.now() + clockOffset;
}

export function GameTable() {
  const room = useGame((s) => s.room);
  const identity = useGame((s) => s.identity);
  const lastRoll = useGame((s) => s.lastRoll);
  const diceColors = useGame((s) => s.diceColors);
  const serverNow = useServerClock();

  const isTiebreak = room?.phase === "tiebreak";
  const playing = room?.phase === "playing";
  const myTurn = !!room && !!identity && room.game.currentPlayerId === identity.playerId;
  const currentPlayer = room?.players.find((p) => p.id === room?.game.currentPlayerId);
  // Nombre SIEMPRE desde la sala (fuente de verdad del servidor)
  const myName = room?.players.find((p) => p.id === identity?.playerId)?.name ?? identity?.name ?? "";
  const turnTotal = room?.game.turnTotal ?? 0;

  // Tick periódico para timer y estado visual del dado (setState solo en callbacks)
  const [, forceTick] = useState(0);
  const rollCount = useGame((s) => s.rollCount);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => forceTick((x) => x + 1), 300);
    return () => clearInterval(t);
  }, [playing]);

  if (!room || !identity) return null;

  // El dado se considera "girando" durante ~3.3s tras cada tirada (tumbo largo)
  const rolling = !!lastRoll && serverNow() - lastRoll.ts < 3300;

  const remainingMs = room.game.turnEndsAt
    ? Math.max(0, room.game.turnEndsAt - serverNow())
    : null;
  const totalMs = (room.settings.turnSeconds || 60) * 1000;
  const timeFrac = remainingMs != null ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 1;
  const urgent = remainingMs != null && remainingMs < 10_000;

  const doRoll = async () => {
    const res = await rollDice();
    if (!res.ok) toast.error(res.error);
  };
  const doHold = async () => {
    const res = await holdPoints();
    if (!res.ok) toast.error(res.error);
  };

  const ranked = [...room.players].sort((a, b) => (room.scores[b.id] ?? 0) - (room.scores[a.id] ?? 0));
  const leaderId = ranked[0]?.id;
  const leaderScore = room.scores[leaderId] ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-8 pt-4 sm:px-6">
      {/* Encabezado */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-zinc-700 font-mono text-zinc-300">#{room.code}</Badge>
          <Badge className="bg-sky-400/15 text-sky-300 hover:bg-sky-400/15">
            Ronda {Math.min(room.game.round, room.game.totalRounds)}/{room.game.totalRounds}
          </Badge>
          <Badge className="gap-1 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/15">
            <Coins className="size-3" /> Bote ${room.pot}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1.5 text-zinc-500 hover:text-red-300">
                <LogOut className="size-4" /> Abandonar
              </Button>
            </AlertDialogTrigger>
          <AlertDialogContent className="border-zinc-800 bg-zinc-950">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-zinc-50">¿Abandonar la partida?</AlertDialogTitle>
              <AlertDialogDescription>
                Tus turnos se pasarán automáticamente y no podrás reclamar el premio. La entrada ya está en el bote.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300">Seguir jugando</AlertDialogCancel>
              <AlertDialogAction className="bg-red-500 text-white hover:bg-red-400" onClick={() => abandonGame()}>
                Abandonar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* ==================== MESA ==================== */}
        <div>
          <div className="felt relative overflow-hidden rounded-3xl border border-emerald-900/60 p-4 sm:p-6">
            {/* flash rojo al quemarse (puro CSS/Framer, sin estado) */}
            {lastRoll?.value === 1 && (
              <motion.div
                key={lastRoll.ts}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.2, times: [0, 0.12, 0.65, 1], ease: "easeOut" }}
                className="pointer-events-none absolute inset-0 z-20"
                style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(220,38,38,0.45) 100%)" }}
              >
                <div className="grid h-full place-items-center">
                  <motion.span
                    initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: [0.4, 1.1, 1], rotate: 0 }}
                    transition={{ duration: 0.5 }}
                    className="text-6xl font-black text-red-400 drop-shadow-[0_0_25px_rgba(220,38,38,0.8)] sm:text-8xl"
                  >
                    ¡UNO! 💥
                  </motion.span>
                </div>
              </motion.div>
            )}

            {/* flash dorado al lograr el bono exacto */}
            {lastRoll?.exactBonus && (
              <motion.div
                key={`bonus-${lastRoll.ts}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.9, times: [0, 0.1, 0.7, 1], ease: "easeOut" }}
                className="pointer-events-none absolute inset-0 z-20"
                style={{ background: "radial-gradient(ellipse at center, transparent 25%, rgba(251,191,36,0.5) 100%)" }}
              >
                <div className="grid h-full place-items-center">
                  <motion.div
                    initial={{ scale: 0.4, rotate: -8 }} animate={{ scale: [0.4, 1.15, 1], rotate: 0 }}
                    transition={{ duration: 0.55 }}
                    className="text-center"
                  >
                    <p className="text-5xl font-black text-red-300 drop-shadow-[0_0_30px_rgba(239,68,68,0.9)] sm:text-7xl">
                      ¡EXACTO {lastRoll.exactBonus.target}! 🎯
                    </p>
                    <p className="mt-2 text-xl font-black text-emerald-300 drop-shadow-lg sm:text-3xl">
                      {lastRoll.exactBonus.doubled && <>puntos ×2 → {lastRoll.exactBonus.banked}</>}
                      {lastRoll.exactBonus.doubled && lastRoll.exactBonus.money > 0 && " · "}
                      {lastRoll.exactBonus.money > 0 && <>+${lastRoll.exactBonus.money}</>}
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {/* Turno actual — imagen de la portada de fondo, opaca, en todo el cuadro */}
            <div
              className={cn(
                "turn-banner relative mb-4 overflow-hidden rounded-2xl border px-4 py-5 text-center transition-colors",
                myTurn && playing ? "border-red-500/60" : "border-zinc-800"
              )}
              style={{
                backgroundImage: `linear-gradient(rgba(9,9,11,${myTurn && playing ? 0.52 : 0.72}), rgba(9,9,11,${myTurn && playing ? 0.62 : 0.8})), url('/hero.jpg')`,
                backgroundSize: "cover",
                backgroundPosition: "50% 28%",
                boxShadow:
                  myTurn && playing
                    ? "0 0 38px rgba(239,68,68,0.28), inset 0 0 46px rgba(0,0,0,0.45)"
                    : "inset 0 0 40px rgba(0,0,0,0.35)",
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={room.game.currentPlayerId ?? "none"}
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.25 }}
                >
                  {myTurn ? (
                    <p className="text-2xl font-black text-[#fca5a5] gold-glow sm:text-3xl">
                      ¡ES TU TURNO, <span className="text-white">{myName}</span>! 🎲
                    </p>
                  ) : (
                    <p className="text-lg font-bold text-white sm:text-xl">
                      Turno de <span className="text-[#7dd3fc]">{currentPlayer?.name ?? "…"}</span>
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>
              <p className={cn("mt-1 text-xs", myTurn && playing ? "font-medium text-white/85" : "text-white/65")}>
                {playing && "Lanza cuantas veces quieras · asegura antes de sacar 1"}
                {isTiebreak && "¡Empate en puestos con premio!"}
              </p>
            </div>

            {/* Dado + pozo del turno */}
            <div className="flex flex-col items-center justify-center gap-5 py-2 sm:flex-row sm:gap-10">
              <div className={cn("rounded-2xl p-3 transition-transform", myTurn && playing && "turn-glow")}>
                <Dice3D
                  value={room.game.dice}
                  spinKey={rollCount}
                  size={128}
                  clickable={myTurn && playing}
                  onClick={doRoll}
                  colors={diceColors}
                />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-300/70">Pozo del turno</p>
                <AnimatePresence mode="popLayout">
                  <motion.p
                    key={turnTotal}
                    initial={{ scale: 0.7, opacity: 0.4, y: -6 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 22 }}
                    className={cn(
                      "text-6xl font-black tabular-nums sm:text-7xl",
                      turnTotal === 0 ? "text-zinc-600" : "text-emerald-300 drop-shadow-[0_0_18px_rgba(52,211,153,0.35)]"
                    )}
                  >
                    {turnTotal}
                  </motion.p>
                </AnimatePresence>
                <p className="text-xs text-zinc-500">puntos en riesgo{turnTotal > 0 && " — ¿aseguras o te arriesgas?"}</p>
              </div>
            </div>

            {/* Timer */}
            {remainingMs != null && playing && (
              <div className="mx-auto mt-4 max-w-md">
                <div className="h-2 overflow-hidden rounded-full bg-zinc-800/80">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-300 ease-linear", urgent ? "bg-red-500" : "bg-sky-400")}
                    style={{ width: `${timeFrac * 100}%` }}
                  />
                </div>
                <p className={cn("mt-1 text-center text-[11px]", urgent ? "font-bold text-red-400" : "text-sky-300/80")}>
                  {urgent ? `¡${Math.ceil((remainingMs ?? 0) / 1000)}s para decidir!` : `Tiempo: ${Math.ceil((remainingMs ?? 0) / 1000)}s`}
                </p>
              </div>
            )}

            {/* Desempate */}
            {isTiebreak && room.game.tiebreak && (
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                className="mx-auto mt-5 max-w-md rounded-2xl border border-red-400/40 bg-zinc-950/70 p-4">
                <p className="flex items-center justify-center gap-2 text-center text-lg font-black text-red-300">
                  <Swords className="size-5" /> DESEMPATE · ronda {room.game.tiebreak.stage}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-3">
                  {room.game.tiebreak.players.map((pid) => {
                    const p = room.players.find((x) => x.id === pid);
                    const roll = room.game.tiebreak?.rolls[pid];
                    return (
                      <div key={pid} className="flex min-w-20 flex-col items-center rounded-xl bg-zinc-900 px-3 py-2">
                        <span className="truncate text-xs font-semibold text-zinc-300">{p?.name}</span>
                        <AnimatePresence mode="popLayout">
                          {roll != null && (
                            <motion.span
                              key={`${roll}-${room.game.tiebreak?.stage}`}
                              initial={{ scale: 0.3, rotate: -30, opacity: 0 }}
                              animate={{ scale: 1, rotate: 0, opacity: 1 }}
                              className="text-3xl font-black text-red-300"
                            >
                              {roll}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Acciones */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                size="lg"
                disabled={!myTurn || !playing || rolling}
                onClick={doRoll}
                className={cn(
                  "h-16 flex-col gap-0.5 bg-red-500 font-black text-white shadow-lg shadow-red-500/25 hover:bg-red-400",
                  !myTurn && "opacity-40"
                )}
              >
                <span className="flex items-center gap-2 text-base"><Dices className="size-5" /> LANZAR</span>
                <span className="text-[10px] font-medium opacity-70">puede quemar tu pozo</span>
              </Button>
              <Button
                size="lg"
                disabled={!myTurn || !playing || rolling}
                onClick={doHold}
                className={cn(
                  "h-16 flex-col gap-0.5 bg-emerald-400 font-black text-zinc-950 shadow-lg shadow-emerald-400/25 hover:bg-emerald-300",
                  !myTurn && "opacity-40"
                )}
              >
                <span className="flex items-center gap-2 text-base">
                  <Lock className="size-5" /> {turnTotal > 0 ? `ASEGURAR ${turnTotal}` : "PASAR"}
                </span>
                <span className="text-[10px] font-medium opacity-70">termina tu turno</span>
              </Button>
            </div>
            {myTurn && playing && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-zinc-500">
                <Zap className="size-3 text-red-400" />
                {room.settings.exactEnabled
                  ? `Pista: si tu pozo llega EXACTO a ${room.settings.exactTarget}, ¡ganas el bono al instante!`
                  : "Consejo: con 20+ puntos en el pozo suele convenir asegurar."}
              </p>
            )}
          </div>

          {/* Líder */}
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-zinc-400">
            <Trophy className="size-4 text-red-400" />
            Líder: <span className="font-bold text-zinc-100">{ranked[0]?.name}</span> con{" "}
            <span className="font-bold text-red-300">{leaderScore} pts</span>
          </div>
        </div>

        {/* ==================== PANEL LATERAL ==================== */}
        <div className="flex min-h-0 flex-col gap-4">
          {/* Marcador */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400">
              <Crown className="size-3.5 text-red-400" /> MARCADOR
            </div>
            <ul className="space-y-1.5 p-2">
              <AnimatePresence initial={false}>
                {ranked.map((p, i) => {
                  const isCur = p.id === room.game.currentPlayerId;
                  const turnPts = isCur ? turnTotal : 0;
                  return (
                    <motion.li
                      key={p.id}
                      layout
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2.5 py-2",
                        isCur ? "turn-glow border border-red-400/40 bg-red-400/5" : "bg-zinc-950/40",
                        p.id === identity.playerId && "ring-1 ring-emerald-400/30"
                      )}
                    >
                      <span className={cn("w-5 text-center text-sm font-black", i === 0 ? "text-red-400" : "text-zinc-600")}>
                        {i + 1}
                      </span>
                      <Avatar className="size-7">
                        <AvatarFallback className="bg-zinc-700 text-[10px] font-bold text-zinc-200">
                          {p.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-zinc-200">
                          {p.name}
                          {p.isAdmin && <Crown className="ml-1 inline size-3 text-red-400" />}
                        </p>
                        {turnPts > 0 && <p className="text-[10px] font-semibold text-emerald-400">+{turnPts} en juego</p>}
                      </div>
                      {(room.bonus?.[p.id] ?? 0) > 0 && (
                        <Badge className="gap-0.5 bg-emerald-400/15 px-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-400/15">
                          🎯 ${room.bonus?.[p.id]}
                        </Badge>
                      )}
                      {p.connected ? <CircleDot className="size-3 text-emerald-500" /> : <WifiOff className="size-3 text-zinc-700" />}
                      <motion.span
                        key={room.scores[p.id] ?? 0}
                        initial={{ scale: 1.35, color: "#f87171" }}
                        animate={{ scale: 1, color: "#fafafa" }}
                        className="w-10 text-right text-sm font-black tabular-nums"
                      >
                        {room.scores[p.id] ?? 0}
                      </motion.span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>

          {/* Actividad */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400">
              <Activity className="size-3.5" /> ACTIVIDAD
            </div>
            <div className="nice-scroll max-h-44 min-h-24 space-y-1 overflow-y-auto p-2 text-[12px] leading-snug" aria-live="polite">
              {[...room.events].reverse().slice(0, 25).map((e: FeedEvent) => (
                <p
                  key={e.id}
                  className={cn(
                    "rounded px-1.5 py-0.5",
                    e.kind === "bust" && "bg-red-500/10 text-red-300",
                    e.kind === "hold" && "text-emerald-300",
                    e.kind === "bonus" && "bg-emerald-400/15 font-bold text-emerald-300",
                    e.kind === "finish" && "bg-red-500/10 font-bold text-red-300",
                    e.kind === "round" && "text-center font-bold uppercase tracking-wider text-zinc-500",
                    e.kind === "tiebreak" && "bg-red-500/10 text-red-200",
                    !["bust", "hold", "bonus", "finish", "round", "tiebreak"].includes(e.kind) && "text-zinc-400"
                  )}
                >
                  {e.text}
                </p>
              ))}
            </div>
          </div>

          {/* Chat */}
          <ChatPanel className="h-72 lg:h-auto lg:flex-1 lg:min-h-40" />
        </div>
      </div>
    </div>
  );
}
