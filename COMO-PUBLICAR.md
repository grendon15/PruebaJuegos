# 🎲 Cómo publicar Dadito GRATIS (sin tarjeta de crédito)

Dadito necesita un **servidor de juego vivo** (WebSockets de Socket.io que lanza el dado, arbitra los turnos y guarda las fichas en SQLite). Por eso **Vercel, Firebase Hosting y Railway** no sirven aquí: los dos primeros solo alojan páginas estáticas, y Railway ya no tiene plan gratis.

Tienes **dos alternativas 100% gratis y sin tarjeta**. Todo lo necesario ya viene en `dadito-gratis.zip`:

| Archivo | Qué hace |
|---|---|
| `Dockerfile` | Empaqueta todo: web + servidor del juego + proxy, en una sola imagen |
| `README.md` | Metadatos para Hugging Face Spaces (Opción B) |
| `deploy/Caddyfile.prod` | Enruta `/socket.io` al servidor del juego y el resto a la web |
| `deploy/start.sh` | Arranca los 3 procesos y auto-repara si uno muere |
| `deploy/render.yaml` | Atajo de 1 clic para Render (Opción A) |

> ⚠️ **Honestidad primero**: en los planes gratis, el servicio se "duerme" cuando nadie juega y al dormirse/reiniciarse **el saldo guardado se perdería** (la partida en curso nunca se corta: mientras haya gente activa, todo funciona). **Solución: el Paso 0 de abajo** — una base de datos gratis externa que hace que el saldo y las salas sobrevivan a TODO, incluso en plan gratis.

---

## Paso 0 (recomendado) — Base de datos gratis en Neon para que el saldo NUNCA se pierda

Neon te da una base de datos Postgres gratis (sin tarjeta) que vive en la nube: aunque Render o Hugging Face se duerman o se reinicien, **el saldo, las salas y el historial renacen solos** al despertar.

1. Entra a **neon.com** (o neon.tech) → **Sign Up** con Google o GitHub.
2. ✅ **Proyecto ya creado**: `withered-fog-32557056` (branch `production`). Si lo tuyo es otro, crea uno nuevo con nombre `dadito`.
3. En el panel copia la **Connection string** (la que empieza por `postgresql://...`) de la branch **production**. Si ofrece dos versiones, usa la que dice **"pooled connection"**.
4. Pégala como variable de entorno en tu plataforma:
   - **Render**: tu servicio → **Environment** → **Add Environment Variable** → nombre `GAME_DB_URL`, valor = la cadena de Neon → **Save** (redespliega solo).
   - **Hugging Face**: tu Space → **Settings** → **Variables and secrets** → **New secret** → nombre `GAME_DB_URL`, valor = la cadena de Neon → Guardar y **Factory reboot**.
   - 💡 También acepta el nombre `DATABASE_URL` (la convención de Neon): si solo existe esa variable, el contenedor la usa automáticamente para el juego.
5. Listo: las tablas se crean solas en el primer arranque. Verás en los logs: `🗄️ Base de datos externa conectada`.

> 💡 Si no configuras `GAME_DB_URL` (ni `DATABASE_URL`), el juego funciona igual pero solo con la base local del contenedor (el saldo se reinicia al dormirse). Alternativas a Neon: Supabase o Turso (mismos pasos).

## Opción A — Render.com (gratis, sin tarjeta, usa GitHub)

### Paso 1 — Sube el proyecto a GitHub (5 minutos)

1. Crea cuenta gratis en **github.com** (si no tienes).
2. Clic en el **+** (arriba a la derecha) → **New repository**.
3. Nombre: `dadito` → puede ser **Private** → **Create repository**.
4. En la página que aparece, clic en **"uploading an existing file"**.
5. Abre la carpeta descomprimida, selecciona **TODO su contenido** (archivos y carpetas) y arrástralo al navegador.
   ⚠️ Arrastra lo que está **DENTRO** de la carpeta, no la carpeta contenedora.
6. Espera la subida (1–3 min) → **Commit changes**.

### Paso 2 — Despliega en Render (3 clics)

1. Entra a **render.com** → **Login with GitHub** (autoriza el acceso).
2. Clic en **New +** → **Blueprint** → elige tu repositorio `dadito` → **Apply**.
3. Espera el build (~5–10 min la primera vez). Al terminar tendrás tu URL:
   🎉 `https://dadito-xxxx.onrender.com`

