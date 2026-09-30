"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Coins, Dices, LogIn, Plus, Volume2, VolumeX, Download, Trophy,
  History, Wallet, Users, Timer, ChevronDown, Sparkles, Target, Music, Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  useGame, createRoom, joinRoom, fetchHistory, refillWallet, loadSavedName, setSound, setMusic,
  setDiceColors, DICE_PRESETS, sfx,
} from "@/lib/game/client";
import type { RoomSettings, DiceColors } from "@/lib/game/types";
import { Dice3D } from "./dice-3d";
import { SettingsDialog } from "./settings-dialog";
import { InstallPwaButton } from "./pwa";
import { ThemeToggle } from "./theme-toggle";

const DEFAULTS: RoomSettings = {
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

export function HomeScreen() {
  const identity = useGame((s) => s.identity);
  const connected = useGame((s) => s.connected);
  const soundOn = useGame((s) => s.soundOn);
  const musicOn = useGame((s) => s.musicOn);
  const diceColors = useGame((s) => s.diceColors);
  const history = useGame((s) => s.history);

  const [name, setName] = useState(() => loadSavedName());
  const [code, setCode] = useState(() => {
    if (typeof window === "undefined") return "";
    const c = (new URLSearchParams(window.location.search).get("code") ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    return c;
  });
  const [settings, setSettings] = useState<RoomSettings>(DEFAULTS);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [diceKey, setDiceKey] = useState(0);

  useEffect(() => {
    fetchHistory();
    // dado decorativo girando de vez en cuando
    const t = setInterval(() => setDiceKey((k) => k + 1), 5200);
    return () => clearInterval(t);
  }, []);

  const needName = !name.trim();

  const handleCreate = async () => {
    if (needName) return toast.error("Escribe tu nombre para jugar");
    setBusy("create");
    const res = await createRoom(name.trim(), settings);
    setBusy(null);
    if (!res.ok) toast.error(res.error ?? "No se pudo crear la sala");
    else { setMusic(false); sfx.start(); }
  };

  const handleJoin = async () => {
    if (needName) return toast.error("Escribe tu nombre para jugar");
    if (code.trim().length < 4) return toast.error("El código de sala tiene 4 caracteres");
    setBusy("join");
    const res = await joinRoom(code.trim().toUpperCase(), name.trim());
    setBusy(null);
    if (!res.ok) toast.error(res.error ?? "No se pudo unir");
    else { setMusic(false); sfx.start(); }
  };

  const handleRefill = async () => {
    const res = await refillWallet();
    if (res.ok) toast.success(`¡Fichas recargadas! +$1.000 → saldo $${(res.balance ?? 0).toLocaleString("es-CO")}`);
    else toast.error(res.error ?? "No se pudo recargar");
  };

  const pickPreset = (c: DiceColors) => setDiceColors(c);
  const pickCustom = (part: "face" | "pip", value: string) => {
    setDiceColors({
      id: "custom",
      name: "Personalizado",
      face: part === "face" ? value : diceColors.face,
      face2: part === "face" ? value : diceColors.face2,
      pip: part === "pip" ? value : diceColors.pip,
    });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      {/* Barra superior */}
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-red-500/10 ring-1 ring-red-500/30">
            <Dices className="size-6 text-red-400" />
          </div>
          <div className="leading-tight">
            <p className="text-lg font-black tracking-tight text-zinc-50">
              DADI<span className="text-gold gold-glow">TO</span>
            </p>
            <p className="text-[11px] text-zinc-500">Pensado, Desarrollado y Ejecutado por Empresas El BroThanosAPI</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {identity && (
            <Badge variant="outline" className="gap-1.5 border-sky-400/30 bg-sky-400/10 py-1.5 text-sky-300">
              <Coins className="size-3.5" /> ${identity.balance.toLocaleString("es-CO")}
            </Badge>
          )}
          <ThemeToggle />
          <Button
            variant="ghost" size="icon" aria-label={musicOn ? "Pausar música" : "Poner música"}
            title="Música estilo cazafantasmas"
            onClick={() => { setMusic(!musicOn); sfx.click(); }}
          >
            <Music className={`size-4 ${musicOn ? "animate-pulse text-emerald-400" : "text-zinc-500"}`} />
          </Button>
          <Button
            variant="ghost" size="icon" aria-label={soundOn ? "Silenciar" : "Activar sonido"}
            onClick={() => { setSound(!soundOn); if (!soundOn) sfx.click(); }}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4 text-zinc-500" />}
          </Button>
          <InstallPwaButton />
        </div>
      </header>

      {/* Héroe: imagen de fondo opaca con Crear sala y Unirse DENTRO */}
      <section className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-800 shadow-2xl">
        <img
          src="/hero.jpg"
          srcSet="/hero-small.jpg 640w, /hero.jpg 1280w"
          sizes="(max-width: 640px) 100vw, 960px"
          alt="Amigos celebrando con dados y billetes en la mesa de juego"
          className="absolute inset-0 h-full w-full object-cover object-[50%_28%]"
          fetchPriority="high"
        />
        {/* Capa opaca: oscurece la foto para que todo se lea bien */}
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/45" />

        <div className="relative p-4 sm:p-6 lg:p-8">
          <motion.h1
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-black leading-tight tracking-tight text-white drop-shadow-lg sm:text-4xl"
          >
            Lanza, arriesga y <span className="text-[#fca5a5] gold-glow">quédate con todo</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="mt-1.5 max-w-2xl text-sm text-white/80 sm:text-base"
          >
            Crea una sala, invita a tus amigos y jueguen en tiempo real. Cada <b>1</b> te quema el turno.
          </motion.p>

          {/* Acciones sobre la imagen */}
          <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2">
            {/* Crear sala */}
            <Card className="card-3d py-4 sm:py-6">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-zinc-50">
                  <span className="grid size-8 place-items-center rounded-lg bg-red-500/15"><Plus className="size-4 text-red-400" /></span>
                  Crear una sala
                </CardTitle>
                <CardDescription>Sé el administrador: fija la entrada, el bono exacto y las reglas de pago.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="create-name" className="text-zinc-300">Tu nombre</Label>
                  <Input id="create-name" placeholder="Ej: Capitán Dados" value={name} maxLength={16}
                    onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-400">
                  <span>Entrada ${settings.buyIn} · {settings.rounds} rondas{settings.exactEnabled && ` · bono ${settings.exactTarget}`}</span>
                  <SettingsDialog
                    settings={settings}
                    onChange={setSettings}
                    difficulty={settings.difficulty ?? "facil"}
                    onDifficultyChange={(d) => setSettings((s) => ({ ...s, difficulty: d }))}
                    onesPct={settings.onesPct}
                    onOnesPctChange={(p) => setSettings((s) => ({ ...s, onesPct: p }))}
                  />
                </div>
                <Button className="w-full bg-red-500 font-bold text-white hover:bg-red-400"
                  disabled={busy === "create" || !connected} onClick={handleCreate}>
                  {busy === "create" ? "Creando…" : "Crear sala y invitar amigos"}
                </Button>
              </CardContent>
            </Card>

            {/* Unirse */}
            <Card className="card-3d py-4 sm:py-6">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-zinc-50">
                  <span className="grid size-8 place-items-center rounded-lg bg-emerald-400/15"><LogIn className="size-4 text-emerald-400" /></span>
                  Unirse con código
                </CardTitle>
                <CardDescription>Pide el código de 4 letras a quien creó la sala.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="join-name" className="text-zinc-300">Tu nombre</Label>
                  <Input id="join-name" placeholder="Ej: Suerte Atómica" value={name} maxLength={16}
                    onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="join-code" className="text-zinc-300">Código de la sala</Label>
                  <Input id="join-code" placeholder="ABCD" value={code} maxLength={6}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                    className="text-center text-2xl font-black uppercase tracking-[0.4em]" />
                </div>
                <Button variant="secondary" className="w-full bg-emerald-400 font-bold text-zinc-950 hover:bg-emerald-300"
                  disabled={busy === "join" || !connected} onClick={handleJoin}>
                  {busy === "join" ? "Entrando…" : "Entrar a la sala"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <div className="mb-8 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <Badge variant="secondary" className="gap-1"><Users className="size-3" /> 2–16 jugadores</Badge>
        <Badge variant="secondary" className="gap-1"><Timer className="size-3" /> Turnos con cronómetro</Badge>
        <Badge variant="secondary" className="gap-1"><Trophy className="size-3" /> Bote según reglas del admin</Badge>
        <Badge variant="secondary" className="gap-1"><Target className="size-3" /> Bono de puntos exactos</Badge>
        <Badge variant="secondary" className="gap-1"><Sparkles className="size-3" /> Dinero 100% virtual</Badge>
      </div>

      {/* Personalización del dado */}
      <section className="mt-4">
        <Card className="border-zinc-800 bg-zinc-900/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-zinc-50">
              <span className="grid size-8 place-items-center rounded-lg bg-violet-400/15"><Palette className="size-4 text-violet-300" /></span>
              Personaliza el color de tu dado
            </CardTitle>
            <CardDescription>Solo tú lo ves así — se guarda en este dispositivo.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="mx-auto shrink-0 sm:mx-0">
              <Dice3D value={5} spinKey={diceKey} size={72} colors={diceColors} />
            </div>
            <div className="w-full space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Colores de dado">
                {DICE_PRESETS.map((c) => (
                  <button
                    key={c.id}
                    title={c.name}
                    aria-label={`Dado ${c.name}`}
                    aria-pressed={diceColors.id === c.id}
                    onClick={() => { pickPreset(c); sfx.click(); }}
                    className={`grid size-9 place-items-center rounded-full transition-transform hover:scale-110 ${
                      diceColors.id === c.id ? "ring-2 ring-red-400 ring-offset-2 ring-offset-zinc-900" : "ring-1 ring-zinc-700"
                    }`}
                    style={{ background: `linear-gradient(145deg, ${c.face}, ${c.face2})` }}
                  >
                    <span className="size-3 rounded-full" style={{ background: c.pip }} />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                <label className="flex items-center gap-2">
                  Cara
                  <input type="color" value={diceColors.face} onChange={(e) => pickCustom("face", e.target.value)}
                    className="size-7 cursor-pointer rounded border border-zinc-700 bg-transparent" aria-label="Color de la cara del dado" />
                </label>
                <label className="flex items-center gap-2">
                  Puntos
                  <input type="color" value={diceColors.pip} onChange={(e) => pickCustom("pip", e.target.value)}
                    className="size-7 cursor-pointer rounded border border-zinc-700 bg-transparent" aria-label="Color de los puntos del dado" />
                </label>
                <span className="text-zinc-600">{diceColors.name}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Cartera virtual: siempre visible, con recarga gratis cuando se acabe */}
      {identity && (
        <Card className={`mt-4 ${identity.balance < 1000 ? "border-sky-400/25 bg-sky-400/5" : "border-zinc-800 bg-zinc-900/60"}`}>
          <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-sky-400/15">
                <Wallet className="size-5 text-sky-300" />
              </span>
              <div>
                <p className="text-sm font-bold text-zinc-100">
                  Tu cartera: <span className="text-sky-300">${identity.balance.toLocaleString("es-CO")}</span>
                </p>
                <p className="text-xs text-zinc-500">
                  Empiezas con $1.000 gratis · recarga sin costo cuando se te acabe.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={identity.balance >= 1000}
              title={identity.balance >= 1000 ? "La recarga se activa cuando tu saldo baje de $1.000" : "Recarga gratis +$1.000"}
              className="border-sky-400/40 text-sky-300 hover:bg-sky-400/10"
              onClick={handleRefill}
            >
              <Coins className="mr-1 size-3.5" /> Recargar +$1.000
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Historial */}
      <section className="mt-6">
        <button
          className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-4 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-900"
          onClick={() => { setShowHistory((v) => !v); if (!showHistory) fetchHistory(); }}
        >
          <span className="flex items-center gap-2"><History className="size-4 text-zinc-400" /> Tus últimas partidas</span>
          <ChevronDown className={`size-4 text-zinc-500 transition-transform ${showHistory ? "rotate-180" : ""}`} />
        </button>
        {showHistory && (
          <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            {history.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">
                Aún no tienes partidas. ¡Crea una sala o únete con un código!
              </p>
            ) : (
              <ul className="space-y-2">
                {history.map((g) => (
                  <li key={g.id} className="flex items-center justify-between rounded-lg bg-zinc-950/50 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <Badge variant={g.position === 1 ? "default" : "secondary"}
                        className={g.position === 1 ? "bg-red-500 text-white" : ""}>
                        #{g.position}
                      </Badge>
                      <span className="text-zinc-400">Sala {g.code} · {g.points} pts</span>
                    </span>
                    <span className={`font-bold ${g.amount > 0 ? "text-emerald-400" : "text-zinc-500"}`}>
                      {g.amount > 0 ? `+$${g.amount}` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Pie */}
      <Separator className="mt-10 bg-zinc-800/70" />
      <footer className="mt-4 pb-4 text-center text-xs text-zinc-600">
        El dinero es 100% virtual y recreativo — no hay apuestas reales. Juega con responsabilidad.
        {!connected && <span className="ml-1 text-red-400">· Reconectando…</span>}
      </footer>
    </div>
  );
}
