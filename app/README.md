# app

Aplikacja SvelteKit (adapter-node, SQLite przez Drizzle). Opis projektu, szybki start i licencja: [../README.md](../README.md).
SvelteKit app (adapter-node, SQLite via Drizzle). Project overview, quick start and license: [../README.md](../README.md).

| Polecenie / command | |
|---|---|
| `ADMIN_DEV=1 npm run dev` | development, panel bez Tailscale / panel without Tailscale |
| `npm run build && npm start` | produkcja bez Dockera (`node server`, czyta `.env`) / production without Docker |
| `npm test`, `npm run check`, `npm run test:e2e` | testy / tests |
| `docker compose up -d --build` | Docker, ustawienia w `.env` (wzór `.env.example`) |

- `server/` – start produkcyjny: handler adapter-node plus `TRUSTED_ORIGINS` czytane przy starcie / production entry with runtime `TRUSTED_ORIGINS`.
- `kiosk/` – instalacja ekranu na Debianie / kiosk install on Debian ([kiosk/README.md](kiosk/README.md)).
