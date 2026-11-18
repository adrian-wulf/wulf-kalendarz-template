import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { SnakeEventType } from '../../logic/snakes.js';

export type Recurrence =
	| { type: 'once'; date: string }
	| { type: 'daily' }
	| { type: 'weekly'; days: number[] } // 1 = poniedziałek … 7 = niedziela
	| { type: 'monthly'; day: number };

export const members = sqliteTable('members', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	color: text('color').notNull(),
	/** emoji albo adres zdjęcia (`/media/avatars/…`); null = kolorowa kropka */
	avatar: text('avatar'),
	/** urodziny: 'YYYY-MM-DD' albo '--MM-DD' (rok nieznany) */
	birthday: text('birthday'),
	/** imię do imienin, gdy inne niż wyświetlane (np. „Tata” → „Adrian”) */
	nameDay: text('name_day'),
	calendarIds: text('calendar_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
	emails: text('emails', { mode: 'json' }).$type<string[]>().notNull().default([]),
	sortOrder: integer('sort_order').notNull().default(0)
});

export const chores = sqliteTable('chores', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	memberId: text('member_id').references(() => members.id, { onDelete: 'set null' }),
	recurrence: text('recurrence', { mode: 'json' }).$type<Recurrence>().notNull(),
	startDate: text('start_date').notNull(),
	archived: integer('archived', { mode: 'boolean' }).notNull().default(false)
});

export const choreCompletions = sqliteTable('chore_completions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	choreId: integer('chore_id')
		.notNull()
		.references(() => chores.id, { onDelete: 'cascade' }),
	dueDate: text('due_date').notNull(),
	completedAt: text('completed_at').notNull(),
	memberId: text('member_id')
});

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).notNull()
});

export const sourceCache = sqliteTable('source_cache', {
	source: text('source').primaryKey(),
	data: text('data', { mode: 'json' }),
	fetchedAt: text('fetched_at'),
	lastError: text('last_error'),
	lastErrorAt: text('last_error_at')
});

export const secrets = sqliteTable('secrets', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

/** Lokalne wydarzenia – do czasu podłączenia Google Calendar. */
export const localEvents = sqliteTable('local_events', {
	id: text('id').primaryKey(),
	title: text('title').notNull(),
	memberId: text('member_id'),
	start: text('start').notNull(),
	end: text('end').notNull(),
	allDay: integer('all_day', { mode: 'boolean' }).notNull(),
	// --- 26a: calendar layers ---
	/** warstwa kalendarza: 'local' (wpisane na kiosku) albo 'local:<uuid>' (np. z importu .ics) */
	calendarId: text('calendar_id').notNull().default('local'),
	/** UID z pliku .ics (import bez duplikatów); null = wpis z kiosku/panelu */
	uid: text('uid'),
	location: text('location'),
	description: text('description')
});

/** Lokalne kartki – do czasu podłączenia kalendarza „Kartki”. */
export const localNotes = sqliteTable('local_notes', {
	id: text('id').primaryKey(),
	text: text('text').notNull(),
	memberId: text('member_id'),
	expiresAt: text('expires_at').notNull()
});

/** Lokalna lista zakupów – do czasu podłączenia Bring!. */
export const localShopping = sqliteTable('local_shopping', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	spec: text('spec'),
	icon: text('icon'),
	addedAt: text('added_at').notNull()
});

/** Odhaczone zadania „wystaw pojemnik” (klucz waste:data:rodzaj). */
export const wasteDone = sqliteTable('waste_done', {
	key: text('key').primaryKey(),
	doneAt: text('done_at').notNull()
});

/** Węże w terrariach. `intervalDays` null = odstęp karmienia liczony z historii. */
export const snakes = sqliteTable('snakes', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	species: text('species').notNull(),
	sex: text('sex').$type<'M' | 'F' | '?'>().notNull(),
	born: text('born').notNull().default(''),
	color: text('color').notNull().default('#2f9e44'),
	intervalDays: integer('interval_days'),
	/** górna granica okna karmienia (np. 7–10 dni); null = jeden odstęp */
	intervalMax: integer('interval_max'),
	pauseUntil: text('pause_until'),
	sortOrder: integer('sort_order').notNull().default(0)
});

/** Historia: karmienie (z rozmiarem karmówki), odmowa, wylinka, sprzątanie, ważenie. */
export const snakeEvents = sqliteTable('snake_events', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	snakeId: text('snake_id')
		.notNull()
		.references(() => snakes.id, { onDelete: 'cascade' }),
	type: text('type').$type<SnakeEventType>().notNull(),
	date: text('date').notNull(),
	food: text('food'),
	grams: integer('grams')
});

