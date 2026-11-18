import { randomUUID } from 'node:crypto';
import { eq, gt } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { choreCompletions, chores, localEvents, localNotes, localShopping, members, wasteDone, type Recurrence } from './db/schema.js';
import { addDays, localParts, localTime } from '#lib/logic/dates.js';
import { noteExpiry, type NoteDuration } from '#lib/logic/schedule.js';
import { iconFor } from '#lib/products.js';
import { deleteById, getRoles, insertFamilyEvent, insertNote, isConnected } from './google.js';
import { refreshNow } from './sync.js';
import { bringAdd, bringComplete, isBringReady } from './bring.js';
import { t } from '#lib/i18n/index.js';

/**
 * Zapisy z kiosku. Na razie lokalne tabele; po podłączeniu Google/Bring!
 * te same funkcje zapiszą tam (interfejs dla tras API zostaje taki sam).
 */

export class InputError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function text(v: unknown, field: string, max: number): string {
	if (typeof v !== 'string' || !v.trim()) throw new InputError(t('err.missingField', { field }));
	const out = v.trim();
	if (out.length > max) throw new InputError(t('err.tooLong', { label: field }));
	return out;
}

function memberOrNull(db: DB, v: unknown): string | null {
	if (v === null || v === undefined || v === '') return null;
	if (typeof v !== 'string' || !db.select().from(members).where(eq(members.id, v)).get()) throw new InputError(t('err.member'));
	return v;
}

function date(v: unknown): string {
	if (typeof v !== 'string' || !DATE.test(v)) throw new InputError(t('err.date'));
	return v;
}

export async function addEvent(db: DB, input: Record<string, unknown>) {
	const title = text(input.title, t('field.title'), 120);
	const memberId = memberOrNull(db, input.memberId);
	const day = date(input.date);
	let start: string, end: string, allDay: boolean;
	if (input.time == null) {
		allDay = true;
		start = day;
		end = addDays(day, 1);
	} else {
		if (typeof input.time !== 'string' || !TIME.test(input.time)) throw new InputError(t('err.time'));
		const [h, m] = input.time.split(':').map(Number);
		allDay = false;
		const s = localTime(day, h, m);
		start = s.toISOString();
		end = new Date(s.getTime() + 3_600_000).toISOString();
	}
	const row = { id: randomUUID(), title, memberId, start, end, allDay };
	if (isConnected(db) && getRoles(db).family) {
		const member = db.select().from(members).where(eq(members.id, memberId ?? '')).get();
		await insertFamilyEvent(db, row, member ? { ...member } : undefined);
		await refreshNow(db, 'google');
		return row;
	}
	db.insert(localEvents).values(row).run();
	return row;
}

const DURATIONS: NoteDuration[] = ['evening', 'tomorrow', '3days'];

export async function addNote(db: DB, input: Record<string, unknown>, now = new Date()) {
	let expires: Date;
	if (input.until != null) {
		// Wybrany dzień (z telefonu): wisi do 23:00 tego dnia.
		const until = date(input.until);
		if (until < localParts(now).date) throw new InputError(t('err.past'));
		expires = localTime(until, 23, 0);
	} else {
		const duration = input.duration as NoteDuration;
		if (!DURATIONS.includes(duration)) throw new InputError(t('err.duration'));
		expires = noteExpiry(now, duration);
	}
	const row = {
		id: randomUUID(),
		text: text(input.text, t('field.text'), 200),
		memberId: memberOrNull(db, input.memberId),
		expiresAt: expires.toISOString()
	};
	if (isConnected(db) && getRoles(db).notes) {
		await insertNote(db, row, now);
		await refreshNow(db, 'google');
		return row;
	}
	db.insert(localNotes).values(row).run();
	return row;
}

export async function removeNote(db: DB, id: string) {
	if (id.startsWith('g:')) {
		await deleteById(db, id);
		await refreshNow(db, 'google');
		return;
	}
	db.delete(localNotes).where(eq(localNotes.id, id)).run();
}

export function activeNotes(db: DB, now = new Date()) {
	return db.select().from(localNotes).where(gt(localNotes.expiresAt, now.toISOString())).all();
}

export async function addShopping(db: DB, input: Record<string, unknown>, now = new Date()) {
	const name = text(input.name, 'produkt', 60);
	if (isBringReady(db)) {
		await bringAdd(db, name);
		await refreshNow(db, 'bring');
		return { id: '', name, spec: null, icon: iconFor(name) ?? null, addedAt: now.toISOString() };
	}
	const existing = db.select().from(localShopping).all().find((i) => i.name.toLowerCase() === name.toLowerCase());
	if (existing) return existing;
	const row = { id: randomUUID(), name, spec: null, icon: iconFor(name) ?? null, addedAt: now.toISOString() };
	db.insert(localShopping).values(row).run();
	return row;
}

export async function removeShopping(db: DB, id: string) {
	if (id.startsWith('b:')) {
		await bringComplete(db, id);
		await refreshNow(db, 'bring');
		return;
	}
	db.delete(localShopping).where(eq(localShopping.id, id)).run();
}

export function addChore(db: DB, input: Record<string, unknown>) {
	const title = text(input.title, 'zadanie', 80);
	const memberId = memberOrNull(db, input.memberId);
	const day = date(input.date);
	const weekday = ((new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
	const repeat = input.repeat;
	const recurrence: Recurrence =
		repeat === 'weekly'
			? { type: 'weekly', days: [weekday] }
			: repeat === 'monthly'
				? { type: 'monthly', day: Number(day.slice(8)) }
				: repeat === 'once' || repeat == null
					? { type: 'once', date: day }
					: (() => {
							throw new InputError(t('err.repeat'));
						})();
	return db.insert(chores).values({ title, memberId, recurrence, startDate: day }).returning().get();
}

/** Odhacza zadanie: klucz `choreId:YYYY-MM-DD` albo `waste:YYYY-MM-DD:rodzaj`. */
export function completeTask(db: DB, key: string, now = new Date()) {
	if (/^waste:\d{4}-\d{2}-\d{2}:(yellow|grey|blue|green)$/.test(key)) {
		db.insert(wasteDone).values({ key, doneAt: now.toISOString() }).onConflictDoNothing().run();
		return;
	}
	const m = key.match(/^(\d+):(\d{4}-\d{2}-\d{2})$/);
	if (!m) throw new InputError(t('err.taskKey'));
	const choreId = Number(m[1]);
	if (!db.select().from(chores).where(eq(chores.id, choreId)).get()) throw new InputError(t('err.chore'));
	db.insert(choreCompletions).values({ choreId, dueDate: m[2], completedAt: now.toISOString() }).run();
}

export function wasteDoneKeys(db: DB): Set<string> {
	return new Set(db.select().from(wasteDone).all().map((r) => r.key));
}
