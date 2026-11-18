import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db/index';
import { localEvents, members } from '../db/schema';
import { seed } from '../db/seed';
import { buildDashboard } from '../dashboard';
import { getSetting } from '../sync';
import { hasPin } from '../security';
import { moduleStates } from '#lib/modules/registry.server.js';
import { DEFAULT_REGION, setRegion } from '#lib/region.js';
import { setLang, LANGS } from '#lib/i18n/index.js';
import { WASTE_PRESETS } from '#lib/logic/waste.js';
import { clashesWithBins } from '#lib/colors.js';
import { addDays } from '#lib/logic/dates.js';
import { celebratesNameDay, namedaysOn } from '#lib/logic/namedays.js';
import { demoPack, granNameDay } from './pack';
import { loadSampleData, resetDemo } from './load';
import { demoFetch, DEMO_HA_TOKEN, DEMO_HA_URL, DEMO_HAFAS_URL, resetDemoFetch } from './fetch';
import { applyDemoEnv, demoLang, demoLockedAction, demoLockedRoute, demoResetTime, isDemo } from './mode';

const AT = new Date('2026-11-12T14:40:00Z'); // czwartek 15:40 w Polsce i w Niemczech
const TODAY = '2026-11-12';

beforeAll(() => {
	// Zdjęcia wygaszacza demo – do katalogu tymczasowego.
	process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'kal-demo-'));
	// Rozkład GTFS demo (PL) zapisuje się obok bazy – też do katalogu tymczasowego.
	process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'kal-demo-db-')), 'k.db');
});
afterEach(() => {
	setRegion(DEFAULT_REGION);
	setLang('pl');
	resetDemoFetch();
});

describe('paczka demo', () => {
	for (const lang of LANGS)
		it(`${lang}: spójna rodzina na bieżący tydzień`, () => {
			const p = demoPack(lang, TODAY);
			const ids = new Set(p.members.map((m) => m.id));
			expect(ids.size).toBe(5);
			// Kolory domowników nie mylą się z kolorami pojemników kraju.
			const bins = WASTE_PRESETS[p.country].map((r) => r.color);
			for (const m of p.members) expect(clashesWithBins(m.color, bins), m.name).toBe(false);
			// Wszystkie odwołania do domowników istnieją.
			for (const id of [...p.events, ...p.notes, ...p.chores, ...p.meds, ...p.care, ...p.countdowns, ...p.kidTasks].map((x) => x.memberId)) if (id) expect(ids.has(id)).toBe(true);
			// Tydzień wokół dziś: wydarzenia od wczoraj, większość w najbliższych 7 dniach.
			expect(p.events.every((e) => e.date >= addDays(TODAY, -1) && e.date <= addDays(TODAY, 14))).toBe(true);
			expect(p.events.filter((e) => e.date >= TODAY && e.date < addDays(TODAY, 7)).length).toBeGreaterThanOrEqual(15);
			// Urodziny dziecka w tym tygodniu, plan posiłków wskazuje istniejące przepisy.
			expect(p.members.some((m) => m.birthday.slice(5) === addDays(TODAY, 3).slice(5))).toBe(true);
			for (const pl of p.plan) if (pl.recipe !== undefined) expect(p.recipes[pl.recipe]).toBeDefined();
			// Wywozy z gotowego zestawu pojemników kraju.
			const known = new Set(WASTE_PRESETS[p.country].map((r) => r.bin));
			for (const w of p.waste) expect(known.has(w.bin), w.bin).toBe(true);
			expect(p.transit.lines.length).toBeGreaterThan(2);
			expect(p.ha.length).toBeGreaterThan(3);
		});

	it('niemiecka i angielska paczka bez polskich znaków (poza nazwami ferii z API)', () => {
		for (const lang of ['de', 'en'] as const) {
			const { ferien, ...rest } = demoPack(lang, TODAY);
			void ferien;
			expect(JSON.stringify(rest)).not.toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/);
		}
	});

	it('PL: babcia obchodzi dziś imieniny, gdy w kalendarzu jest pasujące imię żeńskie', () => {
		expect(granNameDay('2026-11-12')).toBe('Renata');
		expect(celebratesNameDay(granNameDay(TODAY), namedaysOn(TODAY))).toBe(true);
		// Dzień bez pasującego imienia z listy – zostaje stałe imię.
		expect(granNameDay('2026-11-11')).toBe('Halina');
	});
});

