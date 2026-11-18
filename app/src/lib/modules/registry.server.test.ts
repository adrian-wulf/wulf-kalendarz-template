import { describe, expect, it } from 'vitest';
import { openDb } from '#lib/server/db/index.js';
import { chores, members, snakes } from '#lib/server/db/schema.js';
import { buildDashboard } from '#lib/server/dashboard.js';
import { activeSources, setSetting } from '#lib/server/sync.js';
import { addPantry, pantryData } from '#lib/server/pantry.js';
import { ALL_SECTIONS, findSection, panelActions, panelNav } from '#lib/server/admin-panel.js';
import { blockedRoutes, saveModules, seedModules } from './registry.server';

const AT = new Date('2026-11-12T10:00:00Z');

describe('moduły na serwerze', () => {
	it('dashboard: domyślnie dane wszystkich modułów, wyłączony moduł znika', () => {
		const db = openDb(':memory:');
		seedModules(db);
		const all = buildDashboard(db, AT);
		expect(Object.keys(all.modules).sort()).toEqual(['birthdays', 'holidays', 'notes', 'pantry', 'shopping', 'snakes', 'weather']);
		expect(all.enabled).toContain('snakes');
		expect(all.events.some((e) => e.kind === 'waste')).toBe(true);

		saveModules(db, { snakes: { enabled: false }, waste: { enabled: false }, shopping: { enabled: false } });
		const d = buildDashboard(db, AT);
		expect(d.enabled).not.toContain('snakes');
		expect(d.modules.snakes).toBeUndefined();
		// Zapasy wymagają zakupów – też znikają.
		expect(d.modules.pantry).toBeUndefined();
		expect(d.modules.shopping).toBeUndefined();
		expect(d.events.some((e) => e.kind === 'waste')).toBe(false);
		expect(d.tasks.some((t) => t.kind === 'waste')).toBe(false);
		expect(blockedRoutes(db)).toEqual(expect.arrayContaining(['/weze', '/api/snakes', '/zapasy', '/api/shopping', '/admin/smieci']));
	});

	it('synchronizacja: źródła tylko aktywnych modułów', () => {
		const db = openDb(':memory:');
		setSetting(db, 'wasteIcalUrl', 'https://example.com/abfuhr.ics');
		expect(activeSources(db).map((s) => s.name)).toEqual(['weather', 'ferien', 'waste']);
		saveModules(db, { weather: { enabled: false }, waste: { enabled: false } });
		expect(activeSources(db).map((s) => s.name)).toEqual(['ferien']);
	});

	it('seed: każdy moduł raz; włączenie później zasiewa wtedy', () => {
		const db = openDb(':memory:');
		setSetting(db, 'modules', { snakes: { enabled: false } });
		seedModules(db);
		expect(db.select().from(members).all()).toHaveLength(6);
		expect(db.select().from(snakes).all()).toHaveLength(0);
		saveModules(db, { snakes: { enabled: true } });
		expect(db.select().from(snakes).all().length).toBeGreaterThan(0);
		// Usunięte przykłady nie wracają po restarcie.
		db.delete(chores).run();
		seedModules(db);
		expect(db.select().from(chores).all()).toHaveLength(0);
	});

	it('seed: istniejąca instalacja sprzed rejestru nie dostaje przykładów', () => {
		const db = openDb(':memory:');
		db.insert(members).values({ id: 'ja', name: 'Ja', color: '#0ea5e9', sortOrder: 0 }).run();
		seedModules(db);
		expect(db.select().from(chores).all()).toHaveLength(0);
		expect(db.select().from(members).all()).toHaveLength(1);
	});

	it('ustawienia modułu zmieniają działanie (progi zapasów)', () => {
		const db = openDb(':memory:');
		seedModules(db);
		addPantry(db, { name: 'Jogurt', placeId: 'spizarnia', qty: 1, bestBefore: '2026-11-17' }, '2026-11-12');
		expect(pantryData(db, '2026-11-12').summary.warn).toBe(1); // domyślnie 7 dni przed końcem ważności
		saveModules(db, { pantry: { config: { expiryWarnDays: 3, freezerOldDays: 180 } } });
		expect(pantryData(db, '2026-11-12').summary.warn).toBe(0);
	});

	it('panel: menu z aktywnych modułów, sekcja wyłączonego modułu = 404, akcje unikalne', () => {
		const db = openDb(':memory:');
		const nav = () => panelNav(db).map((s) => s.slug);
		expect(nav()).toEqual(['kalendarze', 'google', 'domownicy', 'wydarzenia', 'smieci', 'zakupy', 'kartki', 'zadania', 'zapasy', 'weze', 'birthdays', 'region', 'wyglad', 'uklad', 'ustawienia', 'ekran', 'kopie', 'dostep']);
		saveModules(db, { snakes: { enabled: false } });
		expect(nav()).not.toContain('weze');
		expect(() => findSection(db, 'weze')).toThrow();
		expect(() => findSection(db, 'nieznana')).toThrow();
		expect(findSection(db, 'zapasy').module?.id).toBe('pantry');
		// Każda akcja ma jedną sekcję (zduplikowana nazwa rzuca przy budowie listy).
		const actions = Object.keys(panelActions(() => db));
		expect(actions).toEqual(expect.arrayContaining(['saveMember', 'saveSnake', 'addPantryItem', 'saveWasteRules', 'saveTheme', 'saveLayout', 'saveModuleConfig']));
		expect(actions.length).toBe(ALL_SECTIONS.reduce((n, s) => n + Object.keys(s.actions).length, 0) + 1);
	});
});
