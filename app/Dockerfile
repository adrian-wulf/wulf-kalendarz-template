# Budowanie
FROM node:24-slim AS build
# better-sqlite3 może wymagać kompilacji modułu natywnego
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Uruchamianie
FROM node:24-slim
WORKDIR /app
# Godziny w aplikacji liczone są w strefie z ustawień regionu (panel → Region), niezależnie od TZ.
# TZ kontenera wpływa tylko na znaczniki czasu w logach – np. --build-arg TZ=Europe/Warsaw.
ARG TZ=Europe/Berlin
# HOST=0.0.0.0: w kontenerze trzeba słuchać na wszystkich interfejsach (compose publikuje port tylko na 127.0.0.1 hosta).
# LOCAL_NETS: domyślne TRUSTED_PROXIES i KIOSK_IPS w kontenerze – localhost i sieci Dockera (brama, przez którą
# przychodzi `tailscale serve` i kiosk z hosta). Poza Dockerem domyślnie tylko localhost.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    LOCAL_NETS=127.0.0.0/8,::1,172.16.0.0/12 \
    DATABASE_PATH=/data/kalendarz.db \
    MIGRATIONS_PATH=/app/drizzle \
    TZ=${TZ}
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/server ./server
COPY package.json ./
VOLUME /data
EXPOSE 3000
# /healthz: publiczny ping bazy (bez logowania, działa też z AUTH_MODE=proxy i KIOSK_LOCAL=0); port z PORT.
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server"]
