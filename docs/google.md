# Kalendarz Google – konfiguracja

[English below](#google-calendar-setup)

Kalendarz czyta i zapisuje wydarzenia przez Google Calendar API **Waszej własnej** aplikacji w Google Cloud. Nie ma wspólnego
serwera ani klucza autora – każdy dom zakłada swój projekt (bezpłatnie, ok. 10 minut). Panel → **Google Calendar** prowadzi
przez trzy kroki: klient OAuth, połączenie z kontem rodzinnym, przypisanie kalendarzy.

## 1. Projekt w Google Cloud

1. Otwórz [console.cloud.google.com](https://console.cloud.google.com/) kontem, które ma być „właścicielem” aplikacji
   (może to być konto rodzinne).
2. Na górze: wybór projektu → **Nowy projekt**, nazwa np. `kalendarz-domowy` → **Utwórz**. Upewnij się, że ten projekt jest
   wybrany.

## 2. Włącz Google Calendar API

**Interfejsy API i usługi** → **Biblioteka** → wyszukaj „Google Calendar API” → **Włącz**.

## 3. Ekran zgody OAuth

**Interfejsy API i usługi** → **Ekran zgody OAuth** (w nowszej konsoli: **Google Auth Platform** → **Branding** / **Odbiorcy**):

1. Typ użytkowników: **Zewnętrzny** (External). „Wewnętrzny” jest tylko dla Google Workspace.
2. Nazwa aplikacji (np. „Kalendarz domowy”), e-mail pomocy i e-mail dewelopera – Twój adres. Logo i domeny można pominąć.
3. Zakresy (Scopes) można pominąć – aplikacja sama prosi o `calendar.events` i `calendar.calendarlist.readonly`.
4. **Użytkownicy testowi**: dodaj konto rodzinne (to, którym połączysz kalendarz w panelu).

### Opublikuj aplikację – inaczej co 7 dni trzeba się logować ponownie

Dopóki aplikacja ma stan **Testowanie** (Testing), Google unieważnia zgodę po **7 dniach** – kiosk pokaże wtedy
„Kalendarz: zaloguj ponownie w panelu”. Dlatego na ekranie zgody (**Odbiorcy** / Audience) kliknij **Opublikuj aplikację**
→ **W wersji produkcyjnej** (Publish app → In production). Weryfikacja przez Google **nie** jest potrzebna dla aplikacji
na własny użytek (do 100 użytkowników) – status „Wymaga weryfikacji” można zignorować.

Po publikacji połącz konto w panelu jeszcze raz (**Połącz ponownie**), żeby dostać token bez limitu 7 dni.

## 4. Klient OAuth

**Interfejsy API i usługi** → **Dane logowania** → **Utwórz dane logowania** → **Identyfikator klienta OAuth**
(w nowszej konsoli: **Google Auth Platform** → **Klienci** → **Utwórz klienta**):

1. Typ aplikacji: **Aplikacja internetowa** (Web application).
2. **Autoryzowane identyfikatory URI przekierowania**: wklej adres z panelu → Google Calendar → krok 1
   („Identyfikator URI przekierowania w Google Cloud”), np. `https://kalendarz.twoj-tailnet.ts.net/admin/google/callback`.
   Musi się zgadzać co do znaku (https, nazwa, brak ukośnika na końcu). Adres powstaje z `PUBLIC_ORIGIN` w `app/.env`
   albo z adresu, pod którym otwarto panel; `GOOGLE_REDIRECT_URI` go nadpisuje.
3. **Utwórz** → skopiuj **Identyfikator klienta** (`….apps.googleusercontent.com`) i **Tajny klucz klienta** do panelu
   → Google Calendar → krok 1 → **Zapisz**.

Google przyjmuje jako adres przekierowania `https://…` albo `http://localhost`. Adres w tailnecie z `tailscale serve`
ma https, więc działa od razu.

## 5. Połącz konto rodzinne

Panel → Google Calendar → **Połącz z Google** → zaloguj się **kontem rodzinnym**.

Google pokaże ostrzeżenie **„Google nie zweryfikował tej aplikacji”** – to normalne, to Wasza własna aplikacja:
**Zaawansowane** → **Przejdź do „Kalendarz domowy” (niebezpieczne)** → zaznacz oba uprawnienia → **Dalej**.

## 6. Wspólne kalendarze wielu kont

Najprościej: jedno **konto rodzinne** (np. `rodzina@gmail.com`), którym łączysz panel, i osobne konta domowników.
Kiosk widzi wszystko, co konto rodzinne ma na liście kalendarzy:

- kalendarze utworzone na koncie rodzinnym („Rodzina”, „Kartki”, „Kita”, „Urodziny”) – kiosk może w nich zapisywać,
- kalendarze domowników, które **udostępnili** kontu rodzinnemu.

Każdy domownik w swoim Kalendarzu Google: **Ustawienia** → wybrany kalendarz → **Udostępnij określonym osobom lub grupom**
→ **Dodaj osoby** → adres konta rodzinnego i uprawnienie:

- **„Wyświetlanie wszystkich szczegółów wydarzenia”** (See all event details) – kiosk pokazuje wydarzenia z tytułami,
- **„Wprowadzanie zmian w wydarzeniach”** (Make changes to events) – gdy kiosk ma też dopisywać do tego kalendarza,
- „Wyświetlanie tylko informacji wolny/zajęty” wystarczy tylko na „zajęty” bez tytułów (panel oznacza go jako *wolny/zajęty*).

Konto rodzinne dostaje e-mail z zaproszeniem – kliknij link (albo w Kalendarzu Google konta rodzinnego: **Inne kalendarze**
→ **+** → **Subskrybuj kalendarz**), żeby kalendarz pojawił się na jego liście. Potem odśwież panel.

Na odwrót też działa: domownicy mogą subskrybować kalendarz „Rodzina” konta rodzinnego na swoich telefonach
(udostępnij go im z uprawnieniem „Wprowadzanie zmian”).

## 7. Role w panelu

Panel → Google Calendar → krok 3 **Przypisz kalendarze** – dla każdego kalendarza z listy:

| rola | co robi |
| --- | --- |
| **Rodzina (zapisy z kiosku)** | wspólny kalendarz; nowe wydarzenia z kiosku i telefonu trafiają tutaj (wymagany) |
| **Kartki** | krótkie wiadomości na kiosku zapisywane jako wydarzenia (opcjonalnie) |
| **Kita** | przedszkole / szkoła – na kiosku w kolorze akcentu (opcjonalnie) |
| **Urodziny** | urodziny spoza domowników (opcjonalnie) |
| **Kalendarz domownika** | wydarzenia w kolorze wybranego domownika; domownik może mieć kilka kalendarzy |
| **nie pokazuj** | kalendarz pomijany |

Kalendarze z rolą „Rodzina” i „Kartki” muszą być własne konta rodzinnego albo udostępnione z prawem do zmian.

## Problemy

- **„redirect_uri_mismatch”** – adres przekierowania w Google Cloud różni się od tego z panelu (sprawdź https i nazwę hosta).
- **„access_denied” / „Aplikacja jest w fazie testów”** – konto nie jest na liście użytkowników testowych albo opublikuj aplikację (krok 3).
- **Co tydzień „zaloguj ponownie”** – aplikacja nadal w trybie „Testowanie”; opublikuj ją i połącz ponownie.
- **„Google nie zwrócił refresh tokenu”** – w [myaccount.google.com/permissions](https://myaccount.google.com/permissions) usuń dostęp
  aplikacji i połącz ponownie.
- **Brak czyjegoś kalendarza** – nie jest udostępniony kontu rodzinnemu albo zaproszenie nie zostało przyjęte.

---

# Google Calendar setup

The calendar reads and writes events through the Google Calendar API of **your own** Google Cloud app. There is no shared
server or author key – each household creates its own project (free, about 10 minutes). The panel → **Google Calendar** walks
you through three steps: OAuth client, connecting the family account, assigning calendars.

## 1. Google Cloud project

1. Open [console.cloud.google.com](https://console.cloud.google.com/) with the account that should own the app (it can be the
   family account).
2. At the top: project picker → **New project**, name e.g. `home-calendar` → **Create**. Make sure the project is selected.

## 2. Enable the Google Calendar API

**APIs & Services** → **Library** → search "Google Calendar API" → **Enable**.

## 3. OAuth consent screen

**APIs & Services** → **OAuth consent screen** (newer console: **Google Auth Platform** → **Branding** / **Audience**):

1. User type: **External**. "Internal" is for Google Workspace only.
2. App name (e.g. "Home calendar"), support e-mail and developer e-mail – your address. Logo and domains can be skipped.
3. Scopes can be skipped – the app requests `calendar.events` and `calendar.calendarlist.readonly` itself.
4. **Test users**: add the family account (the one you will connect in the panel).

### Publish the app – otherwise you sign in again every 7 days

While the app is in **Testing**, Google revokes the consent after **7 days** – the kiosk then shows "Calendar: sign in again
in the panel". On the consent screen (**Audience**) click **Publish app** → **In production**. Google verification is **not**
needed for an app for your own use (up to 100 users) – ignore the "Needs verification" status.

After publishing, connect the account in the panel once more (**Reconnect**) to get a token without the 7-day limit.

## 4. OAuth client

**APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**
(newer console: **Google Auth Platform** → **Clients** → **Create client**):

1. Application type: **Web application**.
2. **Authorized redirect URIs**: paste the address from the panel → Google Calendar → step 1 ("Redirect URI in Google
   Cloud"), e.g. `https://kalendarz.your-tailnet.ts.net/admin/google/callback`. It must match exactly (https, host name, no
   trailing slash). It is built from `PUBLIC_ORIGIN` in `app/.env` or from the address the panel was opened at;
   `GOOGLE_REDIRECT_URI` overrides it.
3. **Create** → copy the **Client ID** (`….apps.googleusercontent.com`) and the **Client secret** into the panel → Google
   Calendar → step 1 → **Save**.

Google accepts `https://…` or `http://localhost` redirect URIs. A tailnet address from `tailscale serve` is https, so it works
out of the box.

## 5. Connect the family account

Panel → Google Calendar → **Connect to Google** → sign in with the **family account**.

Google shows **"Google hasn't verified this app"** – expected, it is your own app: **Advanced** → **Go to "Home calendar"
(unsafe)** → tick both permissions → **Continue**.

## 6. Sharing calendars between several accounts

Simplest setup: one **family account** (e.g. `family@gmail.com`) connected in the panel, plus each member's own account.
The kiosk sees every calendar on the family account's calendar list:

- calendars created on the family account ("Family", "Notes", "Nursery", "Birthdays") – the kiosk can write to them,
- members' calendars **shared** with the family account.

Each member, in their Google Calendar: **Settings** → the calendar → **Share with specific people or groups** → **Add people**
→ the family account address and a permission:

- **"See all event details"** – the kiosk shows events with titles,
- **"Make changes to events"** – when the kiosk should also add events to this calendar,
- "See only free/busy" shows just "busy" without titles (the panel marks it *free/busy*).

The family account gets an invitation e-mail – open the link (or in the family account's Google Calendar: **Other calendars**
→ **+** → **Subscribe to calendar**) so the calendar appears on its list. Then reload the panel.

It works the other way round too: members can add the family account's "Family" calendar on their phones (share it with
them with "Make changes to events").

## 7. Roles in the panel

Panel → Google Calendar → step 3 **Assign calendars** – for each calendar on the list:

| role | what it does |
| --- | --- |
| **Family (saved from the kiosk)** | the shared calendar; new events from the kiosk and phone go here (required) |
| **Notes** | short kiosk messages stored as events (optional) |
| **Nursery** | nursery / school – shown in the accent colour (optional) |
| **Birthdays** | birthdays of people outside the household (optional) |
| **Family member's calendar** | events in that member's colour; a member can have several calendars |
| **don't show** | calendar skipped |

Calendars with the "Family" and "Notes" roles must be owned by the family account or shared with "Make changes to events".

## Troubleshooting

- **"redirect_uri_mismatch"** – the redirect URI in Google Cloud differs from the panel's (check https and the host name).
- **"access_denied" / "app is being tested"** – the account is not a test user; add it, or publish the app (step 3).
- **"Sign in again" every week** – the app is still in Testing; publish it and reconnect.
- **"Google did not return a refresh token"** – remove the app's access at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and connect again.
- **Someone's calendar is missing** – it is not shared with the family account, or the invitation was not accepted.
