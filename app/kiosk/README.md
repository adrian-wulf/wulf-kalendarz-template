# Kiosk: instalacja na Debianie

[Polski](#polski) | [English](#english)

## Polski

### Pliki

| Plik | Co robi |
|---|---|
| `install.sh` | instaluje kiosk na świeżym Debianie 12/13 bez pulpitu |
| `uninstall.sh` | usuwa to, co zapisał `install.sh` (pakiety, użytkownik i dane zostają) |
| `kiosk.sh` | pętla Cage + Chromium; czeka na aplikację, po awarii przeglądarki startuje ją ponownie |
| `ekran-agent.py`, `ekran-agent.service` | agent ekranu: jasność według pory dnia, w nocy ekran zgaszony, dotyk tylko budzi |

### BIOS / UEFI

- **Restore on AC Power Loss → Power On** (nazwa bywa inna: „After Power Failure”, „AC Recovery”). Najważniejsze ustawienie: po zaniku prądu komputer sam wraca do kalendarza.
- SATA Mode → AHCI (nie RAID/RST), Fast Boot wyłączony na czas instalacji, Secure Boot może zostać, Debian go obsługuje.
- Menu startu otwiera się zwykle klawiszem F7, F11 albo F12.
- **Klawiatura:** klawiatury gamingowe i bezprzewodowe z przełącznikiem trybów (USB / 2,4 GHz / Bluetooth) potrafią nie działać w BIOS-ie i w instalatorze, mimo że świecą. Użyj zwykłej przewodowej klawiatury biurowej. Do UEFI można też wejść z Windowsa samym dotykiem: Shift + Uruchom ponownie → Rozwiązywanie problemów → Ustawienia oprogramowania układowego UEFI.

### Instalacja

```bash
cd <repozytorium>/app
sudo ./kiosk/install.sh                  # pyta o użytkownika, port, Dockera, Tailscale
sudo ./kiosk/install.sh kiosk --port 3000 --docker --no-tailscale --yes   # bez pytań
sudo reboot
```

Kroki skryptu (każdy można powtórzyć bez szkody):

1. **Pakiety:** `cage`, `chromium`, `seatd`, fonty Noto (w tym emoji; bez nich część znaków to puste kwadraty), `python3`, `curl`, `alsa-utils`.
2. **Użytkownik kiosku** (domyślnie `kiosk`, bez hasła) w grupach `video`, `input`, `render`, `audio`.
3. **Ustawienia** w `/etc/kiosk/kiosk.conf`: `KIOSK_USER`, `KIOSK_PORT`. Opcjonalnie `KIOSK_URL`, `KIOSK_CHROMIUM_FLAGS`, `KIOSK_TOUCH`.
4. **Autologowanie na tty1:** `/etc/systemd/system/getty@tty1.service.d/autologin.conf`.
5. **Sesja kiosku:** `~/.bash_profile` użytkownika kiosku uruchamia na tty1 `/usr/local/lib/kiosk/kiosk.sh`. Chromium startuje w Cage z `--kiosk`, bez tłumaczenia stron (`--disable-features=Translate`), bez ekranu pierwszego uruchomienia, bez dymków po awarii, bez cofania stron gestem i bez powiększania dwoma palcami. Dotyk działa normalnie.
6. **Agent ekranu:** `/usr/local/lib/kiosk/ekran-agent.py` jako usługa `ekran-agent`. Co 30 s pyta `http://127.0.0.1:KIOSK_PORT/api/display` i ustawia podświetlenie przez `/sys/class/backlight`. Godziny nocy (osobno w tygodniu i w weekend) i jasność dzienną, wieczorną, nocną i nocnego wybudzenia ustawia się w panelu → Ekran; starsza aplikacja bez tych pól daje poziomy domyślne (100 / 55 / 0 / 40 %). Testy agenta: `python3 -m unittest discover -s kiosk -p 'test_*.py'`. Cage nie umie wyłączyć wyjścia obrazu, dlatego sterujemy podświetleniem. Bez urządzenia podświetlenia (np. zewnętrzny monitor) usługa zostaje wyłączona.
7. **Docker i aplikacja** (opcjonalnie): Docker z repozytorium docker.com, `app/.env` z `.env.example` (z `HOST_PORT=KIOSK_PORT`), `docker compose up -d --build`. W `compose.yaml` jest stały DNS (`1.1.1.1`, `9.9.9.9`): po starcie Tailscale przejmuje DNS hosta (`100.100.100.100`), którego kontener nie widzi, i bez tego aplikacja przestaje pobierać dane.
8. **Tailscale** (opcjonalnie): instalacja i `tailscaled`, bez logowania. Skrypt wypisuje polecenia `tailscale up` i `tailscale serve --bg PORT` do wykonania ręcznie.

Logi: `~kiosk/kiosk.log` (najwyżej ok. 5 MB, starsza część w `kiosk.log.1`; limit `KIOSK_LOG_MAX_KB` w `/etc/kiosk/kiosk.conf`), `journalctl -u ekran-agent`, `docker compose logs` w katalogu `app` (3 × 10 MB).

### Po instalacji

- Odświeżenie strony bez restartu: aplikacja sama przeładowuje się po wdrożeniu nowej wersji, gdy nikt nie dotyka ekranu, i codziennie o 4:00.
- Krótkie naciśnięcie przycisku zasilania bezpiecznie wyłącza system.
- Zrzut ekranu zdalnie: `apt install grim`, potem `sudo -u kiosk XDG_RUNTIME_DIR=/run/user/$(id -u kiosk) WAYLAND_DISPLAY=wayland-0 grim /tmp/ekran.png`.
- Ustawienia na ekranie: przytrzymaj zegar przez 2 s. Z ustawionym PIN-em (panel → Dostęp) najpierw klawiatura PIN-u. W ustawieniach: motyw, układ, jasność na teraz (do zmiany pory dnia, przez agenta ekranu), wygaszacz, odświeżenie danych i kod QR do telefonu i panelu (z `PUBLIC_ORIGIN`). W trybie `AUTH_MODE=password` bez hasła jest tam też kod do ustawienia hasła na `/login`.
- Kiosk i agent ekranu łączą się z `localhost`/`127.0.0.1` i działają bez logowania w każdym trybie `AUTH_MODE` – nie zmieniaj `KIOSK_URL` na adres z Tailscale ani proxy (wtedy kiosk musiałby się logować). Szczegóły: README → Bezpieczeństwo.

### Układ ekranu i obrót

- Układ wybiera się w panelu: **Układ ekranu** (`/admin/uklad`) – Dziś + tydzień, Tydzień, Miesiąc, Pionowy (1080×1920), Mały ekran (1280×800, 1366×768). Rozdzielczość „Automatycznie” bierze wymiary okna Chromium.
- Obraz obraca kompozytor, nie strona: wtedy Chromium dostaje okno 1080×1920, a dotyk obraca się razem z obrazem. Cage nie ma własnej opcji obrotu – w jego sesji działa `wlr-randr` (`apt install wlr-randr`):

  ```bash
  sudo -u kiosk XDG_RUNTIME_DIR=/run/user/$(id -u kiosk) WAYLAND_DISPLAY=wayland-0 wlr-randr                                   # nazwy wyjść
  sudo -u kiosk XDG_RUNTIME_DIR=/run/user/$(id -u kiosk) WAYLAND_DISPLAY=wayland-0 wlr-randr --output HDMI-A-1 --transform 90
  ```

  Gdy obraz jest do góry nogami, użyj `270`. Obrót trzyma się do restartu Cage. Wartość z panelu (0/90/180/270) podaje też `GET /api/display` (`rotation`) – dla agenta ekranu i skryptów instalacji.
- Konsola tekstowa przed startem Cage: parametr jądra `fbcon=rotate:1` (90°) w `GRUB_CMDLINE_LINUX`, potem `update-grub`.

## English

### Files

| File | What it does |
|---|---|
| `install.sh` | installs the kiosk on a fresh Debian 12/13 without a desktop |
| `uninstall.sh` | removes what `install.sh` wrote (packages, the user and data stay) |
| `kiosk.sh` | Cage + Chromium loop; waits for the app and restarts the browser after a crash |
| `ekran-agent.py`, `ekran-agent.service` | screen agent: brightness by time of day, screen off at night, a touch only wakes it |

### BIOS / UEFI

- **Restore on AC Power Loss → Power On** (also called "After Power Failure" or "AC Recovery"). The most important setting: after a power cut the PC comes back to the calendar by itself.
- SATA Mode → AHCI (not RAID/RST), Fast Boot off during the install, Secure Boot can stay on, Debian supports it.
- The boot menu is usually F7, F11 or F12.
- **Keyboard:** gaming and wireless keyboards with a mode switch (USB / 2.4 GHz / Bluetooth) may not work in the BIOS or the installer even though they light up. Use a plain wired office keyboard. From Windows you can reach UEFI by touch only: Shift + Restart → Troubleshoot → UEFI Firmware Settings.

### Install

```bash
cd <repository>/app
sudo ./kiosk/install.sh                  # asks for user, port, Docker, Tailscale
sudo ./kiosk/install.sh kiosk --port 3000 --docker --no-tailscale --yes   # no questions
sudo reboot
```

What the script does (every step is safe to repeat):

1. **Packages:** `cage`, `chromium`, `seatd`, Noto fonts (including emoji; without them some glyphs render as empty boxes), `python3`, `curl`, `alsa-utils`.
2. **Kiosk user** (default `kiosk`, no password) in the groups `video`, `input`, `render`, `audio`.
3. **Settings** in `/etc/kiosk/kiosk.conf`: `KIOSK_USER`, `KIOSK_PORT`. Optional `KIOSK_URL`, `KIOSK_CHROMIUM_FLAGS`, `KIOSK_TOUCH`.
4. **Autologin on tty1:** `/etc/systemd/system/getty@tty1.service.d/autologin.conf`.
5. **Kiosk session:** the kiosk user's `~/.bash_profile` starts `/usr/local/lib/kiosk/kiosk.sh` on tty1. Chromium runs inside Cage with `--kiosk`, page translation disabled (`--disable-features=Translate`), no first-run screen, no crash bubbles, no swipe-back navigation and no pinch zoom. Touch works as usual.
6. **Screen agent:** `/usr/local/lib/kiosk/ekran-agent.py` as the `ekran-agent` service. Every 30 s it asks `http://127.0.0.1:KIOSK_PORT/api/display` and sets the backlight via `/sys/class/backlight`. Night hours (weekdays and weekend separately) and the day, evening, night and night-wake brightness are set in the panel → Screen; an older app without these fields gives the default levels (100 / 55 / 0 / 40 %). Agent tests: `python3 -m unittest discover -s kiosk -p 'test_*.py'`. Cage cannot power off the output, so the agent controls the backlight. Without a backlight device (for example an external monitor) the service stays disabled.
7. **Docker and the app** (optional): Docker from the docker.com repository, `app/.env` from `.env.example` (with `HOST_PORT=KIOSK_PORT`), `docker compose up -d --build`. `compose.yaml` pins DNS (`1.1.1.1`, `9.9.9.9`): once Tailscale is up it owns the host DNS (`100.100.100.100`), which the container cannot reach, and the app would stop fetching data.
8. **Tailscale** (optional): installs it and starts `tailscaled`, without logging in. The script prints the `tailscale up` and `tailscale serve --bg PORT` commands to run yourself.

Logs: `~kiosk/kiosk.log` (capped at about 5 MB, the older part in `kiosk.log.1`; `KIOSK_LOG_MAX_KB` in `/etc/kiosk/kiosk.conf`), `journalctl -u ekran-agent`, `docker compose logs` in the `app` folder (3 × 10 MB).

### After the install

- No manual refresh needed: the app reloads itself after a new version is deployed (when nobody touches the screen) and daily at 4:00.
- A short press of the power button shuts the system down cleanly.
- Remote screenshot: `apt install grim`, then `sudo -u kiosk XDG_RUNTIME_DIR=/run/user/$(id -u kiosk) WAYLAND_DISPLAY=wayland-0 grim /tmp/screen.png`.
- Settings on the screen: hold the clock for 2 s. With a PIN set (panel → Access) the PIN pad comes first. The settings offer theme, layout, brightness for now (until the time of day changes, through the screen agent), screensaver, a data refresh and QR codes for the phone and the panel (from `PUBLIC_ORIGIN`). In `AUTH_MODE=password` without a password they also show the code to set it on `/login`.
- The kiosk and the screen agent connect to `localhost`/`127.0.0.1` and work without sign-in in every `AUTH_MODE` – do not point `KIOSK_URL` at the Tailscale or proxy address (the kiosk would then have to sign in). Details: README → Security.

### Screen layout and rotation

- Pick the layout in the admin panel: **Układ ekranu** (`/admin/uklad`) – today + week, week, month, portrait (1080×1920), small screen (1280×800, 1366×768). Resolution "Automatycznie" uses the Chromium window size.
- The compositor rotates the picture, not the page: Chromium then gets a 1080×1920 window and touch is rotated with the picture. Cage has no rotation option of its own – use `wlr-randr` inside its session (`apt install wlr-randr`):

  ```bash
  sudo -u kiosk XDG_RUNTIME_DIR=/run/user/$(id -u kiosk) WAYLAND_DISPLAY=wayland-0 wlr-randr                                   # output names
  sudo -u kiosk XDG_RUNTIME_DIR=/run/user/$(id -u kiosk) WAYLAND_DISPLAY=wayland-0 wlr-randr --output HDMI-A-1 --transform 90
  ```

  If the picture is upside down, use `270`. The rotation lasts until Cage restarts. The value set in the panel (0/90/180/270) is also returned by `GET /api/display` (`rotation`) for the screen agent and install scripts.
- Text console before Cage starts: kernel parameter `fbcon=rotate:1` (90°) in `GRUB_CMDLINE_LINUX`, then `update-grub`.
