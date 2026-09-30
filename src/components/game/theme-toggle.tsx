"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame, setTheme } from "@/lib/game/client";

/** Botón para alternar entre modo claro (fondo blanco) y modo nocturno. */
export function ThemeToggle() {
  const theme = useGame((s) => s.theme);
  const dark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Activar modo claro" : "Activar modo nocturno"}
      title={dark ? "Modo claro" : "Modo nocturno"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun className="size-4 text-sky-300" /> : <Moon className="size-4" />}
    </Button>
  );
}
