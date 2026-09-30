"use client";

import { useEffect, useRef, useState } from "react";
import { Send, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGame, sendChat } from "@/lib/game/client";
import { cn } from "@/lib/utils";

export function ChatPanel({ className }: { className?: string }) {
  const room = useGame((s) => s.room);
  const identity = useGame((s) => s.identity);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [room?.chat?.length]);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    const res = await sendChat(t);
    if (!res.ok) return;
  };

  return (
    <div className={cn("flex min-h-0 flex-col rounded-xl border border-zinc-800 bg-zinc-900/60", className)}>
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400">
        <MessageSquare className="size-3.5" /> CHAT DE LA SALA
      </div>
      <div ref={scrollRef} className="nice-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2 text-sm">
        {(room?.chat ?? []).length === 0 && (
          <p className="py-6 text-center text-xs text-zinc-600">Sin mensajes todavía. ¡Rompe el hielo!</p>
        )}
        {(room?.chat ?? []).map((m) => (
          <div key={m.id} className={cn("flex flex-col", m.playerId === identity?.playerId && "items-end")}>
            <span className="text-[10px] text-zinc-600">
              {m.playerId === identity?.playerId ? "Tú" : m.from} · {new Date(m.ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span
              className={cn(
                "max-w-[85%] rounded-lg px-2.5 py-1 text-[13px] leading-snug",
                m.playerId === identity?.playerId
                  ? "bg-sky-400/15 text-sky-100"
                  : "bg-zinc-800/80 text-zinc-200"
              )}
            >
              {m.text}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-zinc-800 p-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Escribe un mensaje…"
          maxLength={200}
          className="h-9 border-zinc-700 text-sm"
        />
        <Button size="icon" className="size-9 shrink-0 bg-red-500 text-white hover:bg-red-400" onClick={submit} aria-label="Enviar mensaje">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