describe('reset demo', () => {
	for (const lang of LANGS)
		it(`${lang}: wszystkie moduły aktywne, każdy kafelek ma dane`, async () => {
			const db = openDb(':memory:');
			const today = await resetDemo(db, AT, lang);
			expect(today).toBe(TODAY);
			expect(moduleStates(db).every((s) => s.active)).toBe(true);
			expect(getSetting(db, 'language')).toBe(lang);
			expect(getSetting(db, 'region').country).toBe(lang === 'pl' ? 'PL' : 'DE');
			expect(getSetting(db, 'demoData')).toBe(false);
			expect(hasPin(db)).toBe(true);

			const d = buildDashboard(db, AT);
			expect(d.members).toHaveLength(5);
			expect(d.events.filter((e) => e.kind === 'event').length).toBeGreaterThan(10);
			expect(d.events.some((e) => e.kind === 'birthday')).toBe(true);
			expect(d.events.some((e) => e.kind === 'waste')).toBe(true);
			expect(d.tasks.length).toBeGreaterThan(0);
			const m = d.modules as Record<string, Record<string, unknown> & { length?: number }>;
			expect(m.weather).toMatchObject({ now: expect.any(Object) });
			expect((m.transit.departures as unknown[]).length).toBeGreaterThan(2);
			expect((m.homeassistant.entities as unknown[]).length).toBeGreaterThan(3);
			expect((m.meds.doses as unknown[]).length).toBeGreaterThan(2);
			expect((m.screensaver.photos as unknown[]).length).toBe(5);
			expect(m.shopping.length).toBeGreaterThan(5);
			expect(m.notes.length).toBe(3);
			for (const id of ['meals', 'kids', 'countdown', 'care', 'pantry', 'snakes', 'birthdays']) expect(m[id], id).toBeTruthy();
			if (lang === 'pl') expect((m.birthdays.namedays as { members: string[] }).members).toContain('babcia');
			// Źródła z atrap od razu w pamięci podręcznej, bez błędów.
			for (const [name, s] of Object.entries(d.sources)) expect(s.error, name).toBeUndefined();
			for (const name of ['weather', 'ferien', 'transit', 'homeassistant']) expect(d.sources[name]?.ok, name).toBe(true);
			// Dostawca odjazdów pasuje do kraju: PL – GTFS, DE – VBB (bez ostrzeżenia „zły kraj”).
			expect((getSetting(db, 'modules').transit?.config as { provider: string }).provider).toBe(lang === 'pl' ? 'gtfs' : 'vbb');
			expect(JSON.stringify(m.transit)).toContain(lang === 'pl' ? 'Dworzec Główny' : 'Hauptbahnhof');
			expect(d.offlineSince).toBeNull();
		}, 30_000);

	it('drugi reset zaczyna od zera (bez podwójnych danych, zdjęcia od nowa)', async () => {
		const db = openDb(':memory:');
		await resetDemo(db, AT, 'pl');
		db.insert(members).values({ id: 'gosc', name: 'Gość', color: '#be185d' }).run();
		await resetDemo(db, AT, 'pl');
		expect(db.select().from(members).all().map((m) => m.id)).not.toContain('gosc');
		expect(db.select().from(members).all()).toHaveLength(5);
		expect(readdirSync(join(process.env.MEDIA_DIR!, 'photos'))).toHaveLength(5);
	}, 30_000);
});

describe('dane przykładowe w zwykłej instalacji', () => {
	it('dopisuje rodzinę, nic nie usuwa; drugi raz – błąd', () => {
		setRegion({ country: 'PL', subdivision: 'PL-MA', timezone: 'Europe/Warsaw' });
		const db = openDb(':memory:');
		seed(db);
		const before = db.select().from(members).all().map((m) => m.id);
		const r = loadSampleData(db, 'pl', AT);
		const after = db.select().from(members).all();
		expect(after.map((m) => m.id)).toEqual(expect.arrayContaining(before));
		expect(after).toHaveLength(before.length + 5);
		// „Babcia” z danych startowych zostaje, przykładowa dostaje nowy identyfikator.
		expect(after.filter((m) => m.name === 'Babcia').map((m) => m.id)).toEqual(['babcia', 'babcia-2']);
		expect(r.members).toBe(5);
		expect(db.select().from(localEvents).all().length).toBe(r.events);
		expect(() => loadSampleData(db, 'pl', AT)).toThrow(/już/);
	});
});

