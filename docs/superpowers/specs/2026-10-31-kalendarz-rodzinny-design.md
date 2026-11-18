# Kalendarz rodzinny – projekt

Data: 2026-10-31
Status: do przeglądu

## 1. Cel

Dotykowy ekran w głównym korytarzu domu (przykład: Niedersachsen), który pokazuje rodzinny kalendarz i planer. Ma być czytelny z kilku metrów i prosty w obsłudze dla wszystkich domowników, w tym osoby starszej. Główny sposób użycia to **podgląd**, a dodawanie z ekranu jest dodatkiem. Pełną edycję zapewnia panel administracyjny dostępny przez Tailscale.

### Użytkownicy

- kilka osób dorosłych (w tym osoba starsza) – osoba starsza korzysta wyłącznie z kiosku, nie z telefonu.
- małe dzieci – nie obsługują ekranu, ale mają swoje wydarzenia i kolory. Ekran musi być odporny na przypadkowy dotyk dziecka.

### Poza zakresem (na teraz)

- Sterowanie smart home (ew. później przez Home Assistant jako osobny kontener).
- Zdjęcia rodzinne / wygaszacz.
- Pixelowe awatary – model danych przewiduje pole na awatar, ale w wersji 1 każdy domownik ma tylko kolor.
- Polskie święta.

## 2. Sprzęt i system

