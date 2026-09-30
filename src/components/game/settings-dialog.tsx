"use client";

import { useState } from "react";
import { Coins, Target, EyeOff, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { Difficulty, ExactReward, PayoutMode, RoomSettings } from "@/lib/game/types";

export function payoutLabel(s: RoomSettings): string {
  if (s.payoutMode === "winner") return "El ganador se lleva TODO el bote";
  if (s.payoutMode === "top2") return "1º lugar 70% · 2º lugar 30%";
  return `1º ${s.custom.first}% · 2º ${s.custom.second}% · 3º ${s.custom.third}% · resto se suma al 1º`;
}

export function payoutShort(s: RoomSettings): string {
  if (s.payoutMode === "winner") return "Gana-todo";
  if (s.payoutMode === "top2") return "70/30";
  return `Top 3: ${s.custom.first}/${s.custom.second}/${s.custom.third}`;
}

export function exactLabel(s: RoomSettings): string {
  if (!s.exactEnabled) return "Desactivado";
  const parts: string[] = [];
  if (s.exactReward === "double") parts.push("duplica puntos");
  if (s.exactReward === "money") parts.push(`+$${s.exactMoney}`);
  if (s.exactReward === "both") parts.push(`duplica y +$${s.exactMoney}`);
  return `${s.exactTarget} exacto: ${parts.join(" · ")}`;
}

interface Props {
  settings: RoomSettings;
  onChange: (s: RoomSettings) => void;
  onSave?: () => void;
  trigger?: React.ReactNode;
  title?: string;
  /** Nivel oculto de la mesa. Si llega onDifficultyChange, la sección se muestra
   *  (solo contextos de admin: portada al crear y lobby del administrador). */
  difficulty?: Difficulty;
  onDifficultyChange?: (d: Difficulty) => void;
  /** % de que salga 1 por nivel — editable solo por el admin. */
  onesPct?: { facil: number; medio: number; dificil: number };
  onOnesPctChange?: (p: { facil: number; medio: number; dificil: number }) => void;
}

/** Diálogo de configuración de reglas (creador / administrador). */
export function SettingsDialog({ settings, onChange, onSave, trigger, title = "Reglas de la sala", difficulty, onDifficultyChange, onesPct, onOnesPctChange }: Props) {
  const [open, setOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(true);
  const update = (patch: Partial<RoomSettings>) => onChange({ ...settings, ...patch });
  const pct = onesPct ?? { facil: 17, medio: 25, dificil: 40 };
  const level = difficulty ?? "facil";
  const LEVEL_NAME: Record<Difficulty, string> = { facil: "Fácil", medio: "Medio", dificil: "Difícil" };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-300">Configurar</Button>}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-zinc-800 bg-zinc-950 nice-scroll sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-50">{title}</DialogTitle>
          <DialogDescription>Fija la entrada, las rondas, el bono exacto y cómo se reparte el bote.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Dinero de entrada por jugador (virtual)</Label>
            <div className="flex items-center gap-2">
              <Coins className="size-4 text-red-400" />
              <Input type="number" min={0} max={50000} value={settings.buyIn}
                onChange={(e) => update({ buyIn: Math.max(0, Math.min(50000, Number(e.target.value) || 0)) })}
                className="border-zinc-700" />
            </div>
            <p className="text-xs text-zinc-500">Cada jugador aporta este monto al bote al iniciar la partida.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Sesiones por jugador</Label>
              <select value={settings.rounds} aria-label="Sesiones por jugador"
                onChange={(e) => update({ rounds: Number(e.target.value) })}
                className="h-9 w-full rounded-md border border-zinc-700 bg-white px-2 text-sm text-black">
                {[3, 5, 7, 10, 12, 15, 20].map((n) => <option key={n} value={n}>{n} rondas</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Máx. jugadores</Label>
              <select value={settings.maxPlayers} aria-label="Máximo de jugadores"
                onChange={(e) => update({ maxPlayers: Number(e.target.value) })}
                className="h-9 w-full rounded-md border border-zinc-700 bg-white px-2 text-sm text-black">
                {[2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Tiempo por turno</Label>
            <select value={settings.turnSeconds} aria-label="Tiempo por turno"
              onChange={(e) => update({ turnSeconds: Number(e.target.value) })}
              className="h-9 w-full rounded-md border border-zinc-700 bg-white px-2 text-sm text-black">
              <option value={0}>Sin límite</option>
              {[20, 30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n} segundos</option>)}
            </select>
            <p className="text-xs text-zinc-500">Si se agota, el turno se asegura automáticamente.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Reglas para ganar el dinero</Label>
            <select value={settings.payoutMode} aria-label="Reglas de pago"
              onChange={(e) => update({ payoutMode: e.target.value as PayoutMode })}
              className="h-9 w-full rounded-md border border-zinc-700 bg-white px-2 text-sm text-black">
              <option value="winner">Gana-todo: el 1º se lleva el bote completo</option>
              <option value="top2">70/30: 1º 70% · 2º 30%</option>
              <option value="custom">Personalizado (top 3)</option>
            </select>
          </div>
          {settings.payoutMode === "custom" && (
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              {(["first", "second", "third"] as const).map((k, i) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs text-zinc-400">{i + 1}º lugar %</Label>
                  <Input type="number" min={0} max={100} value={settings.custom[k]}
                    onChange={(e) => update({ custom: { ...settings.custom, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } })}
                    className="h-8 border-zinc-700 text-sm" />
                </div>
              ))}
              <p className="col-span-3 text-xs text-zinc-500">
                Total: {settings.custom.first + settings.custom.second + settings.custom.third}% — el resto del bote se suma al 1º lugar.
              </p>
            </div>
          )}
          <div className="rounded-lg border border-sky-400/20 bg-sky-400/5 px-3 py-2 text-xs text-sky-200">
            <p className="font-semibold">Vista previa del premio:</p>
            <p>{payoutLabel(settings)}</p>
          </div>

          {/* ---------- Bono Exacto ---------- */}
          <div className="space-y-3 rounded-lg border border-emerald-400/25 bg-emerald-400/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="flex items-center gap-1.5 text-emerald-200">
                  <Target className="size-4 text-emerald-400" /> Bono de puntos exactos
                </Label>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Premio instantáneo si el pozo del turno llega <b className="text-emerald-300">exacto</b> al número objetivo. Se asegura solo y pasa el turno.
                </p>
              </div>
              <Switch
                checked={settings.exactEnabled}
                onCheckedChange={(v) => update({ exactEnabled: v })}
                aria-label="Activar bono de puntos exactos"
              />
            </div>
            {settings.exactEnabled && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-300">Número a sacar (exacto)</Label>
                    <Input type="number" min={5} max={99} value={settings.exactTarget}
                      onChange={(e) => update({ exactTarget: Math.max(5, Math.min(99, Number(e.target.value) || 21)) })}
                      className="border-zinc-700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-300">Tipo de premio</Label>
                    <select value={settings.exactReward} aria-label="Tipo de premio del bono"
                      onChange={(e) => update({ exactReward: e.target.value as ExactReward })}
                      className="h-9 w-full rounded-md border border-zinc-700 bg-white px-2 text-sm text-black">
                      <option value="double">Duplicar puntos del pozo</option>
                      <option value="money">Ganar dinero al instante</option>
                      <option value="both">Ambos (duplicar + dinero)</option>
                    </select>
                  </div>
                </div>
                {(settings.exactReward === "money" || settings.exactReward === "both") && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-300">Dinero del bono (virtual, aparte del bote)</Label>
                    <div className="flex items-center gap-2">
                      <Coins className="size-4 text-red-400" />
                      <Input type="number" min={0} max={10000} value={settings.exactMoney}
                        onChange={(e) => update({ exactMoney: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) })}
                        className="border-zinc-700" />
                    </div>
                    <p className="text-xs text-zinc-500">Se acredita de inmediato a la cartera del jugador que lo logre.</p>
                  </div>
                )}
                <p className="rounded-md bg-zinc-950/60 px-2.5 py-1.5 text-xs text-emerald-200/90">
                  Ejemplo: con objetivo {settings.exactTarget}, si tu pozo llega a {settings.exactTarget}
                  {settings.exactReward !== "money" && <> se duplica a {settings.exactTarget * 2}</>}
                  {settings.exactReward !== "double" && settings.exactMoney > 0 && <> y ganas ${settings.exactMoney}</>} — puntos asegurados automáticamente.
                </p>
              </>
            )}
          </div>

          {/* ---------- Nivel oculto de la mesa (solo admin; jugadores no lo ven) ---------- */}
          {onDifficultyChange && (
            <div className="space-y-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              {/* Título clicable: minimiza / maximiza la sección */}
              <button
                type="button"
                aria-expanded={levelOpen}
                aria-controls="nivel-de-la-mesa"
                onClick={() => setLevelOpen((v) => !v)}
                className="flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded-md text-left transition-colors hover:bg-zinc-800/60"
              >
                <Label className="flex cursor-pointer items-center gap-1.5 text-zinc-200">
                  <EyeOff className="size-3.5 text-zinc-400" /> Nivel de la mesa
                </Label>
                <span className="flex items-center gap-2">
                  {!levelOpen && (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                      {LEVEL_NAME[level]} · 1: {pct[level]}%
                    </span>
                  )}
                  <ChevronDown className={`size-4 text-zinc-500 transition-transform ${levelOpen ? "" : "-rotate-90"}`} />
                </span>
              </button>
              {levelOpen && (
                <div id="nivel-de-la-mesa" className="space-y-2.5">
                  <select
                    value={level}
                    aria-label="Nivel de la mesa"
                    onChange={(e) => onDifficultyChange(e.target.value as Difficulty)}
                    className="h-9 w-full rounded-md border border-zinc-700 bg-white px-2 text-sm text-black"
                  >
                    <option value="facil">Fácil — dado limpio, como siempre</option>
                    <option value="medio">Medio — el 1 asoma más seguido</option>
                    <option value="dificil">Difícil — el 1 acecha a cada tiro</option>
                  </select>
                  {onOnesPctChange && (
                    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-2.5">
                      <p className="text-xs font-semibold text-zinc-300">Probabilidad de que salga 1 (editable)</p>
                      <div className="grid grid-cols-3 gap-2">
                        {("facil,medio,dificil" as const).split(",").map((lvl) => (
                          <div key={lvl} className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wide text-zinc-500">{LEVEL_NAME[lvl as Difficulty]}</Label>
                            <div className="relative">
                              <Input
                                type="number" min={0} max={90}
                                aria-label={`Porcentaje de 1 en ${LEVEL_NAME[lvl as Difficulty]}`}
                                value={pct[lvl as Difficulty]}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(90, Math.round(Number(e.target.value)) || 0));
                                  onOnesPctChange({ ...pct, [lvl]: v });
                                }}
                                className="h-8 border-zinc-700 pr-6 text-sm"
                              />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] leading-relaxed text-zinc-500">
                        Un dado normal saca 1 el <b className="text-zinc-400">16,7%</b> de las veces; el resto se reparte igual entre 2–6.
                        Con nivel <b className="text-zinc-400">{LEVEL_NAME[level]}</b> activo, cerca del <b className="text-red-300">{pct[level]}%</b> de tus tiros serán 1.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-zinc-500">
                    Privado: no aparece en la sala ni en las reglas que ven los demás. Se aplica desde la próxima tirada.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button className="bg-red-500 font-bold text-white hover:bg-red-400"
            onClick={() => { setOpen(false); onSave?.(); }}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
