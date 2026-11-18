import type { DB } from './db/index.js';
import { InputError } from './store.js';
import { getSetting, setSetting } from './sync.js';
import { brightnessAt, brightnessOf, phaseAt, type Brightness, type DisplaySchedule, type NightTimes } from '#lib/logic/schedule.js';
import { getLayout } from './layout.js';
import { t } from '#lib/i18n/index.js';

/** Plan i jasność ekranu (panel → Ekran) oraz odpowiedź dla agenta ekranu (`/api/display`). */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

function times(f: FormData, prefix: string): NightTimes {
	const n = { eveningFrom: str(f, `${prefix}eveningFrom`), nightFrom: str(f, `${prefix}nightFrom`), nightTo: str(f, `${prefix}nightTo`) };
	if (!Object.values(n).every((v) => TIME.test(v))) throw new InputError(t('err.schedule'));
	return n;
}

function percent(f: FormData, k: keyof Brightness, min: number): number {
	const n = Number(str(f, `b_${k}`));
	if (!Number.isInteger(n) || n < min || n > 100) throw new InputError(t('p3a.screen.err.brightness', { min }));
	return n;
}

/** Formularz panelu → zapis planu. Weekend wyłączony = noce weekendowe jak w tygodniu. */
export function parseScreen(f: FormData): DisplaySchedule {
	const week = times(f, '');
	const weekend = f.get('weekendOn') ? times(f, 'we_') : undefined;
	const brightness: Brightness = { day: percent(f, 'day', 10), evening: percent(f, 'evening', 5), night: percent(f, 'night', 0), wake: percent(f, 'wake', 5) };
	return { ...week, ...(weekend ? { weekend } : {}), brightness };
}

export function saveScreen(db: DB, f: FormData) {
	setSetting(db, 'schedule', parseScreen(f));
}

export function getScreen(db: DB) {
	const s = getSetting(db, 'schedule');
	return { schedule: s, weekend: s.weekend ?? null, brightness: brightnessOf(s) };
}

/**
 * Dla agenta ekranu: pora dnia, obrót i jasność. `brightness` w procentach (0 = zgaszony),
 * `level` – jasność teraz. Starsze wersje agenta czytają tylko `phase` i dalej działają.
 */
export function displayState(db: DB, now = new Date()) {
	const s = getSetting(db, 'schedule');
	const phase = phaseAt(now, s);
	// --- p4: security --- jasność „na teraz” z ustawień kiosku (do zmiany pory dnia).
	const o = getSetting(db, 'brightnessNow');
	const override = o && o.phase === phase && Date.parse(o.until) > now.getTime() ? o.level : null;
	return { phase, rotation: getLayout(db).rotation, brightness: brightnessOf(s), level: override ?? brightnessAt(phase, s) };
}
