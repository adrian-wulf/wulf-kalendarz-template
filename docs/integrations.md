# Integracje zewnętrzne (DE / PL)

[Polski](#polski) | [English](#english)

## Polski

Stan sprawdzony na prawdziwych, publicznych usługach 12.11.2026 (bez atrap). Test na żywo leży w
`app/src/lib/server/live.test.ts` i w `npm test` jest pomijany:

```sh
cd app
LIVE=1 npx vitest run src/lib/server/live.test.ts                       # API: pogoda, święta, Bring!, HAFAS
LIVE=1 LIVE_GTFS="/ścieżka/feed.zip|Nazwa przystanku[|stop_id]" npx vitest run src/lib/server/live.test.ts -t GTFS
LIVE=1 LIVE_ICS="DE:/ścieżka/abfuhr.ics;PL:/ścieżka/gmina.ics"  npx vitest run src/lib/server/live.test.ts -t iCal
```

Pliki GTFS i iCal pobierz ręcznie raz – test ich nie ściąga (oszczędzamy publiczne serwery).

### Przegląd

| Źródło | DE | PL | Uwagi |
|---|---|---|---|
| Pogoda – Open-Meteo `api.open-meteo.com/v1/forecast` | działa | działa | strefa czasowa z ustawień regionu (`timezone=Europe/Berlin` / `Europe/Warsaw`); pierwszy dzień prognozy = dziś w tej strefie |
| Geokodowanie (kreator) – Open-Meteo `geocoding-api.open-meteo.com/v1/search` | działa | działa | szuka tylko w nazwach w podanym języku – aplikacja pyta ponownie w języku kraju (patrz niżej) |
| Ferie szkolne – OpenHolidays `/SchoolHolidays` | działa (16 landów) | działa (16 województw) | dane PL niepełne (patrz niżej) |
| Święta ustawowe | liczone lokalnie | liczone lokalnie | zgodne z OpenHolidays `/PublicHolidays` 2026–2027 poza 15.08 w Bawarii (świadomie) |
| Odjazdy na żywo – HAFAS REST | `v6.vbb.transport.rest`, `v6.bvg.transport.rest` | – | `v6.db.transport.rest` wyłączone |
| Odjazdy z rozkładu – GTFS | każdy feed GTFS | Kraków, Warszawa (sprawdzone) | bez opóźnień |
| Wywóz śmieci – iCal | wiele gmin (np. Frankfurt, Lipsk) | rzadko (np. MPGK Katowice) | w PL zwykle PDF/aplikacja – wpis ręczny w panelu |
| Bring! – katalog `web.getbring.com/locale/articles.<locale>.json` | działa | działa | pl-PL 348, de-DE 366, en-GB 381 pozycji |

### Pogoda i geokodowanie (Open-Meteo)

- Prognoza: Hannover i Poznań – 8 dni, temperatura i kod pogody. Bez klucza; limit darmowy
  10 000 zapytań/dzień, tylko użytek niekomercyjny; dane CC BY 4.0 (podać „Open-Meteo.com”).
- Geokodowanie szuka tylko w nazwach w języku z parametru `language`: „Warszawa” z `language=en`
  zwraca pusty wynik, „Warsaw” z `language=pl` – Warszawę. **Poprawione:** gdy w języku interfejsu
  nie ma wyników, kreator pyta drugi raz w języku kraju (PL → `pl`, DE → `de`).

### Ferie i święta (OpenHolidays API)

- `https://openholidaysapi.org/SchoolHolidays?countryIsoCode=PL&subdivisionCode=PL-WP&languageIsoCode=PL&validFrom=2026-01-01&validTo=2027-12-31`
- Kody województw w aplikacji zgadzają się z `/Subdivisions?countryIsoCode=PL` (wszystkie 16; API
  zamienia pary LB/LU, PD/PK, SK/SL względem ISO 3166-2 – aplikacja używa kodów API).
- **PL – braki w danych API (11.2026):** na rok szkolny 2026/27 są tylko ferie zimowe 2027; brak
  przerwy świątecznej 23–31.12.2026, przerwy wiosennej 2027 i wakacji 2027. Uzupełnią się, gdy
  OpenHolidays je doda (pobieramy raz na dobę).
- DE: nazwy pojedynczych dni wolnych („Tag nach Himmelfahrt”, „Zusätzlicher Ferientag”,
  „Unterrichtsfreier Tag”…) i „Fastnachtsferien”/„Halbjahrespause” były pokazywane po niemiecku w
  interfejsie PL/EN. **Poprawione:** tłumaczenie dla wszystkich nazw z API DE 2026–2027.
- Święta ustawowe liczone w aplikacji = `/PublicHolidays` dla PL i wszystkich 16 landów (2026–2027),
  z jednym świadomym wyjątkiem: 15.08 (Mariä Himmelfahrt) w Bawarii – API podaje je dla całego
  DE-BY, a obowiązuje tylko w gminach z przewagą katolików (ok. 1700 z 2056, m.in. Monachium, ale nie
  Norymberga). Augsburger Friedensfest (8.08) API oznacza jako regionalne – też pominięte.
- Licencja: OpenHolidays – dane ODbL, bez klucza i bez sztywnego limitu (prosimy raz na dobę).

### Odjazdy – Niemcy (HAFAS REST)

- `v6.vbb.transport.rest` i `v6.bvg.transport.rest` działają: wyszukiwanie „Alexanderplatz”
  → `900100003`, odjazdy z opóźnieniem, peronem i kolorem linii. Kształt odpowiedzi v6
  (`{ departures: [...] }`) jest obsługiwany; starszy (tablica) też.
- **`v6.db.transport.rest` nie działa** (brak rekordu DNS; README db-rest: „This API is not operational
  anymore”). **Poprawione:** usunięty z listy dostawców; dla DB: własna instancja
  [db-rest](https://github.com/derhuerst/db-rest) w Dockerze jako „Własny serwer HAFAS REST” albo GTFS.
- Limit publicznych instancji: ok. 100 zapytań/min; aplikacja pyta raz na minutę (nie w nocy) i po 429
  czeka zgodnie z `Retry-After`.

### Odjazdy – Polska (GTFS statyczny)

Sprawdzone feedy:

| Miasto | Adres | Rozmiar | Licencja |
|---|---|---|---|
| Kraków – tramwaje (ZTP) | `https://gtfs.ztp.krakow.pl/GTFS_KRK_T.zip` | 5,5 MB (44 MB po rozpakowaniu) | CC BY 4.0 |
| Kraków – autobusy (ZTP) | `https://gtfs.ztp.krakow.pl/GTFS_KRK_A.zip` | 24 MB | CC BY 4.0 |
| Warszawa (ZTM, oprac. M. Kuranowski) | `https://mkuran.pl/gtfs/warsaw.zip` | 107 MB (627 MB, `stop_times.txt` 551 MB) | warunki ZTM Warszawa + ODbL (kształty); wymagane podanie źródeł z `attributions.txt` |

Wyniki (`gtfsDepartures`, Apple M4):

- Kraków, „Teatr Bagatela” (`stop_191_7719`): 596 odjazdów na 36 h w 0,1 s; kalendarz tylko z
  `calendar_dates.txt` (dni robocze/sobota/niedziela) działa; tramwaje nocne (69) w nocy pt→sob jako
  `26:21:00` → sobota 02:21 czasu warszawskiego.
- Warszawa, stacja metra „Politechnika” (`7006M`, perony z `parent_station`): ok. 2–4 s, RSS procesu
  +20 MB (plik czytany strumieniowo).
- **Błąd poprawiony:** metro w Warszawie jest zapisane w `frequencies.txt` (wzorzec kursu od
  00:00:00 + okna „co 270–570 s”). Aplikacja ignorowała ten plik i pokazywała jeden odjazd M1 o 00:18
  w nocy. Teraz kursy są rozwijane wg `start_time`/`end_time`/`headway_secs`.
- **Poprawione:** wyszukiwanie pokazuje stacje (`location_type=1`) przed pojedynczymi peronami
  („Politechnika” – stacja metra była poza pierwszymi 20 wynikami).
- **Poprawione:** odjazdy liczymy co godzinę (plik pobierany nadal co 12 h). Lista ma limit 600
  pozycji – na ruchliwej stacji to ok. 12–15 h, więc przy liczeniu co 12 h kafelek mógł się opróżnić.
- Mały kiosk (8 GB RAM, i5-7400): pamięć bez znaczenia (kilkadziesiąt MB); czas na i5-7400 ok. 2–3×
  dłuższy niż na M4, czyli ~10 s dla Warszawy raz na godzinę i < 1 s dla Krakowa – w porządku.
  Pobranie 107 MB co 12 h – sprawdź łącze; limit pliku to 300 MB.
- Ograniczenia: tylko rozkład (bez opóźnień); GTFS-RT (np. Kraków `TripUpdates_*.pb`) nie jest
  obsługiwany. MPK Wrocław (`wroclaw.pl/open-data/...`) odpowiadał 403 na pobranie skryptem, ZTM Poznań
  zmienił adres strony z plikami – nie sprawdzone.

### Wywóz śmieci (iCal)

Niemcy – sprawdzone (adres z publicznych przykładów; swój znajdziesz na stronie gminy):

- FES Frankfurt: `https://frankfurtplus.de/abfallkalender/<ID>/ical` – tytuły „<adres> : Verpackung-Abholung”,
  „Restabfall-Abholung”, „Altpapier-Abholung”, „Bioabfall-Abholung”, `DTSTART;VALUE=DATE`.
- Stadtreinigung Leipzig: `https://stadtreinigung-leipzig.de/wir-kommen-zu-ihnen/abfallkalender/ical.ics?position_nos=<nr>&name=<ulica>&mode=download`
  – „Gelbe Tonne”, „Blaue Tonne”, „Restabfalltonne”, `DTSTART;TZID=Europe/Berlin`.
- **Poprawione w zestawie DE:** „Verpackung” → żółty, „Blaue Tonne” → papier, „Braune Tonne” → bio,
  „Schwarze/Graue Tonne”, „Hausmüll” → resztkowe. Wcześniej Frankfurt tracił 26 z 52 terminów
  (Verpackung), Lipsk – papier.

Polska – iCal ma niewiele gmin (zwykle PDF albo aplikacje EcoHarmonogram, kiedyodpady.pl itp.):

- MPGK Katowice: `POST https://www.mpgk.com.pl/mod/harmonogram/ics` (`street`, `number`) – plik
  pobierz w przeglądarce i wgraj w panelu (aplikacja pobiera adres tylko metodą GET). Tytuły:
  „Odpady komunalne”, „Odpady szklane…”, „Odpady papier, makulatura…”, „Odpady z tworzyw sztucznych
  i metalu…”, „Odpady wielkogabarytowe…”, czas `…T050000Z`.
- **Poprawione w zestawie PL:** „szklane” (wcześniej tylko „szkło/szklo”) i „Odpady komunalne” →
  zmieszane. Wcześniej Katowice traciły szkło i odpady zmieszane (105 z 331 terminów).
- Gdzie nie ma iCal: terminy wpisuje się ręcznie w panelu → Śmieci.

Co obsługuje parser iCal (`app/src/lib/server/sources/ical.ts`):

- `VEVENT` z `DTSTART` (data, czas UTC `…Z`, czas lokalny/`TZID` – liczy się dzień z pliku) i `SUMMARY`;
  zawinięte linie, znaki `\,` `\;` `\n`, spacje na końcu linii.
- **Powtórzenia** (poprawione – wcześniej był tylko pierwszy termin): `RRULE` z `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY`,
  `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` (też `1MO`, `-1FR` w MONTHLY/YEARLY), `BYMONTHDAY`, `BYMONTH`;
  `EXDATE` (kilka linii i list); `RECURRENCE-ID` (przeniesiony termin zastępuje termin z reguły),
  `STATUS:CANCELLED`. Reguła bez końca – do 2 lat naprzód, maks. 2000 terminów.
- Nieobsługiwane: `RDATE`, `BYSETPOS`, `BYWEEKNO`, `BYYEARDAY`, `FREQ` poniżej dnia, `WKST`.
- Wydarzenie, którego nie da się odczytać (zła data, nieobsługiwana reguła), jest pomijane z
  ostrzeżeniem w logu – reszta kalendarza działa (wcześniej jeden błąd zatrzymywał cały plik).
- `VALARM` i inne podkomponenty są pomijane (ich `SUMMARY` nie nadpisuje tytułu).
- Znane ograniczenie: reguły szukają fragmentu w całym tytule – gdy dostawca dokleja adres
  („Biotopweg 3 : Restabfall”), nazwa ulicy może trafić w złą regułę; wtedy popraw reguły w panelu
  (np. wyrażenie regularne `/: rest/`).

### Bring!

- Katalogi `articles.pl-PL.json`, `articles.de-DE.json`, `articles.en-GB.json` – płaski JSON
  „klucz niemiecki → nazwa”. Działają.
- Ograniczenie: zestawy kluczy różnią się między językami (52 klucze z de-DE nie ma w pl-PL, np.
  „Champignons”, „Kohlrabi”) – takie pozycje widać pod niemieckim kluczem.
- API listy jest nieoficjalne (to samo, którego używa Home Assistant) – może się zmienić bez uprzedzenia.

## English

Verified against the real public services on 2026-11-12. Live test: `app/src/lib/server/live.test.ts`
(skipped in `npm test`; run with `LIVE=1`, plus `LIVE_GTFS` / `LIVE_ICS` for local files).

| Source | DE | PL | Notes |
|---|---|---|---|
| Open-Meteo forecast | works | works | timezone from region settings |
| Open-Meteo geocoding | works | works | matches names in the requested language only – **fixed:** retries in the country language |
| OpenHolidays school holidays | works | works | PL data incomplete for school year 2026/27 (only winter break 2027); **fixed:** all DE day-off names translated |
| Public holidays (computed) | matches OpenHolidays 2026–2027 | matches | except 15 Aug in Bavaria (municipal-only, intentionally omitted) |
| HAFAS REST | VBB, BVG work | – | **`v6.db.transport.rest` is gone (no DNS) – removed from providers**; use your own db-rest |
| GTFS static | any feed | Kraków (CC BY 4.0), Warsaw (`mkuran.pl/gtfs/warsaw.zip`, ZTM terms + ODbL) | **fixed:** `frequencies.txt` (Warsaw metro), stations listed first, departures recomputed hourly |
| Waste iCal | FES Frankfurt, Leipzig | MPGK Katowice (POST – upload the file) | **fixed:** DE/PL preset rules (Verpackung, Blaue Tonne, szklane, „Odpady komunalne”); RRULE support |
| Bring! catalog | works | works | key sets differ per locale (52 de-DE keys missing in pl-PL) |

iCal parser supports `RRULE` (DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY incl. `1MO`/`-1FR`,
BYMONTHDAY, BYMONTH), `EXDATE`, `RECURRENCE-ID`, `STATUS:CANCELLED`; open-ended rules expand 2 years ahead.
Not supported: `RDATE`, `BYSETPOS`, `BYWEEKNO`, `BYYEARDAY`, sub-daily rules. A broken VEVENT is skipped
with a warning instead of failing the whole feed; `VALARM` is ignored.

Kiosk sizing: the Warsaw feed (107 MB zip, 551 MB `stop_times.txt`) is streamed – ~20 MB extra RAM,
~2–4 s on an Apple M4, roughly 10 s on an i5-7400, once per hour. An 8 GB i5-7400 kiosk copes fine.
Licensing: Open-Meteo CC BY 4.0 (non-commercial free tier), OpenHolidays ODbL, Kraków GTFS CC BY 4.0,
Warsaw GTFS – ZTM Warszawa terms with attribution from `attributions.txt`, public transport.rest
instances – fair use (~100 req/min).
