#!/usr/bin/env bash
# Instalacja kiosku na świeżym Debianie 12/13 bez pulpitu (bookworm / trixie).
# Kiosk installer for a fresh, minimal Debian 12/13 (no desktop).
#
#   sudo ./install.sh [UŻYTKOWNIK] [opcje]
#
# Opcje / options:
#   --user NAZWA        użytkownik kiosku (domyślnie: kiosk) / kiosk user (default: kiosk)
#   --port PORT         port aplikacji na 127.0.0.1 (domyślnie: 3000) / app port (default: 3000)
#   --docker | --no-docker        zainstalować Dockera i uruchomić aplikację / install Docker and start the app
#   --tailscale | --no-tailscale  zainstalować Tailscale (bez logowania) / install Tailscale (no login)
#   -y, --yes           bez pytań, wartości domyślne / no questions, use defaults
#   -h, --help
#
# Skrypt można uruchamiać wielokrotnie: każdy krok sprawdza stan i nadpisuje tylko własne pliki.
# Safe to re-run: every step checks the current state and only rewrites its own files.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=$(dirname -- "$SCRIPT_DIR")
CONF_DIR=/etc/kiosk
CONF=$CONF_DIR/kiosk.conf
LIB_DIR=/usr/local/lib/kiosk
GETTY_DROPIN=/etc/systemd/system/getty@tty1.service.d/autologin.conf
AGENT_UNIT=/etc/systemd/system/ekran-agent.service
STEPS=8
STEP=0

say() { printf '%s\n' "$*"; }
step() {
	STEP=$((STEP + 1))
	printf '\n==> [%d/%d] %s / %s\n' "$STEP" "$STEPS" "$1" "$2"
}
info() { printf '    %s\n' "$*"; }
warn() { printf '    UWAGA / WARNING: %s\n' "$*" >&2; }
die() {
	printf 'BŁĄD / ERROR: %s\n' "$*" >&2
	exit 1
}

usage() { sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; }

# Wartość z pliku KEY=VALUE (bez wykonywania pliku). Read KEY from a KEY=VALUE file.
conf_get() {
	local file=$1 key=$2
	[ -r "$file" ] || return 0
	sed -n "s/^${key}=//p" "$file" | tail -n 1 | tr -d '"'
}

# Ustawia KEY=VALUE w pliku, zachowując resztę. Set KEY=VALUE in a file, keep everything else.
conf_set() {
	local file=$1 key=$2 value=$3
	if grep -q "^${key}=" "$file" 2>/dev/null; then
		sed -i "s|^${key}=.*|${key}=${value}|" "$file"
	else
		printf '%s=%s\n' "$key" "$value" >>"$file"
	fi
}

# Zastępuje blok między znacznikami (albo dopisuje go na końcu). Replace or append a marked block.
put_block() {
	local file=$1 block=$2 tmp
	tmp=$(mktemp)
	if [ -f "$file" ]; then
		sed '/^# >>> kiosk >>>$/,/^# <<< kiosk <<<$/d' "$file" >"$tmp"
	fi
	printf '# >>> kiosk >>>\n%s\n# <<< kiosk <<<\n' "$block" >>"$tmp"
	cat "$tmp" >"$file"
	rm -f "$tmp"
}

ask() {
	local var=$1 question=$2 default=$3 answer
	if [ "$INTERACTIVE" = 1 ]; then
		read -r -p "$question [$default]: " answer
		printf -v "$var" '%s' "${answer:-$default}"
	else
		printf -v "$var" '%s' "$default"
	fi
}

ask_yn() {
	local var=$1 question=$2 default=$3 answer
	if [ "$INTERACTIVE" = 1 ]; then
		read -r -p "$question [$([ "$default" = yes ] && echo T/n || echo t/N)]: " answer
		case "${answer,,}" in
		t | tak | y | yes) answer=yes ;;
		n | nie | no) answer=no ;;
		*) answer=$default ;;
		esac
		printf -v "$var" '%s' "$answer"
	else
		printf -v "$var" '%s' "$default"
	fi
}

# --- Argumenty / arguments ---------------------------------------------------

