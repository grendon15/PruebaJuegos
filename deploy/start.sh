#!/bin/bash
# ============================================================
#  DADITO 🎲 — arranque de los 3 procesos del contenedor
#  1) game-service (Socket.io, puerto 3003)
#  2) Next.js standalone (puerto 3000)
#  3) Caddy al frente en $PORT
#  Si CUALQUIER proceso muere, el contenedor termina y la
#  plataforma lo reinicia automáticamente (auto-reparación).
# ============================================================
set -e

cd "$(dirname "$0")/.."

# Neon: si la plataforma define DATABASE_URL (convención de Neon) y no hay
# GAME_DB_URL dedicada, se usa esta como base externa del juego.
if [ -z "$GAME_DB_URL" ] && [ -n "$DATABASE_URL" ]; then
  export GAME_DB_URL="$DATABASE_URL"
fi

# 1) Game service (Socket.io)
cd mini-services/game-service
PORT=3003 SOCKET_PATH=/socket.io bun index.ts &
cd ../..

# 2) Frontend Next.js (standalone)
PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production node .next/standalone/server.js &

# 3) Caddy en primer plano; wait -n detecta la muerte de cualquiera
caddy run --config deploy/Caddyfile.prod --adapter caddyfile &
wait -n
echo ">>> Un proceso de Dadito murió; el contenedor se reinicia..." >&2
exit 1
