# Test z „nietechnicznym użytkownikiem” – notatki (#26, część B)

[English summary below](#english-summary)

## Jak test przebiegał

Świeża instalacja (pusta baza, kreator po polsku: Wielkopolska, dwoje domowników, „Zacznij od pustego”), potem
Playwright tylko z tym, co widać na ekranie – przyciski i pola po ich napisach (`getByRole`, `getByLabel`), bez
selektorów z kodu. Ekran 1920×1080 (kiosk i panel) i 390 px (telefon, panel na telefonie). Scenariusz rodzica:

1. kiosk po kreatorze – co zrobić z pustym kalendarzem,
2. panel → Przegląd → lista „Co jeszcze możesz podłączyć”,
3. „Ustaw” przy wywozie śmieci → przewodnik → harmonogram z PDF na cały rok (seria co 2 tygodnie, potem wklejone daty),
4. „Ustaw” przy PIN-ie → Dostęp → PIN,
5. urodziny, kopia poza komputerem, wydarzenia bez Google, Google,
6. to samo na szerokości telefonu.

Po poprawkach przejście powtórzone (ta sama ścieżka) – bez nowych miejsc zawahania z listy „ważne”.

## Miejsca zawahania i co z nimi zrobiono

| # | Gdzie | Zawahanie | Waga | Co zrobione |
|---|---|---|---|---|
| 1 | Panel → Śmieci (przed zmianami) | Na pustej instalacji sekcja mówiła „kiosk pokazuje przykładowe terminy”, choć przykładów nie było (start „od pustego”). Nie wiadomo, od czego zacząć. | ważne | Pusty stan: „Nie ma jeszcze terminów wywozu” + jeden przycisk **Dodaj terminy wywozu** (skok do wpisu na cały rok). Komunikat o przykładach tylko wtedy, gdy przykłady naprawdę są. |
| 2 | Śmieci → adres iCal | Pole na link do kalendarza gminy było w **Ustawieniach**, a nie w sekcji Śmieci – rodzic go nie znajduje. | ważne | Pole **Adres kalendarza** i wgrywanie pliku w jednej części „Kalendarz z gminy” w sekcji Śmieci; w Ustawieniach tylko odnośnik. |
| 3 | Śmieci → wpis ręczny | Harmonogram z PDF (26 dat papieru, 26 szkła…) trzeba było wpisywać dzień po dniu. | ważne | **Wpisz terminy na cały rok**: pojemnik + pierwszy wywóz + „co ile tygodni” (albo raz w miesiącu) + do kiedy, albo **Wklej daty** (`12.01, 26.01`, `styczeń: 12, 26`, `III: 5, 19`). Podgląd miesiącami przed zapisem, święta zaznaczone, nieczytelne fragmenty wypisane. |
| 4 | Śmieci → tabela reguł | Tabela „Słowa w tytule / Identyfikator / wyrażenie regularne” na środku strony wyglądała na obowiązkową. | ważne | Zwinięta pod „Pojemniki i rozpoznawanie – dla zaawansowanych”. |
| 5 | Śmieci → po zapisie | Po „Zapisz 30 terminów” pola zostawały wypełnione; drugi klik wyglądał, jakby dodawał to samo jeszcze raz. | średnie | Po zapisie data i wklejony tekst się czyszczą; podgląd mówi „N z tych dat jest już wpisanych – nie zapiszą się drugi raz”. |
| 6 | Śmieci → lista ręcznych terminów | Długa lista samych dat ISO (`2027-01-12`) bez podziału na pojemniki. | średnie | Daty po ludzku („wt., 12 sty”), zwinięte per pojemnik z liczbą, przycisk „Usuń wszystkie: Papier” po pomyłce w serii. |
| 7 | Kiosk po kreatorze | „Nic zaplanowanego” i pusty tydzień – nie wiadomo, czy coś jest zepsute. | ważne | Pod spodem: „Kalendarz jest jeszcze pusty. Dopisz pierwsze wydarzenie albo połącz Kalendarz Google w panelu.” + duży przycisk **+ Dodaj wydarzenie**. Pierwsza wersja miała za mały tekst na ekran oglądany z odległości – powiększone. |
| 8 | Panel → Przegląd | Brak odpowiedzi na „co jeszcze trzeba ustawić?” – trzeba klikać po kolei w menu. | ważne | Lista **Co jeszcze możesz podłączyć** z postępem („2 z 9 gotowe”), każda pozycja prowadzi do sekcji z otwartym przewodnikiem; „Nie potrzebuję” ukrywa pozycję. |
| 9 | Dostęp z linku „PIN kiosku” | Na stronie Dostęp otwierały się dwa przewodniki naraz (telefony i ekran) – długa strona, nie wiadomo, który czytać. | średnie | Link z listy (`?guide=…`) otwiera tylko swój przewodnik. |
| 10 | Panel → Google | Podpowiedź „krok po kroku: docs/google.md w repozytorium” – rodzic nie wie, co to repozytorium. | ważne | Usunięta; zamiast niej przewodnik w panelu (9 kroków) z adresem przekierowania wstawionym w krok. |
| 11 | Kopie zapasowe | Strona pokazuje „OK” przy kopii na tym samym dysku – wygląda, jakby wszystko było zabezpieczone. | ważne | Pusty stan „Kopie są tylko na tym komputerze” + **Dodaj Nextcloud albo NAS**; formularz dodawania otwarty, dopóki nie ma kopii poza komputerem. |
| 12 | Wydarzenia bez Google | „Brak nadchodzących wydarzeń dodanych z kiosku” – nie mówi, co dalej. | średnie | „Nie ma jeszcze wydarzeń. Połącz Kalendarz Google albo dodawaj wydarzenia tutaj” + **Połącz Google**. |
| 13 | Przewodniki – linki | Strzałka „↗” przy linkach renderowała się jako kolorowe emoji. | drobne | Wymuszony znak tekstowy. |
| 14 | Przewodniki – zrzuty | Zrzut kodu QR rozciągnięty do szerokości kolumny – rozmyty. | drobne | Zrzuty w naturalnym rozmiarze (najwyżej 440 px). |
| 15 | Odjazdy – przewodnik | Krok mówił „→ Zapisz”, a przycisk na dole strony to „Zapisz ustawienia modułu”. | drobne | Teksty kroków używają dokładnych napisów z przycisków (PL/DE/EN). |
| 16 | Telefon: Leki/Dzieci/Opieka puste | „Dodaj je w panelu” bez linku. | drobne | Administrator widzi przycisk „Ustaw w panelu ›”. |

## Zostaje (świadomie albo poza zakresem)

- **Dostęp**: opis trybu logowania mówi o `.env`, `AUTH_MODE`, `ADMIN_LOGINS` – to informacja dla osoby technicznej; przewodnik
  „Telefony domowników” prowadzi rodzica bez tego. Do przemyślenia osobno.
- **Domownicy**: pozycja „Urodziny domowników” prowadzi do tabeli z polem „Urodziny” – działa, ale wiersz jest szeroki
  (Kalendarze Google ID, e-maile). Bez zmian w tej części.
- **„Telefony domowników”** liczy się jako gotowe, gdy stronę `/telefon` otworzy dowolne urządzenie spoza kiosku – także
  komputer administratora. Lepszego sygnału (bez śledzenia urządzeń) nie ma.
- **Pole daty** pokazuje format przeglądarki (w teście `mm/dd/yyyy` z angielskiego Chromium); u użytkownika – jego format.
- **Tryb demo (PL)**: odjazdy w demo mają źródło „Własny serwer HAFAS REST”, więc sekcja Odjazdy pokazuje ostrzeżenie
  o źródle spoza Niemiec. Błąd danych demo, nie przewodników – zrzut do przewodnika go ukrywa.
- **Inne kalendarze** (`/admin/kalendarze`) – pozycja na liście bez sprawdzania stanu („›”, nie liczy się do postępu),
  dopóki sekcja warstw kalendarzy nie poda, co jest podłączone.

## English summary

Fresh install (empty start), Playwright driven only by visible labels at 1920×1080 and 390 px. Main hesitation points
and fixes: misleading "sample dates" message and no clear first action on the bin page (empty state with one button),
the iCal address hidden in Settings (moved to the bin section), entering a PDF schedule date by date (whole-year entry:
series or pasted dates, preview by month, holidays flagged, duplicates explained), the regex rules table looking mandatory
(collapsed as advanced), an empty kiosk with no hint (hint + large "Add event" button), no overview of what is left to set
up (checklist with progress, links that open the right guide, dismissable items), two guides opening at once, a reference
to `docs/google.md` (replaced by the in-panel guide), backups "OK" while only on the same disk (empty state, add form
open), and exact button names in guide steps. Left as is: technical login-mode text on the Access page, wide member rows,
"phones" counting any non-kiosk device, a demo-data transit warning in Polish demo.
