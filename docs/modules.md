# Moduły

Kalendarz składa się z rdzenia (kalendarz, domownicy, region, wygląd) i modułów, które można
włączać, wyłączać i ustawiać w kolejności w panelu (`/admin` → Moduły). Wyłączony moduł:

- znika z kiosku (przycisk obok nawigacji tygodnia, kafelek na dole), z telefonu (zakładka) i z menu panelu,
- jego strony i `/api/...` odpowiadają 404 (sprawdza to `src/hooks.server.ts` na podstawie `routes` z manifestu),
- jego źródła przestają się synchronizować, a dashboard nie liczy jego danych,
- jego dane zostają w bazie – po ponownym włączeniu wszystko wraca.

Moduły w rejestrze: `calendar` (rdzeń, zawsze włączony), `weather`, `holidays`, `waste`, `shopping`,
`notes`, `chores`, `pantry` (wymaga `shopping`), `snakes`, `playground`, `birthdays` (urodziny domowników
i imieniny w PL), `screensaver` (wygaszacz ze zdjęciami), `meals` (wymaga `shopping`), `kids`, `countdown`,
`meds`, `care`, `transit`, `homeassistant`. Wszystkie od `screensaver` w dół są w nowej instalacji domyślnie
wyłączone (opis niżej).

## Gdzie co leży

```
app/src/lib/modules/
  index.ts              rejestr (MODULES), stan z ustawień, zależności, kolejność, trasy 404
  types.ts              typ manifestu
  data.ts               ModuleData – typy danych modułów w Dashboard.modules
  settings.ts           schemat ustawień: wartości domyślne i walidacja
  server-types.ts       typ części serwerowej (seed, sources, dashboard, admin)
  registry.server.ts    SERVERS – część serwerowa każdego modułu, seed, źródła
  <id>/index.ts         manifest (czyta go też przeglądarka – bez importów serwerowych)
  <id>/hooks.server.ts  część serwerowa
  <id>/Admin.svelte     widok sekcji panelu (opcjonalnie)
```

Ustawienia w bazie: `settings.modules = { [id]: { enabled, order, config } }`. Brak wpisu = wartości
z manifestu (`defaultEnabled`, kolejność z rejestru, domyślne z `settings`). Schemat bazy jest wspólny
– moduł nie ma własnych migracji; nowe tabele dodaje się w `app/src/lib/server/db/schema.ts` jak dotąd.

## Manifest (`<id>/index.ts`)

| pole | znaczenie |
| --- | --- |
| `id`, `name`, `nameKey`, `icon`, `description` | identyfikator, nazwa (getter z `t()`), klucz nazwy w słowniku `lib/i18n`, ikona, opis w panelu (getter) |
| `core` | rdzeń – zawsze włączony |
| `defaultEnabled` | stan bez wpisu w ustawieniach |
| `requires` | moduły, bez których ten nie działa (panel ostrzega, moduł jest wtedy nieaktywny) |
| `routes` | prefiksy adresów modułu: strony i API (404 po wyłączeniu); `/admin/<slug>` dochodzi sam |
| `sources` | nazwy źródeł synchronizacji z etykietą do tabeli statusu |
| `kiosk.launcher` | przycisk na kiosku: `href`, `label`, `reload`, `badge(data)` |
| `kiosk.tile` | kafelek na dole: `kind` (`shopping`, `note`, `chore`) i `weight` (szerokość) |
| `phone` | zakładka na telefonie: `/telefon/<path>` |
| `admin` | sekcja panelu: `/admin/<slug>` |
| `settings` | schemat ustawień – panel sam robi z niego formularz |

## Część serwerowa (`<id>/hooks.server.ts`)

Wszystko opcjonalne:

- `seed(db)` – dane startowe; rejestr woła go raz na instalację (lista w `settings.seededModules`), także gdy moduł zostanie włączony później,
- `sources(db)` – źródła do pętli synchronizacji (tylko gdy moduł jest aktywny),
- `dashboard(ctx)` – wkład do ekranu: `data` (trafia do `Dashboard.modules[id]`), `events`, `tasks`, `status`,
- `admin` – `load(db, ctx)` i `actions` (każda przez `act(fn, 'klucz-komunikatu')`); nazwy akcji muszą być unikalne w całym panelu.

Tryb demo i „Wczytaj dane przykładowe” biorą dane z jednej paczki: `app/src/lib/server/demo/pack.ts` (treść, względem „dziś”)
i `load.ts` (zapis do bazy). Nowy moduł z własnymi danymi dopisuje tam swoją część, a integracja z siecią – atrapę
w `demo/fetch.ts` (w demo każdy inny adres dostaje 503). Akcje panelu, które łączą się z cudzymi kontami albo podmieniają
bazę, trafiają do `DEMO_LOCKED_ACTIONS` w `demo/mode.ts`. Opis: [demo.md](demo.md).

