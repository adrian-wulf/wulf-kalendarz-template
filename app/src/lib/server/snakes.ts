import { asc, eq, sql } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { foodStock, settings, snakeEvents, snakes } from './db/schema.js';
import { InputError } from './store.js';
import { snakeView, type SnakeEventType, type SnakeView } from '#lib/logic/snakes.js';
import { t } from '#lib/i18n/index.js';
import { addDays, localParts } from '#lib/logic/dates.js';

/** Węże: karty z terminami karmienia, historia i zapas karmówki. */

export interface Food {
	id: string;
	label: string;
	count: number;
	minCount: number;
}

export interface SnakesData {
	today: string;
	snakes: SnakeView[];
	food: Food[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES: SnakeEventType[] = ['feed', 'refused', 'shed', 'clean', 'weight'];

export const isLow = (f: Food) => f.count < f.minCount;

export function listFood(db: DB): Food[] {
	return db.select().from(foodStock).orderBy(asc(foodStock.sortOrder)).all();
}

export function snakesData(db: DB, today: string): SnakesData {
	const events = db.select().from(snakeEvents).all();
	const list = db.select().from(snakes).orderBy(asc(snakes.sortOrder)).all();
	return {
		today,
		snakes: list.map(({ sortOrder: _, ...s }) =>
			snakeView(
				s,
				events.filter((e) => e.snakeId === s.id).map(({ snakeId: _, ...e }) => e),
				today
			)
		),
		food: listFood(db)
	};
}

/** Do plakietki na przycisku 🐍: ile węży czeka na karmienie i czy brakuje karmówki. */
export function snakesSummary(db: DB, today: string) {
	const d = snakesData(db, today);
	return { due: d.snakes.filter((s) => s.state === 'due').length, lowFood: d.food.some(isLow) };
}

function snakeOrThrow(db: DB, id: unknown) {
	if (typeof id !== 'string' || !db.select().from(snakes).where(eq(snakes.id, id)).get()) throw new InputError(t('err.snake'));
	return id;
}

function changeStock(db: DB, food: string, delta: number) {
	db.update(foodStock)
		.set({ count: sql`max(0, ${foodStock.count} + ${delta})` })
		.where(eq(foodStock.id, food))
		.run();
}

/** Wpis z kiosku (data = dziś). Karmienie z rozmiarem zdejmuje sztukę z zapasu. */
export function addSnakeEvent(db: DB, input: Record<string, unknown>, today: string, opts = { stock: true }) {
	const snakeId = snakeOrThrow(db, input.snakeId);
	const type = input.type as SnakeEventType;
	if (!TYPES.includes(type)) throw new InputError(t('err.entryType'));
	const date = input.date ?? today;
	if (typeof date !== 'string' || !DATE.test(date)) throw new InputError(t('err.date'));
	let food: string | null = null;
	if (type === 'feed' && input.food != null && input.food !== '') {
		if (typeof input.food !== 'string' || !db.select().from(foodStock).where(eq(foodStock.id, input.food)).get()) throw new InputError(t('err.food'));
		food = input.food;
	}
	let grams: number | null = null;
	if (type === 'weight') {
		grams = Number(input.grams);
		if (!Number.isInteger(grams) || grams < 1 || grams > 50_000) throw new InputError('Waga w gramach: 1–50000');
	}
	const row = db.insert(snakeEvents).values({ snakeId, type, date, food, grams }).returning().get();
	if (food && opts.stock) changeStock(db, food, -1);
	// Karmienie kończy wstrzymanie.
	if (type === 'feed') db.update(snakes).set({ pauseUntil: null }).where(eq(snakes.id, snakeId)).run();
	return row;
}

/** Cofnięcie wpisu; karmówka wraca do zapasu (z kiosku – tylko dla świeżych wpisów). */
export function removeSnakeEvent(db: DB, id: number, opts = { stock: true }) {
	const row = db.select().from(snakeEvents).where(eq(snakeEvents.id, id)).get();
	if (!row) throw new InputError('Nie ma takiego wpisu');
	db.delete(snakeEvents).where(eq(snakeEvents.id, id)).run();
	if (row.food && opts.stock) changeStock(db, row.food, 1);
}

export function setPause(db: DB, input: Record<string, unknown>) {
	const snakeId = snakeOrThrow(db, input.snakeId);
	const until = input.until;
	if (until !== null && (typeof until !== 'string' || !DATE.test(until))) throw new InputError(t('err.date'));
	db.update(snakes).set({ pauseUntil: until }).where(eq(snakes.id, snakeId)).run();
}

export function adjustStock(db: DB, input: Record<string, unknown>) {
	const delta = Number(input.delta);
	if (delta !== 1 && delta !== -1) throw new InputError('Zmiana o 1');
	if (typeof input.food !== 'string' || !db.select().from(foodStock).where(eq(foodStock.id, input.food)).get()) throw new InputError(t('err.food'));
	changeStock(db, input.food, delta);
}

// --- Dane przykładowe (wymyślone węże, terminy liczone od „dziś”) ---

/**
 * Wąż przykładowy: co ile dni je, ile dni temu ostatnio, ile karmień w historii,
 * wylinki i sprzątanie (dni temu). Daty wychodzą regularne i zawsze świeże względem dnia startu demo.
 */
type SeedSnake = {
	id: string;
	name: string;
	species: string;
	sex: 'M' | 'F';
	born: string;
	every: number;
	lastAgo: number;
	feeds: number;
	shedAgo: number[];
	cleanAgo: number[];
	color: string;
	food: string;
};

const SEED: SeedSnake[] = [
	// ok – do karmienia jeszcze kilka dni
	{ id: 'sezam', name: 'Sezam', species: 'Pyton królewski', sex: 'F', born: '2021', every: 10, lastAgo: 4, feeds: 12, shedAgo: [9, 52], cleanAgo: [9, 40], color: '#c2255c', food: '90g' },
	// soon – można karmić
	{ id: 'rumba', name: 'Rumba', species: 'Wąż zbożowy', sex: 'M', born: '2022', every: 7, lastAgo: 6, feeds: 14, shedAgo: [20, 61], cleanAgo: [14], color: '#5c940d', food: '15-20g' },
	// due – po terminie
	{ id: 'tofu', name: 'Tofu', species: 'Boa constrictor imperator', sex: 'M', born: '2019', every: 14, lastAgo: 17, feeds: 8, shedAgo: [33], cleanAgo: [33, 75], color: '#7048e8', food: '400g' },
	// młody, jedno karmienie – odstęp domyślny
	{ id: 'pestka', name: 'Pestka', species: 'Heterodon', sex: 'F', born: '2025', every: 7, lastAgo: 3, feeds: 1, shedAgo: [], cleanAgo: [], color: '#0c8599', food: '15-20g' }
];

const SEED_FOOD: [id: string, label: string, count: number][] = [
	['15-20g', '15–20 g', 6],
	['30g', '30 g+', 0],
	['50g', '50 g+', 3],
	['90g', '90 g+', 4],
	['400g', '400 g', 2]
];

/** Jednorazowo: przykładowe węże, historia i zapas karmówki. `today` – dzień, od którego liczą się daty. */
export function seedSnakes(db: DB, today: string = localParts(new Date()).date) {
	if (db.select().from(settings).where(eq(settings.key, 'snakesSeeded')).get()) return;
	db.transaction((tx) => {
		SEED.forEach((s, i) => {
			const { id, name, species, sex, born, color } = s;
			tx.insert(snakes).values({ id, name, species, sex, born, color, sortOrder: i }).onConflictDoNothing().run();
			for (let k = s.feeds - 1; k >= 0; k--)
				tx.insert(snakeEvents).values({ snakeId: id, type: 'feed', date: addDays(today, -(s.lastAgo + k * s.every)), food: s.food }).run();
			for (const ago of s.shedAgo) tx.insert(snakeEvents).values({ snakeId: id, type: 'shed', date: addDays(today, -ago) }).run();
			for (const ago of s.cleanAgo) tx.insert(snakeEvents).values({ snakeId: id, type: 'clean', date: addDays(today, -ago) }).run();
		});
		SEED_FOOD.forEach(([id, label, count], i) => tx.insert(foodStock).values({ id, label, count, minCount: 2, sortOrder: i }).onConflictDoNothing().run());
		tx.insert(settings).values({ key: 'snakesSeeded', value: true }).run();
	});
}

// --- Panel: pełna edycja (FormData z formularzy) ---

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

function slug(name: string, taken: Set<string>) {
	const base =
		name
			.toLowerCase()
			.normalize('NFD')
			.replace(/\p{M}/gu, '')
			.replace(/ł/g, 'l')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'waz';
	let id = base;
	for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
	return id;
}

export function saveSnake(db: DB, f: FormData) {
	const name = str(f, 'name');
	if (!name || name.length > 40) throw new InputError(t('err.snakeName'));
	const sex = str(f, 'sex');
	if (sex !== 'M' && sex !== 'F' && sex !== '?') throw new InputError(t('err.sex'));
	const interval = str(f, 'intervalDays');
	const intervalDays = interval ? Number(interval) : null;
	if (intervalDays !== null && !(Number.isInteger(intervalDays) && intervalDays >= 1 && intervalDays <= 120)) throw new InputError(t('err.interval'));
	const toStr = str(f, 'intervalMax');
	const intervalMax = toStr && intervalDays !== null ? Number(toStr) : null;
	if (intervalMax !== null && !(Number.isInteger(intervalMax) && intervalMax >= intervalDays! && intervalMax <= 120)) throw new InputError(t('err.intervalMax'));
	const pause = str(f, 'pauseUntil');
	if (pause && !DATE.test(pause)) throw new InputError(t('err.pauseDate'));
	const color = str(f, 'color') || '#2f9e44';
	if (!/^#[0-9a-f]{6}$/i.test(color)) throw new InputError(t('err.color'));
	const values = { name, species: str(f, 'species').slice(0, 60), sex: sex as 'M' | 'F' | '?', born: str(f, 'born').slice(0, 20), color: color.toLowerCase(), intervalDays, intervalMax, pauseUntil: pause || null };
	const id = str(f, 'id');
	if (id) return void db.update(snakes).set(values).where(eq(snakes.id, id)).run();
	const all = db.select().from(snakes).all();
	db.insert(snakes)
		.values({ id: slug(name, new Set(all.map((s) => s.id))), ...values, sortOrder: all.length })
		.run();
}

export function deleteSnake(db: DB, f: FormData) {
	db.delete(snakes).where(eq(snakes.id, str(f, 'id'))).run();
}

/** Wpis historyczny z panelu – bez zmiany zapasu karmówki. */
export function addSnakeEventForm(db: DB, f: FormData) {
	addSnakeEvent(db, { snakeId: str(f, 'snakeId'), type: str(f, 'type'), date: str(f, 'date'), food: str(f, 'food') || null, grams: str(f, 'grams') }, str(f, 'date'), { stock: false });
}

export function deleteSnakeEventForm(db: DB, f: FormData) {
	removeSnakeEvent(db, Number(str(f, 'id')), { stock: false });
}

export function saveFood(db: DB, f: FormData) {
	const label = str(f, 'label');
	if (!label || label.length > 20) throw new InputError(t('err.foodSize'));
	const count = Number(str(f, 'count'));
	const minCount = Number(str(f, 'minCount'));
	if (![count, minCount].every((n) => Number.isInteger(n) && n >= 0 && n <= 999)) throw new InputError(t('err.counts'));
	const id = str(f, 'id');
	if (id) return void db.update(foodStock).set({ label, count, minCount }).where(eq(foodStock.id, id)).run();
	const all = listFood(db);
	db.insert(foodStock)
		.values({ id: slug(label, new Set(all.map((x) => x.id))), label, count, minCount, sortOrder: all.length })
		.run();
}

export function deleteFood(db: DB, f: FormData) {
	db.delete(foodStock).where(eq(foodStock.id, str(f, 'id'))).run();
}
