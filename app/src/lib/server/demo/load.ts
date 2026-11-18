import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import {
	careItems,
	careLog,
	choreCompletions,
	chores,
	countdowns,
	haEntities,
	kidPoints,
	kidRedemptions,
	kidRewards,
	kidTasks,
	localEvents,
	localNotes,
	localShopping,
	mealPlan,
	medDoses,
	meds,
	members,
	pantryPlaces,
	recipes,
	secrets,
	settings
} from '../db/schema.js';
import { newMemberId } from '../admin.js';
import { getSetting, refresh, setSetting, activeSources } from '../sync.js';
import { setTheme } from '../theme.js';
import { addPantry } from '../pantry.js';
import { seedSnakes } from '../snakes.js';
import { setPin } from '../security.js';
import { setKv, getKv } from '../kv.js';
import { InputError } from '../store.js';
import { presetById } from '#lib/theme.js';
import { addDays, localParts, localTime, parseHHMM } from '#lib/logic/dates.js';
import { periodOf } from '#lib/logic/kids.js';
import { parseIngredients } from '#lib/logic/meals.js';
import { binRule } from '#lib/logic/waste.js';
import { MODULES } from '#lib/modules/index.js';
import { SEEDED } from '#lib/modules/registry.server.js';
import type { ModulesSetting } from '#lib/modules/types.js';
import { setLang, t, type Lang } from '#lib/i18n/index.js';
import { wasteRules } from '../sync.js';
import { demoPack, type DemoPack } from './pack.js';
import { DEMO_PIN, demoLang, demoResetTime } from './mode.js';
import { demoFetch, DEMO_GTFS_URL, DEMO_HA_TOKEN, DEMO_HA_URL, resetDemoFetch } from './fetch.js';
import type { Country } from '#lib/region.js';
import { writeDemoPhotos } from './photos.js';
// --- 26a: calendar layers ---
import { createLocalCalendar, createSubscription } from '../calendars.js';
import { writeImport } from '../ics-import.js';

/**
 * Zapis danych demo do bazy: `resetDemo` (tryb demo – baza od zera) i `loadSampleData`
 * (przycisk w panelu – dopisuje przykład do istniejącej instalacji, niczego nie usuwa).
 */

/** Wszystkie tabele aplikacji (bez tabeli migracji). */
function appTables(db: DB): string[] {
	return db
		.all<{ name: string }>(sql`select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'`)
		.map((r) => r.name);
}

/** Czyści bazę demo (wszystkie tabele) i przywraca wiersze, które dodają migracje (miejsca zapasów). */
function wipe(db: DB) {
	db.$client.pragma('foreign_keys = OFF');
	try {
		db.transaction((tx) => {
			for (const name of appTables(db)) tx.run(sql.raw(`delete from "${name.replaceAll('"', '')}"`));
			tx.run(sql`delete from sqlite_sequence`);
			tx.insert(pantryPlaces)
				.values([
					{ id: 'spizarnia', name: t('demo.place.pantry'), icon: '🥫', freezer: false, sortOrder: 0 },
					{ id: 'zamrazarka', name: t('demo.place.freezer'), icon: '❄️', freezer: true, sortOrder: 1 }
				])
				.run();
		});
	} finally {
		db.$client.pragma('foreign_keys = ON');
	}
}

/** Wszystkie moduły włączone; ustawienia, przy których demo wygląda najlepiej. */
function demoModules(country: Country): ModulesSetting {
	const out: ModulesSetting = {};
	for (const m of MODULES) out[m.id] = { enabled: true };
	out.meals = { enabled: true, config: { slots: 'both' } };
	// Dostawca jak w prawdziwej instalacji w tym kraju: PL – rozkład GTFS, DE – VBB (bez ostrzeżenia o kraju).
	out.transit = {
		enabled: true,
		config: country === 'PL' ? { provider: 'gtfs', gtfsUrl: DEMO_GTFS_URL, results: 5, walkMinutes: 2 } : { provider: 'vbb', results: 5, walkMinutes: 2 }
	};
	out.screensaver = { enabled: true, config: { idleMinutes: 3, slideSeconds: 12 } };
	return out;
}

export interface WriteSummary {
	members: number;
	events: number;
	items: number;
}

/**
 * Treść paczki do bazy. `ids` – domownicy paczki → identyfikatory w bazie (w trybie „dopisz” mogą być inne).
 * `waste` – wywozy ręczne (tylko gdy nie ma innego źródła terminów).
 */
