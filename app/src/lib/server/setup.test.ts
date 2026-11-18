import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb } from './db/index';
import { chores, localNotes, localShopping, members, settings } from './db/schema';
import { seed } from './db/seed';
import { getSetting } from './sync';
import { buildDashboard } from './dashboard';
import { getTheme } from './theme';
import { finishSetup, goToStep, initSetup, restartSetup, saveStep, searchPlaces, setupData, setupPending, setupState } from './setup';
import { modulesSetting, seedModules } from '#lib/modules/registry.server.js';
import { DEFAULT_REGION, setRegion } from '#lib/region.js';
import { SetupError } from '#lib/setup.js';
import { getLang, setLang } from '#lib/i18n/index.js';
import { getLayout } from './layout';

const AT = new Date('2026-11-12T10:00:00Z');
afterEach(() => {
	setRegion(DEFAULT_REGION);
	setLang('pl');
});

/** Świeża instalacja tak jak przy starcie serwera: initSetup, potem seedModules. */
function boot(db = openDb(':memory:'), env: Record<string, string> = {}) {
	initSetup(db, env);
	seedModules(db);
	return db;
}

/** Kroki od języka do danych z sensownymi wartościami. */
function walk(db: ReturnType<typeof openDb>, demo: 'empty' | 'example') {
	saveStep(db, 'lang', { language: 'pl' });
	saveStep(db, 'region', { country: 'PL', subdivision: 'PL-MA', timezone: 'Europe/Warsaw' });
	saveStep(db, 'place', { name: 'Kraków', lat: 50.06, lon: 19.94 });
	saveStep(db, 'members', { members: [{ name: 'Ewa', color: '#0ea5e9' }, { name: 'Jan', color: '#8b5cf6' }] });
	saveStep(db, 'modules', { enabled: { weather: true, holidays: true, waste: true, shopping: true, notes: true, chores: true, pantry: false, snakes: false, playground: false } });
	saveStep(db, 'theme', { preset: 'fiord' });
	saveStep(db, 'layout', { preset: 'week' });
	return saveStep(db, 'data', { demo });
}

describe('kreator: kto go widzi', () => {
	it('świeża instalacja → kreator, bez domowników i bez danych przykładowych', () => {
		const db = boot();
		expect(setupPending(db)).toBe(true);
		expect(db.select().from(members).all()).toEqual([]);
		expect(db.select().from(localShopping).all()).toEqual([]);
		expect(setupState(db)).toEqual({ step: 'lang', saved: [] });
	});

	it('istniejąca instalacja (są domownicy) liczy się jako zrobiona – kiosk nie zobaczy kreatora', () => {
		const db = openDb(':memory:');
		seed(db);
		boot(db);
		expect(getSetting(db, 'setupDone')).toBe(true);
		expect(setupPending(db)).toBe(false);
	});

	it('istniejąca instalacja z zapisem seedModules (nawet bez domowników) też jest zrobiona', () => {
		const db = openDb(':memory:');
		db.insert(settings).values({ key: 'seededModules', value: ['calendar'] }).run();
		boot(db);
		expect(setupPending(db)).toBe(false);
	});

	it('SKIP_SETUP=1: świeża baza z przykładami jak dawniej', () => {
		const db = boot(openDb(':memory:'), { SKIP_SETUP: '1' });
		expect(setupPending(db)).toBe(false);
		expect(db.select().from(members).all().length).toBe(6);
		expect(db.select().from(localShopping).all().length).toBeGreaterThan(0);
	});

	it('decyzja zapada raz: restart w trakcie kreatora (są już domownicy) nadal pokazuje kreator', () => {
		const db = boot();
		saveStep(db, 'lang', { language: 'pl' });
		saveStep(db, 'region', { country: 'DE', subdivision: 'DE-NI', timezone: 'Europe/Berlin' });
		saveStep(db, 'place', { lat: '52,37', lon: '9,74' });
		saveStep(db, 'members', { members: [{ name: 'Anna', color: '#0ea5e9' }] });
		boot(db); // „restart”
		expect(setupPending(db)).toBe(true);
		expect(setupState(db).step).toBe('modules');
		expect(db.select().from(localShopping).all()).toEqual([]);
	});
});