/** Zapas karmówki według rozmiaru; poniżej `minCount` – ostrzeżenie. */
export const foodStock = sqliteTable('food_stock', {
	id: text('id').primaryKey(),
	label: text('label').notNull(),
	count: integer('count').notNull().default(0),
	minCount: integer('min_count').notNull().default(1),
	sortOrder: integer('sort_order').notNull().default(0)
});

/** Miejsca przechowywania (spiżarnia, zamrażarka…). Zamrażarka liczy wiek partii. */
export const pantryPlaces = sqliteTable('pantry_places', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	icon: text('icon').notNull().default('📦'),
	freezer: integer('freezer', { mode: 'boolean' }).notNull().default(false),
	sortOrder: integer('sort_order').notNull().default(0)
});

/** Zapamiętane produkty – do szybkiego ponownego dodania; `uses` = jak często dodawane. */
export const pantryProducts = sqliteTable('pantry_products', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	icon: text('icon'),
	category: text('category').notNull().default('inne'),
	unit: text('unit').notNull().default('szt.'),
	/** poniżej (łącznie we wszystkich miejscach) – trafia do zakupów; null = gdy się skończy */
	minQty: integer('min_qty'),
	uses: integer('uses').notNull().default(0),
	lastPlaceId: text('last_place_id')
});

/** Co leży: w spiżarni jeden wiersz na produkt, w zamrażarce jeden na partię (datę włożenia). */
export const pantryItems = sqliteTable('pantry_items', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	productId: integer('product_id')
		.notNull()
		.references(() => pantryProducts.id, { onDelete: 'cascade' }),
	placeId: text('place_id')
		.notNull()
		.references(() => pantryPlaces.id, { onDelete: 'cascade' }),
	qty: integer('qty').notNull(),
	addedAt: text('added_at').notNull(),
	bestBefore: text('best_before')
});

// --- p3b: meals, kids, countdown ---

/** Składnik przepisu: ilość opcjonalna (null = „trochę”), jednostka jak wpisana (g, szt., łyżka…). */
export interface Ingredient {
	name: string;
	qty: number | null;
	unit: string;
}

/** Przepisy do planu posiłków. */
export const recipes = sqliteTable('recipes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	emoji: text('emoji').notNull().default('🍽️'),
	ingredients: text('ingredients', { mode: 'json' }).$type<Ingredient[]>().notNull().default([]),
	notes: text('notes').notNull().default('')
});

/** Plan: jeden wpis na dzień i porę (obiad / kolacja) – przepis albo sam tekst. */
export const mealPlan = sqliteTable(
	'meal_plan',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		date: text('date').notNull(),
		slot: text('slot').$type<'lunch' | 'dinner'>().notNull(),
		recipeId: integer('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
		text: text('text')
	},
	(t) => [uniqueIndex('meal_plan_date_slot').on(t.date, t.slot)]
);

/** Powtarzanie zadań dzieci: codziennie, w wybrane dni tygodnia albo raz w tygodniu (dowolnego dnia). */
export type KidRepeat = { type: 'daily' } | { type: 'days'; days: number[] } | { type: 'weekly' };

/** Zadania dzieci z punktami. Dziecko = domownik, który ma choć jedno zadanie. */
export const kidTasks = sqliteTable('kid_tasks', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	memberId: text('member_id')
		.notNull()
		.references(() => members.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	emoji: text('emoji').notNull().default('⭐'),
	points: integer('points').notNull().default(1),
	repeat: text('repeat', { mode: 'json' }).$type<KidRepeat>().notNull(),
	sortOrder: integer('sort_order').notNull().default(0)
});

/**
 * Księga punktów: odhaczone zadanie (taskId + okres: dzień albo poniedziałek tygodnia), premia rodzica
 * i wymieniona nagroda (ujemne). Saldo = suma `delta`.
 */
export const kidPoints = sqliteTable(
	'kid_points',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		memberId: text('member_id')
			.notNull()
			.references(() => members.id, { onDelete: 'cascade' }),
		delta: integer('delta').notNull(),
		reason: text('reason').notNull().default(''),
		taskId: integer('task_id').references(() => kidTasks.id, { onDelete: 'set null' }),
		period: text('period'),
		createdAt: text('created_at').notNull()
	},
	(t) => [uniqueIndex('kid_points_task_period').on(t.taskId, t.period)]
);

/** Nagrody do wymiany za punkty. */
export const kidRewards = sqliteTable('kid_rewards', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	emoji: text('emoji').notNull().default('🎁'),
	cost: integer('cost').notNull(),
	sortOrder: integer('sort_order').notNull().default(0)
});