| Element | Wybór |
|---|---|
| Komputer | dowolny komputer all-in-one z ekranem dotykowym Full HD (np. 23") |
| Sieć | LAN (kabel) |
| System | Debian 13 bez środowiska graficznego |
| Kiosk | Cage (kompozytor Wayland) + Chromium w trybie kiosku → `http://localhost:3000` |
| Aplikacja | Docker (Compose), restart `unless-stopped` |
| Dostęp zdalny | Tailscale (SSH + panel administracyjny) |
| BIOS | UEFI, AHCI, „Restore on AC Power Loss = Power On” |
| Aktualizacje | `unattended-upgrades` dla poprawek bezpieczeństwa Debiana |

Kiosk startuje automatycznie po włączeniu (autologin użytkownika `kiosk` na tty1 → Cage → Chromium). Chromium jest restartowany przez systemd, jeśli się zamknie.

## 3. Architektura

```
┌──────────────── AIO (Debian 13) ─────────────────┐
│ Cage + Chromium ──► http://localhost:3000 (kiosk) │
│                                                   │
│ Docker: aplikacja SvelteKit (Node, TypeScript)    │
│   ├─ synchronizacja źródeł + cache                │
│   ├─ SQLite (plik w wolumenie)                    │
│   └─ API dla kiosku i panelu                      │
│                                                   │
│ Tailscale ──► panel /admin (tylko tailnet)        │
│ Agent ekranu (systemd, host) – włącz/wyłącz       │
└───────────────────────────────────────────────────┘
        │ tylko ruch wychodzący
        ▼
 Google Calendar API · Bring! API · Open-Meteo · iCal śmieci · iCal ferii
```

- **Stos:** SvelteKit (TypeScript) z adapterem Node, SQLite (np. przez Drizzle ORM), oficjalna biblioteka `googleapis`.
- **Jeden kontener** z frontendem i backendem. Tokeny i hasła zostają na serwerze i nigdy nie trafiają do przeglądarki.
- **Nic nie jest wystawione do internetu.** Aplikacja nasłuchuje na `localhost` (kiosk) i jest udostępniona w tailnecie przez `tailscale serve`.

### Moduły serwera

Każdy moduł ma jedną odpowiedzialność i własny interfejs:

| Moduł | Odpowiedzialność |
|---|---|
| `sources/google` | Odczyt kalendarzy domowników; odczyt/zapis kalendarzy Rodzina i Kartki |
| `sources/bring` | Odczyt/zapis listy zakupów Bring! |
| `sources/weather` | Prognoza z Open-Meteo dla lokalizacji domu |
| `sources/ical` | Pobieranie i parsowanie iCal (śmieci, ferie Niedersachsen) |
| `holidays` | Feiertage Niedersachsen wyliczane lokalnie (w tym Wielkanoc i święta ruchome) |
| `waste` | Zamiana wywozów na wydarzenia + zadania „wystawić dzień wcześniej” |
| `chores` | Zadania domowe z powtarzaniem (SQLite) |
| `sync` | Harmonogram odpytywania źródeł, cache ostatnich danych, status źródeł |
| `display` | Komunikacja z agentem ekranu (włącz/wyłącz, jasność) |
| `auth` | Rozpoznanie: kiosk (localhost) vs administrator (nagłówek tożsamości Tailscale) |

Interfejs źródła: `fetch(): Promise<Data>`. Moduł `sync` odpytuje źródła i zapisuje wynik z czasem pobrania. Kiosk zawsze czyta z cache, nigdy bezpośrednio z zewnętrznych API.

## 4. Źródła danych

### Konto Google: rodzina@example.com (konto rodzinne)

| Kalendarz | Właściciel | Uprawnienie konta rodzinnego | Do czego |
|---|---|---|---|
| Prywatne kalendarze domowników | każdy domownik | **Wyświetlanie** (lub „tylko wolny/zajęty”) | Podgląd |
| Kalendarz służbowy domownika | domownik | Wyświetlanie / wolny-zajęty | Podgląd |
| **Rodzina** | konto rodzinne | właściciel | Wydarzenia dodane z kiosku/panelu + wspólne |
| **Kartki** | konto rodzinne | właściciel | Tablica na kartki |
| **Kita** | konto rodzinne | właściciel | Schließtage przedszkola, wpisywane ręcznie raz w roku |
| Urodziny | konto rodzinne | właściciel | Urodziny i ważne daty |

- Kalendarze Rodzina i Kartki są udostępnione domownikom do edycji. Każdy dorosły subskrybuje „Rodzinę” w telefonie i włącza dla niej powiadomienia.
- **Przypisanie wydarzenia do osoby** w kalendarzu Rodzina: `extendedProperties.private.memberId`. Tytuł w Google ma prefiks z imieniem („Mama: Dentysta”), żeby był czytelny w telefonie. Wydarzenia bez `memberId` są wydarzeniami „całej rodziny”.
- **Autor kartki:** dla kartek z telefonu – `creator.email` przypisany do domownika. Dla kartek z kiosku – `extendedProperties.private.memberId`.
- **Czas wiszenia kartki** = czas trwania wydarzenia. Wydarzenie całodniowe wisi do końca dnia. Domyślnie z kiosku: do jutra 6:00.
- **OAuth:** jednorazowa autoryzacja konta rodzinnego w panelu. Projekt Google Cloud musi mieć status **„In production”**, bo w trybie „Testing” refresh token wygasa po 7 dniach. Zakresy: `calendar.readonly` dla podglądu + `calendar.events` do zapisu w kalendarzach Rodzina i Kartki.
- Odświeżanie: co 60 s.

### Bring!

- Konto kiosku założone na rodzina@example.com, dodane do wspólnej listy zakupów rodziny.
- Nieoficjalne API (to samo, którego używa integracja Home Assistant). Obsługiwane: odczyt listy, dodanie pozycji, odhaczenie, usunięcie, podpowiedzi produktów z ikonami.
- Odświeżanie: co 30 s. Jeśli API przestanie działać, kafel pokazuje „Lista chwilowo niedostępna”, a telefony dalej działają normalnie.

### Pozostałe

| Źródło | Szczegóły | Odświeżanie |
|---|---|---|
| Pogoda | Open-Meteo (bez klucza), współrzędne domu (ustawiane w panelu) | 30 min |
| Wywóz śmieci | iCal lokalnej firmy wywozowej (Abfuhrkalender) dla adresu (URL wpisywany w panelu) | 12 h |
| Schulferien | iCal ferii Niedersachsen (URL w panelu) | 24 h |
| Feiertage | wyliczane lokalnie dla Niedersachsen | — |

### Dane lokalne (SQLite)

- `members`: id, imię, kolor, awatar (nullable, na przyszłość), lista ID kalendarzy Google, kolejność.
- `chores`: id, tytuł, reguła powtarzania (co dzień / co tydzień w dni X / co miesiąc dnia N / jednorazowo), przypisana osoba (opcjonalnie), następny termin.
- `chore_completions`: id zadania, termin, kto/kiedy odhaczył.
- `settings`: godziny trybu nocnego, PIN, URL-e iCal, ID listy Bring!, parametry wyglądu.
- `source_cache`: źródło, dane (JSON), czas pobrania, ostatni błąd.
- Sekrety (refresh token Google, hasło Bring!) w tabeli `secrets`, nigdy nie wysyłane do przeglądarki.

## 5. Ekran główny (kiosk)

Układ „Dziś + tydzień” (1920×1080, poziomo):

```
┌───────────────┬──────────────────────────────────────────────┐
│ 14:32         │ Nd 1 │ Pn 2 │ Wt 3 │ Śr 4 │ Cz 5 │ Pt 6 │ So 7│
│ Sobota, 31.10 │                                              │
│ [Feiertag]    │   wydarzenia w kolorach osób                 │
│ pogoda 4 dni  │   + wywozy śmieci w kolorach pojemników      │
│ DZIŚ:         │                                              │
│  wydarzenia   │   ‹ tydzień ›   [Dziś]                  [＋] │
├───────────────┴───────┬──────────────────┬───────────────────┤
│ 🛒 Zakupy (Bring!)    │ 📌 Kartki        │ ✅ Zadania        │
└───────────────────────┴──────────────────┴───────────────────┘
```

- **Lewa kolumna (30%):** duży zegar, data, czerwony pasek przy Feiertag („sklepy zamknięte”), pogoda (dziś + 3 dni), lista wydarzeń na dziś.
- **Prawa część:** kolejne 7 dni w kolumnach. Strzałki zmieniają tydzień, „Dziś” wraca. Stuknięcie w nagłówek dnia otwiera widok tego dnia na pełnym ekranie.
- **Dolny pasek:** 3 kafle – Zakupy, Kartki, Zadania.
- **Ferie i Kita** jako paski całodniowe w kalendarzu. **Urodziny** z ikoną 🎂.
- **Śmieci** jako wydarzenia w stałych, zarezerwowanych kolorach pojemników: Gelbe Tonne – żółty, Restmüll – szary, Papier – niebieski, Bio – zielony. Dzień przed wywozem pojawia się wpis „🗑 Wieczorem wystawić: …” w kolumnie Dziś **oraz** zadanie do odhaczenia w kaflu Zadania. Nieodhaczone znika samo po terminie wywozu.
- Domownicy wybierają kolory spoza kolorów zarezerwowanych dla pojemników.

### Styl: „Ciepły papier”

- Tło kremowe (`#f4efe6`), karty `#fffdf8`, tekst ciemny brąz (`#2a2522`), zaokrąglenia 14 px, delikatne cienie.
- Nagłówki i zegar: Fraunces (szeryf). Tekst: Inter. Fonty są dostarczane lokalnie, bez CDN, żeby działały offline.
- Minimalny rozmiar tekstu wydarzeń na ekranie docelowym: 22 px. Zegar: ok. 140 px.
- Kartki: żółte karteczki z górnym paskiem w kolorze autora.
- **Wieczorem:** przyciemniona wersja tego samego stylu (ciemniejsze tło, niższa jasność ekranu).

## 6. Interakcje na kiosku

Zasady ogólne:

- Jeden krok na ekran, duże przyciski, zawsze widoczne „✕ Anuluj”.
- Po 60 s bez dotyku ekran wraca do widoku głównego.
- Brak gestów przesuwania – tylko stuknięcia i przytrzymania.
- **Ochrona przed dziećmi:** wszystko, co usuwa lub odhacza, wymaga przytrzymania ok. 1,5 s (pasek postępu). Przez 5 s po akcji widoczne jest „↶ Cofnij”.
- Własna klawiatura ekranowa w aplikacji (Cage nie ma systemowej): układ QWERTZ z ą ć ę ł ń ó ś ź ż ä ö ü ß.

| Akcja | Przebieg |
|---|---|
| Dodaj wydarzenie | ＋ → Kto (kafle domowników + „Cała rodzina”) → Co (klawiatura + szybkie podpowiedzi) → Kiedy (Dziś/Jutro/dni tygodnia/inny; cały dzień/godziny) → ✓. Zapis do kalendarza **Rodzina**. |
| Podgląd wydarzenia | Stuknięcie → okno ze szczegółami. **Bez edycji i usuwania na kiosku.** |
| Dodaj kartkę | Kto → Treść → Jak długo (do wieczora / do jutra rana / 3 dni) → ✓. Zapis do kalendarza **Kartki**. |
| Zdejmij kartkę | Przytrzymanie. |
| Dodaj do zakupów | Stuknięcie w kafel → klawiatura z podpowiedziami Bring! → stuknięcie w podpowiedź. |
| Dodaj zadanie domowe | ＋ w kaflu Zadania → Co (klawiatura + podpowiedzi z wcześniejszych zadań) → Dla kogo (domownik lub „ktokolwiek”) → Kiedy (Dziś / Jutro / dzień tygodnia) → Powtarzanie (jednorazowo / co tydzień / co miesiąc) → ✓. Bardziej złożone reguły i edycja tylko w panelu. |
| Odhacz zakup / zadanie | Przytrzymanie. |
| Ustawienia awaryjne | Przytrzymanie zegara 5 s → PIN → tryb nocny, ponowne połączenie Google. |

## 7. Panel administracyjny (przez Tailscale)

Adres: `https://kalendarz.<tailnet>.ts.net/admin`, udostępniony przez `tailscale serve`. Dostęp tylko dla kont Tailscale z listy administratorów, rozpoznawanych po nagłówku `Tailscale-User-Login`. Żądania z `localhost` (kiosk) nie mają dostępu do `/admin`.

Panel umożliwia **pełną edycję wszystkiego**:

- **Wydarzenia** w kalendarzu Rodzina: dodaj, edytuj, usuń, zmień przypisaną osobę.
- **Kartki:** dodaj, edytuj, usuń, zmień czas wiszenia.
- **Zakupy:** dodaj, odhacz, usuń.
- **Zadania domowe:** tworzenie, edycja, usuwanie, reguły powtarzania, przypisanie osoby, historia odhaczeń.
- **Domownicy:** imię, kolor (z walidacją wobec kolorów zarezerwowanych), kolejność, przypisane kalendarze Google, awatar (gdy powstanie).
- **Źródła:** połączenie z Google (OAuth), wybór kalendarzy, dane Bring!, URL-e iCal (śmieci, ferie), współrzędne pogody.
- **Ekran:** godziny trybu wieczornego i nocnego, jasność, „wyłącz / włącz ekran teraz”, przeładowanie strony kiosku.
- **Wygląd:** kolory stylu, skala czcionki.
- **Podgląd na żywo** tego, co jest teraz na kiosku (ten sam widok renderowany w panelu).
- **Status:** dla każdego źródła ostatnia udana synchronizacja i ostatni błąd.
- **Backup:** pobierz / przywróć plik bazy.
- **PIN** do ustawień awaryjnych na kiosku.

## 8. Tryb nocny i ekran

- **Agent ekranu** to mała usługa systemd na hoście (poza Dockerem). Udostępnia lokalne API (socket Unix montowany do kontenera): `on`, `off`, `brightness`. Implementacja: `wlr-randr`/`wlopm` dla wyjścia Wayland, a jasność przez podświetlenie, jeśli sprzęt pozwala (w przeciwnym razie przyciemnienie po stronie CSS).
- **Harmonogram** (domyślnie, ustawiany w panelu): 21:00 tryb wieczorny, 23:00–6:00 ekran wyłączony.
- **Dotyk przy wyłączonym ekranie** budzi go na 2 minuty. Agent nasłuchuje zdarzeń z urządzenia dotykowego (`libinput`/evdev).
- **Codziennie o 4:00** strona kiosku przeładowuje się, żeby po pracy 24/7 zacząć na świeżo.

## 9. Obsługa błędów

| Sytuacja | Zachowanie |
|---|---|
| Brak internetu | Kiosk pokazuje dane z cache + ikonkę „offline · dane z HH:MM”. Nigdy pusty ekran. |
| Źródło zwraca błąd | Dotyczy tylko jego kafla/warstwy. Status widoczny w panelu. Ponowna próba z backoffem. |
| Google wymaga ponownej autoryzacji | Żółty pasek na kiosku: „Kalendarz: zaloguj ponownie w ustawieniach”. |
| Zapis z kiosku nie powiódł się | Komunikat „Nie udało się zapisać – spróbuj ponownie”. Akcja nie znika po cichu. |
| Awaria aplikacji | Docker restartuje kontener. Strona kiosku sama ponawia połączenie. |
| Awaria Chromium | systemd restartuje Cage/Chromium. |
| Zanik prądu | BIOS włącza komputer, kiosk startuje automatycznie. |

Backup: co noc kopia pliku SQLite (rotacja 14 dni) w wolumenie. Do pobrania z panelu.

## 10. Testy

- **Jednostkowe (Vitest):** reguły powtarzania zadań, generowanie „wystaw dzień wcześniej”, Feiertage Niedersachsen (w tym Wielkanoc), harmonogram dzień/wieczór/noc, zmiana czasu letni/zimowy, przypisanie autora kartki, czas wiszenia kartki.
- **Integracyjne:** moduły źródeł testowane na nagranych odpowiedziach (fixtures) Google, Bring!, Open-Meteo, iCal.
- **Wizualne (Playwright):** zrzut ekranu głównego w 1920×1080 na stałych danych testowych, w trybie dziennym i wieczornym.
- **Dostęp:** test, że `/admin` odrzuca żądania bez nagłówka Tailscale i z localhost.

## 11. Kolejność budowy

1. **System (część A):** Debian, Tailscale, Docker, kiosk Cage + Chromium, agent ekranu, BIOS. (W trakcie: Debian się instaluje.)
2. **Szkielet aplikacji:** SvelteKit + SQLite + Docker Compose, ekran główny na danych testowych w stylu „Ciepły papier”.
3. **Źródła tylko do odczytu:** Google Calendar, pogoda, Feiertage, ferie, śmieci.
4. **Panel administracyjny:** domownicy, źródła, status.
5. **Zapis:** wydarzenia i kartki (Google), zakupy (Bring!), zadania domowe.
6. **Kiosk: interakcje** – klawiatura ekranowa, kreatory, przytrzymania, cofanie.
7. **Tryb nocny** i dopracowanie.
