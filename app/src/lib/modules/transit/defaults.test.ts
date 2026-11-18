import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '#lib/server/db/index.js';
import { getSetting, setSetting } from '#lib/server/sync.js';
import { initSetup, saveStep, setupData, finishSetup } from '#lib/server/setup.js';
import { modulesSetting, moduleSources, saveModules, seedModules } from '#lib/modules/registry.server.js';
import { getModule, moduleConfig, setEnabled } from '#lib/modules/index.js';
import { DEFAULT_REGION, setRegion } from '#lib/region.js';
import { setLang } from '#lib/i18n/index.js';
import { defaultProvider, providerFits, transitSettings } from './index.js';
import hooks from './hooks.server.js';

const PL = { country: 'PL', subdivision: 'PL-MZ', timezone: 'Europe/Warsaw' } as const;
const DE = { country: 'DE', subdivision: 'DE-BE', timezone: 'Europe/Berlin' } as const;

afterEach(() => {
	setRegion(DEFAULT_REGION);
	setLang('pl');
	vi.restoreAllMocks();
});

const cfg = (db: ReturnType<typeof openDb>) => moduleConfig(transitSettings, getSetting(db, 'modules'), 'transit');

describe('odjazdy: domyślnie wyłączone i z kraju regionu', () => {
	it('moduł jest domyślnie wyłączony', () => {
		expect(getModule('transit')?.defaultEnabled).toBe(false);
	});

	it('źródło domyślne zależy od kraju: PL → GTFS, DE → VBB', () => {
		expect(defaultProvider('PL')).toBe('gtfs');
		expect(defaultProvider('DE')).toBe('vbb');
		const db = openDb(':memory:');
		setSetting(db, 'region', PL);
		expect(cfg(db).provider).toBe('gtfs');
		setSetting(db, 'region', DE);
		expect(cfg(db).provider).toBe('vbb');
	});

	it('PL: GTFS pierwszy, HAFAS opisany „tylko Niemcy”; DE: wszystkie, GTFS nadal dostępny', () => {
		setRegion(PL);
		const pl = transitSettings.provider.options;
		expect(pl[0][0]).toBe('gtfs');
		expect(pl.filter(([v]) => v !== 'gtfs').every(([, l]) => l.includes('tylko Niemcy'))).toBe(true);
		setRegion(DE);
		const de = transitSettings.provider.options;
		expect(de.map(([v]) => v)).toContain('gtfs');
		expect(de.some(([, l]) => l.includes('tylko Niemcy'))).toBe(false);
	});

	it('kreator: moduł odjazdów odznaczony; „Wczytaj przykład” go nie włącza', () => {
		const db = openDb(':memory:');
		initSetup(db, {});
		seedModules(db);
		expect(setupData(db).modules.find((m) => m.id === 'transit')?.enabled).toBe(false);
		saveStep(db, 'lang', { language: 'pl' });
		saveStep(db, 'region', PL);
		saveStep(db, 'place', { name: 'Warszawa', lat: 52.23, lon: 21.01 });
		saveStep(db, 'members', { members: [{ name: 'Ewa', color: '#0ea5e9' }] });
		saveStep(db, 'modules', { enabled: { weather: true } });
		saveStep(db, 'theme', { preset: 'fiord' });
		saveStep(db, 'layout', { preset: 'week' });
		saveStep(db, 'data', { demo: 'example' });
		finishSetup(db);
		expect(modulesSetting(db).transit?.enabled ?? false).toBe(false);
		expect(moduleSources(db).map((s) => s.name)).not.toContain('transit');
	});

	it('bez przystanku żadnych pobrań – także po włączeniu modułu i w panelu', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'));
		const db = openDb(':memory:');
		setSetting(db, 'region', PL);
		saveModules(db, setEnabled(modulesSetting(db), 'transit', true));
		expect(moduleSources(db).map((s) => s.name)).not.toContain('transit');
		const data = await hooks.admin!.load!(db, { url: new URL('http://x/admin/odjazdy') } as never);
		expect((data as { transit: { stop: unknown } }).transit.stop).toBeNull();
		expect(fetchSpy.mock.calls.filter(([u]) => /transport\.rest|gtfs|zip/i.test(String(u)))).toEqual([]);
	});

	it('źródło niepasujące do kraju: ostrzeżenie w panelu, bez cichej zmiany', async () => {
		expect(providerFits('vbb', 'PL')).toBe(false);
		expect(providerFits('gtfs', 'PL')).toBe(true);
		expect(providerFits('vbb', 'DE')).toBe(true);
		const db = openDb(':memory:');
		setSetting(db, 'region', DE);
		const stored = modulesSetting(db);
		saveModules(db, { ...stored, transit: { ...stored.transit, enabled: true, config: { provider: 'vbb' } } } as never);
		const load = async () => ((await hooks.admin!.load!(db, { url: new URL('http://x/admin/odjazdy') } as never)) as { transit: { provider: string; wrongCountry: unknown } }).transit;
		expect((await load()).wrongCountry).toBeNull();
		setSetting(db, 'region', PL);
		const tr = await load();
		expect(tr.provider).toBe('vbb');
		expect(tr.wrongCountry).toEqual({ provider: 'VBB', country: 'PL' });
	});
});
