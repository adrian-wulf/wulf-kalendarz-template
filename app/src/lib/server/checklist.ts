import type { DB } from './db/index.js';
import { members } from './db/schema.js';
import { getKv, setKv } from './kv.js';
import { getSetting, readCache } from './sync.js';
import { resolveLayers } from './calendars.js';
import { getRoles, isConnected } from './google.js';
import { bringEmail, isBringReady } from './bring.js';
import { hasPin } from './security.js';
import { getConfig, getState } from './backup.js';
import { getStop } from './transit/index.js';
import { getHaAuth, selectedEntities } from './homeassistant.js';
import { isActive } from '#lib/modules/registry.server.js';
import { isTipId, type TipId, type TipState } from '#lib/guides/index.js';

/**
 * Przegląd panelu → „Co jeszcze możesz podłączyć”: co już działa, co zaczęte, czego brak.
 * Ta sama detekcja daje „✓ Gotowe – to działa” na końcu przewodnika w sekcji (26b).
 */

export interface Tip {
	id: TipId;
	/** done – działa; started – zaczęte, czegoś brakuje; todo – nic; unknown – nie da się sprawdzić */
	state: TipState;
	/** dokąd prowadzi (sekcja panelu, z otwartym przewodnikiem) */
	href: string;
}

const DISMISSED_KEY = 'guides.dismissed';
const PHONE_KEY = 'guides.phoneSeen';

/** Ktoś otworzył stronę telefonu z innego urządzenia niż kiosk (Tailscale, proxy, hasło). */
export function markPhoneSeen(db: DB, now = new Date()) {
	if (!getKv<string | null>(db, PHONE_KEY, null)) setKv(db, PHONE_KEY, now.toISOString());
}

const state = (done: boolean, started = false): TipState => (done ? 'done' : started ? 'started' : 'todo');

function backupState(db: DB): TipState {
	const cfg = getConfig(db);
	const st = getState(db);
	// Poza urządzeniem: WebDAV (Nextcloud, NAS) albo folder z własną ścieżką (zamontowany udział).
	const away = cfg.targets.filter((tg) => tg.enabled && (tg.kind === 'webdav' || !!tg.path));
	return state(away.some((tg) => st.targets[tg.id]?.ok), away.length > 0);
}

function calendarsState(db: DB): TipState {
	const sources = resolveLayers(db).filter((l) => l.showKiosk && (l.kind === 'google' || l.kind === 'ical' || (l.kind === 'local' && l.id !== 'local')));
	const working = sources.filter((l) => l.kind !== 'ical' || !readCache(db, l.id).status.error);
	return state(working.length > 0, sources.length > 0);
}

/** Wszystkie pozycje, które pasują do włączonych modułów (bez uwzględnienia ukrytych). */
export function detectTips(db: DB, today: string): Tip[] {
	const out: Tip[] = [];
	const add = (id: TipId, s: TipState, href: string) => out.push({ id, state: s, href });
	const connected = isConnected(db);
	add('google', state(connected && !!getRoles(db).family, connected), '/admin/google?guide=google');
	// --- 26a: calendar layers --- gotowe: poza wpisami z kiosku jest jeszcze jedno źródło wydarzeń widoczne
	// na kiosku (Google, subskrypcja iCal albo kalendarz z importu .ics). Warstwy generowane (urodziny, śmieci,
	// ferie, święta) się nie liczą – są od razu, więc „≥ 2 widoczne” byłoby zawsze spełnione. Zaczęte: subskrypcja
	// jest, ale ostatnie pobranie się nie udało.
	add('calendars', calendarsState(db), '/admin/kalendarze');
	if (isActive(db, 'waste')) {
		const manual = getSetting(db, 'wasteManual').some((p) => p.date >= today);
		add('waste', state(!!getSetting(db, 'wasteIcalUrl') || !!getSetting(db, 'wasteIcs') || manual), '/admin/smieci?guide=waste');
	}
	if (isActive(db, 'shopping')) add('bring', state(isBringReady(db), !!bringEmail(db)), '/admin/zakupy?guide=bring');
	if (isActive(db, 'birthdays') || isActive(db, 'countdown')) {
		const list = db.select({ birthday: members.birthday }).from(members).all();
		add('birthdays', state(list.some((m) => !!m.birthday)), '/admin/domownicy');
	}
	add('phones', state(!!getKv<string | null>(db, PHONE_KEY, null)), '/admin/dostep?guide=phones');
	add('backup', backupState(db), '/admin/kopie?guide=backup');
	add('pin', state(hasPin(db)), '/admin/dostep?guide=kiosk');
	if (isActive(db, 'transit')) add('transit', state(!!getStop(db)), '/admin/odjazdy?guide=transit');
	if (isActive(db, 'homeassistant')) {
		const auth = !!getHaAuth(db);
		add('ha', state(auth && selectedEntities(db).length > 0, auth), '/admin/home-assistant?guide=ha');
	}
	return out;
}

export const dismissedTips = (db: DB) => getKv<string[]>(db, DISMISSED_KEY, []);

/** Lista do przeglądu: pozycje z flagą „ukryte” i postęp (ukryte i niesprawdzalne się nie liczą). */
export function checklist(db: DB, today: string) {
	const hidden = new Set(dismissedTips(db));
	const items = detectTips(db, today).map((tip) => ({ ...tip, dismissed: hidden.has(tip.id) }));
	const counted = items.filter((i) => !i.dismissed && i.state !== 'unknown');
	return { items, done: counted.filter((i) => i.state === 'done').length, total: counted.length };
}

/** Stan jednej pozycji (do przewodnika w sekcji); null – pozycji nie ma (np. moduł wyłączony). */
export const tipState = (db: DB, id: TipId, today: string): TipState | null => detectTips(db, today).find((x) => x.id === id)?.state ?? null;

export function dismissTip(db: DB, id: string) {
	if (!isTipId(id)) return;
	const list = dismissedTips(db);
	if (!list.includes(id)) setKv(db, DISMISSED_KEY, [...list, id]);
}

export const restoreTips = (db: DB) => setKv(db, DISMISSED_KEY, null);
