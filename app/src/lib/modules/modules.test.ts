import { describe, expect, it } from 'vitest';
import {
	dependencyWarnings,
	dependents,
	disabledRoutes,
	getModule,
	isPathDisabled,
	kioskLaunchers,
	kioskTiles,
	MODULES,
	moduleConfig,
	phoneTabs,
	reorder,
	resolveModules,
	setEnabled
} from './index';
import { ConfigError, defaultsOf, parseConfig, withDefaults } from './settings';
import { pantrySettings } from './pantry/index';

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const active = (stored = {}) => resolveModules(stored).filter((s) => s.active).map((s) => s.id);
// Moduły domyślnie wyłączone (wygaszacz, posiłki, dzieci, odliczanie, leki, opieka, odjazdy, HA) i ich trasy – tło dla testów poniżej.
const DEFAULT_OFF = MODULES.filter((m) => !m.defaultEnabled).map((m) => m.id as string);
const ALL_ON = Object.fromEntries(MODULES.map((m) => [m.id, { enabled: true }]));
const OFF_ROUTES = disabledRoutes(resolveModules());

describe('rejestr modułów', () => {
	it('identyfikatory, sekcje panelu i trasy są unikalne', () => {
		const all = MODULES.map((m) => m.id);
		expect(new Set(all).size).toBe(all.length);
		const slugs = MODULES.flatMap((m) => ('admin' in m && m.admin ? [m.admin.slug] : []));
		expect(new Set(slugs).size).toBe(slugs.length);
		const routes = MODULES.flatMap((m) => getModule(m.id)?.routes ?? []);
		expect(new Set(routes).size).toBe(routes.length);
		for (const m of MODULES) for (const r of ('requires' in m ? m.requires : []) as string[]) expect(getModule(r), `${m.id} → ${r}`).toBeTruthy();
	});

	it('domyślnie włączone wszystko poza nowymi modułami, w kolejności z rejestru (jak przed modułami)', () => {
		const states = resolveModules();
		expect(states.every((s) => (DEFAULT_OFF.includes(s.id) ? !s.enabled && !s.active : s.enabled && s.active))).toBe(true);
		expect(ids(states)).toEqual(MODULES.map((m) => m.id));
		const enabled = ids(states.filter((s) => s.active));
		expect(ids(kioskLaunchers(enabled))).toEqual(['pantry', 'snakes', 'playground']);
		expect(kioskTiles(enabled).map((m) => m.kiosk?.tile?.kind)).toEqual(['shopping', 'note', 'chore']);
		expect(phoneTabs(enabled).map((m) => m.phone?.path)).toEqual(['kalendarz', 'kartki', 'zadania', 'zapasy', 'weze']);
		expect(disabledRoutes(states)).toEqual(OFF_ROUTES);
		expect(OFF_ROUTES).toEqual(expect.arrayContaining(['/admin/wygaszacz', '/api/meals', '/api/kids', '/api/countdown', '/api/meds', '/api/care', '/admin/odjazdy', '/api/homeassistant']));
		expect(disabledRoutes(resolveModules(ALL_ON))).toEqual([]);
	});

	it('rdzenia nie da się wyłączyć ani przesunąć', () => {
		expect(active({ calendar: { enabled: false, order: 999 } })[0]).toBe('calendar');
		expect(setEnabled({}, 'calendar', false)).toEqual({});
		expect(setEnabled({}, 'nieznany', false)).toEqual({});
	});

	it('zależności: zapasy bez zakupów nie działają i jest ostrzeżenie', () => {
		const states = resolveModules({ shopping: { enabled: false } });
		const pantry = states.find((s) => s.id === 'pantry')!;
		expect(pantry).toMatchObject({ enabled: true, active: false, missing: ['shopping'] });
		expect(dependencyWarnings(states)).toEqual(['Zapasy potrzebuje modułu „Zakupy” – włącz go, inaczej Zapasy pozostaje wyłączony.']);
		expect(disabledRoutes(states)).toEqual(expect.arrayContaining(['/api/shopping', '/zapasy', '/api/pantry', '/admin/zapasy']));
		expect(dependents('shopping')).toEqual(expect.arrayContaining(['pantry', 'meals']));
		// Świadomie wyłączony moduł nie daje ostrzeżenia.
		expect(dependencyWarnings(resolveModules({ shopping: { enabled: false }, pantry: { enabled: false } }))).toEqual([]);
	});

	it('kolejność: zapis order i przesuwanie w górę/dół', () => {
		let s = reorder({}, 'playground', 'up');
		expect(ids(kioskLaunchers(active(s)))).toEqual(['pantry', 'playground', 'snakes']);
		s = reorder(s, 'playground', 'up');
		expect(ids(kioskLaunchers(active(s)))).toEqual(['playground', 'pantry', 'snakes']);
		// Na brzegu nic się nie zmienia.
		const last = resolveModules(s).at(-1)!.id;
		expect(reorder(s, last, 'down')).toBe(s);
		expect(resolveModules(reorder({}, 'weather', 'up'))[0].id).toBe('calendar');
		// Włączenie zachowuje kolejność.
		expect(setEnabled(s, 'snakes', false).snakes).toMatchObject({ enabled: false, order: s.snakes!.order });
	});

	it('wyłączony moduł: jego strony, API i sekcja panelu na liście 404', () => {
		const states = resolveModules({ ...ALL_ON, snakes: { enabled: false } });
		const routes = disabledRoutes(states);
		expect(routes.filter((r) => !OFF_ROUTES.includes(r))).toEqual(['/weze', '/telefon/weze', '/api/snakes', '/admin/weze']);
		for (const p of ['/weze', '/weze/', '/telefon/weze', '/api/snakes/stock', '/api/snakes/events/3', '/admin/weze']) expect(isPathDisabled(p, routes), p).toBe(true);
		for (const p of ['/', '/wezel', '/telefon/kartki', '/api/shopping', '/admin', '/admin/wezeX']) expect(isPathDisabled(p, routes), p).toBe(false);
		expect(phoneTabs(ids(states.filter((s) => s.active))).map((m) => m.phone?.path)).not.toContain('weze');
		expect(ids(kioskLaunchers(ids(states.filter((s) => s.active))))).toEqual(['pantry', 'playground']);
	});

	it('plakietki przycisków kiosku liczą się z danych modułu', () => {
		const snakes = getModule('snakes')!.kiosk!.launcher!.badge!;
		expect(snakes({ due: 0, lowFood: false } as never)).toBeNull();
		expect(snakes({ due: 2, lowFood: false } as never)).toEqual({ text: 2, warn: false });
		expect(snakes({ due: 0, lowFood: true } as never)).toEqual({ text: '!', warn: true });
		expect(getModule('pantry')!.kiosk!.launcher!.badge!({ low: 1, warn: 2 } as never)).toEqual({ text: 3, warn: true });
	});
});