## Nowy moduł krok po kroku – przykład „Rośliny”

1. Manifest `app/src/lib/modules/plants/index.ts`:

   ```ts
   import { defineModule } from '../data.js';
   import { defineSettings } from '../settings.js';
   import { t } from '#lib/i18n/index.js';

   export const plantsSettings = defineSettings({
   	everyDays: { type: 'number', get label() { return t('plants.everyDays'); }, default: 3, min: 1, max: 30 }
   });

   export default defineModule({
   	id: 'plants',
   	nameKey: 'module.plants',
   	get name() { return t('module.plants'); },
   	icon: '🪴',
   	get description() { return t('module.plants.desc'); },
   	defaultEnabled: false,
   	routes: ['/rosliny', '/api/plants'],
   	kiosk: { launcher: { href: '/rosliny', get label() { return t('module.plants'); }, badge: (d) => (d.thirsty ? { text: d.thirsty } : null) } },
   	settings: plantsSettings
   });
   ```

   Teksty to gettery z `t()` – czytane przy każdym użyciu, więc zmiana języka działa od razu. Klucze
   (`module.plants`, `module.plants.desc`, `plants.everyDays`) dopisz do `lib/i18n/pl.ts`, `de.ts` i `en.ts`.

2. Typ danych w `app/src/lib/modules/data.ts` (`ModuleData`): `plants: { thirsty: number };`

3. Część serwerowa `app/src/lib/modules/plants/hooks.server.ts`:

   ```ts
   import { moduleConfig } from '../index.js';
   import { defineServer } from '../server-types.js';
   import { plantsSettings } from './index.js';

   export default defineServer('plants', {
   	dashboard: ({ modules }) => {
   		const { everyDays } = moduleConfig(plantsSettings, modules, 'plants');
   		return { data: { thirsty: everyDays > 2 ? 1 : 0 } };
   	}
   });
   ```

4. Rejestracja: dopisz `plants` do `MODULES` w `index.ts` i do `SERVERS` w `registry.server.ts`
   (kolejność w `MODULES` = kolejność domyślna).

5. Strony i API jak zwykle w `app/src/routes/rosliny/…` i `app/src/routes/api/plants/…` – zablokuje je prefiks z `routes`.

6. Sekcja panelu (opcjonalnie): `admin: { slug: 'rosliny', label: 'Rośliny' }` w manifeście, `admin: { load, actions }`
   w `hooks.server.ts`, komponent `plants/Admin.svelte` i wpis w `VIEWS` w `app/src/routes/admin/[section]/+page.svelte`.
   Moduł z samym `settings` (bez `admin`) dostaje stronę `/admin/plants` z formularzem ustawień.

Kafelki na dole kiosku mają stały zestaw rodzajów (`TileKind`: zakupy, kartki, zadania – wspólne okno listy
i dodawania – oraz posiłki, dzieci, odliczanie z własnymi oknami). Nowy rodzaj kafelka: komponent kafelka
i okna w folderze modułu (`<id>/KioskTile.svelte`, `<id>/KioskSheet.svelte`, nagłówek `components/kiosk/TileHeader.svelte`),
gałąź w `Tiles.svelte` i w nakładkach `routes/+page.svelte`. Na ekranie pionowym więcej niż 3 kafelki układają się w dwóch rzędach.

## Posiłki, dzieci, odliczanie (`meals`, `kids`, `countdown`)

Tabele z migracji `0007_meals_kids_countdown.sql` (blok `p3b` na końcu `schema.ts`); logika w `lib/logic/{meals,kids,countdown}.ts`,
baza w `lib/server/{meals,kids,countdown}.ts`, wspólna walidacja pól w `lib/server/fields.ts`.

- **Posiłki** (`/telefon/posilki`, `/admin/posilki`, `/api/meals`): przepisy ze składnikami (linia = składnik, np. „500 g mąka”),
  plan na dzień i porę (obiad / kolacja / oba – ustawienie modułu). Kafelek: dziś i jutro; okno: 7 dni, wybór przepisu albo własny tekst
  z klawiatury, „Brakujące na listę”. Braki = suma składników dań na N dni (ustawienie) minus zapasy (gdy działa moduł Zapasy:
  ta sama jednostka – odejmowanie, kg/g i l/ml przeliczane; inna jednostka – „jest w domu”, gdy ilość > 0) minus to, co już jest na liście
  zakupów. Nazwy porównywane bez wielkości liter i znaków diakrytycznych, z tolerancją końcówek („mąki” = „mąka”).