describe('kreator: kroki', () => {
	it('nie da się przeskoczyć kroków', () => {
		const db = boot();
		expect(() => saveStep(db, 'members', { members: [{ name: 'A', color: '#0ea5e9' }] })).toThrow(SetupError);
		expect(() => goToStep(db, 'theme')).toThrow('poprzednie');
		expect(() => saveStep(db, 'lang', { language: 'fr' })).toThrow('Wybierz język');
		expect(() => saveStep(db, 'nope', {})).toThrow('Nieznany');
		saveStep(db, 'lang', { language: 'pl' });
		goToStep(db, 'region');
		goToStep(db, 'lang');
		expect(setupState(db)).toEqual({ step: 'lang', saved: ['lang'] });
	});

	it('każdy krok zapisuje się od razu do ustawień', () => {
		const db = boot();
		expect(walk(db, 'empty')).toBe('summary');
		expect(getSetting(db, 'region')).toEqual({ country: 'PL', subdivision: 'PL-MA', timezone: 'Europe/Warsaw' });
		expect(getSetting(db, 'location')).toEqual({ name: 'Kraków', lat: 50.06, lon: 19.94 });
		expect(db.select().from(members).all().map((m) => [m.id, m.name, m.sortOrder])).toEqual([
			['ewa', 'Ewa', 0],
			['jan', 'Jan', 1]
		]);
		expect(modulesSetting(db)).toMatchObject({ pantry: { enabled: false }, snakes: { enabled: false }, shopping: { enabled: true } });
		expect(getTheme(db)).toMatchObject({ preset: 'fiord', font: 'inter' });
		expect(getLayout(db).preset).toBe('week');
		expect(getSetting(db, 'demoData')).toBe(false);
	});

	it('język: DE i EN zapisują się i przełączają komunikaty od razu', () => {
		const db = boot();
		saveStep(db, 'lang', { language: 'de' });
		expect(getSetting(db, 'language')).toBe('de');
		expect(getLang()).toBe('de');
		expect(() => saveStep(db, 'region', { country: 'XX' })).toThrow('Land');
		goToStep(db, 'lang');
		saveStep(db, 'lang', { language: 'en' });
		expect(() => saveStep(db, 'region', { country: 'XX' })).toThrow('country');
	});

	it('układ ekranu: tylko gotowy układ, reszta ustawień zostaje', () => {
		const db = boot();
		walk(db, 'empty');
		goToStep(db, 'layout');
		expect(() => saveStep(db, 'layout', { preset: 'nope' })).toThrow('Nieznany układ');
		saveStep(db, 'layout', { preset: 'portrait' });
		expect(getLayout(db)).toMatchObject({ preset: 'portrait', resolution: 'auto', density: 'comfortable' });
		expect(setupData(db, {}).layout).toBe('portrait');
	});

	it('moduły: włączone zapasy wymuszają zakupy', () => {
		const db = boot();
		walk(db, 'empty');
		goToStep(db, 'modules');
		saveStep(db, 'modules', { enabled: { pantry: true, shopping: false } });
		expect(modulesSetting(db)).toMatchObject({ pantry: { enabled: true }, shopping: { enabled: true }, weather: { enabled: false } });
	});

	it('domownicy: zmiana, usunięcie i dodanie przy ponownym kroku', () => {
		const db = boot();
		walk(db, 'empty');
		saveStep(db, 'members', { members: [{ id: 'jan', name: 'Janek', color: '#c026d3' }, { name: 'Zosia', color: '#0f766e' }] });
		expect(db.select().from(members).all().map((m) => [m.id, m.name, m.color, m.sortOrder])).toEqual([
			['jan', 'Janek', '#c026d3', 0],
			['zosia', 'Zosia', '#0f766e', 1]
		]);
	});

	it('motyw: ten sam motyw zostawia własne kolory', () => {
		const db = boot();
		walk(db, 'empty');
		const t = getTheme(db);
		db.update(settings).set({ value: { ...t, overrides: { accent: '#123456' } } }).where(eq(settings.key, 'theme')).run();
		saveStep(db, 'theme', { preset: 'fiord' });
		expect(getTheme(db).overrides).toEqual({ accent: '#123456' });
		saveStep(db, 'theme', { preset: 'noc' });
		expect(getTheme(db)).toMatchObject({ preset: 'noc', overrides: {} });
	});
});