### Cómo se comporta el plan gratis de Render

- Se duerme tras **~15 minutos sin visitas**; la primera persona que entre tarda ~1 minuto en "despertarlo", el resto entra instantáneo.
- Al dormirse o redesplegar se reinicia el saldo (ver nota honesta arriba).

---

## Opción B — Hugging Face Spaces (gratis, sin tarjeta, SIN GitHub)

Aquí ni siquiera necesitas GitHub: subes los archivos directo a la plataforma.

1. Entra a **huggingface.co** → **Sign Up** (solo email de verificación).
2. Clic en tu foto (arriba a la derecha) → **New Space**.
3. Rellena así:
   - **Space name**: `dadito`
   - **SDK**: **Docker** → plantilla **Blank**
   - **Visibility**: **Public**
4. **Create Space** → ve a la pestaña **Files** → **Add file** → **Upload files**.
5. Abre la carpeta descomprimida y arrastra **todo su contenido** (los archivos y las carpetas `src`, `public`, `deploy`, `mini-services` juntos). El `README.md` ya trae la configuración del Space (`sdk: docker`, puerto `8080`).
6. Botón **Commit changes** → el Space se compila solo (~5–10 min, pestaña "Building").
7. 🎉 Tu URL: `https://TU-USUARIO-dadito.hf.space` (y con HTTPS incluido).

### Cómo se comporta el plan gratis de Hugging Face

- Se duerme tras **48 horas sin visitas** (mucho más generoso que Render).
- Al reiniciarse el Space, el saldo vuelve a $1.000 (igual que Render).

> 💡 Si el navegador se resiste a arrastrar carpetas en Hugging Face, usa la **Opción A**: el subidor de GitHub sí acepta carpetas arrastradas sin problema.

---

## ¿Cuál elijo?

| | Render (A) | Hugging Face (B) |
|---|---|---|
| ¿Necesita GitHub? | Sí | **No** |
| Se despierta tras... | 15 min sin visitas | **48 h sin visitas** |
| ¿Pide tarjeta? | No | No |
| Esfuerzo | 3 clics si ya subiste a GitHub | Subida directa de archivos |

**Recomendación**: si ya creaste el repo de GitHub para Railway, usa **Render** (te toma 3 clics). Si prefieres no usar GitHub, usa **Hugging Face**.

## ¿Y para jugar?

- Comparte tu URL por WhatsApp: quien entra escribe su nombre y **crea sala** o se une con el **código de 4 letras**.
- 1 navegador = 1 jugador (cada amigo desde su propio celular/PC).
- Es una **PWA**: en el celular, menú del navegador → **"Añadir a pantalla de inicio"**.
- El dinero es 100% virtual: empiezas con $1.000 y el botón **Recargar +$1.000** es gratis.

## ¿Cómo actualizo el juego más adelante?

- **Render**: vuelve a subir los archivos cambiados a GitHub → Render redespliega solo.
- **Hugging Face**: pestaña Files → Add file → Upload files → sube los archivos cambiados → Commit.

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| Render me pide tarjeta | Usa la Opción B (Hugging Face) |
| El build falla | Vuelve a "Deploy"/"Commit" una vez; si persiste, mándame captura |
| La página abre pero no conecta | Espera 1 minuto (los 3 procesos levantan en escalera); verifica `https://` |
| El saldo se reinició | Configura `GAME_DB_URL` con tu base gratis de Neon (Paso 0) |
| Cambiar el saldo inicial de $1.000 | `mini-services/game-service/index.ts`, constante `START_BALANCE = 1000` (línea 24) |
| HF: no puedo subir carpetas | Usa la Opción A (GitHub sí acepta carpetas) |

## Opción avanzada — VPS propio

Si algún día tienes un VPS con Docker: `docker build -t dadito . && docker run -d -p 80:8080 -v dadito-data:/app/mini-services/game-service/data dadito` — el volumen guarda el saldo para siempre.

---

**Notas**: HTTPS incluido gratis en ambas plataformas (necesario para instalar la PWA). El dado se lanza con aleatoriedad criptográfica en el servidor: nadie hace trampas desde el navegador. El dinero es virtual, no hay pagos reales.
