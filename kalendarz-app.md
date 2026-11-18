# Plan budowy: aplikacja kalendarza rodzinnego

## Cel
Aplikacja SvelteKit + SQLite w Dockerze według `docs/superpowers/specs/2026-10-31-kalendarz-rodzinny-design.md`. Rozwój i testy lokalnie na Macu, a wdrożenie na kiosk dopiero na polecenie użytkownika (na ekranie jest teraz plac zabaw).

## Zadania
- [x] 1. Szkielet: `npx sv create app` (SvelteKit, TS, Vitest, Playwright), adapter-node, Drizzle + better-sqlite3, lokalne fonty Fraunces/Inter → Weryfikacja: `npm run dev`, `npm test` przechodzi
- [x] 2. Model danych + seed: tabele `members`, `chores`, `chore_completions`, `settings`, `source_cache`, `secrets`, dane testowe (6 domowników) → Weryfikacja: test Vitest czyta seed
- [x] 3. Logika czysta (TDD): Feiertage Niedersachsen, reguły powtarzania zadań, „wystaw śmieci dzień wcześniej”, harmonogram dzień/wieczór/noc, czas wiszenia kartki → Weryfikacja: `npm test` zielony, w tym zmiana czasu i Wielkanoc 2026/2027
- [x] 4. Ekran główny na danych testowych, styl „Ciepły papier”, 1920×1080: zegar, Feiertag, pogoda, Dziś, tydzień, 3 kafle → Weryfikacja: zrzut Playwright zgodny z makietą A v3
- [x] 5. Warstwa `sync` + źródła bez kont: Open-Meteo, iCal (ferie, wywóz śmieci), Feiertage. Cache + status + tryb offline → Weryfikacja: ekran pokazuje prawdziwą pogodę; po odcięciu sieci znacznik „offline”
- [x] 6. Google Calendar: OAuth konta rodzinnego, odczyt kalendarzy domowników, zapis do Rodzina/Kartki (`extendedProperties.private.memberId`) → Weryfikacja: wydarzenie dodane w aplikacji widoczne w Google Calendar w telefonie
- [ ] 7. Bring!: odczyt, dodanie, odhaczenie, podpowiedzi z ikonami; łagodna awaria → Weryfikacja: produkt dodany na ekranie pojawia się w Bring! na telefonie
- [x] 8. Interakcje kiosku: klawiatura QWERTZ z PL/DE, kreatory (wydarzenie, kartka, zadanie, zakup), przytrzymanie 1,5 s + Cofnij, powrót po 60 s → Weryfikacja: testy Playwright z dotykiem
- [x] 9. Panel `/admin` (dostęp przez nagłówek Tailscale) z pełną edycją, statusem źródeł, podglądem na żywo i backupem → Weryfikacja: test, że localhost i brak nagłówka dają 403
- [x] 10. Wdrożenie: Dockerfile, compose, `tailscale serve`, agent ekranu (systemd + wlopm), tryb nocny, backup nocny → Weryfikacja: **dopiero na polecenie użytkownika** – kiosk pokazuje aplikację, ekran gaśnie o 23:00
  - [x] agent ekranu (podświetlenie + EVIOCGRAB, bo Cage nie ma wlr-output-power-management), nocna kopia bazy 03:30 → data/backups (14 dni), przeładowanie 4:00
  - [x] kiosk pokazuje kalendarz (2026-11-01): aplikacja na :3000, nginx placeholder zatrzymany, gry pod /plac/index.html (🎮)

## Od użytkownika (potrzebne przed zadaniami 5–7)
- Założyć konto **rodzina@example.com** (konto rodzinne) i kalendarze Rodzina / Kartki / Kita; domownicy udostępniają swoje kalendarze („Wyświetlanie”)
- Projekt w **Google Cloud Console** z włączonym Calendar API i ekranem zgody w statusie „In production” (poprowadzę krok po kroku)
- Konto **Bring!** dla kiosku dodane do wspólnej listy
- **Adres** (ulica) do kalendarza śmieci (Abfuhrkalender)

## Gotowe, gdy
- [ ] Kiosk 24/7 pokazuje kalendarz rodziny z Google, pogodę, śmieci, ferie, zakupy z Bring!, kartki i zadania; panel przez Tailscale pozwala edytować wszystko; ekran gaśnie w nocy.

## Uwagi
- Lokalnie: Node 26. W Dockerze: obraz `node:24-alpine` (LTS).
- Nie ruszać ekranu kiosku, dopóki użytkownik nie pozwoli.