KIOSK_USER=""
KIOSK_PORT=""
WITH_DOCKER=""
WITH_TAILSCALE=""
ASSUME_YES=0

while [ $# -gt 0 ]; do
	case "$1" in
	--user)
		KIOSK_USER=${2:?--user wymaga nazwy}
		shift
		;;
	--port)
		KIOSK_PORT=${2:?--port wymaga numeru}
		shift
		;;
	--docker) WITH_DOCKER=yes ;;
	--no-docker) WITH_DOCKER=no ;;
	--tailscale) WITH_TAILSCALE=yes ;;
	--no-tailscale) WITH_TAILSCALE=no ;;
	-y | --yes) ASSUME_YES=1 ;;
	-h | --help)
		usage
		exit 0
		;;
	-*) die "nieznana opcja / unknown option: $1" ;;
	*) KIOSK_USER=$1 ;;
	esac
	shift
done

[ "$(id -u)" -eq 0 ] || die "uruchom jako root (sudo) / run as root (sudo)"
command -v apt-get >/dev/null || die "potrzebny Debian z apt-get / Debian with apt-get required"

# shellcheck source=/dev/null
CODENAME=$(. /etc/os-release && echo "${VERSION_CODENAME:-}")
# shellcheck source=/dev/null
DISTRO=$(. /etc/os-release && echo "${ID:-}")
if [ "$DISTRO" != debian ] || { [ "$CODENAME" != bookworm ] && [ "$CODENAME" != trixie ]; }; then
	warn "testowane na Debianie 12/13, tu: ${DISTRO:-?} ${CODENAME:-?} / tested on Debian 12/13 only"
fi

INTERACTIVE=0
if [ "$ASSUME_YES" = 0 ] && [ -t 0 ]; then INTERACTIVE=1; fi

# Przy ponownym uruchomieniu domyślne wartości pochodzą z poprzedniej instalacji.
# On re-run, defaults come from the previous install.
DEFAULT_USER=$(conf_get "$CONF" KIOSK_USER)
DEFAULT_PORT=$(conf_get "$CONF" KIOSK_PORT)
[ -n "$KIOSK_USER" ] || ask KIOSK_USER "Użytkownik kiosku / kiosk user" "${DEFAULT_USER:-kiosk}"
[ -n "$KIOSK_PORT" ] || ask KIOSK_PORT "Port aplikacji / app port" "${DEFAULT_PORT:-3000}"
[ -n "$WITH_DOCKER" ] || ask_yn WITH_DOCKER "Docker + uruchomienie aplikacji? / Docker + start the app?" yes
[ -n "$WITH_TAILSCALE" ] || ask_yn WITH_TAILSCALE "Tailscale (zdalny dostęp, telefony)? / Tailscale (remote access, phones)?" no