describe('kreator: koniec', () => {
	it('„pusty”: bez przykładowych list, wydarzeń i wywozów; włączenie modułu później też nic nie dodaje', () => {
		const db = boot();
		walk(db, 'empty');
		finishSetup(db);
		expect(setupPending(db)).toBe(false);
		expect(db.select().from(localShopping).all()).toEqual([]);
		expect(db.select().from(localNotes).all()).toEqual([]);
		expect(db.select().from(chores).all()).toEqual([]);
		const d = buildDashboard(db, AT);
		expect(d.events.filter((e) => e.kind === 'event' || e.kind === 'waste')).toEqual([]);
		seedModules(db);
		expect(db.select().from(localShopping).all()).toEqual([]);
	});

	it('„przykład”: dane przykładowe, wydarzenia przypisane do prawdziwych domowników', () => {
		const db = boot();
		walk(db, 'example');
		finishSetup(db);
		expect(db.select().from(localShopping).all().length).toBeGreaterThan(0);
		expect(db.select().from(localNotes).all().length).toBeGreaterThan(0);
		expect(db.select().from(chores).all().length).toBeGreaterThan(0);
		// Przykładowi „Tata/Mama” nie powstają – są tylko domownicy z kreatora.
		expect(db.select().from(members).all().map((m) => m.id)).toEqual(['ewa', 'jan']);
		const people = new Set(buildDashboard(db, AT).events.filter((e) => e.kind === 'event').map((e) => e.memberId));
		expect([...people].filter(Boolean).every((id) => id === 'ewa' || id === 'jan')).toBe(true);
	});

	it('nie kończy się bez wszystkich kroków', () => {
		const db = boot();
		saveStep(db, 'lang', { language: 'pl' });
		expect(() => finishSetup(db)).toThrow('Region');
	});

	it('ponowne uruchomienie z panelu: obecne wartości, wszystkie kroki dostępne', () => {
		const db = boot();
		walk(db, 'empty');
		finishSetup(db);
		restartSetup(db);
		expect(setupPending(db)).toBe(true);
		const data = setupData(db, {});
		expect(data.state.step).toBe('lang');
		expect(data.reachable).toContain('summary');
		expect(data.region).toEqual({ country: 'PL', subdivision: 'PL-MA', timezone: 'Europe/Warsaw' });
		expect(data.place).toEqual({ name: 'Kraków', lat: 50.06, lon: 19.94 });
		expect(data.members.map((m) => m.name)).toEqual(['Ewa', 'Jan']);
		expect(data.theme).toBe('fiord');
		expect(data.demo).toBe('empty');
		expect(data.adminUrl).toBeNull();
		expect(setupData(db, { PUBLIC_ORIGIN: 'https://kalendarz.x.ts.net/' }).adminUrl).toBe('https://kalendarz.x.ts.net/admin');
		// Restart serwera w trakcie – dalej kreator.
		boot(db);
		expect(setupPending(db)).toBe(true);
		finishSetup(db);
		expect(setupPending(db)).toBe(false);
	});

	it('świeża instalacja: brak zapisanego regionu i miejsca (kreator zgaduje w przeglądarce)', () => {
		const data = setupData(boot(), {});
		expect(data.region).toBeNull();
		expect(data.place).toBeNull();
		expect(data.demo).toBeNull();
		expect(data.members).toEqual([]);
	});
});

describe('kreator: geokodowanie', () => {
	it('pyta Open-Meteo po polsku z krajem i upraszcza wyniki', async () => {
		let asked = '';
		const f = (async (url: string) => {
			asked = url;
			return new Response(
				JSON.stringify({
					results: [
						{ name: 'Kraków', latitude: 50.06143, longitude: 19.93658, country: 'Polska', admin1: 'małopolskie', admin2: 'Kraków' },
						{ name: 'Krakow am See', latitude: 53.65, longitude: 12.27, country: 'Niemcy', admin1: 'Meklemburgia' },
						{ name: 'zepsuty' }
					]
				})
			);
		}) as typeof fetch;
		const places = await searchPlaces(' Kraków ', 'PL', f, 'https://geo.test/v1/search');
		const u = new URL(asked);
		expect(u.origin + u.pathname).toBe('https://geo.test/v1/search');
		expect(Object.fromEntries(u.searchParams)).toMatchObject({ name: 'Kraków', language: 'pl', countryCode: 'PL' });
		expect(places).toEqual([
			{ name: 'Kraków', lat: 50.0614, lon: 19.9366, detail: 'małopolskie, Polska' },
			{ name: 'Krakow am See', lat: 53.65, lon: 12.27, detail: 'Meklemburgia, Niemcy' }
		]);
	});

	it('brak wyników, za krótkie zapytanie, błąd HTTP', async () => {
		const empty = (async () => new Response('{}')) as unknown as typeof fetch;
		expect(await searchPlaces('Xyz', null, empty, 'https://geo.test/s')).toEqual([]);
		expect(await searchPlaces('K', null, empty, 'https://geo.test/s')).toEqual([]);
		const down = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
		await expect(searchPlaces('Kraków', null, down, 'https://geo.test/s')).rejects.toThrow('503');
	});

	it('nazwa lokalna w innym języku interfejsu: drugie zapytanie w języku kraju', async () => {
		// Open-Meteo (11.2026): „Warszawa” z language=en → {}, z language=pl → wynik
		setLang('en');
		const asked: string[] = [];
		const f = (async (u: string) => {
			asked.push(new URL(u).searchParams.get('language')!);
			return new Response(
				new URL(u).searchParams.get('language') === 'pl'
					? JSON.stringify({ results: [{ name: 'Warszawa', latitude: 52.22977, longitude: 21.01178, admin1: 'Mazowieckie', country: 'Polska' }] })
					: '{"generationtime_ms":0.07}'
			);
		}) as unknown as typeof fetch;
		expect(await searchPlaces('Warszawa', 'PL', f, 'https://geo.test/s')).toEqual([{ name: 'Warszawa', lat: 52.2298, lon: 21.0118, detail: 'Mazowieckie, Polska' }]);
		expect(asked).toEqual(['en', 'pl']);
		// bez kraju i w języku kraju – tylko jedno zapytanie
		asked.length = 0;
		expect(await searchPlaces('Nirgendwo', null, f, 'https://geo.test/s')).toEqual([]);
		setLang('de');
		expect(await searchPlaces('Nirgendwo', 'DE', f, 'https://geo.test/s')).toEqual([]);
		expect(asked).toEqual(['en', 'de']);
	});
});
