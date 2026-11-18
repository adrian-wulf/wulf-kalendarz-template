import { and, asc, eq, gte } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { medDoses, meds, members } from './db/schema.js';
import { InputError } from './store.js';
import { addDays } from '#lib/logic/dates.js';
import { history, isTime, kioskDoses, parseTimes, type DayHistory, type Dose, type DoseLog, type DoseWindow, type MedPlan } from '#lib/logic/meds.js';
import { t } from '#lib/i18n/index.js';

/**
 * Leki i przypomnienia. Wszystko zostaje w lokalnej bazie (nic nie wychodzi do sieci).
 * Aplikacja nie podaje żadnych porad medycznych – tylko plan wpisany przez domowników.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Ile dni historii trzymamy w zapytaniach (kiosk: dziś i wczoraj; panel: 14 dni). */
const HISTORY_DAYS = 14;

export function listMeds(db: DB): MedPlan[] {
	return db
		.select()
		.from(meds)
		.orderBy(asc(meds.sortOrder), asc(meds.id))
		.all()
		.map(({ sortOrder: _, ...m }) => m);
}

function logsSince(db: DB, from: string): DoseLog[] {
	return db.select().from(medDoses).where(gte(medDoses.date, from)).all();
}

export interface MedsSummary {
	doses: Dose[];
	/** ile dawek czeka teraz (pora albo zaległe) */
	due: number;
	overdue: number;
}

/** Dane na kiosk: dawki dziś (+ niewzięte wieczorne z wczoraj). */
export function medsSummary(db: DB, today: string, now: Date, w: DoseWindow): MedsSummary {
	const doses = kioskDoses(listMeds(db), logsSince(db, addDays(today, -1)), today, now, w);
	return {
		doses,
		due: doses.filter((d) => d.state === 'due' || d.state === 'overdue').length,
		overdue: doses.filter((d) => d.state === 'overdue').length
	};
}

export interface MedRow extends MedPlan {
	history: DayHistory[];
}

export function medsAdmin(db: DB, today: string): { meds: MedRow[] } {
	const logs = logsSince(db, addDays(today, -HISTORY_DAYS));
	return { meds: listMeds(db).map((m) => ({ ...m, history: history(m, logs, today, HISTORY_DAYS) })) };
}

function medOrThrow(db: DB, id: unknown) {
	const n = Number(id);
	const row = Number.isInteger(n) ? db.select().from(meds).where(eq(meds.id, n)).get() : undefined;
	if (!row) throw new InputError(t('meds.err.unknown'));
	return row;
}

/** „Wzięte” z kiosku albo telefonu: tylko dawka z planu, dziś lub wczoraj. */
export function takeDose(db: DB, input: Record<string, unknown>, today: string, now = new Date()) {
	const m = medOrThrow(db, input.medId);
	const date = input.date ?? today;
	if (typeof date !== 'string' || !DATE.test(date) || (date !== today && date !== addDays(today, -1))) throw new InputError(t('err.date'));
	if (!isTime(input.time) || !m.times.includes(input.time)) throw new InputError(t('meds.err.time'));
	const row = db
		.insert(medDoses)
		.values({ medId: m.id, date, time: input.time, takenAt: now.toISOString() })
		.onConflictDoNothing()
		.returning()
		.get();
	return row ?? db.select().from(medDoses).where(and(eq(medDoses.medId, m.id), eq(medDoses.date, date), eq(medDoses.time, input.time))).get();
}

/** Cofnięcie „wzięte” (pomyłka). */
export function untakeDose(db: DB, input: Record<string, unknown>) {
	const id = Number(input.id);
	if (!Number.isInteger(id) || !db.select().from(medDoses).where(eq(medDoses.id, id)).get()) throw new InputError(t('meds.err.dose'));
	db.delete(medDoses).where(eq(medDoses.id, id)).run();
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Zapis leku z panelu (nowy albo zmiana). */
export function saveMed(db: DB, f: FormData, today: string) {
	const name = str(f, 'name');
	if (!name || name.length > 60) throw new InputError(t('meds.err.name'));
	const dose = str(f, 'dose');
	if (dose.length > 40) throw new InputError(t('err.tooLong', { label: t('meds.dose') }));
	const times = parseTimes(str(f, 'times'));
	if (!times) throw new InputError(t('meds.err.times'));
	const days = f
		.getAll('days')
		.map(Number)
		.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
	const memberRaw = str(f, 'memberId');
	const memberId = memberRaw || null;
	if (memberId && !db.select().from(members).where(eq(members.id, memberId)).get()) throw new InputError(t('err.member'));
	// Nowy lek bez daty „od” – od dziś (historia nie liczy dni sprzed wpisania).
	const startDate = str(f, 'startDate') || (f.has('id') ? null : today);
	const endDate = str(f, 'endDate') || null;
	for (const d of [startDate, endDate]) if (d && !DATE.test(d)) throw new InputError(t('err.date'));
	if (startDate && endDate && endDate < startDate) throw new InputError(t('meds.err.range'));
	const values = { name, dose, times, days: [...new Set(days)].sort(), memberId, startDate, endDate, active: f.get('active') !== null || !f.has('id') };
	const id = str(f, 'id');
	if (id) {
		const m = medOrThrow(db, id);
		db.update(meds).set(values).where(eq(meds.id, m.id)).run();
	} else {
		const n = db.select().from(meds).all().length;
		db.insert(meds).values({ ...values, sortOrder: n }).run();
	}
}

export function deleteMed(db: DB, f: FormData) {
	const m = medOrThrow(db, f.get('id'));
	db.delete(meds).where(eq(meds.id, m.id)).run();
}
