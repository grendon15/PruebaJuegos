# ============================================================
#  DADITO 🎲 — Imagen de producción (todo en uno)
#  Next.js standalone (3000) + Game-service Socket.io (3003)
#  + Caddy al frente en $PORT (enruta /socket.io → game-service)
# ============================================================

# ---------- Etapa 1: build del frontend ----------
FROM node:22-bookworm-slim AS build
# Bun: instala dependencias y corre el game-service (usa bun:sqlite)
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Dependencias del game-service (mini-proyecto aparte)
WORKDIR /app/mini-services/game-service
RUN bun install --frozen-lockfile

# ---------- Etapa 2: binario de Caddy ----------
FROM caddy:2 AS caddybin

# ---------- Etapa 3: runtime (liviano) ----------
FROM node:22-bookworm-slim
# Usuario no-root (requerido por Hugging Face Spaces, buena práctica en general)
RUN useradd -m -u 1000 user
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
COPY --from=caddybin /usr/bin/caddy /usr/local/bin/caddy
WORKDIR /app

# Solo lo necesario para correr:
#  - .next/standalone → servidor Next.js compilado (incluye public/ y static)
#  - mini-services    → servidor del juego con sus dependencias
#  - deploy           → start.sh y Caddyfile.prod
COPY --from=build /app/.next/standalone ./.next/standalone
COPY --from=build /app/mini-services ./mini-services
COPY --from=build /app/deploy ./deploy

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    SOCKET_PATH=/socket.io \
    PORT=8080

RUN chown -R user:user /app
USER user

EXPOSE 8080

CMD ["bash", "deploy/start.sh"]
