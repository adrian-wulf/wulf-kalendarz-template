#!/bin/bash
# Kiosk: Cage (kompozytor Wayland dla jednej aplikacji) + Chromium na pełnym ekranie.
# Uruchamiany z ~/.bash_profile użytkownika kiosku po autologowaniu na tty1.
# Czeka, aż aplikacja odpowie, a po awarii przeglądarki startuje ją ponownie.
#
# Kiosk loop: Cage + Chromium in kiosk mode, started from ~/.bash_profile on tty1.
# Settings: /etc/kiosk/kiosk.conf (KIOSK_PORT, optional KIOSK_URL, KIOSK_CHROMIUM_FLAGS).

if [ -r /etc/kiosk/kiosk.conf ]; then
	# shellcheck source=/dev/null
	. /etc/kiosk/kiosk.conf
fi
KIOSK_PORT="${KIOSK_PORT:-3000}"
URL="${KIOSK_URL:-http://localhost:${KIOSK_PORT}}"

# Log z limitem: Chromium potrafi pisać dużo przez tygodnie bez restartu. Powyżej KIOSK_LOG_MAX_KB
# (domyślnie 5 MB) kopia idzie do kiosk.log.1, a kiosk.log zaczyna się od zera (dopisywanie, więc bez dziur).
# Size-capped log: above KIOSK_LOG_MAX_KB the log is copied to kiosk.log.1 and truncated.
LOG="${KIOSK_LOG:-$HOME/kiosk.log}"
LOG_MAX_KB="${KIOSK_LOG_MAX_KB:-5120}"
rotate_log() {
	local size
	size=$(stat -c %s "$LOG" 2>/dev/null || stat -f %z "$LOG" 2>/dev/null || echo 0)
	if [ "$size" -gt $((LOG_MAX_KB * 1024)) ]; then
		cp -f "$LOG" "$LOG.1"
		: >"$LOG"
	fi
}
if [ -z "${KIOSK_NO_LOG:-}" ]; then
	exec >>"$LOG" 2>&1
	rotate_log
	(while sleep 300; do rotate_log; done) &
	ROTATOR=$!
	trap 'kill "$ROTATOR" 2>/dev/null' EXIT
fi
# Tylko funkcja rotate_log (testy): KIOSK_ROTATE_ONLY=1
[ -n "${KIOSK_ROTATE_ONLY:-}" ] && return 0 2>/dev/null

until curl -s -o /dev/null "$URL"; do sleep 2; done

# shellcheck disable=SC2054 # przecinki należą do wartości flag
FLAGS=(
	--kiosk "$URL"
	--ozone-platform=wayland
	--noerrdialogs
	--disable-infobars
	--no-first-run
	--disable-session-crashed-bubble
	--hide-crash-restore-bubble
	# Bez propozycji tłumaczenia strony i bez cofania stron gestem przesunięcia.
	--disable-features=Translate,TouchpadOverscrollHistoryNavigation
	--overscroll-history-navigation=0
	# Dotyk działa, ale bez powiększania dwoma palcami.
	--disable-pinch
	--password-store=basic
	--check-for-update-interval=31536000
)
# Dodatkowe flagi z kiosk.conf, np. KIOSK_CHROMIUM_FLAGS="--force-device-scale-factor=1.25"
read -r -a EXTRA <<<"${KIOSK_CHROMIUM_FLAGS:-}"

while true; do
	cage -d -- chromium "${FLAGS[@]}" "${EXTRA[@]}"
	sleep 3
done