describe('atrapy (bez sieci)', () => {
	it('nieznany adres – 503, nic nie wychodzi do sieci', async () => {
		expect((await demoFetch('https://example.com/x')).status).toBe(503);
		expect((await demoFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList')).status).toBe(503);
	});

	it('Home Assistant: token, stany, przełączanie w pamięci', async () => {
		setRegion({ country: 'PL', subdivision: 'PL-WP', timezone: 'Europe/Warsaw' });
		const headers = { authorization: `Bearer ${DEMO_HA_TOKEN}` };
		expect((await demoFetch(`${DEMO_HA_URL}/api/states`)).status).toBe(401);
		const states = (await (await demoFetch(`${DEMO_HA_URL}/api/states`, { headers })).json()) as { entity_id: string; state: string }[];
		const light = states.find((s) => s.entity_id.startsWith('light.') && s.state === 'on')!;
		await demoFetch(`${DEMO_HA_URL}/api/services/light/toggle`, { method: 'POST', headers, body: JSON.stringify({ entity_id: light.entity_id }) });
		const again = (await (await demoFetch(`${DEMO_HA_URL}/api/states`, { headers })).json()) as { entity_id: string; state: string }[];
		expect(again.find((s) => s.entity_id === light.entity_id)?.state).toBe('off');
	});

	it('odjazdy: przyszłe kursy po kolei, przystanek do znalezienia', async () => {
		setRegion({ country: 'DE', subdivision: 'DE-NI', timezone: 'Europe/Berlin' });
		resetDemoFetch('de');
		const before = Date.now();
		const stops = (await (await demoFetch(`${DEMO_HAFAS_URL}/locations?query=linden`)).json()) as { id: string }[];
		expect(stops).toHaveLength(1);
		const { departures } = (await (await demoFetch(`${DEMO_HAFAS_URL}/stops/${stops[0].id}/departures`)).json()) as { departures: { when: string; plannedWhen: string }[] };
		expect(departures.length).toBeGreaterThan(5);
		expect(Date.parse(departures[0].plannedWhen)).toBeGreaterThanOrEqual(before - 60_000);
		const times = departures.map((x) => Date.parse(x.when));
		expect(times).toEqual([...times].sort((a, b) => a - b));
	});
});

describe('tryb demo – zmienne i blokady', () => {
	it('DEMO, DEMO_LANG, DEMO_RESET', () => {
		expect(isDemo({ DEMO: '1' })).toBe(true);
		expect(isDemo({})).toBe(false);
		expect(demoLang({ DEMO_LANG: 'DE' })).toBe('de');
		expect(demoLang({ DEMO_LANG: 'xx' })).toBe('pl');
		expect(demoResetTime({})).toBe('03:45');
		expect(demoResetTime({ DEMO_RESET: 'off' })).toBeNull();
	});

	it('własna baza i zdjęcia obok zwykłych – prawdziwa baza nietknięta', () => {
		const env: Record<string, string | undefined> = { DATABASE_PATH: '/data/kalendarz.db', DEMO_LANG: 'de' };
		applyDemoEnv(env);
		expect(env.DATABASE_PATH).toBe('/data/demo/kalendarz-demo-de.db');
		expect(env.MEDIA_DIR).toBe('/data/demo/media-de');
		expect(env.BACKUP_DIR).toBe('/data/demo/kopie');
	});

	it('zablokowane akcje i trasy', () => {
		for (const a of ['saveGoogleClient', 'connectBring', 'saveHaAuth', 'backupSaveTarget', 'backupConfirm', 'savePin', 'restartSetup']) expect(demoLockedAction(a), a).toBe(true);
		for (const a of ['saveMember', 'saveRecipe', 'toggleModule']) expect(demoLockedAction(a), a).toBe(false);
		expect(demoLockedRoute('/admin/google/start')).toBe(true);
		expect(demoLockedRoute('/admin/backup/upload')).toBe(true);
		expect(demoLockedRoute('/admin/backup')).toBe(false);
		expect(demoLockedRoute('/admin/google')).toBe(false);
	});
});