function writeContent(db: DB, pack: DemoPack, ids: Map<string, string>, now: Date, opts: { waste: boolean }): WriteSummary {
	const today = localParts(now).date;
	const minutes = localParts(now).minutes;
	const at = now.toISOString();
	const who = (id: string | null) => (id ? (ids.get(id) ?? null) : null);
	let items = 0;
	const count = <T>(rows: T[]) => ((items += rows.length), rows);

	db.transaction((tx) => {
		// Wydarzenia lokalne (bez Google) – godziny w strefie regionu.
		for (const e of pack.events) {
			const [start, end] = e.from
				? [localTime(e.date, ...(e.from.split(':').map(Number) as [number, number])), localTime(e.date, ...((e.to ?? e.from).split(':').map(Number) as [number, number]))].map((d) => d.toISOString())
				: [e.date, addDays(e.date, e.days)];
			tx.insert(localEvents).values({ id: randomUUID(), title: e.title, memberId: who(e.memberId), start, end, allDay: !e.from }).run();
		}

		for (const n of count(pack.notes))
			tx.insert(localNotes)
				.values({ id: randomUUID(), text: n.text, memberId: who(n.memberId), expiresAt: localTime(addDays(today, n.days), 23, 59).toISOString() })
				.run();

		pack.shopping.forEach((s, i) =>
			tx
				.insert(localShopping)
				.values({ id: randomUUID(), name: s.name, spec: s.spec, icon: s.icon, addedAt: new Date(now.getTime() - (pack.shopping.length - i) * 60_000).toISOString() })
				.run()
		);
		items += pack.shopping.length;

		for (const c of count(pack.chores)) {
			const row = tx.insert(chores).values({ title: c.title, memberId: who(c.memberId), recurrence: c.recurrence, startDate: c.startDate }).returning().get();
			if (c.doneToday) tx.insert(choreCompletions).values({ choreId: row.id, dueDate: today, completedAt: at, memberId: who(c.memberId) }).run();
		}

		const recipeIds = count(pack.recipes).map(
			(r) =>
				tx
					.insert(recipes)
					.values({ name: r.name, emoji: r.emoji, ingredients: parseIngredients(r.ingredients.join('\n')), notes: '' })
					.returning()
					.get().id
		);
		for (const p of pack.plan)
			tx.insert(mealPlan)
				.values({ date: p.date, slot: p.slot, recipeId: p.recipe === undefined ? null : recipeIds[p.recipe], text: p.text ?? null })
				.onConflictDoNothing()
				.run();

		const rewardIds = count(pack.rewards).map((r, i) => tx.insert(kidRewards).values({ title: r.title, emoji: r.emoji, cost: r.cost, sortOrder: i }).returning().get());
		const sortBase = tx.select().from(kidTasks).all().length;
		count(pack.kidTasks).forEach((k, i) => {
			const memberId = who(k.memberId);
			if (!memberId) return;
			const row = tx
				.insert(kidTasks)
				.values({ memberId, title: k.title, emoji: k.emoji, points: k.points, repeat: k.repeat, sortOrder: sortBase + i })
				.returning()
				.get();
			if (k.doneToday)
				tx.insert(kidPoints)
					.values({ memberId, delta: k.points, reason: `${k.emoji} ${k.title}`, taskId: row.id, period: periodOf(k.repeat, today), createdAt: at })
					.onConflictDoNothing()
					.run();
		});
		for (const b of pack.bonus) {
			const memberId = who(b.memberId);
			if (memberId) tx.insert(kidPoints).values({ memberId, delta: b.delta, reason: t('kids.bonus'), createdAt: new Date(now.getTime() - 86_400_000).toISOString() }).run();
		}
		if (pack.request && who(pack.request.memberId)) {
			const r = rewardIds[pack.request.reward];
			tx.insert(kidRedemptions)
				.values({ memberId: who(pack.request.memberId)!, rewardId: r.id, title: r.title, emoji: r.emoji, cost: r.cost, requestedAt: new Date(now.getTime() - 40 * 60_000).toISOString() })
				.run();
		}

		for (const c of count(pack.countdowns)) tx.insert(countdowns).values({ ...c, memberId: who(c.memberId) }).run();

		const medBase = tx.select().from(meds).all().length;
		count(pack.meds).forEach((m, i) => {
			const row = tx
				.insert(meds)
				.values({ memberId: who(m.memberId), name: m.name, dose: m.dose, times: m.times, days: [], startDate: m.startDate, endDate: m.endDate, active: true, sortOrder: medBase + i })
				.returning()
				.get();
			// Wczoraj wszystko wzięte, dziś – dawki do teraz.
			for (const time of m.times) {
				const [h, mm] = time.split(':').map(Number);
				const takenAt = (date: string) => new Date(localTime(date, h, mm).getTime() + 5 * 60_000).toISOString();
				tx.insert(medDoses).values({ medId: row.id, date: addDays(today, -1), time, takenAt: takenAt(addDays(today, -1)) }).onConflictDoNothing().run();
				if (parseHHMM(time) <= minutes) tx.insert(medDoses).values({ medId: row.id, date: today, time, takenAt: takenAt(today) }).onConflictDoNothing().run();
			}
		});

		const careBase = tx.select().from(careItems).all().length;
		count(pack.care).forEach((c, i) => {
			const row = tx
				.insert(careItems)
				.values({ name: c.name, icon: c.icon, minDays: c.minDays, maxDays: c.maxDays, memberId: who(c.memberId), sortOrder: careBase + i })
				.returning()
				.get();
			tx.insert(careLog).values({ itemId: row.id, date: c.lastDone, doneAt: localTime(c.lastDone, 18, 0).toISOString() }).run();
		});
	});

	for (const p of count(pack.pantry)) addPantry(db, { name: p.name, placeId: p.place, qty: p.qty, date: p.addedAt }, today);

	// Kalendarz szkoły – jak po imporcie pliku .ics (osobna warstwa z kolorem i ikoną).
	const school = pack.school;
	const schoolId = createLocalCalendar(db, { name: school.name, color: school.color, icon: school.icon, memberId: who(school.memberId) });
	writeImport(
		db,
		schoolId,
		school.events.map((e) => {
			const [start, end] = e.from
				? [localTime(e.date, ...(e.from.split(':').map(Number) as [number, number])), localTime(e.date, ...(e.to ?? e.from).split(':').map(Number) as [number, number])].map((x) => x.toISOString())
				: [e.date, addDays(e.date, 1)];
			return { uid: e.uid, title: e.title, start, end, allDay: !e.from, location: null, description: null };
		})
	);

	if (opts.waste) {
		const rules = wasteRules(db);
		const manual = pack.waste.filter((w) => binRule(w.bin, rules));
		setSetting(db, 'wasteManual', [...getSetting(db, 'wasteManual'), ...manual]);
		items += manual.length;
	}
	return { members: ids.size, events: pack.events.length + school.events.length, items };
}

let resetTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Tryb demo: baza od zera z rodziną z paczki, atrapy źródeł od razu w pamięci podręcznej
 * (kiosk ma pogodę i odjazdy od pierwszego żądania). Zwraca datę „dziś”, dla której powstały dane.
 */
export async function resetDemo(db: DB, now = new Date(), lang: Lang = demoLang()): Promise<string> {
	setLang(lang);
	wipe(db);
	resetDemoFetch(lang);
	const first = demoPack(lang, '2000-01-01');
	// Region najpierw – od niego zależy strefa czasowa, a więc „dziś”.
	setSetting(db, 'region', { country: first.country, subdivision: first.subdivision, timezone: first.timezone });
	const today = localParts(now).date;
	const pack = demoPack(lang, today);

	setSetting(db, 'language', lang);
	setSetting(db, 'location', pack.location);
	setSetting(db, 'setupDone', true);
	setSetting(db, 'setup', { step: 'summary', saved: ['lang', 'region', 'place', 'members', 'modules', 'theme', 'layout', 'data'] });
	// Przykładowe wydarzenia „wirtualne” wyłączone – demo ma własne, prawdziwe wpisy.
	setSetting(db, 'demoData', false);
	setSetting(db, 'modules', demoModules(pack.country));
	db.insert(settings)
		.values({ key: SEEDED, value: MODULES.map((m) => m.id) })
		.onConflictDoUpdate({ target: settings.key, set: { value: MODULES.map((m) => m.id) } })
		.run();
	const theme = presetById(process.env.DEMO_THEME ?? '') ?? presetById('papier')!;
	setTheme(db, { preset: theme.id, font: theme.font, overrides: {}, evening: 'auto' });

	db.insert(members)
		.values(pack.members.map((m, i) => ({ id: m.id, name: m.name, color: m.color, avatar: m.avatar, birthday: m.birthday, nameDay: m.nameDay, sortOrder: i })))
		.run();
	writeContent(db, pack, new Map(pack.members.map((m) => [m.id, m.id])), now, { waste: true });
	seedSnakes(db, today);

	// Home Assistant i odjazdy przez atrapy (`fetch.ts`).
	db.insert(secrets)
		.values({ key: 'homeassistant.auth', value: JSON.stringify({ url: DEMO_HA_URL, token: DEMO_HA_TOKEN }) })
		.run();
	db.insert(haEntities)
		.values(pack.ha.map((e, i) => ({ entityId: e.entityId, label: e.label, sortOrder: i })))
		.run();
	setKv(db, 'transitStop', { provider: pack.country === 'PL' ? 'gtfs' : 'vbb', id: pack.transit.stop.id, name: pack.transit.stop.name });

	// Subskrypcja iCal klubu – pobierana przez atrapę jak każde źródło (niżej, razem z pogodą).
	createSubscription(db, { name: pack.club.name, url: pack.club.url, color: pack.club.color, icon: pack.club.icon, memberId: pack.club.memberId, refreshMinutes: 60 });

	await setPin(db, DEMO_PIN, DEMO_PIN);
	writeDemoPhotos();
	// Pogoda, ferie, odjazdy, Home Assistant – od razu w pamięci podręcznej.
	await Promise.all(activeSources(db).map((s) => refresh(db, s, demoFetch, now)));
	return today;
}

