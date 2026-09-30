"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Crown, Copy, Share2, Play, LogOut, Wifi, WifiOff, Settings2,
  Coins, CircleDot, UserMinus, Swords, Hourglass, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useGame, updateSettings, kickPlayer, startGame, leaveRoom, setDifficulty, setOnesPct, refillWallet, sfx } from "@/lib/game/client";
import type { RoomSettings } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { ChatPanel } from "./chat-panel";
import { SettingsDialog, payoutShort, exactLabel } from "./settings-dialog";
import { ThemeToggle } from "./theme-toggle";

export function Lobby() {
  const room = useGame((s) => s.room);
  const identity = useGame((s) => s.identity);
  const connected = useGame((s) => s.connected);
  const adminDifficulty = useGame((s) => s.adminDifficulty);
  const adminOnesPct = useGame((s) => s.adminOnesPct);
  const [editing, setEditing] = useState<RoomSettings | null>(null);
  const [starting, setStarting] = useState(false);
  // Borrador local de los % del nivel oculto + debounce para no spamear al servidor.
  const [pctDraft, setPctDraft] = useState<{ facil: number; medio: number; dificil: number } | null>(null);
  const pctTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!room || !identity) return null;
  const isAdmin = room.players.find((p) => p.id === identity.playerId)?.isAdmin ?? false;
  const players = room.players;
  const enough = players.length >= 2;
  const canAfford = (identity.balance ?? 0) >= room.settings.buyIn;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/?code=${room.code}` : "";

  const copyCode = async () => {
    await navigator.clipboard.writeText(room.code).catch(() => {});
    toast.success(`Código ${room.code} copiado`);
    sfx.click();
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Dadito Online", text: `¡Entra a mi sala con el código ${room.code}!`, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(`${shareUrl} (código: ${room.code})`);
        toast.success("Enlace copiado al portapapeles");
      }
    } catch { /* cancelado */ }
  };

  const saveSettings = async () => {
    if (!editing) return;
    const res = await updateSettings(editing);
    if (!res.ok) toast.error(res.error ?? "No se pudo guardar");
    else toast.success("Reglas actualizadas");
    setEditing(null);
  };

  const handleStart = async () => {
    setStarting(true);
    const res = await startGame();
    setStarting(false);
    if (!res.ok) toast.error(res.error ?? "No se pudo iniciar");
    else sfx.start();
  };

  const handleKick = async (playerId: string) => {
    const res = await kickPlayer(playerId);
    if (!res.ok) toast.error(res.error ?? "No se pudo expulsar");
  };

  const handlePctChange = (p: { facil: number; medio: number; dificil: number }) => {
    setPctDraft(p);
    if (pctTimer.current) clearTimeout(pctTimer.current);
    pctTimer.current = setTimeout(async () => {
      const res = await setOnesPct(p);
      if (!res.ok) toast.error(res.error ?? "No se pudo guardar");
    }, 450);
  };

  const handleRefill = async () => {
    const res = await refillWallet();
    if (res.ok) toast.success(`¡Fichas recargadas! +$1.000 → saldo $${(res.balance ?? 0).toLocaleString("es-CO")}`);
    else toast.error(res.error ?? "No se pudo recargar");
  };

  const handleLeave = async () => {
    const res = await leaveRoom();
    if (!res.ok) toast.error(res.error ?? "No se pudo salir");
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-5 sm:px-6">
      {/* Encabezado */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Swords className="size-4 text-red-400" /> Lobby de la sala
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button size="sm" variant="ghost" className="gap-1.5 text-zinc-400 hover:text-red-300" onClick={handleLeave}>
            <LogOut className="size-4" /> Salir
          </Button>
        </div>
      </div>

      {/* Código + compartir */}
      <Card className="mb-4 border-red-500/25 bg-zinc-900/60">
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Código de invitación</p>
            <button onClick={copyCode} title="Copiar código"
              className="gold-glow mt-1 text-5xl font-black tracking-[0.3em] text-red-400 transition-transform hover:scale-105 sm:text-6xl">
              {room.code}
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700 text-zinc-200" onClick={copyCode}>
                <Copy className="size-4" /> Copiar
              </Button>
              <Button size="sm" className="gap-1.5 bg-red-500 font-bold text-white hover:bg-red-400" onClick={share}>
                <Share2 className="size-4" /> Invitar amigos
              </Button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-zinc-500">
              {connected ? <Wifi className="size-3.5 text-emerald-400" /> : <WifiOff className="size-3.5 text-red-400" />}
              {players.length}/{room.settings.maxPlayers} jugadores · comparte el código o el enlace
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Columna izquierda: jugadores + reglas */}
        <div className="space-y-4">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base text-zinc-100">
                <span className="flex items-center gap-2"><Users2Icon /> Jugadores ({players.length})</span>
                {!enough && <Badge variant="secondary" className="text-sky-300">Faltan jugadores</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <AnimatePresence initial={false}>
                {players.map((p) => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                      p.id === identity.playerId
                        ? "border-red-400/30 bg-red-400/5"
                        : "border-zinc-800 bg-zinc-950/40"
                    )}
                  >
                    <Avatar className="size-9">
                      <AvatarFallback className={cn(
                        "font-bold",
                        p.isAdmin ? "bg-red-500 text-white" : "bg-zinc-700 text-zinc-200"
                      )}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-100">
                        {p.name}
                        {p.id === identity.playerId && <span className="ml-1.5 text-xs font-normal text-zinc-500">(tú)</span>}
                      </p>
                      <p className="flex items-center gap-1 text-[11px] text-zinc-500">
                        {p.connected
                          ? <><CircleDot className="size-3 text-emerald-400" /> En línea</>
                          : <><WifiOff className="size-3 text-zinc-600" /> Desconectado</>}
                      </p>
                    </div>
                    {p.isAdmin && (
                      <Badge className="gap-1 bg-red-500/15 text-red-300 hover:bg-red-500/15">
                        <Crown className="size-3" /> Admin
                      </Badge>
                    )}
                    {isAdmin && !p.isAdmin && (
                      <Button size="icon" variant="ghost" className="size-7 text-zinc-600 hover:text-red-400"
                        aria-label={`Expulsar a ${p.name}`} onClick={() => handleKick(p.id)}>
                        <UserMinus className="size-4" />
                      </Button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* Resumen de reglas */}
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base text-zinc-100">
                <span className="flex items-center gap-2"><Settings2 className="size-4 text-zinc-400" /> Reglas de la partida</span>
                {isAdmin && (
                  <SettingsDialog
                    settings={editing ?? room.settings}
                    onChange={setEditing}
                    onSave={saveSettings}
                    difficulty={adminDifficulty ?? "facil"}
                    onDifficultyChange={(d) => { setDifficulty(d); }}
                    onesPct={pctDraft ?? adminOnesPct ?? undefined}
                    onOnesPctChange={handlePctChange}
                    trigger={
                      <Button size="sm" variant="outline" className="h-7 gap-1 border-zinc-700 text-xs text-red-300">
                        <Settings2 className="size-3.5" /> Editar
                      </Button>
                    }
                  />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <Rule label="Entrada" value={`$${room.settings.buyIn}`} icon={<Coins className="size-3.5 text-red-400" />} />
              <Rule label="Sesiones" value={`${room.settings.rounds} por jugador`} />
              <Rule label="Tiempo/turno" value={room.settings.turnSeconds > 0 ? `${room.settings.turnSeconds}s` : "Sin límite"} />
              <Rule label="Premio" value={payoutShort(room.settings)} />
              <Rule
                label="Bono exacto 🎯"
                value={exactLabel(room.settings)}
                className={room.settings.exactEnabled ? "text-emerald-300" : undefined}
              />
              <Rule label="Máx. jugadores" value={`${room.settings.maxPlayers}`} />
              <div className="col-span-2 rounded-lg bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
                Bote potencial: <span className="font-bold text-red-300">${room.settings.buyIn * players.length}</span> ·
                {" "}quien no tenga saldo será retirado al iniciar.
                {!isAdmin && identity.balance < room.settings.buyIn && (
                  <span className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-sky-400/10 px-2 py-1.5 text-sky-300">
                    <span>Tu saldo (${identity.balance}) no alcanza para la entrada.</span>
                    <Button size="sm" variant="outline"
                      className="h-6 border-sky-400/40 px-2 text-[11px] text-sky-300 hover:bg-sky-400/10"
                      onClick={handleRefill}>
                      Recargar +$1.000
                    </Button>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: chat */}
        <ChatPanel className="min-h-[320px] lg:max-h-[560px]" />
      </div>

      {/* Barra de inicio */}
      <div className="sticky bottom-4 mt-5">
        <Card className="border-red-500/30 bg-zinc-900/90 shadow-xl backdrop-blur">
          <CardContent className="flex flex-col items-center gap-3 p-4 sm:flex-row sm:justify-between">
            {isAdmin ? (
              <>
                <p className="flex items-center gap-2 text-xs text-zinc-400">
                  {canAfford
                    ? <>Listo para repartir <span className="font-bold text-red-300">${room.settings.buyIn * players.length}</span> entre {players.length} jugadores</>
                    : <><X className="size-4 text-red-400" /> Te faltan ${room.settings.buyIn - identity.balance} para pagar la entrada</>}
                </p>
                {!canAfford && (
                  <Button size="sm" variant="outline"
                    className="border-sky-400/40 text-sky-300 hover:bg-sky-400/10"
                    onClick={handleRefill}>
                    Recargar +$1.000
                  </Button>
                )}
                <Button
                  size="lg"
                  className="w-full bg-emerald-400 font-black text-zinc-950 shadow-lg shadow-emerald-400/20 hover:bg-emerald-300 sm:w-auto"
                  disabled={starting || !enough || !connected}
                  onClick={handleStart}
                >
                  <Play className="mr-1.5 size-5" />
                  {enough ? "¡Iniciar partida!" : "Se necesitan 2+ jugadores"}
                </Button>
              </>
            ) : (
              <p className="flex w-full items-center justify-center gap-2 py-1 text-sm text-zinc-400">
                <Hourglass className="size-4 animate-pulse text-sky-400" />
                Esperando a que el administrador inicie la partida…
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Rule({ label, value, icon, className }: { label: string; value: string; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg bg-zinc-950/50 px-3 py-2", className)}>
      {icon}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="truncate text-sm font-semibold text-zinc-200">{value}</p>
      </div>
    </div>
  );
}

function Users2Icon() {
  return <Crown className="size-4 text-red-400" />;
}
