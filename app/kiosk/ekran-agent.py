#!/usr/bin/env python3
"""Agent ekranu kiosku: jasność według pory dnia z aplikacji, w nocy ekran zgaszony.

Pora dnia i jasność (panel → Ekran) przychodzą z /api/display. Starsza aplikacja bez pola
`brightness` – zostają poziomy domyślne poniżej.

Cage nie obsługuje wygaszania wyjścia przez Wayland, więc sterujemy podświetleniem
(/sys/class/backlight). W nocy przejmujemy dotyk na wyłączność (EVIOCGRAB), żeby
dotknięcie ciemnego ekranu tylko go budziło, a nie klikało w coś na ślepo.
Bez zależności – sama biblioteka standardowa. Uruchamiany przez systemd jako root.
"""
import fcntl
import glob
import json
import os
import select
import time
import urllib.request

PORT = os.environ.get('KIOSK_PORT', '3000')  # ten sam port co HOST_PORT w compose
URL = os.environ.get('KIOSK_DISPLAY_URL') or f'http://127.0.0.1:{PORT}/api/display'
TOUCH_GLOB = os.environ.get('KIOSK_TOUCH', '/dev/input/by-id/*Touch*-event*')
# Domyślne poziomy (0..1), gdy aplikacja nie podaje jasności.
LEVELS = {'day': 1.0, 'evening': 0.55, 'night': 0.0}
WAKE_LEVEL = 0.4  # nocne wybudzenie dotykiem – nie oślepiać
WAKE_SECONDS = 120
POLL_SECONDS = 30
EVIOCGRAB = 0x40044590
EVENT_SIZE = 24  # struct input_event na 64 bitach

BACKLIGHT = None
MAX = 1


def init_backlight():
    global BACKLIGHT, MAX
    BACKLIGHT = glob.glob('/sys/class/backlight/*')[0]
    MAX = int(open(f'{BACKLIGHT}/max_brightness').read())


def get_brightness():
    return int(open(f'{BACKLIGHT}/brightness').read())


def set_brightness(target, fade=1.0):
    """Płynne przejście do poziomu 0..1."""
    goal = round(MAX * target)
    start = get_brightness()
    steps = 20 if fade and start != goal else 1
    for i in range(1, steps + 1):
        with open(f'{BACKLIGHT}/brightness', 'w') as f:
            f.write(str(round(start + (goal - start) * i / steps)))
        if steps > 1:
            time.sleep(fade / steps)


def fetch_display():
    try:
        with urllib.request.urlopen(URL, timeout=5) as r:
            return json.load(r)
    except Exception:
        return None  # aplikacja niedostępna – ekran zostaje włączony


def _pct(value, default):
    """Procent z API (0..100) → 0..1; zła albo brakująca wartość → domyślna."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    return min(max(value, 0), 100) / 100


def levels_from(display):
    """Poziomy (dzień, wieczór, noc) i jasność nocnego wybudzenia z odpowiedzi /api/display."""
    b = (display or {}).get('brightness')
    if not isinstance(b, dict):
        return dict(LEVELS), WAKE_LEVEL
    levels = {k: _pct(b.get(k), v) for k, v in LEVELS.items()}
    # Wybudzenie nie ciemniejsze niż ustawiona noc (gdy noc tylko przyciemniona).
    wake = max(_pct(b.get('wake'), WAKE_LEVEL), levels['night'])
    return levels, wake


def phase_of(display):
    phase = (display or {}).get('phase')
    return phase if phase in LEVELS else 'day'


class Touch:
    def __init__(self):
        self.fd = None
        self.grabbed = False

    def open(self):
        if self.fd is not None:
            return True
        paths = glob.glob(TOUCH_GLOB)
        if not paths:
            return False
        self.fd = os.open(paths[0], os.O_RDONLY | os.O_NONBLOCK)
        self.grabbed = False
        return True

    def close(self):
        if self.fd is not None:
            try:
                os.close(self.fd)
            except OSError:
                pass
        self.fd = None
        self.grabbed = False

    def grab(self, on):
        if self.fd is None or self.grabbed == on:
            return
        try:
            fcntl.ioctl(self.fd, EVIOCGRAB, 1 if on else 0)
            self.grabbed = on
        except OSError:
            self.close()

    def wait(self, seconds):
        """Czeka na dotyk najwyżej `seconds`; True, jeśli ktoś dotknął."""
        if not self.open():
            time.sleep(seconds)
            return False
        try:
            ready, _, _ = select.select([self.fd], [], [], seconds)
            if not ready:
                return False
            data = os.read(self.fd, EVENT_SIZE * 64)
            return len(data) >= EVENT_SIZE
        except OSError:
            self.close()  # urządzenie odłączone – otworzymy ponownie
            return False


def main():
    init_backlight()
    touch = Touch()
    phase = 'day'
    levels, wake_level = dict(LEVELS), WAKE_LEVEL
    awake_until = 0.0
    last_poll = 0.0
    current = None
    try:
        while True:
            now = time.monotonic()
            if now - last_poll >= POLL_SECONDS:
                display = fetch_display()
                phase = phase_of(display)
                levels, wake_level = levels_from(display)
                last_poll = now
            night = phase == 'night'
            if night and now < awake_until:
                level = wake_level
            else:
                level = levels.get(phase, 1.0)
            if level != current:
                set_brightness(level)
                current = level
            # Dotyk trafia do Chromium tylko wtedy, gdy ekran świeci.
            touch.grab(level == 0.0)
            touched = touch.wait(1 if night else POLL_SECONDS)
            if touched and night:
                awake_until = time.monotonic() + WAKE_SECONDS
    finally:
        touch.grab(False)
        set_brightness(1.0, fade=0)


if __name__ == '__main__':
    main()