/** Prośby o nagrodę – czekają na zgodę rodzica (panel albo telefon z dostępem do panelu). */
export const kidRedemptions = sqliteTable('kid_redemptions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	memberId: text('member_id')
		.notNull()
		.references(() => members.id, { onDelete: 'cascade' }),
	rewardId: integer('reward_id').references(() => kidRewards.id, { onDelete: 'set null' }),
	title: text('title').notNull(),
	emoji: text('emoji').notNull().default('🎁'),
	cost: integer('cost').notNull(),
	status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
	requestedAt: text('requested_at').notNull(),
	decidedAt: text('decided_at'),
	decidedBy: text('decided_by')
});

/** Odliczanie do dat (wakacje, urodziny, święta); `yearly` – co roku tego samego dnia. */
export const countdowns = sqliteTable('countdowns', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	emoji: text('emoji').notNull().default('🎉'),
	date: text('date').notNull(),
	yearly: integer('yearly', { mode: 'boolean' }).notNull().default(false),
	memberId: text('member_id').references(() => members.id, { onDelete: 'set null' })
});

// --- p3c: care, transit, home assistant (moduły meds, care, homeassistant) ---

/** Leki domownika: nazwa, dawka, godziny i dni tygodnia (pusta lista = codziennie). Dane zostają lokalnie. */
export const meds = sqliteTable('meds', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	memberId: text('member_id').references(() => members.id, { onDelete: 'set null' }),
	name: text('name').notNull(),
	dose: text('dose').notNull().default(''),
	times: text('times', { mode: 'json' }).$type<string[]>().notNull(),
	days: text('days', { mode: 'json' }).$type<number[]>().notNull().default([]),
	startDate: text('start_date'),
	endDate: text('end_date'),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	sortOrder: integer('sort_order').notNull().default(0)
});

/** Potwierdzone dawki („wzięte”): lek, dzień i godzina z planu. */
export const medDoses = sqliteTable(
	'med_doses',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		medId: integer('med_id')
			.notNull()
			.references(() => meds.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		time: text('time').notNull(),
		takenAt: text('taken_at').notNull()
	},
	(t) => [uniqueIndex('med_doses_once').on(t.medId, t.date, t.time)]
);

/** Opieka „co X dni” (rośliny, filtr…): okno od–do dni, ikona, opcjonalnie domownik. */
export const careItems = sqliteTable('care_items', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	icon: text('icon').notNull().default('🪴'),
	minDays: integer('min_days').notNull(),
	maxDays: integer('max_days').notNull(),
	memberId: text('member_id').references(() => members.id, { onDelete: 'set null' }),
	pauseUntil: text('pause_until'),
	sortOrder: integer('sort_order').notNull().default(0)
});

/** Historia opieki: kiedy zrobione. Ostatni wpis = „ostatnio”. */
export const careLog = sqliteTable('care_log', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	itemId: integer('item_id')
		.notNull()
		.references(() => careItems.id, { onDelete: 'cascade' }),
	date: text('date').notNull(),
	doneAt: text('done_at').notNull()
});

/** Encje Home Assistanta wybrane na kiosk (stan czyta serwer – token nie wychodzi do przeglądarki). */
export const haEntities = sqliteTable('ha_entities', {
	entityId: text('entity_id').primaryKey(),
	label: text('label').notNull().default(''),
	sortOrder: integer('sort_order').notNull().default(0)
});

// --- 26a: calendar layers ---

/**
 * Warstwy kalendarza („Kalendarze”). Wiersz to ustawienia warstwy: dla subskrypcji iCal i lokalnych
 * kalendarzy z importu – także sama definicja; dla Google, kiosku i warstw generowanych (urodziny,
 * śmieci, ferie, święta) – tylko zmiany względem domyślnych (brak wiersza = widoczne, kolory jak dotąd).
 */
export const calendars = sqliteTable('calendars', {
	id: text('id').primaryKey(),
	kind: text('kind').$type<'google' | 'local' | 'ical' | 'birthdays' | 'waste' | 'ferien' | 'holidays'>().notNull(),
	/** '' = nazwa domyślna w bieżącym języku */
	name: text('name').notNull().default(''),
	/** null = automatycznie (kolor osoby, jak przed warstwami) */
	color: text('color'),
	/** emoji; null = domyślne dla rodzaju */
	icon: text('icon'),
	memberId: text('member_id').references(() => members.id, { onDelete: 'set null' }),
	showKiosk: integer('show_kiosk', { mode: 'boolean' }).notNull().default(true),
	showPhone: integer('show_phone', { mode: 'boolean' }).notNull().default(true),
	/** null = kolejność domyślna */
	sortOrder: integer('sort_order'),
	/** subskrypcja: adres iCal i odświeżanie w minutach */
	url: text('url'),
	refreshMinutes: integer('refresh_minutes'),
	createdAt: text('created_at').notNull()
});
