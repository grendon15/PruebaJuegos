"use client";

import { useEffect, useRef } from "react";
import type { DiceColors } from "../lib/game/types";

/** Mapeo de rotación para mostrar cada cara del dado al frente. */
const SHOW: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: -90, y: 0 },
  2: { x: 90, y: 0 },
};

/** Colocación de caras del cubo (opuestas suman 7). */
const FACES: { v: number; t: string }[] = [
  { v: 1, t: "translateZ(var(--h))" },
  { v: 6, t: "rotateY(180deg) translateZ(var(--h))" },
  { v: 3, t: "rotateY(90deg) translateZ(var(--h))" },
  { v: 4, t: "rotateY(-90deg) translateZ(var(--h))" },
  { v: 5, t: "rotateX(90deg) translateZ(var(--h))" },
  { v: 2, t: "rotateX(-90deg) translateZ(var(--h))" },
];

const PIPS: Record<number, number[]> = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

/** Duración del lanzamiento (tumbo + giro). LARGO a propósito. */
const ROLL_MS = 3200;
const ROLL_EASE = "cubic-bezier(.22,.72,.24,1)";
/** Pose de reposo del dado (sin valor). */
const IDLE_POSE = "rotateX(-16deg) rotateY(22deg)";

function poseFor(value: number | null, spinKey: number): string {
  if (!value || value < 1) return IDLE_POSE;
  const base = SHOW[value] ?? SHOW[1];
  const k = Math.max(1, spinKey);
  // 4 vueltas en Y + 1 en X por tirada → giro largo que frena solo.
  return `rotateX(${base.x + k * 360}deg) rotateY(${base.y + k * 1440}deg)`;
}

interface Dice3DProps {
  value: number | null;
  /**
   * Se incrementa en cada lanzamiento (contador monótono).
   * Mientras crezca, el dado gira siempre hacia adelante.
   */
  spinKey?: number;
  size?: number;
  clickable?: boolean;
  onClick?: () => void;
  /** Colores personalizados del dado. */
  colors?: DiceColors;
}

/** Estilos CSS derivados de los colores elegidos (fallback: dado clásico). */
function diceVars(c?: DiceColors): Record<string, string> {
  if (!c) return {};
  return {
    "--dice-face-a": c.face,
    "--dice-face-b": c.face2 || c.face,
    "--dice-face-c": c.face2 || c.face,
    "--dice-pip-a": c.pip,
    "--dice-pip-b": c.pip,
  };
}

