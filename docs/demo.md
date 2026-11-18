# Tryb demo, dane przykładowe i zrzuty ekranu

[English below](#demo-mode-example-data-and-screenshots)

## Tryb demo (`DEMO=1`)

Aplikacja startuje z fikcyjną rodziną i całym tygodniem danych – do pokazania, testów na żywo albo publicznego demo.

```bash
cd app
DEMO=1 DEMO_LANG=pl npm start          # albo w .env: DEMO=1, potem docker compose up -d
```

| zmienna | znaczenie |
| --- | --- |
| `DEMO=1` | włącza tryb demo |
| `DEMO_LANG` | `pl` (domyślnie) – rodzina z Poznania; `de` – rodzina z Hanoweru; `en` – rodzina z Hanoweru po angielsku |
| `DEMO_THEME` | motyw (`papier` domyślnie, `noc`, `kontrast`, `drewno`, `fiord`) |
| `DEMO_RESET` | godzina codziennego resetu (`03:45` domyślnie, czas regionu) albo `off` – tylko przy starcie |

**Własna baza.** Demo zapisuje do `data/demo/kalendarz-demo-<język>.db` i `data/demo/media-<język>/` (obok katalogu
zwykłej bazy) – prawdziwej bazy, zdjęć ani kopii nie dotyka. Kopie zapasowe w demo są wyłączone.

**Zapis działa, ale nie zostaje.** Wszystko można klikać (odhaczać zadania i leki, dodawać wydarzenia, przełączać światło
w Home Assistancie), a baza wraca do stanu demo przy każdym starcie i codziennie o `DEMO_RESET`. Dane liczone są
względem „dziś”, więc demo zawsze pokazuje bieżący tydzień.

**Co jest w demo** (rodzina: tata, mama, córka 10 lat, syn 6 lat, babcia; imiona, przystanki i wydarzenia są wymyślone):

- wszystkie moduły włączone, motyw i układ jak po kreatorze, PIN kiosku `1234` (przytrzymaj zegar 2 s),
- ok. 20 wydarzeń od wczoraj do przyszłego tygodnia (basen, angielski, delegacja na dwa dni, wizyta u lekarza, przyjęcie
  urodzinowe), urodziny córki za 3 dni i mamy za 11 dni; w Polsce imieniny (babcia obchodzi imieniny z dzisiejszej
  listy, gdy jest na niej pasujące imię żeńskie),
- kartki, zakupy, zadania domowe (jedno zaległe), zapasy w spiżarni i zamrażarce, węże z historią karmienia,
- plan obiadów i kolacji na tydzień z przepisami, zadania dzieci z punktami i prośbą o nagrodę czekającą na rodzica,
- odliczania, leki (wczoraj wzięte, dziś do bieżącej godziny), opieka „co X dni” (jedna pozycja po terminie),
- wywozy śmieci z gotowego zestawu pojemników kraju (PL albo DE; jutro bio – dziś wieczorem „wystaw”),
- pogoda, ferie, odjazdy i Home Assistant z **wbudowanych atrap** (`app/src/lib/server/demo/fetch.ts`) – bez sieci;
  odjazdy co kilka minut względem „teraz”, Home Assistant przełącza stan w pamięci,
- wygaszacz z pięcioma krajobrazami rysowanymi w kodzie (gradienty i sylwetki, bez zdjęć ludzi i cudzych plików).

**Bezpieczne publiczne demo.** W trybie demo nic nie wychodzi do sieci: każdy adres poza atrapami dostaje 503 (także adresy
wpisane w panelu, np. iCal śmieci). W panelu tylko do podglądu (z informacją) są: Google, Bring!, Home Assistant,
kopie zapasowe i miejsca WebDAV, przywracanie, Dostęp (hasło, PIN, token) i ponowny kreator; serwer odrzuca te akcje
także z pominięciem formularza (403), a logowanie Google i wgrywanie kopii są zamknięte. Do wystawienia demo w internecie
potrzebny jest jeszcze dostęp do panelu – np. `AUTH_MODE=password` z hasłem podanym na stronie demo albo proxy z logowaniem.

## Dane przykładowe w zwykłej instalacji

Panel → Przegląd → **Dane przykładowe** → „Wczytaj dane przykładowe” dopisuje tę samą rodzinę (w bieżącym języku) do
istniejących danych: domowników (zajęty identyfikator dostaje nowy, np. `babcia-2`), wydarzenia lokalne, kartki, zakupy,
zadania, przepisy i plan posiłków, zadania dzieci, odliczania, leki, opiekę i zapasy, a wywozy śmieci tylko wtedy, gdy nie
ma innego źródła terminów. Niczego nie usuwa i nie zmienia ustawień (region, język, motyw, moduły, Home Assistant,
odjazdy, zdjęcia). Moduły wyłączone pokażą swoje dane po włączeniu. Drugi raz przycisk się nie pojawia. Przykład usuwa się
ręcznie – najprościej domowników w sekcji Domownicy. W kreatorze pierwszego uruchomienia jest osobny wybór „z przykładem”.

## Zrzuty ekranu (`npm run screenshots`)

```bash
cd app
npx playwright install chromium   # raz
npm run screenshots
```

Skrypt (`app/scripts/screenshots.mjs`) buduje aplikację, uruchamia trzy serwery na danych demo (PL – Papier, DE – Noc,
świeża instalacja dla kreatora) ze stałym zegarem (`app/scripts/fake-clock.mjs`: czwartek 12.11.2026, 15:40; kiosk
dodatkowo z `?at=`) i zapisuje WebP do `docs/screenshots/` (kodowanie w Chromium, bez dodatkowych zależności). Zrzuty
są więc takie same niezależnie od dnia. Opcje: `SHOTS_ONLY=kiosk-month-pl,admin-meals-pl`, `SHOTS_QUALITY=0.9`,
`SHOTS_PNG=katalog` (surowe PNG do przeglądu), `SHOTS_PORT=4600`. Lista: [screenshots/README.md](screenshots/README.md).

Ten sam skrypt robi małe zrzuty do przewodników „Jak to ustawić?” w panelu: `app/static/guides/<nazwa>-<pl|de|en>.webp`
(czwarty serwer – demo po angielsku). Tylko one: `SHOTS_ONLY=guides`. Test `src/lib/guides/guides.test.ts` sprawdza, że
każdy zrzut użyty w kroku istnieje we wszystkich językach.

---

# Demo mode, example data and screenshots

## Demo mode (`DEMO=1`)

The app starts with a made-up family and a whole week of data – for showing it off, live testing or a public demo.

```bash
cd app
DEMO=1 DEMO_LANG=en npm start          # or in .env: DEMO=1, then docker compose up -d
```

| variable | meaning |
| --- | --- |
| `DEMO=1` | turns demo mode on |
| `DEMO_LANG` | `pl` (default) – a family in Poznań; `de` – a family in Hannover; `en` – a family in Hannover, in English |
| `DEMO_THEME` | theme (`papier` default, `noc`, `kontrast`, `drewno`, `fiord`) |
| `DEMO_RESET` | daily reset time (`03:45` by default, region time) or `off` – reset on start only |

**Separate database.** The demo writes to `data/demo/kalendarz-demo-<lang>.db` and `data/demo/media-<lang>/` (next to the
normal data folder) and never touches your real database, photos or backups. Backups are off in demo mode.

**Writes work but do not stay.** Everything is clickable (tick off chores and medication, add events, switch a Home
Assistant light), and the database goes back to the demo state on every start and daily at `DEMO_RESET`. All dates are
relative to today, so the demo always shows the current week.

**What is in it** (dad, mum, a 10-year-old daughter, a 6-year-old son, grandma; names, stops and events are made up):

- all modules on, PIN `1234` (hold the clock for 2 s),
- about 20 events from yesterday to next week, the daughter's birthday in 3 days and mum's in 11 days; in Poland name days,
- notes, shopping, chores (one overdue), pantry and freezer, snakes with a feeding history,
- a week of lunches and dinners with recipes, kids' chores with points and a reward request waiting for a parent,
- countdowns, medication (yesterday taken, today up to the current hour), care items (one overdue),
- waste collection from the country's bin preset (PL or DE),
- weather, school holidays, departures and Home Assistant from **built-in fakes** (`app/src/lib/server/demo/fetch.ts`) –
  no network; departures every few minutes from now, Home Assistant toggles state in memory,
- a screensaver with five landscapes drawn in code (gradients and silhouettes – no photos of people, no third-party files).

**Safe for a public demo.** Nothing leaves the machine in demo mode: every address other than the fakes gets a 503 (including
addresses typed into the panel, e.g. a waste iCal). These panel parts are view-only with a notice: Google, Bring!, Home
Assistant, backups and WebDAV targets, restore, Access (password, PIN, token) and running the wizard again; the server
rejects these actions even without the form (403), Google sign-in and backup upload are closed. To put a demo on the
internet you still need access to the panel – e.g. `AUTH_MODE=password` with the password shown on the demo page, or a proxy.

## Example data in a normal install

Panel → Overview → **Example data** → "Load example data" adds the same family (in the current language) to your existing
data: family members (a taken id gets a new one, e.g. `babcia-2`), local events, notes, shopping, chores, recipes and a meal
plan, kids' chores, countdowns, medication, care and pantry; waste collection only when there is no other source. It deletes
nothing and changes no settings (region, language, theme, modules, Home Assistant, departures, photos). Disabled modules
show their data once enabled. The button disappears after one use. Remove the example by hand – easiest by deleting the
members in Family. The first-run wizard has its own "with example" choice.

## Screenshots (`npm run screenshots`)

The script (`app/scripts/screenshots.mjs`) builds the app, starts three servers on demo data (PL – Papier, DE – Noc, a fresh
install for the wizard) with a fixed clock (`app/scripts/fake-clock.mjs`: Thursday 12 Nov 2026, 15:40; the kiosk also with
`?at=`) and writes WebP files to `docs/screenshots/` (encoded by Chromium, no extra dependencies), so the screenshots are the
same whatever day you run it. Options: `SHOTS_ONLY=…`, `SHOTS_QUALITY=0.9`, `SHOTS_PNG=dir`, `SHOTS_PORT=4600`.
List: [screenshots/README.md](screenshots/README.md).
The script also makes small crops for the in-panel "How do I set this up?" guides: `app/static/guides/<name>-<pl|de|en>.webp`
(a fourth server runs the English demo); only those: `SHOTS_ONLY=guides`.