[[ "$KIOSK_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die "zła nazwa użytkownika / invalid user name: $KIOSK_USER"
[ "$KIOSK_USER" != root ] || die "kiosk nie może działać jako root / the kiosk must not run as root"
if ! [[ "$KIOSK_PORT" =~ ^[0-9]+$ ]] || [ "$KIOSK_PORT" -lt 1 ] || [ "$KIOSK_PORT" -gt 65535 ]; then
	die "zły port / invalid port: $KIOSK_PORT"
fi

say "Instalacja kiosku: użytkownik=$KIOSK_USER, port=$KIOSK_PORT, docker=$WITH_DOCKER, tailscale=$WITH_TAILSCALE"
say "Installing kiosk: user=$KIOSK_USER, port=$KIOSK_PORT, docker=$WITH_DOCKER, tailscale=$WITH_TAILSCALE"

export DEBIAN_FRONTEND=noninteractive

# --- 1. Pakiety ---------------------------------------------------------------

step "Pakiety: Cage, Chromium, fonty, Python" "Packages: Cage, Chromium, fonts, Python"
# fonts-noto-*: bez nich część znaków (emoji, symbole) wyświetla się jako puste kwadraty.
# fonts-noto-*: without them some glyphs (emoji, symbols) render as empty boxes.
apt-get update -q
apt-get install -y -q --no-install-recommends \
	cage chromium seatd \
	fonts-noto-core fonts-noto-color-emoji fonts-dejavu-core \
	python3 curl ca-certificates alsa-utils

# --- 2. Użytkownik kiosku ------------------------------------------------------

step "Użytkownik kiosku: $KIOSK_USER" "Kiosk user: $KIOSK_USER"
if id -u "$KIOSK_USER" >/dev/null 2>&1; then
	info "już istnieje / already exists"
else
	# Bez hasła: logowanie tylko automatyczne na tty1. No password: autologin on tty1 only.
	useradd -m -s /bin/bash "$KIOSK_USER"
	info "utworzony / created"
fi
for group in video input render audio; do
	if getent group "$group" >/dev/null; then usermod -aG "$group" "$KIOSK_USER"; fi
done
KIOSK_HOME=$(getent passwd "$KIOSK_USER" | cut -d: -f6)

# --- 3. Ustawienia -------------------------------------------------------------

step "Ustawienia w $CONF" "Settings in $CONF"
install -d -m 755 "$CONF_DIR"
if [ ! -f "$CONF" ]; then
	cat >"$CONF" <<'EOF'
# Ustawienia kiosku (czyta je kiosk.sh i ekran-agent.service). Kiosk settings.
# KIOSK_PORT musi być równy HOST_PORT w app/.env. Must equal HOST_PORT in app/.env.
# Opcjonalnie / optional:
#   KIOSK_URL=http://localhost:3000
#   KIOSK_CHROMIUM_FLAGS="--force-device-scale-factor=1.25"
#   KIOSK_TOUCH=/dev/input/by-id/*Touch*-event*
EOF
fi
conf_set "$CONF" KIOSK_USER "$KIOSK_USER"
conf_set "$CONF" KIOSK_PORT "$KIOSK_PORT"
chmod 644 "$CONF"
info "KIOSK_USER=$KIOSK_USER, KIOSK_PORT=$KIOSK_PORT"

# --- 4. Autologowanie na tty1 ---------------------------------------------------

step "Autologowanie na tty1" "Autologin on tty1"
install -d -m 755 "$(dirname "$GETTY_DROPIN")"
cat >"$GETTY_DROPIN" <<EOF
# Zapisane przez kiosk/install.sh. Written by kiosk/install.sh.
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $KIOSK_USER --noclear %I \$TERM
EOF
systemctl daemon-reload
systemctl enable getty@tty1.service >/dev/null 2>&1 || true
for dm in gdm3 gdm lightdm sddm; do
	if systemctl is-enabled "$dm" >/dev/null 2>&1; then
		warn "włączony menedżer logowania $dm – kiosk potrzebuje tty1 bez pulpitu / display manager $dm is enabled, the kiosk needs a desktop-free tty1"
	fi
done

# --- 5. Sesja kiosku: Cage + Chromium -------------------------------------------

step "Sesja kiosku: Cage + Chromium (--kiosk)" "Kiosk session: Cage + Chromium (--kiosk)"
install -d -m 755 "$LIB_DIR"
install -m 755 "$SCRIPT_DIR/kiosk.sh" "$LIB_DIR/kiosk.sh"
PROFILE=$KIOSK_HOME/.bash_profile
if [ ! -f "$PROFILE" ]; then
	# Gdy istnieje .bash_profile, bash pomija .profile – wczytujemy go ręcznie.
	# bash skips .profile once .bash_profile exists, so source it explicitly.
	# shellcheck disable=SC2016 # $HOME ma się rozwinąć dopiero przy logowaniu
	printf '[ -f "$HOME/.profile" ] && . "$HOME/.profile"\n' >"$PROFILE"
fi
# shellcheck disable=SC2016 # treść trafia do .bash_profile bez rozwijania
put_block "$PROFILE" 'if [ "$(tty)" = "/dev/tty1" ]; then
	exec /usr/local/lib/kiosk/kiosk.sh >"$HOME/kiosk.log" 2>&1
fi'
chown "$KIOSK_USER": "$PROFILE"
info "$PROFILE → $LIB_DIR/kiosk.sh"

# --- 6. Agent ekranu -------------------------------------------------------------

step "Agent ekranu (tryb nocny, budzenie dotykiem)" "Screen agent (night mode, wake on touch)"
install -m 755 "$SCRIPT_DIR/ekran-agent.py" "$LIB_DIR/ekran-agent.py"
install -m 644 "$SCRIPT_DIR/ekran-agent.service" "$AGENT_UNIT"
systemctl daemon-reload
if compgen -G '/sys/class/backlight/*' >/dev/null; then
	systemctl enable ekran-agent.service >/dev/null
	systemctl restart ekran-agent.service
	info "działa, pyta http://127.0.0.1:$KIOSK_PORT/api/display / running"
else
	systemctl disable --now ekran-agent.service >/dev/null 2>&1 || true
	warn "brak /sys/class/backlight (np. zewnętrzny monitor) – agent ekranu wyłączony / no backlight device, screen agent disabled"
fi

# --- 7. Docker i aplikacja --------------------------------------------------------

step "Docker i aplikacja" "Docker and the app"
if [ "$WITH_DOCKER" = yes ]; then
	if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
		info "instaluję Dockera z download.docker.com / installing Docker"
		install -d -m 755 /etc/apt/keyrings
		curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
		chmod a+r /etc/apt/keyrings/docker.asc
		cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
		apt-get update -q
		apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
	else
		info "Docker już jest / already installed"
	fi
	systemctl enable --now docker.service >/dev/null

	ENV_FILE=$APP_DIR/.env
	if [ ! -f "$ENV_FILE" ]; then
		install -m 600 "$APP_DIR/.env.example" "$ENV_FILE"
		chown "$(stat -c %U:%G "$APP_DIR")" "$ENV_FILE"
		info "utworzono / created $ENV_FILE"
	fi
	conf_set "$ENV_FILE" HOST_PORT "$KIOSK_PORT"
	info "budowanie i start (kilka minut przy pierwszym razie) / building and starting (a few minutes the first time)"
	(cd "$APP_DIR" && docker compose up -d --build)
else
	info "pominięte – aplikacja musi odpowiadać na http://localhost:$KIOSK_PORT / skipped, the app must answer on that port"
fi

# --- 8. Tailscale ------------------------------------------------------------------

step "Tailscale" "Tailscale"
if [ "$WITH_TAILSCALE" = yes ]; then
	if ! command -v tailscale >/dev/null; then
		info "instaluję z tailscale.com / installing from tailscale.com"
		curl -fsSL https://tailscale.com/install.sh | sh
	else
		info "Tailscale już jest / already installed"
	fi
	systemctl enable --now tailscaled.service >/dev/null
	cat <<EOF
    Logowanie i HTTPS zrób ręcznie (skrypt nikogo nie loguje).
    Log in and enable HTTPS yourself (the script does not authenticate anything):

      sudo tailscale up --hostname=kalendarz
      sudo tailscale serve --bg $KIOSK_PORT

    Funnel zostaw wyłączony (wystawiłby kalendarz do internetu). Keep Funnel off.
    Potem w $APP_DIR/.env / then in .env:
      ADMIN_LOGINS=<twój login Tailscale / your Tailscale login>
      TRUSTED_ORIGINS=http://localhost:$KIOSK_PORT,https://kalendarz.<tailnet>.ts.net
    i / and: cd $APP_DIR && sudo docker compose up -d
EOF
else
	info "pominięte / skipped"
fi

cat <<EOF

Gotowe. Uruchom ponownie komputer: sudo reboot
Po starcie tty1 zaloguje się samo i pokaże kalendarz na pełnym ekranie.
Logi kiosku: $KIOSK_HOME/kiosk.log, agent ekranu: journalctl -u ekran-agent

Done. Reboot: sudo reboot
After boot tty1 logs in by itself and shows the calendar full screen.
Kiosk log: $KIOSK_HOME/kiosk.log, screen agent: journalctl -u ekran-agent

BIOS: ustaw "Restore on AC Power Loss" = Power On (opis w kiosk/README.md).
BIOS: set "Restore on AC Power Loss" = Power On (see kiosk/README.md).
EOF
