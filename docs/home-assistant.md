# Home Assistant na kalendarzu

[Polski](#polski) | [English](#english)

## Polski

Moduł **Home Assistant** (`homeassistant`, domyślnie wyłączony) pokazuje na kiosku kafelek „Dom”:
czujniki (temperatura, wilgotność), światła i gniazdka (z przełączaniem), zamki, rolety, czujniki
binarne (okno, ruch) i podgląd kamer.

### Jak to działa

```
kiosk (przeglądarka) ──► serwer kalendarza ──► Home Assistant (REST API)
          ▲                     │  token z tabeli `secrets`
          └── gotowe kafelki ◄──┘  stany co N s (pętla synchronizacji)
```

- Adres HA i **długoterminowy token** leżą w tabeli `secrets` w bazie kalendarza. Nie trafiają do
  przeglądarki: kiosk dostaje tylko gotowe dane kafelków (nazwa, stan, ikona).
- Stany pobiera serwer (`GET /api/states`) co „Odświeżanie stanów” sekund i zapisuje tylko wybrane encje.
- Przełączenie światła z kiosku idzie przez `POST /api/homeassistant/toggle` tej aplikacji – serwer
  sprawdza, czy encja jest wybrana w panelu i czy to światło/gniazdko, i dopiero wtedy woła
  `POST /api/services/<domena>/toggle` w HA. **Zamków, bram i alarmów nie da się otworzyć z kiosku.**
- Obraz z kamery: `GET /api/homeassistant/camera/<encja>` – serwer pobiera `camera_proxy` z HA z tokenem
  i oddaje sam obraz (tylko JPEG/PNG/WebP/GIF, tylko kamery wybrane w panelu). Kiosk odświeża go co
  „Odświeżanie obrazu kamer” sekund; dotknięcie powiększa obraz.

### Konfiguracja

1. W Home Assistancie utwórz (najlepiej osobnego) użytkownika bez uprawnień administratora, np. `kalendarz`.
   Zaloguj się nim → profil (lewy dolny róg) → **Bezpieczeństwo** → **Tokeny dostępu długoterminowego** → Utwórz.
2. W kalendarzu: panel → **Moduły** → włącz **Home Assistant**, potem sekcja **Home Assistant**:
   adres (np. `http://192.168.1.20:8123`) i token → Zapisz.
   Pole tokenu po zapisie pokazuje tylko jego końcówkę; puste pole przy kolejnym zapisie zostawia stary token.
3. Zaznacz encje na kiosku, opcjonalnie wpisz własne nazwy → **Zapisz wybór**. Kolejność jak na liście.
4. W ustawieniach modułu (dół strony) ustaw odświeżanie i to, czy kiosk może przełączać światła.

Kalendarz i Home Assistant muszą się widzieć w sieci. W Dockerze wpisuj **adres IP** Home Assistanta (najlepiej
stały – rezerwacja DHCP w routerze): nazwy mDNS (`homeassistant.local`) w kontenerze nie działają, a kontener używa
stałych serwerów DNS (`compose.yaml`, bo Tailscale MagicDNS jest z Dockera nieosiągalny), które nie znają nazw z sieci
domowej. Nazwa jest konieczna? Ustaw `DNS1=<IP routera>` w `app/.env` albo dopisz ją w `extra_hosts` w `compose.yaml`.

### Kamery (RTSP/HLS) przez go2rtc

Kafelek pokazuje **zdjęcie** z kamery odświeżane co kilka sekund – to wystarcza na ekran w przedpokoju
i nie obciąża słabego komputera. Kamera musi być encją `camera.*` w HA. Jeśli masz tylko strumień RTSP:

1. Zainstaluj dodatek **go2rtc** (albo integrację „WebRTC Camera”, która go zawiera) i dodaj strumień:

   ```yaml
   # go2rtc.yaml
   streams:
     wejscie: rtsp://user:haslo@192.168.1.50:554/stream1
   ```

2. W HA dodaj kamerę z obrazem z go2rtc, np. integracją **Generic Camera**:
   - Still image URL: `http://<go2rtc>:1984/api/frame.jpeg?src=wejscie`
   - Stream source (opcjonalnie): `rtsp://<go2rtc>:8554/wejscie`
3. Nowa encja (np. `camera.wejscie`) pojawi się na liście w panelu kalendarza – zaznacz ją.

Żywy obraz (HLS/WebRTC) na kiosku nie jest wbudowany celowo: Chromium na starym all-in-one dekoduje
wideo programowo i zjada procesor. Jeśli mimo to chcesz, zobacz „Własne integracje” w [modules.md](modules.md).

### Bezpieczeństwo

- Token daje dostęp do HA z uprawnieniami użytkownika – dlatego osobny użytkownik bez praw administratora.
- Token jest w bazie kalendarza i w jej kopiach zapasowych (panel → kopia) – trzymaj je jak hasła.
- Kiosk (bez logowania, dostępny z localhost) może tylko: czytać stany wybranych encji, przełączać wybrane
  światła/gniazdka (da się to wyłączyć w ustawieniach) i oglądać wybrane kamery.
- Odłączenie (przycisk „Odłącz”) usuwa adres i token z bazy.

## English

The **Home Assistant** module (`homeassistant`, off by default) adds a "Home" tile to the kiosk: sensors,
lights and plugs (switchable), locks, covers, binary sensors and camera snapshots.

- The HA URL and a **long-lived access token** are stored in the `secrets` table and never reach the browser.
  The server polls `GET /api/states` and keeps only the selected entities; the kiosk gets ready-made tile data.
- Toggling goes through this app (`POST /api/homeassistant/toggle`): only selected lights/switches, never locks.
- Camera images are proxied by the server (`/api/homeassistant/camera/<entity>` → HA `camera_proxy`, raster
  images only) and refreshed every N seconds.
- Setup: create a non-admin HA user, create a long-lived token (Profile → Security), enable the module in
  the panel, enter URL (e.g. `http://192.168.1.20:8123`) and token, pick entities.
- In Docker use Home Assistant's **IP address** (ideally a DHCP reservation): mDNS names (`homeassistant.local`) never
  resolve inside the container, and the container uses fixed public DNS servers (`compose.yaml` – Tailscale MagicDNS is
  unreachable from Docker), which don't know LAN names. Need a name? Set `DNS1=<router IP>` in `app/.env` or add it
  under `extra_hosts` in `compose.yaml`.
- RTSP cameras: add the stream to **go2rtc**, then create a Generic Camera in HA with the still image URL
  `http://<go2rtc>:1984/api/frame.jpeg?src=<name>`; pick the new `camera.*` entity in the panel.