/** Start trybu demo: reset przy starcie i codziennie o `DEMO_RESET` (domyślnie 03:45). */
export async function startDemo(db: DB) {
	const today = await resetDemo(db);
	console.log(`[demo] tryb demo (${demoLang()}): dane na ${today}, reset ${demoResetTime() ? `codziennie o ${demoResetTime()}` : 'tylko przy starcie'}`);
	scheduleReset(db);
}

function scheduleReset(db: DB) {
	clearTimeout(resetTimer);
	const time = demoResetTime();
	if (!time) return;
	const now = new Date();
	const { date } = localParts(now);
	const [h, m] = time.split(':').map(Number);
	let next = localTime(date, h, m);
	if (next.getTime() <= now.getTime()) next = localTime(addDays(date, 1), h, m);
	resetTimer = setTimeout(async () => {
		try {
			await resetDemo(db);
			console.log('[demo] nocny reset danych demo');
		} catch (e) {
			console.error('[demo] reset nie wyszedł:', e);
		}
		scheduleReset(db);
	}, next.getTime() - now.getTime());
	resetTimer.unref?.();
}

const SAMPLE_KEY = 'sampleDataLoaded';

/**
 * Panel → Przegląd → „Wczytaj dane przykładowe” (zwykła instalacja): dopisuje rodzinę z paczki
 * w bieżącym języku – domownicy (nowe identyfikatory, gdy zajęte), wydarzenia lokalne, kartki, zakupy,
 * zadania, przepisy i plan, zadania dzieci, odliczania, leki, opiekę i zapasy. Niczego nie usuwa
 * i nie zmienia ustawień (region, język, motyw, moduły, Home Assistant, odjazdy). Drugi raz – błąd.
 */
export function loadSampleData(db: DB, lang: Lang, now = new Date()): WriteSummary {
	if (getKv(db, SAMPLE_KEY, false)) throw new InputError(t('admin.sample.already'));
	const today = localParts(now).date;
	const pack = demoPack(lang, today);
	const ids = new Map<string, string>();
	const existing = db.select({ n: members.sortOrder }).from(members).all();
	const order = existing.length ? Math.max(...existing.map((r) => r.n)) + 1 : 0;
	pack.members.forEach((m, i) => {
		const id = newMemberId(db, m.name);
		db.insert(members).values({ id, name: m.name, color: m.color, avatar: m.avatar, birthday: m.birthday, nameDay: m.nameDay, sortOrder: order + i }).run();
		ids.set(m.id, id);
	});
	// Wywozy tylko wtedy, gdy nie ma żadnego źródła terminów i kraj regionu pasuje do paczki.
	const waste = !getSetting(db, 'wasteIcalUrl') && !getSetting(db, 'wasteIcs') && !getSetting(db, 'wasteManual').length && getSetting(db, 'region').country === pack.country;
	const summary = writeContent(db, pack, ids, now, { waste });
	setKv(db, SAMPLE_KEY, now.toISOString());
	return summary;
}

export const sampleDataLoaded = (db: DB) => !!getKv(db, SAMPLE_KEY, false);
