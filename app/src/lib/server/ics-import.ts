import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { localEvents } from './db/schema.js';
import { InputError } from './store.js';
import { createLocalCalendar, findLayer, layerColor, layerIcon, layerMember, layerName, localCalendars } from './calendars.js';
import { parseIcal } from './sources/ical.js';
import { icalToCalEvent, MAX_ICAL_BYTES } from './sources/subscription.js';
import { addDays } from '#lib/logic/dates.js';
import { t } from '#lib/i18n/index.js';

/**
 * Jednorazowy import pliku .ics do lokalnego kalendarza: najpierw podgląd (ile wydarzeń, od kiedy do
 * kiedy, ile już jest), potem zapis. Ten sam UID (z pliku) w tym samym kalendarzu = aktualizacja,
 * nie duplikat – ten sam plik można wgrać drugi raz (np. poprawiony plan zebrań).
 *
 * One-time .ics import into a local calendar: preview first, then import; deduplicated by UID.
 */

/** Najwięcej wydarzeń z jednego pliku (powtarzające się bez końca rozwijamy na 2 lata). */
export const MAX_IMPORT = 3000;
const PENDING_MS = 30 * 60_000;

interface Pending {
	name: string;
	text: string;
	at: number;
}

/** Wgrane, jeszcze nie zaimportowane pliki (podgląd → „Importuj”), pół godziny w pamięci. */
const pending = new Map<string, Pending>();

export interface ImportRow {
	uid: string;
	title: string;
	start: string;
	end: string;
	allDay: boolean;
	location: string | null;
	description: string | null;
}

export interface IcsPreview {
	token: string;
	fileName: string;
	/** nazwa kalendarza z pliku (X-WR-CALNAME) – podpowiedź nazwy nowego kalendarza */
	suggestedName: string;
	/** do zaimportowania (od dziś) */
	total: number;
	/** pominięte: już minęły */
	past: number;
	/** pominięte: nieczytelne (zły format daty, nieobsługiwana reguła) */
	broken: number;
	/** w pliku z regułą powtarzania */
	recurring: number;
	from: string | null;
	to: string | null;
	/** ile wydarzeń z pliku już jest w danym lokalnym kalendarzu (zostaną zaktualizowane) */
	existing: Record<string, number>;
	sample: { title: string; start: string; allDay: boolean }[];
}

function calName(text: string): string {
	const m = text.match(/^X-WR-CALNAME:(.*)$/im);
	return (m?.[1] ?? '').replace(/\\([,;\\])/g, '$1').trim().slice(0, 60);
}

/** Wydarzenia z pliku od dziś (bez duplikatów UID w samym pliku) i liczby do podglądu. */
export function readIcs(text: string, today: string): { rows: ImportRow[]; past: number; broken: number; recurring: number } {
	if (!/BEGIN:VCALENDAR/i.test(text)) throw new InputError(t('cal.err.notCalendar'));
	let broken = 0;
	const parsed = parseIcal(text, { details: true, horizon: addDays(today, 730), warn: () => broken++ });
	const recurring = new Set(parsed.filter((e) => e.uid.includes('|')).map((e) => e.uid.split('|')[0])).size;
	const byUid = new Map<string, ImportRow>();
	let past = 0;
	for (const e of parsed) {
		const ev = icalToCalEvent(e, 'import');
		const ended = ev.allDay ? ev.end <= today : ev.end.slice(0, 10) < today;
		if (ended) {
			past++;
			continue;
		}
		byUid.set(e.uid, { uid: e.uid, title: ev.title.slice(0, 200), start: ev.start, end: ev.end, allDay: ev.allDay, location: ev.location ?? null, description: ev.description ?? null });
	}
	const rows = [...byUid.values()].sort((a, b) => a.start.localeCompare(b.start));
	return { rows, past, broken, recurring };
}

