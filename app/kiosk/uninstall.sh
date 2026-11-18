#!/usr/bin/env bash
# Usuwa to, co zapisał install.sh: autologowanie, sesję kiosku, agenta ekranu, /etc/kiosk.
# Nie rusza pakietów, użytkownika, Dockera, Tailscale ani danych aplikacji.
# Removes what install.sh wrote. Packages, the user, Docker, Tailscale and app data stay.
#
#   sudo ./uninstall.sh [UŻYTKOWNIK]
set -euo pipefail

[ "$(id -u)" -eq 0 ] || {
	echo "BŁĄD / ERROR: uruchom jako root (sudo) / run as root (sudo)" >&2
	exit 1
}

CONF=/etc/kiosk/kiosk.conf
KIOSK_USER=${1:-}
if [ -z "$KIOSK_USER" ] && [ -r "$CONF" ]; then
	KIOSK_USER=$(sed -n 's/^KIOSK_USER=//p' "$CONF" | tail -n 1)
fi
KIOSK_USER=${KIOSK_USER:-kiosk}

echo "==> Agent ekranu / screen agent"
systemctl disable --now ekran-agent.service >/dev/null 2>&1 || true
rm -f /etc/systemd/system/ekran-agent.service

echo "==> Autologowanie na tty1 / tty1 autologin"
rm -f /etc/systemd/system/getty@tty1.service.d/autologin.conf
rmdir /etc/systemd/system/getty@tty1.service.d 2>/dev/null || true

echo "==> Sesja kiosku / kiosk session ($KIOSK_USER)"
if KIOSK_HOME=$(getent passwd "$KIOSK_USER" | cut -d: -f6) && [ -f "$KIOSK_HOME/.bash_profile" ]; then
	sed -i '/^# >>> kiosk >>>$/,/^# <<< kiosk <<<$/d' "$KIOSK_HOME/.bash_profile"
fi
rm -rf /usr/local/lib/kiosk /etc/kiosk

systemctl daemon-reload

cat <<EOF

Gotowe. Po restarcie tty1 pokaże zwykłe logowanie. Done. After a reboot tty1 shows a normal login.
Zostało (usuń ręcznie, jeśli chcesz) / left in place (remove by hand if you want):
  aplikacja / app:   cd <repo>/app && sudo docker compose down   (dane / data: <repo>/app/data)
  tailscale serve:   sudo tailscale serve reset
  użytkownik / user: sudo userdel -r $KIOSK_USER
  pakiety / packages: sudo apt-get remove cage chromium
EOF