- **Dzieci** (`/telefon/dzieci`, `/admin/dzieci`, `/api/kids`): dziecko = domownik z co najmniej jednym zadaniem. Zadania codzienne,
  w wybrane dni albo raz w tygodniu; punkty w księdze `kid_points` (odhaczenie = wpis z okresem, cofnięcie = usunięcie; premie i wydane
  nagrody też tu). Prośba o nagrodę rezerwuje punkty; zgoda albo odmowa tylko z dostępem do panelu (`/admin/dzieci` albo telefon
  administratora) albo na kiosku po PIN-ie (tylko gdy PIN jest ustawiony) – `/api/kids/decide` odpowiada 403 bez tego. Animacja po odhaczeniu (ustawienie) nie gra przy „ograniczonym ruchu”.
- **Odliczanie** (`/telefon/odliczanie`, `/admin/odliczanie`, `/api/countdown`): daty jednorazowe i coroczne (29 lutego → 28 w zwykłym roku),
  liczone na datach w strefie regionu (zmiana czasu nie przesuwa licznika). Kafelek: 1–3 najbliższe (ustawienie). Urodziny domowników
  (ustawienie, domyślnie włączone): z dat w profilach (`members.birthday`, panel → Domownicy) przez `birthdayCountdowns`;
  własny coroczny wpis tego samego domownika na ten sam dzień ma pierwszeństwo (bez dubli).

Kafelki na kiosku: jeden rząd mieści 5 (mały ekran 4, pionowy 3); więcej → kilka rzędów po najwyżej 5 (pionowy 4), rozłożonych
po równo (`rowGrid` w `routes/+page.svelte`). Telefon pokazuje najwyżej 5 zakładek: przy większej liczbie 4 pierwsze i „Więcej”.

Testy rejestru: `app/src/lib/modules/modules.test.ts` (czysta logika) i `registry.server.test.ts` (baza w pamięci).

## Leki, opieka, odjazdy, Home Assistant

Cztery moduły, domyślnie wyłączone. Mają kafelki na dole kiosku (rodzaje `meds`, `care`, `transit`, `ha` –
widok w `components/kiosk/ModuleTile.svelte`; akcje idą od razu do API, „Cofnij” jest w samym kafelku),
sekcje panelu i – leki i opieka – zakładki na telefonie. Tabele: migracja `0008_care_meds_ha.sql`.

- **Leki** (`meds`): plan na domownika – godziny, dni tygodnia, zakres dat. Na kiosku dawki z dziś (i zaległa
  wieczorna z wczoraj), duży przycisk „Wzięte”, czerwone po czasie z ustawień. Godziny to czas lokalny
  w strefie regionu – zmiana czasu nie przesuwa „8:00” (`logic/meds.ts`, `localTime`). Historia 14 dni
  w panelu i na telefonie. Dane zostają w lokalnej bazie; aplikacja nie daje porad medycznych.
- **Opieka** (`care`): „co X dni” albo okno „co X–Y dni” (rośliny, filtr, odkamienianie). To samo okno
  co karmienie węży – wspólna logika w `logic/recurring.ts`. Na kiosku pozycje w oknie, dziś i po
  terminie; dotknięcie = zrobione dziś.