function existingUids(db: DB, calendarId: string): Map<string, string> {
	return new Map(
		db
			.select({ id: localEvents.id, uid: localEvents.uid })
			.from(localEvents)
			.where(and(eq(localEvents.calendarId, calendarId), isNotNull(localEvents.uid)))
			.all()
			.map((r) => [r.uid!, r.id])
	);
}

/** Wgrany plik → podgląd (plik czeka w pamięci na „Importuj”). */
export async function previewIcs(db: DB, file: unknown, today: string, now = Date.now()): Promise<IcsPreview> {
	if (!(file instanceof File) || !file.size) throw new InputError(t('cal.err.noFile'));
	if (file.size > MAX_ICAL_BYTES) throw new InputError(t('err.fileTooBig'));
	const text = await file.text();
	const { rows, past, broken, recurring } = readIcs(text, today);
	if (!rows.length) throw new InputError(past ? t('cal.err.allPast', { n: past }) : t('cal.err.noEvents'));
	if (rows.length > MAX_IMPORT) throw new InputError(t('cal.err.tooMany', { n: rows.length, max: MAX_IMPORT }));
	for (const [k, v] of pending) if (now - v.at > PENDING_MS) pending.delete(k);
	const token = randomUUID();
	pending.set(token, { name: file.name, text, at: now });
	const uids = new Set(rows.map((r) => r.uid));
	const existing: Record<string, number> = {};
	for (const c of localCalendars(db)) existing[c.id] = [...existingUids(db, c.id).keys()].filter((u) => uids.has(u)).length;
	return {
		token,
		fileName: file.name,
		suggestedName: calName(text) || file.name.replace(/\.ics$/i, '').slice(0, 60),
		total: rows.length,
		past,
		broken,
		recurring,
		from: rows[0]?.start.slice(0, 10) ?? null,
		to: rows.reduce((m, r) => (r.start > m ? r.start : m), '').slice(0, 10) || null,
		existing,
		sample: rows.slice(0, 6).map((r) => ({ title: r.title, start: r.start, allDay: r.allDay }))
	};
}

/** Zapis wierszy do kalendarza: nowy UID – nowe wydarzenie, znany UID – aktualizacja. */
export function writeImport(db: DB, calendarId: string, rows: ImportRow[]): { added: number; updated: number } {
	const known = existingUids(db, calendarId);
	let added = 0;
	let updated = 0;
	db.transaction((tx) => {
		for (const r of rows) {
			const values = { title: r.title, start: r.start, end: r.end, allDay: r.allDay, location: r.location, description: r.description };
			const id = known.get(r.uid);
			if (id) {
				tx.update(localEvents).set(values).where(eq(localEvents.id, id)).run();
				updated++;
			} else {
				tx.insert(localEvents)
					.values({ id: randomUUID(), calendarId, uid: r.uid, memberId: null, ...values })
					.run();
				added++;
			}
		}
	});
	return { added, updated };
}

/** „Importuj”: plik z podglądu → wybrany lokalny kalendarz albo nowy. */
export function importIcs(db: DB, f: FormData, today: string): { added: number; updated: number; calendarId: string } {
	const token = String(f.get('token') ?? '');
	const p = pending.get(token);
	if (!p) throw new InputError(t('cal.err.expired'));
	const target = String(f.get('target') ?? 'new');
	let calendarId: string;
	if (target === 'new') {
		const s = (k: string) => String(f.get(k) ?? '');
		calendarId = createLocalCalendar(db, { name: layerName(s('name'), true), color: layerColor(s('color')), icon: layerIcon(s('icon')), memberId: layerMember(db, s('memberId')) });
	} else {
		const l = findLayer(db, target);
		if (l.kind !== 'local') throw new InputError(t('cal.err.notLocal'));
		calendarId = l.id;
	}
	const res = writeImport(db, calendarId, readIcs(p.text, today).rows);
	pending.delete(token);
	return { ...res, calendarId };
}