describe('ustawienia modułu (schemat)', () => {
	it('domyślne, zapisane i uszkodzone wartości', () => {
		expect(defaultsOf(pantrySettings)).toEqual({ expiryWarnDays: 7, freezerOldDays: 180 });
		expect(moduleConfig(pantrySettings, {}, 'pantry')).toEqual({ expiryWarnDays: 7, freezerOldDays: 180 });
		expect(moduleConfig(pantrySettings, { pantry: { config: { expiryWarnDays: 3, obcy: 1 } } }, 'pantry')).toEqual({ expiryWarnDays: 3, freezerOldDays: 180 });
		expect(withDefaults(pantrySettings, { freezerOldDays: 'dużo', expiryWarnDays: 999 })).toEqual({ expiryWarnDays: 7, freezerOldDays: 180 });
	});

	it('walidacja formularza', () => {
		const f = new FormData();
		f.set('expiryWarnDays', '14');
		expect(parseConfig(pantrySettings, f)).toEqual({ expiryWarnDays: 14, freezerOldDays: 180 });
		f.set('freezerOldDays', '1');
		expect(() => parseConfig(pantrySettings, f)).toThrow(ConfigError);
		f.set('freezerOldDays', 'abc');
		expect(() => parseConfig(pantrySettings, f)).toThrow('wpisz liczbę');
		const schema = {
			on: { type: 'boolean', label: 'Włączone', default: true },
			kind: { type: 'select', label: 'Rodzaj', default: 'a', options: [['a', 'A'], ['b', 'B']] },
			code: { type: 'text', label: 'Kod', default: '', pattern: '\\d{3}' }
		} as const;
		expect(parseConfig(schema, {})).toEqual({ on: false, kind: 'a', code: '' });
		expect(parseConfig(schema, { on: 'on', kind: 'b', code: '123' })).toEqual({ on: true, kind: 'b', code: '123' });
		expect(() => parseConfig(schema, { kind: 'c' })).toThrow('nieznana wartość');
		expect(() => parseConfig(schema, { code: '12a' })).toThrow('zły format');
	});
});
