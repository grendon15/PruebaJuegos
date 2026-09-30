"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Crown, Coins, RotateCcw, Home, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useGame, rematch, leaveRoom } from "@/lib/game/client";
import { cn } from "@/lib/utils";
import { payoutShort, exactLabel } from "./settings-dialog";
import { ThemeToggle } from "./theme-toggle";

const CONFETTI_COLORS = ["#ef4444", "#f87171", "#34d399", "#ffffff", "#3b82f6"];

function fireConfetti() {
  const defaults = { colors: CONFETTI_COLORS, zIndex: 60 };
  confetti({ ...defaults, particleCount: 90, spread: 75, origin: { y: 0.7 } });
  setTimeout(() => confetti({ ...defaults, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.8 } }), 250);
  setTimeout(() => confetti({ ...defaults, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.8 } }), 400);
  setTimeout(() => confetti({ ...defaults, particleCount: 70, spread: 100, origin: { y: 0.6 } }), 900);
}

export function Results() {
  const room = useGame((s) => s.room);
  const identity = useGame((s) => s.identity);
  const fired = useRef(false);

  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      fireConfetti();
    }
  }, []);

  if (!room || !identity || !room.results) return null;
  const isAdmin = room.players.find((p) => p.id === identity.playerId)?.isAdmin ?? false;
  const ranking = room.results.ranking;
  const first = ranking[0];
  const podium = [ranking[1], ranking[0], ranking[2]].filter(Boolean);
  const myResult = ranking.find((r) => r.playerId === identity.playerId);

  const handleRematch = async () => {
    const res = await rematch();
    if (!res.ok) toast.error(res.error ?? "No se pudo reiniciar");
  };

  const handleHome = async () => {
    await leaveRoom();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6 sm:px-6">
      {/* Título */}
      <div className="mb-6 text-center">
        <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-[0.3em] text-zinc-500">
          <Trophy className="size-4 text-red-400" /> Resultados finales
        </motion.p>
        <motion.h1
          initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 18 }}
          className="gold-glow mt-2 text-4xl font-black text-red-300 sm:text-5xl"
        >
          🏆 {first?.name} gana
        </motion.h1>
        <p className="mt-2 text-sm text-zinc-400">
          Bote de <span className="font-bold text-red-300">${room.results.pot}</span> repartido · modo {payoutShort({ ...room.settings, payoutMode: room.results.mode })}
          {room.settings.exactEnabled && <> · bono 🎯 {room.settings.exactTarget} exacto ({exactLabel(room.settings).split(":")[1]?.trim() ?? "activo"})</>}
        </p>
      </div>

      {/* Podio */}
      <div className="mb-6 flex items-end justify-center gap-2 sm:gap-4">
        {podium.map((r) => {
          const pos = r.position;
          const h = pos === 1 ? "h-28 sm:h-36" : pos === 2 ? "h-20 sm:h-28" : "h-14 sm:h-20";
          const medal = pos === 1 ? "🥇" : pos === 2 ? "🥈" : "🥉";
          return (
            <motion.div
              key={r.playerId}
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25 + pos * 0.12, type: "spring", stiffness: 160, damping: 20 }}
              className="flex w-24 flex-col items-center sm:w-36"
            >
              <Avatar className={cn("mb-2 ring-2", pos === 1 ? "size-14 ring-red-400 sm:size-16" : "size-11 ring-zinc-600 sm:size-12")}>
                <AvatarFallback className={cn("font-black", pos === 1 ? "bg-red-500 text-lg text-white" : "bg-zinc-700 text-zinc-200")}>
                  {r.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="max-w-full truncate text-sm font-bold text-zinc-100">{r.name}</p>
              <p className="text-xs text-zinc-500">{r.points} pts</p>
              {r.amount > 0 && (
                <Badge className="mt-1 gap-1 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/15">
                  <Coins className="size-3" /> +${r.amount}
                </Badge>
              )}
              {(room.bonus?.[r.playerId] ?? 0) > 0 && (
                <Badge className="mt-1 gap-1 bg-sky-400/15 text-sky-300 hover:bg-sky-400/15">
                  🎯 bono +${room.bonus?.[r.playerId]}
                </Badge>
              )}
              <div className={cn(
                "mt-2 flex w-full items-start justify-center rounded-t-xl border border-b-0 border-zinc-700/70 pt-2 text-2xl",
                h,
                pos === 1 ? "bg-gradient-to-b from-red-500/30 to-transparent" : "bg-gradient-to-b from-zinc-500/25 to-transparent"
              )}>
                {medal}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Mi resultado */}
      {myResult && (
        <Card className={cn("mb-4", myResult.position === 1 ? "border-red-400/40 bg-red-400/5" : "border-zinc-800 bg-zinc-900/60")}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-zinc-300">
              Tu resultado: <span className="font-black text-zinc-50">#{myResult.position}</span> con{" "}
              <span className="font-black text-zinc-50">{myResult.points} pts</span>
            </div>
            <div className={cn("text-lg font-black", myResult.amount > 0 ? "text-emerald-400" : "text-zinc-500")}>
              {myResult.amount > 0 ? `+$${myResult.amount}` : `−$${room.settings.buyIn}`}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla completa */}
      <div className="mb-6 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-2.5">#</th>
              <th className="px-4 py-2.5">Jugador</th>
              <th className="px-4 py-2.5 text-right">Puntos</th>
              <th className="px-4 py-2.5 text-right">Bono 🎯</th>
              <th className="px-4 py-2.5 text-right">Premio</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => (
              <motion.tr
                key={r.playerId}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.07 }}
                className={cn(
                  "border-b border-zinc-800/60 last:border-0",
                  r.playerId === identity.playerId && "bg-emerald-400/5",
                  i === 0 && "bg-red-400/5"
                )}
              >
                <td className="px-4 py-2.5 font-black text-zinc-400">{r.position === 1 ? <Crown className="size-4 text-red-400" /> : `#${r.position}`}</td>
                <td className="px-4 py-2.5 font-semibold text-zinc-200">{r.name}{r.playerId === identity.playerId && <span className="ml-1 text-xs text-zinc-500">(tú)</span>}</td>
                <td className="px-4 py-2.5 text-right font-bold tabular-nums text-zinc-300">{r.points}</td>
                <td className={cn("px-4 py-2.5 text-right font-bold tabular-nums", (room.bonus?.[r.playerId] ?? 0) > 0 ? "text-sky-300" : "text-zinc-600")}>
                  {(room.bonus?.[r.playerId] ?? 0) > 0 ? `+$${room.bonus?.[r.playerId]}` : "—"}
                </td>
                <td className={cn("px-4 py-2.5 text-right font-black tabular-nums", r.amount > 0 ? "text-emerald-400" : "text-zinc-600")}>
                  {r.amount > 0 ? `+$${r.amount}` : "—"}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Acciones */}
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        {isAdmin ? (
          <Button size="lg" className="gap-2 bg-red-500 font-black text-white hover:bg-red-400" onClick={handleRematch}>
            <RotateCcw className="size-5" /> ¡Revancha! Volver al lobby
          </Button>
        ) : (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-center text-sm text-zinc-400">
            Espera a que el administrador lance la revancha…
          </p>
        )}
        <Button size="lg" variant="outline" className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={handleHome}>
          <Home className="size-5" /> Volver al inicio
        </Button>
        <ThemeToggle />
      </div>
    </div>
  );
}
