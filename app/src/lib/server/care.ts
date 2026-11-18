import { asc, eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { careItems, careLog, members, settings } from './db/schema.js';
import { InputError } from './store.js';
import { addDays } from '#lib/logic/dates.js';
import { careList, parseWindow, type CareItem, type CareView } from '#lib/logic/care.js';
import { t } from '#lib/i18n/index.js';

/** Opieka „co X dni”: lista z terminami, odhaczanie z kiosku i telefonu, cofnięcie, historia. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function listItems(db: DB): CareItem[] {
	return db
		.select()
		.from(careItems)
		.orderBy(asc(careItems.sortOrder), asc(careItems.id))
		.all()
		.map(({ sortOrder: _, ...i }) => i);
}

export function careData(db: DB, today: string): CareView[] {
	return careList(listItems(db), db.select().from(careLog).all(), today);
}

export interface CareSummary {
	/** do zrobienia teraz (dziś, po terminie, w oknie) */
	items: CareView[];
	/** następne (kiedy nic nie czeka – „następne: …”) */
	next: CareView | null;
	overdue: number;
}

export function careSummary(db: DB, today: string): CareSummary {
	const all = careData(db, today);
	const items = all.filter((v) => v.actionable);
	return { items, next: all.find((v) => !v.actionable && v.state !== 'paused') ?? null, overdue: items.filter((v) => v.state === 'overdue').length };
}

function itemOrThrow(db: DB, id: unknown) {
	const n = Number(id);
	const row = Number.isInteger(n) ? db.select().from(careItems).where(eq(careItems.id, n)).get() : undefined;
	if (!row) throw new InputError(t('care.err.unknown'));
	return row;
}

/** Odhaczenie (dziś, albo z panelu z inną datą). Zwraca wpis – kiosk trzyma jego id do cofnięcia. */
export function markDone(db: DB, input: Record<string, unknown>, today: string, now = new Date()) {
	const item = itemOrThrow(db, input.id);
	const date = input.date ?? today;
	if (typeof date !== 'string' || !DATE.test(date) || date > today) throw new InputError(t('err.date'));
	return db.insert(careLog).values({ itemId: item.id, date, doneAt: now.toISOString() }).returning().get();
}

/** Cofnięcie odhaczenia (tylko wpis z ostatniej doby – pomyłka na kiosku). */
export function undoDone(db: DB, input: Record<string, unknown>, now = new Date(), maxAgeMs = 24 * 3_600_000) {
	const id = Number(input.logId);
	const row = Number.isInteger(id) ? db.select().from(careLog).where(eq(careLog.id, id)).get() : undefined;
	if (!row) throw new InputError(t('care.err.entry'));
	if (now.getTime() - Date.parse(row.doneAt) > maxAgeMs) throw new InputError(t('care.err.tooOld'));
	db.delete(careLog).where(eq(careLog.id, id)).run();
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export function saveItem(db: DB, f: FormData, today: string) {
	const name = str(f, 'name');
	if (!name || name.length > 60) throw new InputError(t('care.err.name'));
	const icon = str(f, 'icon') || '🪴';
	if ([...icon].length > 4) throw new InputError(t('care.err.icon'));
	const win = parseWindow(str(f, 'minDays'), str(f, 'maxDays'));
	if (!win) throw new InputError(t('care.err.window'));
	const memberId = str(f, 'memberId') || null;
	if (memberId && !db.select().from(members).where(eq(members.id, memberId)).get()) throw new InputError(t('err.member'));
	const pauseUntil = str(f, 'pauseUntil') || null;
	if (pauseUntil && !DATE.test(pauseUntil)) throw new InputError(t('err.date'));
	const values = { name, icon, ...win, memberId, pauseUntil };
	const id = str(f, 'id');
	if (id) {
		const item = itemOrThrow(db, id);
		db.update(careItems).set(values).where(eq(careItems.id, item.id)).run();
	} else {
		const row = db
			.insert(careItems)
			.values({ ...values, sortOrder: db.select().from(careItems).all().length })
			.returning()
			.get();
		// „Ostatnio” z formularza – żeby nowa pozycja nie była od razu „do zrobienia”.
		const last = str(f, 'lastDone');
		if (last) {
			if (!DATE.test(last) || last > today) throw new InputError(t('err.date'));
			db.insert(careLog).values({ itemId: row.id, date: last, doneAt: new Date().toISOString() }).run();
		}
	}
}

export function deleteItem(db: DB, f: FormData) {
	const item = itemOrThrow(db, f.get('id'));
	db.delete(careItems).where(eq(careItems.id, item.id)).run();
}

export function deleteLog(db: DB, f: FormData) {
	const id = Number(f.get('id'));
	if (!Number.isInteger(id)) throw new InputError(t('care.err.entry'));
	db.delete(careLog).where(eq(careLog.id, id)).run();
}

/** Historia do panelu: ostatnie wpisy każdej pozycji (najnowsze pierwsze). */
export function careHistory(db: DB, limit = 8): Record<number, { id: number; date: string }[]> {
	const out: Record<number, { id: number; date: string }[]> = {};
	for (const l of db.select().from(careLog).all().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)) {
		const list = (out[l.itemId] ??= []);
		if (list.length < limit) list.push({ id: l.id, date: l.date });
	}
	return out;
}

/** Dane przykładowe: kilka typowych pozycji (raz na instalację, przez rejestr modułów). */
export function seedCare(db: DB, today: string) {
	if (db.select().from(settings).where(eq(settings.key, 'careSeeded')).get()) return;
	const sample: [string, string, number, number, number][] = [
		[t('care.demo.monstera'), '🪴', 7, 10, 8],
		[t('care.demo.herbs'), '🌿', 2, 3, 3],
		[t('care.demo.filter'), '💧', 30, 30, 12],
		[t('care.demo.descale'), '☕', 28, 42, 20]
	];
	db.transaction((tx) => {
		sample.forEach(([name, icon, minDays, maxDays, ago], i) => {
			const row = tx.insert(careItems).values({ name, icon, minDays, maxDays, sortOrder: i }).returning().get();
			tx.insert(careLog).values({ itemId: row.id, date: addDays(today, -ago), doneAt: new Date().toISOString() }).run();
		});
		tx.insert(settings).values({ key: 'careSeeded', value: true }).run();
	});
}
