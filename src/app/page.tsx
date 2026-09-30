"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dices } from "lucide-react";
import { initGameClient, useGame } from "@/lib/game/client";
import { HomeScreen } from "@/components/game/home-screen";
import { Lobby } from "@/components/game/lobby";
import { GameTable } from "@/components/game/game-table";
import { Results } from "@/components/game/results";

const emptySubscribe = () => () => {};

export default function Page() {
  // true solo en cliente (evita desajustes de hidratación)
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const ready = useGame((s) => s.ready);
  const room = useGame((s) => s.room);

  useEffect(() => {
    initGameClient();
  }, []);

  const phase = room?.phase;

  let screen: React.ReactNode;
  if (!mounted || !ready) {
    screen = <Splash />;
  } else if (!room) {
    screen = <HomeScreen />;
  } else if (phase === "lobby") {
    screen = <Lobby />;
  } else if (phase === "playing" || phase === "tiebreak") {
    screen = <GameTable />;
  } else {
    screen = <Results />;
  }

  return (
    <main className="app-bg flex min-h-screen flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={!mounted || !ready ? "splash" : !room ? "home" : phase ?? "home"}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.28 }}
          className="flex w-full flex-1 flex-col"
        >
          {screen}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

function Splash() {
  return (
    <div className="grid flex-1 place-items-center py-24">
      <div className="flex flex-col items-center gap-4">
        <div className="grid size-16 place-items-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/30">
          <Dices className="size-9 animate-bounce text-red-400" />
        </div>
        <p className="text-sm font-semibold text-zinc-400">Conectando a la mesa…</p>
      </div>
    </div>
  );
}