export function Dice3D({ value, spinKey = 0, size = 112, clickable = false, onClick, colors }: Dice3DProps) {
  const idle = !value;
  const hopRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  // Pose final de la tirada anterior: punto de partida del siguiente giro.
  const prevPose = useRef<string>(IDLE_POSE);

  // MECIDO en reposo (solo cuando el dado no tiene valor): vive en el wrapper,
  // así nunca interfiere con la rotación del cubo.
  useEffect(() => {
    const hop = hopRef.current;
    if (!idle || !hop) return;
    const wobble = hop.animate(
      [
        { transform: "translateY(0) rotate(0deg)" },
        { transform: "translateY(-2.6%) rotate(-1.7deg)" },
        { transform: "translateY(0) rotate(0deg)" },
        { transform: "translateY(-1.4%) rotate(1.1deg)" },
        { transform: "translateY(0) rotate(0deg)" },
      ],
      { duration: 3600, iterations: Infinity, easing: "ease-in-out" }
    );
    return () => { wobble.cancel(); };
  }, [idle]);

  // LANZAMIENTO (tumbo + giro, TODO por WAAPI): arranca SIEMPRE, incluida la
  // primera tirada, porque interpolamos entre poses explícitas — sin depender
  // de transiciones CSS ni del estado previo del navegador.
  useEffect(() => {
    const hop = hopRef.current;
    if (!spinKey || !hop) return;

    // Corta el mecido en reposo para que el salto domine desde el frame 1.
    hop.getAnimations().forEach((a) => a.cancel());

    const to = poseFor(value, spinKey);
    const from = prevPose.current || IDLE_POSE;

    // Tumbo: rebotes grandes que se frenan poco a poco.
    const tumble = hop.animate(
      [
        { transform: "translateY(0) scale(1) rotate(0deg)", offset: 0 },
        { transform: "translateY(-60%) scale(1.17) rotate(-28deg)", offset: 0.07 },
        { transform: "translateY(0) scale(0.9) rotate(23deg)", offset: 0.15 },
        { transform: "translateY(-44%) scale(1.13) rotate(-19deg)", offset: 0.24 },
        { transform: "translateY(0) scale(0.94) rotate(15deg)", offset: 0.33 },
        { transform: "translateY(-30%) scale(1.08) rotate(-11deg)", offset: 0.42 },
        { transform: "translateY(0) scale(0.97) rotate(8deg)", offset: 0.51 },
        { transform: "translateY(-20%) scale(1.05) rotate(-5.5deg)", offset: 0.6 },
        { transform: "translateY(0) scale(1) rotate(3.5deg)", offset: 0.68 },
        { transform: "translateY(-12%) scale(1.03) rotate(-2.5deg)", offset: 0.76 },
        { transform: "translateY(0) scale(1) rotate(1.5deg)", offset: 0.83 },
        { transform: "translateY(-6%) scale(1.01) rotate(-1deg)", offset: 0.9 },
        { transform: "translateY(0) scale(1) rotate(0.5deg)", offset: 0.96 },
        { transform: "translateY(-2%) scale(1) rotate(0deg)", offset: 0.99 },
        { transform: "translateY(0) scale(1) rotate(0deg)", offset: 1 },
      ],
      { duration: ROLL_MS, easing: ROLL_EASE }
    );

    // Giro del cubo: de la pose anterior a la nueva, SIEMPRE interpola.
    let spin: Animation | null = null;
    const cube = cubeRef.current;
    if (cube) {
      spin = cube.animate([{ transform: from }, { transform: to }], { duration: ROLL_MS, easing: ROLL_EASE });
      spin.onfinish = () => {
        prevPose.current = to;
        // El estilo inline ya apunta a la pose final: al cancelar no hay salto.
        spin?.cancel();
      };
    }

    return () => {
      tumble.cancel();
      if (spin) {
        prevPose.current = to; // si se corta a medias, la próxima sale de la pose destino
        spin.cancel();
      }
    };
    // `value` llega siempre junto a spinKey (mismo evento); solo spinKey dispara.
  }, [spinKey]);

  // El estilo inline SIEMPRE refleja la pose final (el WAAPI la override en vuelo).
  const transform = poseFor(value, spinKey);

  return (
    <div
      className="dice-scene select-none"
      style={{
        ["--dice" as string]: `${size}px`,
        ["--h" as string]: `${size / 2}px`,
        ...diceVars(colors),
      }}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      aria-label={clickable ? "Lanzar dado" : `Dado: ${value ?? "-"}`}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) onClick?.();
      }}
    >
      {/* Resplandor */}
      <div
        className="pointer-events-none absolute rounded-full blur-2xl transition-opacity duration-500"
        style={{
          width: size * 1.1,
          height: size * 1.1,
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          background: "rgba(239,68,68,0.24)",
          opacity: idle ? 0.35 : 0.9,
        }}
      />
      <div
        ref={hopRef}
        style={{
          width: "var(--dice)",
          height: "var(--dice)",
          transformStyle: "preserve-3d",
        }}
      >
        <div ref={cubeRef} className="dice-cube" style={{ transform }}>
          {FACES.map((f) => (
            <div key={f.v} className="dice-face" style={{ transform: f.t }}>
              {Array.from({ length: 9 }, (_, i) => i + 1).map((cell) => (
                <span key={cell} className="grid place-items-center">
                  {PIPS[value ?? 1]?.includes(cell) ? <span className="dice-pip" /> : null}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