- **Odjazdy** (`transit`): najbliższe odjazdy z jednego przystanku. Dostawcy (`server/transit/`):
  - HAFAS REST w formacie FPTF – publiczne `v6.vbb.transport.rest` i `v6.bvg.transport.rest` (Berlin–Brandenburgia),
    `v6.db.transport.rest` (Deutsche Bahn – w listopadzie 2026 bez wpisu DNS, opcja zostaje) albo własna
    instancja [`db-rest`](https://github.com/derhuerst/db-rest) w Dockerze. Na żywo z opóźnieniami;
    pytamy co 60 s (pamięć w `source_cache`), po 429 czekamy `Retry-After`, w nocy nie pytamy.
  - **GTFS** (rozkład statyczny) – dla Polski. Nie ma jednego krajowego API na żywo, ale większość miast
    publikuje GTFS (ZTM Warszawa, MPK Kraków, ZTM Poznań, ZTM Gdańsk, MPK Wrocław…). Plik `.zip` z adresu
    (co 12 h) albo wgrany w panelu; serwer czyta go strumieniowo własnym czytnikiem ZIP (`node:zlib`,
    bez nowych zależności) i liczy odjazdy na 36 h do przodu. Bez opóźnień – kafelek ma znacznik „rozkład”.
  - Nowy dostawca (np. API przewoźnika na żywo, GTFS-Realtime): funkcja zwracająca `Departure[]`
    (`server/transit/types.ts`), opcja w `transitSettings.provider` i gałąź w `transitSource`.
- **Home Assistant** (`homeassistant`): opis i bezpieczeństwo tokenu – [home-assistant.md](home-assistant.md).

## Własne integracje

Większość „mam w domu X i chcę to widzieć na kalendarzu” da się zrobić bez pisania modułu – przez
Home Assistanta: dodaj urządzenie do HA, a w kalendarzu zaznacz jego encję. Własny moduł ma sens, gdy
dane nie pasują do kafelka HA albo nie chcesz HA.

### Kamera przez go2rtc

1. Strumień RTSP kamery do go2rtc (`streams: { wejscie: rtsp://… }`).
2. W HA kamera „Generic Camera” z obrazem `http://<go2rtc>:1984/api/frame.jpeg?src=wejscie`.
3. W kalendarzu: panel → Home Assistant → zaznacz `camera.wejscie`. Kiosk pokazuje zdjęcie co kilka sekund
   (przez serwer, bez tokenu w przeglądarce). Szczegóły: [home-assistant.md](home-assistant.md#kamery-rtsphls-przez-go2rtc).

Żywy obraz bez HA: go2rtc wystawia też `http://<go2rtc>:1984/stream.html?src=wejscie` (WebRTC/MSE).
Taką stronę można dodać jako przycisk kiosku w manifeście modułu (`kiosk.launcher` z `href` i `reload: true`,
jak „Plac zabaw”) – ale go2rtc musi być wtedy osiągalny z kiosku, a stary komputer dekoduje wideo programowo.

### Własny moduł z danymi z sieci (szkic)

1. Manifest jak w przykładzie „Rośliny” wyżej, z `sources: [{ name: 'moje', label: 'Moje dane' }]`.
2. W `hooks.server.ts`: `sources: (db) => [{ name: 'moje', intervalMs: 60_000, fetch: async (f) => … }]` –
   pętla synchronizacji pobiera dane, zapisuje je w `source_cache`, ponawia po błędzie.
3. `dashboard: ({ db }) => { const { data, status } = readCache(db, 'moje'); return { data, status: { moje: status } }; }`
   – kiosk dostaje dane w `Dashboard.modules.moje`.
4. Sekrety (tokeny, hasła) w tabeli `secrets` (wzór: `server/homeassistant.ts`, `server/bring.ts`) –
   nigdy w danych dashboardu ani w `settings`, które czyta kiosk.
5. Testy bez sieci: atrapa `fetch` w testach jednostkowych (`server/transit/transit.test.ts`) albo mały serwer
   HTTP (`server/homeassistant.test.ts`, `e2e/p3c-mock.mjs`).

---

## English summary

The app is a core (calendar, family members, region, theme) plus modules that the admin can enable, disable,
reorder and configure at `/admin`. A module is a manifest (`app/src/lib/modules/<id>/index.ts`: id, name, icon,
`defaultEnabled`, `requires`, `routes`, `sources`, kiosk launcher/tile, phone tab, admin section, settings schema)
and an optional server part (`<id>/hooks.server.ts`: `seed`, `sources`, `dashboard`, `admin` load/actions).
State lives in `settings.modules = { [id]: { enabled, order, config } }`; missing entries fall back to the manifest.
A disabled module disappears from the kiosk, phone and admin menu, its route prefixes return 404
(`src/hooks.server.ts`), its sync sources stop, and the dashboard skips it. Data stays in the shared database
(no per-module migrations). To add a module: write the manifest, add its data type to `ModuleData`, write the
server part, register it in `MODULES` (`index.ts`) and `SERVERS` (`registry.server.ts`); see the "Rośliny" example above.
Demo mode and "Load example data" read one data pack (`app/src/lib/server/demo/pack.ts` + `load.ts`); a new module adds its
example data there, a network integration adds a fake in `demo/fetch.ts`, and panel actions that connect to outside accounts
go into `DEMO_LOCKED_ACTIONS` (`demo/mode.ts`) – see [demo.md](demo.md).

Modules `meals` (weekly meal plan with recipes; missing ingredients, minus pantry stock, go to the shopping list), `kids` (children's
chores with points, rewards approved by a parent with admin access) and `countdown` (days until chosen dates; optionally the
members' birthdays from their profiles) are off by default; their tables come from migration `0007_meals_kids_countdown.sql`.

Modules `meds` (medication schedules, "taken" button, DST-safe), `care` ("every X–Y days" items, same window logic
as the snakes), `transit` (departures: live HAFAS REST via transport.rest for Germany, GTFS static timetables for
Poland and elsewhere, parsed server-side without new dependencies) and `homeassistant` (token kept server-side,
see [home-assistant.md](home-assistant.md)) are off by default; their tables come from migration `0008_care_meds_ha.sql`.
"Własne integracje" above explains adding a camera through go2rtc and writing your own data module.
