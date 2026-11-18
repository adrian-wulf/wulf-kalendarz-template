# Kopie zapasowe i przywracanie

[English below](#backups-and-restore)

Panel → **Kopie zapasowe** (`/admin/kopie`): harmonogram, miejsca kopii, szyfrowanie, przywracanie.

## Co jest w kopii

Jedno archiwum `kalendarz-RRRR-MM-DD-GGMMSS.tar.gz` (zaszyfrowane: `.tar.gz.enc`):

| plik | zawartość |
| --- | --- |
| `manifest.json` | format i jego wersja, wersja aplikacji, ostatnia migracja bazy (`schema.tag`, `schema.createdAt`), data utworzenia, liczba zdjęć |
| `kalendarz.db` | spójna migawka SQLite (backup API – działa także w trakcie zapisów) |
| `media/photos/…` | zdjęcia wygaszacza |
| `media/avatars/…` | zdjęcia domowników |

W bazie są też tokeny Google i Home Assistanta oraz hasła miejsc WebDAV – kopia, która opuszcza dom, powinna być
zaszyfrowana (niżej). Niezaszyfrowane archiwum to zwykły `tar.gz`: `tar -xzf kalendarz-….tar.gz`.

## Harmonogram i miejsca

- **Harmonogram**: codziennie albo co tydzień (dzień tygodnia) o wybranej godzinie, albo wyłączony (tylko ręcznie).
  Godzina liczy się w strefie z panelu → Region. Gdy serwer był wyłączony o tej porze, kopia powstaje zaraz po starcie.
- **Zrób kopię teraz** – kopia do wszystkich włączonych miejsc; opcjonalnie z hasłem tylko dla tej kopii (nie jest nigdzie zapisywane).
- **Pobierz nową kopię** (`/admin/backup`) – świeże archiwum prosto do przeglądarki. Działa tylko z linku w panelu (nagłówek `Sec-Fetch-Site`) i jedno archiwum naraz – obca strona nie uruchomi budowania kopii.
- **Miejsca** (do 8): każde ma własną liczbę trzymanych kopii (starsze usuwa samo), ostatni wynik i błąd, przycisk *Sprawdź*.
  Błąd jednego miejsca nie zatrzymuje pozostałych. Kopie „przed przywróceniem” nie wchodzą do tej puli (zostają 3 ostatnie).
  - **Folder** – ścieżka wewnątrz kontenera. Domyślne miejsce „Na tym urządzeniu” to `data/backups` obok bazy
    (albo `BACKUP_DIR` z `.env`). Stare nocne kopie `kalendarz-RRRR-MM-DD.db` liczą się do rotacji i można je przywrócić.
  - **WebDAV** – Nextcloud, ownCloud, Synology/QNAP (pakiet WebDAV Server), Apache mod_dav. Wysyłanie idzie do `….part`
    i dopiero po całości zmienia nazwę, więc przerwane wysyłanie nie wygląda jak kopia. Hasło aplikacji leży w tabeli
    `secrets` i nigdy nie trafia do przeglądarki.

### Nextcloud

1. Nextcloud → Ustawienia osobiste → Bezpieczeństwo → *Utwórz nowe hasło aplikacji* (np. „kalendarz”).
2. W panelu → Kopie zapasowe → Dodaj miejsce → WebDAV:
   - adres: `https://cloud.example.com/remote.php/dav/files/LOGIN/Kopie/kalendarz/` (brakujące katalogi powstaną same),
   - login: login Nextclouda, hasło: hasło aplikacji.
3. *Sprawdź*, potem *Zrób kopię teraz*.

Synology: pakiet *WebDAV Server* (HTTPS, port 5006), adres `https://192.168.1.10:5006/folder-wspoldzielony/kalendarz/` (adres IP – nazw `*.local` kontener nie rozwiąże, zob. `dns` w `app/compose.yaml`), użytkownik DSM z prawem zapisu do tego folderu.

### NAS przez SMB/NFS (jako folder)

SMB nie jest wbudowany – udział montuje się na hoście i podaje kontenerowi jako folder:

```bash
# host (Raspberry Pi OS / Debian)
sudo apt install cifs-utils
sudo mkdir -p /mnt/nas/kalendarz
printf 'username=kalendarz\npassword=HASLO\n' | sudo tee /etc/nas-kalendarz.cred && sudo chmod 600 /etc/nas-kalendarz.cred
# /etc/fstab:
//192.168.1.10/kopie/kalendarz  /mnt/nas/kalendarz  cifs  credentials=/etc/nas-kalendarz.cred,uid=0,gid=0,file_mode=0600,dir_mode=0700,_netdev,nofail,x-systemd.automount  0  0
sudo mount -a
```

NFS: `192.168.1.10:/volume1/kopie/kalendarz  /mnt/nas/kalendarz  nfs  _netdev,nofail,x-systemd.automount  0  0`.

W `app/compose.yaml` odkomentuj wolumen i uruchom ponownie (`docker compose up -d`):

```yaml
    volumes:
      - ./data:/data
      - /mnt/nas/kalendarz:/backup
```

W panelu dodaj miejsce **Folder** ze ścieżką `/backup`. *Sprawdź* zapisuje i usuwa plik próbny – od razu widać brak
uprawnień albo niezamontowany udział. Uwaga: gdy udział się nie zamontuje, `/backup` jest zwykłym katalogiem w kontenerze;
`x-systemd.automount` + `nofail` ogranicza ten przypadek, a status miejsca pokaże błąd zapisu, jeśli katalog zniknie.

Zamiast montowania na hoście można też zdefiniować wolumen Dockera z driverem `local` i `type: cifs` – efekt ten sam.

## Szyfrowanie

Włączane w panelu hasłem (min. 8 znaków). Hasło jest wtedy zapisane na serwerze (tabela `secrets`) – bez tego kopie
według harmonogramu nie mogłyby być szyfrowane. Zapisz je także poza kalendarzem: bez hasła kopii nie da się przywrócić.

Format `.tar.gz.enc`: `WKBAKENC` (8 B) | wersja `1` (1 B) | sól (16 B) | IV (12 B) | szyfrogram | znacznik GCM (16 B).
Klucz: `scrypt(hasło NFC, sól, 32, N=2^15, r=8, p=1)`, szyfr AES-256-GCM z `node:crypto`. Zmiana choćby bajtu → „Złe hasło
albo uszkodzona kopia”.

## Przywracanie

1. Panel → Kopie zapasowe → Przywracanie: wgraj plik (`.tar.gz`, `.tar.gz.enc` albo stara kopia `.db`) albo przy miejscu kopii
   kliknij *Przywróć…* (folder: lista od razu, WebDAV: *Pokaż kopie*). Duże pliki idą w kawałkach po 8 MB.
2. Serwer rozpakowuje kopię do katalogu roboczego obok bazy (`data/.kalendarz.db.work/`) i sprawdza:
   manifest, `PRAGMA integrity_check`, schemat bazy. **Kopia z nowszej wersji aplikacji jest odrzucana** – najpierw zaktualizuj kalendarz.
3. Panel pokazuje, co zostanie zastąpione (data kopii, wersja, schemat i liczba migracji do uruchomienia, liczba domowników,
   wydarzeń, zadań, zdjęć). *Przywróć tę kopię* →
   - kopia „przed przywróceniem” (`kalendarz-przed-przywroceniem-….tar.gz`) w domyślnym folderze kopii,
   - wstrzymanie pętli synchronizacji i harmonogramu kopii,
   - migracje na kopii tymczasowej (gdy kopia jest starsza) – błąd tutaj nie dotyka działającej bazy,
   - podmiana bazy jednym krokiem (SQLite backup API do pliku bazy: czytelnicy widzą starą albo nową bazę, nigdy pół na pół),
   - podmiana katalogu zdjęć (kopia samej bazy `.db` zostawia zdjęcia bez zmian),
   - ustawienia kopii (miejsca, hasła, harmonogram, szyfrowanie) zostają **obecne**, nie z kopii,
   - wznowienie synchronizacji i odświeżenie źródeł.

Ręcznie, bez panelu (niezaszyfrowana kopia), w katalogu `app`. Kontener działa jako root, więc pliki w `data/`
należą do roota – polecenia potrzebują `sudo`:

```bash
sudo docker compose stop
mkdir /tmp/k && tar -xzf kalendarz-….tar.gz -C /tmp/k
sudo cp -a data/kalendarz.db data/kalendarz.db.przed && sudo rm -f data/kalendarz.db-wal data/kalendarz.db-shm
sudo cp /tmp/k/kalendarz.db data/kalendarz.db
sudo rm -rf data/media && sudo cp -r /tmp/k/media data/media
sudo docker compose up -d   # migracje uruchomią się przy starcie
rm -rf /tmp/k               # w kopii są tokeny Google/HA – nie zostawiaj jej w /tmp
```

Bez Dockera (`npm start`) pliki muszą należeć do użytkownika, który uruchamia aplikację – po skopiowaniu jako root:
`sudo chown -R UŻYTKOWNIK: data/kalendarz.db data/media`. Bazy nie podmieniaj przy działającej aplikacji
(zostałyby stare `-wal`/`-shm`).

Zaszyfrowaną kopię przywróć z panelu – także na świeżej instalacji (kreator → panel → Kopie zapasowe).

## Ograniczenia

- SMB/NFS tylko przez zamontowany folder (wyżej); wysyłka mailem – brak.
- Archiwum powstaje najpierw lokalnie (`data/.kalendarz.db.work/backup`) – potrzeba miejsca na jedną kopię.
- Wgrywany plik: do 4 GB; pojedyncze zdjęcie w archiwum nie większe niż limit panelu (8 MB, awatar 2 MB).

---

# Backups and restore

Panel → **Backups** (`/admin/kopie`): schedule, targets, encryption, restore.

## What a backup contains

One archive `kalendarz-YYYY-MM-DD-HHMMSS.tar.gz` (encrypted: `.tar.gz.enc`) with `manifest.json` (format, app version,
last database migration, creation time, photo counts), `kalendarz.db` (a consistent SQLite snapshot taken with the backup API)
and `media/photos/…`, `media/avatars/…`. The database also holds Google and Home Assistant tokens and WebDAV passwords – encrypt
backups that leave your home.

## Schedule and targets

- Daily or weekly (weekday) at a chosen time in the panel's time zone, or off. A run missed while the server was down happens right after start.
- **Back up now** sends a backup to every enabled target, optionally with a one-off passphrase that is not stored. **Download a fresh backup** is `/admin/backup`. It works only from the panel's link (`Sec-Fetch-Site` header) and builds one archive at a time – another site cannot trigger it.
- Up to 8 targets, each with its own retention, last result and error, and a *Test* button. One failing target does not stop the others.
  "Before restore" backups are kept separately (last 3).
  - **Folder**: a path inside the container. The default target is `data/backups` next to the database (or `BACKUP_DIR`).
    Old nightly `kalendarz-YYYY-MM-DD.db` files count towards retention and can be restored.
  - **WebDAV**: Nextcloud, ownCloud, Synology/QNAP WebDAV Server, Apache mod_dav. Uploads go to `….part` and are moved into place when complete.
    The app password is stored in the `secrets` table and never sent to the browser.

**Nextcloud**: Personal settings → Security → create an app password; in the panel add a WebDAV target with
`https://cloud.example.com/remote.php/dav/files/LOGIN/Backups/calendar/` (missing folders are created), your Nextcloud login and the app password; *Test*, then *Back up now*.
**Synology**: install *WebDAV Server* (HTTPS port 5006), URL `https://192.168.1.10:5006/shared-folder/calendar/` (an IP address – the container cannot resolve `*.local` names, see `dns` in `app/compose.yaml`).

**NAS over SMB/NFS**: mount the share on the host and hand it to the container as a folder – see the `fstab` lines above
(`cifs` with a credentials file, or `nfs`, both with `_netdev,nofail,x-systemd.automount`), uncomment `- /mnt/nas/kalendarz:/backup`
in `app/compose.yaml`, `docker compose up -d`, then add a **Folder** target `/backup`. *Test* writes and deletes a probe file, so a missing mount or
permissions show up immediately.

## Encryption

Turned on in the panel with a passphrase (8+ characters), which is then stored on the server – scheduled backups could not be
encrypted otherwise. Keep a copy of it elsewhere: an encrypted backup cannot be restored without it.
Format: `WKBAKENC` | version `1` | salt (16) | IV (12) | ciphertext | GCM tag (16); key = `scrypt(passphrase NFC, salt, 32, N=2^15, r=8, p=1)`, AES-256-GCM.

## Restore

1. Upload a file (`.tar.gz`, `.tar.gz.enc` or an old `.db`) or press *Restore…* next to a file in a target list. Large files are uploaded in 8 MB chunks.
2. The server unpacks it into a work folder next to the database and checks the manifest, `PRAGMA integrity_check` and the schema.
   **Backups from a newer app version are refused** – update the calendar first.
3. The panel shows what will be replaced (date, version, schema and pending migrations, counts). *Restore this backup* then:
   saves a "before restore" backup, pauses the sync loop and the backup schedule, runs migrations on the staged copy (an older
   backup is upgraded before it touches the live database), swaps the database in one locked step (SQLite backup API into the live
   file), swaps the photo folder (a database-only `.db` backup leaves photos alone), keeps the **current** backup settings
   (targets, passwords, schedule, encryption), and resumes syncing.

Manual restore without the panel (unencrypted), in the `app` folder: the container runs as root, so files in `data/` belong to
root and the commands need `sudo` – `sudo docker compose stop`, extract the archive, `sudo cp` it over `data/kalendarz.db` (keep a copy
of the old one and remove `-wal`/`-shm`) and `data/media`, `sudo docker compose up -d` – migrations run at startup; delete the extracted
copy afterwards (it contains Google/HA tokens). Without Docker (`npm start`) the files must belong to the user running the app:
`sudo chown -R USER: data/kalendarz.db data/media`. Never swap the database while the app is running. Restore encrypted backups from the panel, also on a fresh install.

## Limits

SMB/NFS only as a mounted folder; no e-mail target. The archive is built locally first (space for one backup needed).
Uploads up to 4 GB; files inside the archive are capped at the panel's photo limits.
